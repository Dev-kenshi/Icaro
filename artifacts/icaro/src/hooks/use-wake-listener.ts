import { useEffect, useRef, useState } from 'react';
import { SpeechUtteranceBuffer, UTTERANCE_MAX_MS, UTTERANCE_SILENCE_MS, WakeTurnGate, type WakeEvent } from '@/lib/wake-turn-gate';
import { wakeAccessBlockReason } from '@/lib/wake-access';

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
}
const ctor = () => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
export type ListeningStatus = 'starting' | 'listening' | 'blocked' | 'unsupported' | 'error' | 'paused';
type Options = {
  busy: boolean;
  allowWakeDuringWait?: boolean;
  directMode?: boolean;
  onWake: () => void;
  onStop: () => void;
  onQuestion: (text: string) => void;
  onTranscript: (text: string) => void;
  isEcho?: (text: string) => boolean;
};

/** Continuous wake-word listening. Speech segments are collected until a short
 * silence or the 15-second cap, then dispatched once as a complete utterance. */
export function useWakeListener(options: Options) {
  const latest = useRef(options); latest.current = options;
  const [status, setStatus] = useState<ListeningStatus>('starting');
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const requested = useRef(false);
  const gate = useRef(new WakeTurnGate());
  const desired = useRef(true);
  const restart = useRef<(() => void) | null>(null);
  const pauseRef = useRef<(() => void) | null>(null);
  const completeRef = useRef<((playedAudio?: boolean) => void) | null>(null);
  const activateNow = () => {
    requested.current = false;
    gate.current.arm(Date.now()); setActive(true); latest.current.onWake();
  };

  useEffect(() => {
    const Constructor = ctor();
    if (!Constructor) { setError('unsupported'); setStatus('unsupported'); return; }
    let disposed = false;
    let rec: Recognition | null = null;
    let timer = 0;
    let captureQuietTimer = 0;
    let captureMaxTimer = 0;
    let recognitionSession = 0;
    const utterance = new SpeechUtteranceBuffer();
    let failures = 0;
    const clearUtterance = () => {
      window.clearTimeout(captureQuietTimer);
      window.clearTimeout(captureMaxTimer);
      captureQuietTimer = 0;
      captureMaxTimer = 0;
      utterance.clear();
    };
    let dispatchEvents: (events: WakeEvent[], sessionId?: number) => void = () => {};
    const flushUtterance = () => {
      window.clearTimeout(captureQuietTimer);
      window.clearTimeout(captureMaxTimer);
      captureQuietTimer = 0;
      captureMaxTimer = 0;
      const text = utterance.take();
      if (text) dispatchEvents(gate.current.submitQuestion(text, Date.now()));
    };
    const collectTranscript = (index: number, text: string, sessionId: number) => {
      const firstSegment = utterance.empty;
      const now = Date.now();
      const fullText = utterance.update(sessionId * 1_000_000 + index, text, now);
      if (firstSegment) {
        gate.current.beginCapture(now);
        captureMaxTimer = window.setTimeout(flushUtterance, UTTERANCE_MAX_MS);
      }
      window.clearTimeout(captureQuietTimer);
      captureQuietTimer = window.setTimeout(flushUtterance, UTTERANCE_SILENCE_MS);
      latest.current.onTranscript(fullText);
    };
    dispatchEvents = (events, sessionId = recognitionSession) => {
      setActive(gate.current.active);
      for (const action of events) {
        switch (action.type) {
          case 'stop': case 'expired': clearUtterance(); latest.current.onStop(); break;
          case 'wake': clearUtterance(); latest.current.onWake(); break;
          case 'transcript': collectTranscript(action.index, action.text, sessionId); break;
          case 'question': clearUtterance(); latest.current.onQuestion(action.text); break;
        }
      }
    };
    completeRef.current = (playedAudio = false) => {
      clearUtterance();
      gate.current.complete(Date.now(), playedAudio); setActive(false);
    };
    const expiryTimer = window.setInterval(() => {
      if (gate.current.expire(Date.now())) { clearUtterance(); setActive(false); latest.current.onStop(); }
    }, 100);
    const start = () => {
      if (disposed || !desired.current || rec) return;
      window.clearTimeout(timer);
      const block = wakeAccessBlockReason(
        document as unknown as Parameters<typeof wakeAccessBlockReason>[0],
        window.isSecureContext,
      );
      if (block) {
        desired.current = false; running.current = false; requested.current = false;
        gate.current.stop(); setActive(false); setError(block); setStatus('blocked');
        return;
      }
      const next = new Constructor();
      rec = next;
      const sessionId = ++recognitionSession;
      next.lang = 'pt-BR'; next.interimResults = true; next.continuous = true; next.maxAlternatives = 1;
      gate.current.newRecognitionSession();
      setError(null);
      setStatus('starting');
      next.onstart = () => {
        if (disposed || rec !== next || !desired.current) return;
        running.current = true; failures = 0; setError(null); setStatus('listening');
        if (requested.current) activateNow();
      };
      next.onresult = (event) => {
        if (disposed || !desired.current || rec !== next) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          const echo = latest.current.isEcho?.(transcript) ?? false;
          if (echo) clearUtterance();
          const events = gate.current.receive(
            transcript,
            result.isFinal,
            i,
            Date.now(),
            latest.current.busy,
            echo,
            latest.current.allowWakeDuringWait,
            latest.current.directMode,
            true,
          );
          dispatchEvents(events, sessionId);
        }
      };
      next.onerror = ({ error }) => {
        if (disposed || rec !== next) return;
        running.current = false;
        if (error !== 'no-speech' && error !== 'aborted') {
          setError(error);
          console.warn('Reconhecimento de voz indisponível:', error);
        }
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(error)) {
          clearUtterance();
          requested.current = false;
          desired.current = false; gate.current.stop(); setStatus('blocked');
          setActive(false);
          latest.current.onStop();
          try { next.abort(); } catch { /* already terminated by the browser */ }
          if (rec === next) rec = null;
        } else if (error !== 'no-speech' && error !== 'aborted') {
          failures++; setStatus('error');
        }
      };
      next.onend = () => {
        if (disposed || rec !== next) return;
        rec = null; running.current = false;
        if (!disposed && desired.current) {
          setStatus(failures ? 'error' : 'starting');
          timer = window.setTimeout(start, failures ? Math.min(150 * 2 ** failures, 15_000) : 30);
        }
      };
      try { next.start(); }
      catch {
        clearUtterance();
        rec = null; desired.current = false; running.current = false; requested.current = false;
        setError('not-allowed');
        setStatus('blocked');
      }
    };
    restart.current = () => { desired.current = true; failures = 0; start(); };
    pauseRef.current = () => {
      desired.current = false; gate.current.stop(); window.clearTimeout(timer); clearUtterance();
      running.current = false; requested.current = false;
      setActive(false); setStatus('paused');
      latest.current.onStop();
      rec?.abort(); rec = null;
    };
    start();
    return () => {
      disposed = true; window.clearTimeout(timer); clearUtterance(); window.clearInterval(expiryTimer);
      running.current = false; requested.current = false;
      restart.current = null; pauseRef.current = null; completeRef.current = null;
      if (rec) {
        rec.onstart = rec.onend = rec.onresult = rec.onerror = null;
        rec.abort(); rec = null;
      }
    };
  }, []);

  return {
    status, active, error, inFrame: window.self !== window.top,
    supported: status !== 'unsupported',
    enable: () => restart.current?.(),
    pause: () => pauseRef.current?.(),
    complete: (playedAudio = false) => completeRef.current?.(playedAudio),
    activate: () => {
      completeRef.current?.();
      requested.current = true;
      if (running.current) activateNow();
      else restart.current?.();
    },
    standby: () => {
      completeRef.current?.();
      requested.current = false;
      gate.current.stop(); setActive(false); latest.current.onStop();
    },
  };
}
