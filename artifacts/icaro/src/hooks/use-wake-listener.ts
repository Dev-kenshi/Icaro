import { useEffect, useRef, useState } from 'react';
import { WakeTurnGate } from '@/lib/wake-turn-gate';
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
const INTERIM_COMMIT_MS = 550;
export type ListeningStatus = 'starting' | 'listening' | 'blocked' | 'unsupported' | 'error' | 'paused';
type Options = {
  busy: boolean;
  allowWakeDuringWait?: boolean;
  onWake: () => void;
  onStop: () => void;
  onQuestion: (text: string) => void;
  onTranscript: (text: string) => void;
  isEcho?: (text: string) => boolean;
};

/** Continuous wake-word listening. Permission errors stop retries; activated
 * speech may be dispatched after a short stable-interim window, never twice. */
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
  const pauseRef = useRef<(() => Promise<void>) | null>(null);
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
    let interimTimer = 0;
    let interimCandidate: { index: number; text: string } | null = null;
    let failures = 0;
    let stopping = false;
    let stopPromise: Promise<void> = Promise.resolve();
    const clearInterimCommit = () => {
      window.clearTimeout(interimTimer);
      interimTimer = 0;
      interimCandidate = null;
    };
    const dispatch = (events: ReturnType<WakeTurnGate['receive']>) => {
      setActive(gate.current.active);
      for (const action of events) {
        switch (action.type) {
          case 'stop': case 'expired': clearInterimCommit(); latest.current.onStop(); break;
          case 'wake': latest.current.onWake(); break;
          case 'transcript': latest.current.onTranscript(action.text); break;
          case 'question': clearInterimCommit(); latest.current.onQuestion(action.text); break;
        }
      }
    };
    completeRef.current = (playedAudio = false) => {
      clearInterimCommit();
      gate.current.complete(Date.now(), playedAudio); setActive(false);
    };
    const expiryTimer = window.setInterval(() => {
      if (gate.current.expire(Date.now())) { clearInterimCommit(); setActive(false); latest.current.onStop(); }
    }, 100);
    const start = () => {
      if (disposed || !desired.current || rec) return;
      if (stopping) {
        const waiting = stopPromise;
        void waiting.then(() => { if (!disposed && desired.current && !rec && !stopping) start(); });
        return;
      }
      window.clearTimeout(timer);
      clearInterimCommit();
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
      next.lang = 'pt-BR'; next.interimResults = true; next.continuous = true; next.maxAlternatives = 1;
      gate.current.newRecognitionSession();
      setStatus('starting');
      next.onstart = () => {
        if (disposed || rec !== next || !desired.current) return;
        running.current = true; setStatus('listening');
        if (requested.current) activateNow();
      };
      next.onresult = (event) => {
        if (disposed || !desired.current || rec !== next) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          if (transcript.trim()) { failures = 0; setError(null); }
          const events = gate.current.receive(
            transcript,
            result.isFinal,
            i,
            Date.now(),
            latest.current.busy,
            latest.current.isEcho?.(transcript),
            latest.current.allowWakeDuringWait,
          );
          if (result.isFinal) clearInterimCommit();
          dispatch(events);
          if (!result.isFinal) {
            const transcriptText = events.flatMap((action) => action.type === 'transcript' ? [action.text] : [])[0];
            if (!transcriptText) { clearInterimCommit(); continue; }
            interimCandidate = { index: i, text: transcriptText };
            window.clearTimeout(interimTimer);
            interimTimer = window.setTimeout(() => {
              const candidate = interimCandidate;
              if (!candidate || candidate.index !== i || candidate.text !== transcriptText) return;
              if (disposed || !desired.current || rec !== next) return;
              interimCandidate = null; interimTimer = 0;
              const commitEvents = gate.current.commitInterim(
                candidate.index,
                candidate.text,
                Date.now(),
                latest.current.busy,
                latest.current.isEcho?.(candidate.text) ?? false,
              );
              dispatch(commitEvents);
            }, INTERIM_COMMIT_MS);
          }
        }
      };
      next.onerror = ({ error }) => {
        if (disposed || rec !== next) return;
        running.current = false;
        if (error !== 'no-speech') {
          setError(error);
          console.warn('Reconhecimento de voz indisponível:', error);
        }
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(error)) {
          clearInterimCommit();
          requested.current = false;
          desired.current = false; gate.current.stop(); setStatus('blocked');
          setActive(false);
          latest.current.onStop();
          try { next.abort(); } catch { /* already terminated by the browser */ }
          if (rec === next) rec = null;
        } else if (error !== 'no-speech') {
          failures++; setStatus('error');
        }
      };
      next.onend = () => {
        if (disposed || rec !== next) return;
        rec = null; running.current = false;
        if (!disposed && desired.current) {
          setStatus(failures ? 'error' : 'starting');
          timer = window.setTimeout(start, failures ? Math.min(150 * 2 ** failures, 15_000) : 150);
        }
      };
      try { next.start(); }
      catch (cause) {
        clearInterimCommit();
        rec = null; running.current = false;
        const name = cause instanceof DOMException ? cause.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          desired.current = false; requested.current = false;
          gate.current.stop(); setActive(false); setError('not-allowed'); setStatus('blocked');
          latest.current.onStop();
        } else {
          failures++;
          setError('start-failed');
          setStatus('starting');
          timer = window.setTimeout(start, Math.min(150 * 2 ** (failures - 1), 15_000));
        }
      }
    };
    restart.current = () => { desired.current = true; failures = 0; setError(null); start(); };
    pauseRef.current = () => {
      desired.current = false; gate.current.stop(); window.clearTimeout(timer); clearInterimCommit();
      running.current = false; requested.current = false;
      setActive(false); setStatus('paused');
      latest.current.onStop();
      const current = rec;
      if (!current) return stopPromise;
      rec = null;
      stopping = true;
      stopPromise = new Promise<void>((resolve) => {
        let settled = false;
        let timeout = 0;
        const previousOnEnd = current.onend;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          if (current.onend === wrappedOnEnd) current.onend = previousOnEnd;
          stopping = false;
          resolve();
        };
        const wrappedOnEnd = () => {
          previousOnEnd?.();
          finish();
        };
        current.onend = wrappedOnEnd;
        timeout = window.setTimeout(finish, 1000);
        try { current.abort(); } catch { finish(); }
      });
      return stopPromise;
    };
    start();
    return () => {
      disposed = true; window.clearTimeout(timer); window.clearTimeout(interimTimer); window.clearInterval(expiryTimer);
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
    pause: () => pauseRef.current?.() ?? Promise.resolve(),
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
