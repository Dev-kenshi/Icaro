import { useCallback, useEffect, useRef, useState } from 'react';
import { adaptiveQuestionSilenceMs, mergeQuestionContinuation, WakeTurnGate } from '@/lib/wake-turn-gate';
import { parseWakeCommand } from '@/lib/wake-commands';
import { wakeAccessBlockReason } from '@/lib/wake-access';

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  start(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
}
type LocalAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
type RecognitionConstructor = {
  new(): Recognition;
  available?: (options: { langs: string[]; processLocally: true; quality: 'dictation' }) => Promise<LocalAvailability>;
  install?: (options: { langs: string[]; processLocally: true; quality: 'dictation' }) => Promise<boolean>;
};
const ctor = () => {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
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
  onBargeSpeech?: (text: string) => void;
  isEcho?: (text: string) => boolean;
};

/** Continuous wake-word listening. Permission errors stop retries; activated
 * speech may be dispatched after a short stable-interim window, never twice. */
export function useWakeListener(options: Options) {
  const latest = useRef(options); latest.current = options;
  const [status, setStatus] = useState<ListeningStatus>('starting');
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localInstallAvailable, setLocalInstallAvailable] = useState(false);
  const [installingLocal, setInstallingLocal] = useState(false);
  const running = useRef(false);
  const requested = useRef(false);
  const gate = useRef(new WakeTurnGate());
  const desired = useRef(true);
  const restart = useRef<(() => void) | null>(null);
  const pauseRef = useRef<(() => Promise<void>) | null>(null);
  const completeRef = useRef<((playedAudio?: boolean) => void) | null>(null);
  const installLocalRef = useRef<(() => Promise<void>) | null>(null);
  const audioLevelHandlerRef = useRef<(level: number) => void>(() => undefined);
  const reportAudioLevel = useCallback((level: number) => audioLevelHandlerRef.current(level), []);
  const activateNow = () => {
    requested.current = false;
    gate.current.arm(Date.now()); setActive(true); latest.current.onWake();
  };

  useEffect(() => {
    const Constructor = ctor();
    if (!Constructor) { setError('unsupported'); setStatus('unsupported'); return; }
    let disposed = false;
    let rec: Recognition | null = null;
    let localReady = false;
    let localCheckPromise: Promise<boolean> | null = null;
    let installing = false;
    let timer = 0;
    let interimTimer = 0;
    let deferredTimer = 0;
    let interimCandidate: { index: number; text: string } | null = null;
    let deferredQuestion: { index: number; text: string; lastSpeechAt: number } | null = null;
    let failures = 0;
    let stopping = false;
    let stopPromise: Promise<void> = Promise.resolve();
    let localApiSupported = false;
    try {
      const probe = new Constructor();
      localApiSupported = 'processLocally' in probe && typeof Constructor.available === 'function';
    } catch { /* Fail closed below if the local recognition API cannot be inspected. */ }
    setLocalInstallAvailable(localApiSupported && typeof Constructor.install === 'function');
    const clearInterimCommit = () => {
      window.clearTimeout(interimTimer);
      interimTimer = 0;
      interimCandidate = null;
    };
    const clearDeferredQuestion = () => {
      window.clearTimeout(deferredTimer);
      deferredTimer = 0;
      deferredQuestion = null;
    };
    const scheduleDeferredQuestion = (pending: NonNullable<typeof deferredQuestion>) => {
      window.clearTimeout(deferredTimer);
      const waitMs = adaptiveQuestionSilenceMs(pending.text);
      deferredTimer = window.setTimeout(() => {
        if (deferredQuestion !== pending || disposed || !desired.current) return;
        deferredQuestion = null;
        deferredTimer = 0;
        latest.current.onQuestion(pending.text);
      }, waitMs);
    };
    audioLevelHandlerRef.current = (level) => {
      if (!deferredQuestion || !Number.isFinite(level) || level < 0.035) return;
      const now = Date.now();
      if (now - deferredQuestion.lastSpeechAt < 120) return;
      deferredQuestion.lastSpeechAt = now;
      scheduleDeferredQuestion(deferredQuestion);
    };
    const deferQuestion = (text: string, index: number) => {
      clearDeferredQuestion();
      deferredQuestion = { index, text, lastSpeechAt: Date.now() };
      scheduleDeferredQuestion(deferredQuestion);
    };
    const dispatch = (events: ReturnType<WakeTurnGate['receive']>, resultIndex = -1) => {
      setActive(gate.current.active);
      for (const action of events) {
        switch (action.type) {
          case 'stop': case 'expired': clearInterimCommit(); clearDeferredQuestion(); latest.current.onStop(); break;
          case 'wake': clearDeferredQuestion(); latest.current.onWake(); break;
          case 'transcript': latest.current.onTranscript(action.text); break;
          case 'question': clearInterimCommit(); deferQuestion(action.text, resultIndex); break;
        }
      }
    };
    completeRef.current = (playedAudio = false) => {
      clearInterimCommit(); clearDeferredQuestion();
      gate.current.complete(Date.now(), playedAudio); setActive(false);
    };
    const failLocal = (reason: string, unsupported = false) => {
      desired.current = false; running.current = false; requested.current = false;
      gate.current.stop(); setActive(false); setError(reason);
      setStatus(unsupported ? 'unsupported' : 'blocked');
      latest.current.onStop();
    };
    const ensureLocalRecognition = (): Promise<boolean> => {
      if (localReady) return Promise.resolve(true);
      if (localCheckPromise) return localCheckPromise;
      if (!localApiSupported || typeof Constructor.available !== 'function') {
        failLocal('local-unsupported', true);
        return Promise.resolve(false);
      }
      localCheckPromise = (async () => {
        try {
          const availability = await Constructor.available!({
            langs: ['pt-BR'],
            processLocally: true,
            quality: 'dictation',
          });
          if (disposed || !desired.current) return false;
          if (availability === 'available') {
            localReady = true;
            setError(null);
            return true;
          }
          if (availability === 'downloadable' || availability === 'downloading') {
            failLocal('local-pack-required');
          } else {
            failLocal('local-unavailable');
          }
          return false;
        } catch (cause) {
          if (disposed || !desired.current) return false;
          const name = cause instanceof DOMException ? cause.name : '';
          failLocal(['NotAllowedError', 'SecurityError'].includes(name) ? 'local-policy' : 'local-check-failed');
          return false;
        }
      })().finally(() => { localCheckPromise = null; });
      return localCheckPromise;
    };
    const expiryTimer = window.setInterval(() => {
      if (gate.current.expire(Date.now())) { clearInterimCommit(); clearDeferredQuestion(); setActive(false); latest.current.onStop(); }
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
      if (!localReady) {
        setStatus('starting');
        void ensureLocalRecognition().then((ready) => {
          if (ready && !disposed && desired.current && !rec) start();
        });
        return;
      }
      const next = new Constructor();
      if (!('processLocally' in next)) {
        failLocal('local-unsupported', true);
        return;
      }
      next.processLocally = true;
      if (next.processLocally !== true) {
        failLocal('local-unsupported', true);
        return;
      }
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
          const echo = latest.current.isEcho?.(transcript) ?? false;
          if (transcript.trim()) { failures = 0; setError(null); }
          if (latest.current.busy && transcript.trim() && !echo) {
            latest.current.onBargeSpeech?.(transcript);
          }
          if (result.isFinal) clearInterimCommit();
          const pending = deferredQuestion;
          const pendingCommand = pending ? parseWakeCommand(transcript, true) : null;
          if (pending && transcript.trim() && !echo && !pendingCommand?.wake && !pendingCommand?.stop) {
            const merged = mergeQuestionContinuation(pending.text, transcript);
            if (merged) {
              pending.text = merged;
              pending.index = i;
              pending.lastSpeechAt = Date.now();
              scheduleDeferredQuestion(pending);
            }
            continue;
          }
          if (pending && (pendingCommand?.wake || pendingCommand?.stop)) clearDeferredQuestion();
          const events = gate.current.receive(
            transcript,
            result.isFinal,
            i,
            Date.now(),
            latest.current.busy,
            echo,
            latest.current.allowWakeDuringWait || Boolean(pending),
          );
          dispatch(events, i);
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
              dispatch(commitEvents, candidate.index);
            }, INTERIM_COMMIT_MS);
          }
        }
      };
      next.onerror = ({ error }) => {
        if (disposed || rec !== next) return;
        running.current = false;
        if (error !== 'no-speech') {
          setError(error === 'language-not-supported' ? 'local-pack-required' : error);
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
        if (name === 'NotSupportedError') {
          failLocal('local-pack-required');
          return;
        }
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
    const installLocalPack = async () => {
      if (disposed || installing || !localApiSupported || typeof Constructor.install !== 'function') return;
      installing = true; setInstallingLocal(true); desired.current = true;
      setError(null); setStatus('starting');
      try {
        const installed = await Constructor.install({
          langs: ['pt-BR'],
          processLocally: true,
          quality: 'dictation',
        });
        if (!installed) throw new Error('language-pack-install-failed');
        if (disposed || !desired.current) return;
        localReady = false;
        const ready = await ensureLocalRecognition();
        if (ready && !disposed && desired.current) start();
        else if (!ready && desired.current) failLocal('local-pack-install-failed');
      } catch {
        if (!disposed && desired.current) failLocal('local-pack-install-failed');
      } finally {
        installing = false;
        if (!disposed) setInstallingLocal(false);
      }
    };
    installLocalRef.current = installLocalPack;
    pauseRef.current = () => {
      desired.current = false; gate.current.stop(); window.clearTimeout(timer); clearInterimCommit(); clearDeferredQuestion();
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
      disposed = true; window.clearTimeout(timer); window.clearTimeout(interimTimer); window.clearTimeout(deferredTimer); window.clearInterval(expiryTimer);
      audioLevelHandlerRef.current = () => undefined;
      running.current = false; requested.current = false;
      restart.current = null; pauseRef.current = null; completeRef.current = null; installLocalRef.current = null;
      if (rec) {
        rec.onstart = rec.onend = rec.onresult = rec.onerror = null;
        rec.abort(); rec = null;
      }
    };
  }, []);

  return {
    status, active, error, inFrame: window.self !== window.top,
    supported: status !== 'unsupported',
    localInstallAvailable,
    installingLocal,
    enable: () => restart.current?.(),
    pause: () => pauseRef.current?.() ?? Promise.resolve(),
    installLocalPack: () => installLocalRef.current?.() ?? Promise.resolve(),
    complete: (playedAudio = false) => completeRef.current?.(playedAudio),
    reportAudioLevel,
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
