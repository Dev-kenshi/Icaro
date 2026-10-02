import {
  avatarAssetsUrl,
  type IcaroAvatarInstance,
  type IcaroSpeechInstance,
  type IcaroTimeline,
  type IcaroWord,
  loadIcaroAvatarLibrary,
} from './icaro-avatar';
import { queueSpeechChunks, type SpeechQueueEngine } from './speech-plan';

export const VOICE_RE = /antonio.*natural|donato|fabio|humberto|julio|nicolau|valerio|leandro|daniel|felipe|google.*portugu/i;

export function ptVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis.getVoices().filter((v) => /^pt(-|_)?br/i.test(v.lang) || /^pt/i.test(v.lang));
}

export function pickVoice(uri: string | null): SpeechSynthesisVoice | null {
  const voices = ptVoices();
  if (uri) { const v = voices.find((x) => x.voiceURI === uri); if (v) return v; }
  return voices.find((v) => VOICE_RE.test(v.name)) ?? voices.find((v) => /br/i.test(v.lang)) ?? voices[0] ?? null;
}

export interface SpeakOpts {
  pitch: number;
  rate: number;
  voiceURI: string | null;
  neural?: boolean;
  onChunk: (t: string) => void;
  onStart: () => void;
  onEnd: () => void;
  onProvider?: (p: string) => void;
  onWords?: (words: string[], activeIndex: number) => void;
  onError?: (message: string) => void;
}

const BASE_URL = import.meta.env.BASE_URL;
const DEFAULT_GEMINI_VOICE = 'Orus';
const FALLBACK_CACHE_MAX_ENTRIES = 24;
const FALLBACK_CACHE_MAX_BYTES = 10 * 1024 * 1024;
const fallbackAudioCache = new Map<string, { audio: ArrayBuffer; size: number }>();
const fallbackRequests = new Set<AbortController>();
let fallbackCacheBytes = 0;
let fallbackVoice = DEFAULT_GEMINI_VOICE;
let avatar: IcaroAvatarInstance | null = null;
let player: IcaroSpeechInstance | null = null;
let audioContext: AudioContext | null = null;
let outputAnalyser: AnalyserNode | null = null;
let micAnalyser: AnalyserNode | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let ttsLevel = 0;
let fallbackCooldownUntil = 0;
let token = 0;
let currentRun: SpeechRun | null = null;
let outputMeterRaf = 0;
let outputMeterBuffer = new Uint8Array(1024);

interface SpeechRun {
  id: number;
  engine: IcaroSpeechInstance;
  avatar: IcaroAvatarInstance;
  options: SpeakOpts;
  started: boolean;
  completed: boolean;
  usedFallback: boolean;
  error: Error | null;
  pendingTimeline: IcaroTimeline | null;
  pendingClock: (() => number) | null;
  sentenceText: string;
  words: IcaroWord[];
  startWatchdog?: number;
  aborts: Set<AbortController>;
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function isCurrent(run: SpeechRun): boolean {
  return currentRun === run && player === run.engine && avatar === run.avatar && !run.completed;
}

function stopOutputMeter() {
  if (outputMeterRaf) cancelAnimationFrame(outputMeterRaf);
  outputMeterRaf = 0;
  ttsLevel = 0;
}

function outputMeterTick() {
  const analyser = outputAnalyser;
  if (analyser) {
    if (outputMeterBuffer.length !== analyser.fftSize) outputMeterBuffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(outputMeterBuffer);
    let sum = 0;
    for (let i = 0; i < outputMeterBuffer.length; i++) sum += Math.abs(outputMeterBuffer[i] - 128);
    ttsLevel = Math.min(1, sum / outputMeterBuffer.length / 16);
    const run = currentRun;
    if (run && isCurrent(run) && run.started) run.avatar.setAudioLevel(ttsLevel);
  } else {
    ttsLevel = 0;
  }
  if (audioContext && audioContext.state !== 'closed') outputMeterRaf = requestAnimationFrame(outputMeterTick);
  else outputMeterRaf = 0;
}

function ensureSharedAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Este navegador não oferece suporte ao áudio necessário.');
    audioContext = new AudioContextCtor({ latencyHint: 'interactive' });
    outputAnalyser = audioContext.createAnalyser();
    outputAnalyser.fftSize = 1024;
    outputAnalyser.smoothingTimeConstant = .5;
    outputAnalyser.connect(audioContext.destination);
    stopOutputMeter();
    outputMeterRaf = requestAnimationFrame(outputMeterTick);
  }
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);
  return audioContext;
}

function abortRunRequests(run?: SpeechRun) {
  const requests = run?.aborts ?? fallbackRequests;
  for (const request of requests) request.abort();
  requests.clear();
  if (!run) fallbackRequests.clear();
}

function completeRun(run: SpeechRun, error?: Error, stopEngine = false) {
  if (!isCurrent(run)) return;
  run.completed = true;
  if (run.startWatchdog) window.clearTimeout(run.startWatchdog);
  currentRun = null;
  player = null;
  ttsLevel = 0;
  abortRunRequests(run);

  // Retiring an engine invalidates its callbacks before vendor stop() can call
  // _finish; the shared AudioContext stays open and unlocked for the next turn.
  if (stopEngine) {
    try { run.engine.stop(); } catch { /* retired engine; callbacks are gated */ }
  }
  if (run.started || error) run.avatar.stopSpeaking();
  if (error) {
    console.error('Falha na reprodução da fala do Ícaro.', error);
    run.options.onError?.(`Não foi possível iniciar o áudio do Ícaro: ${error.message}`);
  }
  run.options.onEnd();
}

function validateAudio(audio: AudioBuffer): void {
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0 || audio.numberOfChannels < 1 || audio.length < 1) {
    throw new Error('O provedor retornou áudio vazio ou com duração inválida.');
  }
  let peak = 0;
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (!Number.isFinite(sample)) throw new Error('O provedor retornou áudio inválido.');
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  if (peak <= 1e-7) throw new Error('O provedor retornou apenas silêncio.');
}

function validateDecoded(data: unknown): asserts data is { audio: AudioBuffer; tl: IcaroTimeline } {
  if (!data || typeof data !== 'object') throw new Error('A resposta de fala não contém áudio e alinhamento.');
  const decoded = data as { audio?: AudioBuffer; tl?: IcaroTimeline };
  validateAudio(decoded.audio as AudioBuffer);
  if (!decoded.tl || !Array.isArray(decoded.tl.words) || !decoded.tl.words.length ||
      !Array.isArray(decoded.tl.keys) || !decoded.tl.keys.length) {
    throw new Error('O alinhamento de fala não contém palavras ou visemas válidos.');
  }
}

function revealAudioStart(run: SpeechRun) {
  if (!isCurrent(run) || run.started || !run.pendingClock) return;
  const clock = run.pendingClock;
  if (!audioContext || audioContext.state !== 'running' || clock() < 0) return;

  const timeline = run.pendingTimeline;
  if (!timeline) return;
  run.started = true;
  run.avatar.speak(timeline, clock);
  run.options.onProvider?.(run.usedFallback ? 'Gemini Orus' : 'ElevenLabs');
  lastProvider = run.usedFallback ? 'Gemini Orus' : 'ElevenLabs';
  run.options.onStart();
}

function scheduleStartCheck(run: SpeechRun) {
  const check = () => {
    if (!isCurrent(run) || run.started) return;
    revealAudioStart(run);
    if (!run.started) requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
  if (!run.startWatchdog) {
    run.startWatchdog = window.setTimeout(() => {
      if (!isCurrent(run) || run.started) return;
      revealAudioStart(run);
      if (!run.started) completeRun(run, new Error('O áudio não começou. Verifique a saída de som e tente novamente.'), true);
    }, 1800);
  }
}

function displayAlignedWord(text: string): string {
  return text.replace(/\bUéfis\b/gi, 'UEFS');
}

function makeRunAvatarProxy(run: SpeechRun): IcaroAvatarInstance {
  const actual = run.avatar;
  return {
    ready: actual.ready,
    state: actual.state,
    canvas: actual.canvas,
    setState(state) {
      if (!isCurrent(run) || !run.started || state === 'speaking') return;
      actual.setState(state);
    },
    speak(timeline, clock) {
      if (!isCurrent(run)) return;
      run.pendingTimeline = timeline;
      run.pendingClock = clock;
      if (run.started) actual.speak(timeline, clock);
      else scheduleStartCheck(run);
    },
    stopSpeaking() {
      if (isCurrent(run) && run.started) actual.stopSpeaking();
    },
    setAudioLevel(level) {
      if (isCurrent(run) && run.started) actual.setAudioLevel(level);
    },
  };
}

function createRunEngine(run: SpeechRun, Constructor: NonNullable<Window['IcaroSpeech']>): IcaroSpeechInstance {
  const proxy = makeRunAvatarProxy(run);
  const engine = new Constructor({
    avatar: proxy,
    endpoint: `${BASE_URL}api/tts-ts`,
    fallback: async (text) => {
      try {
        return await fetchGeminiAudio(run, text);
      } catch (error) {
        if (isCurrent(run) && !(error instanceof Error && error.name === 'AbortError')) {
          run.error = asError(error, 'A voz reserva falhou.');
        }
        throw error;
      }
    },
    onSentence(text, timeline, clock) {
      if (!isCurrent(run)) return;
      run.sentenceText = text;
      run.words = timeline.words;
      run.pendingTimeline = timeline;
      run.pendingClock = clock;
      scheduleStartCheck(run);
    },
    onWord(word, index, words) {
      if (!isCurrent(run) || !run.started) return;
      const originalWords = run.sentenceText.trim().split(/\s+/);
      const alignedWords = run.words.length === originalWords.length ? originalWords : words.map((item) => item.text);
      const displayWords = alignedWords.map(displayAlignedWord);
      const caption = displayWords.slice(0, index + 1).join(' ');
      run.options.onChunk(caption);
      run.options.onWords?.(displayWords, index);
      void word;
    },
    onEnd() {
      if (!isCurrent(run)) return;
      const error = run.error ?? (!run.started ? new Error('Nenhum áudio foi iniciado.') : undefined);
      completeRun(run, error);
    },
    onLevel(level) {
      if (isCurrent(run) && run.started) {
        ttsLevel = level;
        run.avatar.setAudioLevel(level);
      }
    },
  });
  run.engine = engine;

  // All speech turns share the one gesture-unlocked output context/analyser. The
  // vendor meter loop is replaced because the integration owns the shared meter.
  engine._meter = () => undefined;
  engine.unlock = () => {
    const context = ensureSharedAudioContext();
    engine.ctx = context;
    engine.analyser = outputAnalyser;
    return context;
  };
  engine.ctx = ensureSharedAudioContext();
  engine.analyser = outputAnalyser;

  const originalFetch = engine._fetch.bind(engine);
  engine._fetch = (item, generation) => {
    const request = originalFetch(item, generation).then((data) => {
      validateDecoded(data);
      return data;
    });
    // Vendor prefetches later sentences without awaiting them; attach a rejection
    // handler now while returning the original rejecting promise to _pump.
    void request.catch(() => undefined);
    return request;
  };

  const originalFallback = engine._fallback.bind(engine);
  engine._fallback = async (text) => {
    if (!isCurrent(run) || run.error) return null;
    try {
      const data = await originalFallback(text);
      if (!isCurrent(run)) return null;
      if (!data) {
        if (!run.error) run.error = new Error('A voz reserva não retornou áudio válido.');
        return null;
      }
      validateDecoded(data);
      run.usedFallback = true;
      return data;
    } catch (error) {
      if (isCurrent(run)) run.error = asError(error, 'A voz reserva falhou.');
      return null;
    }
  };

  const originalPump = engine._pump.bind(engine);
  engine._pump = (generation) => {
    const pump = originalPump(generation);
    void pump.catch((error: unknown) => {
      if (!isCurrent(run)) return;
      run.error = asError(error, 'A fila de áudio falhou.');
      completeRun(run, run.error, true);
    });
    return pump;
  };
  return engine;
}

async function fetchGeminiAudio(run: SpeechRun, text: string): Promise<ArrayBuffer> {
  if (!isCurrent(run)) throw new DOMException('Fala cancelada.', 'AbortError');
  const cacheKey = JSON.stringify([fallbackVoice, text]);
  const cached = fallbackAudioCache.get(cacheKey);
  if (cached) {
    fallbackAudioCache.delete(cacheKey);
    fallbackAudioCache.set(cacheKey, cached);
    run.usedFallback = true;
    return cached.audio.slice(0);
  }
  const cooldownMs = fallbackCooldownUntil - Date.now();
  if (cooldownMs > 0) {
    throw new Error(`A voz neural está temporariamente indisponível. Tente novamente em ${Math.ceil(cooldownMs / 1000)} s.`);
  }
  const controller = new AbortController();
  run.aborts.add(controller);
  fallbackRequests.add(controller);
  try {
    const spokenText = text.replace(/\bUEFS\b/gi, 'Uéfis');
    const response = await fetch(`${BASE_URL}api/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ text: spokenText.slice(0, 1200) }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: unknown; error?: unknown } | null;
      const retryAfter = Number(response.headers.get('Retry-After'));
      const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 0;
      if (response.status === 503 && retryAfterSeconds > 0 && payload?.code !== 'SPEECH_PROVIDER_AUTH') {
        fallbackCooldownUntil = Math.max(fallbackCooldownUntil, Date.now() + retryAfterSeconds * 1000);
      }
      const message = response.status === 503 && retryAfterSeconds > 0 && payload?.code !== 'SPEECH_PROVIDER_AUTH'
        ? `A voz neural está temporariamente indisponível. Tente novamente em ${retryAfterSeconds} s.`
        : typeof payload?.error === 'string'
          ? payload.error
          : `Voz reserva indisponível (${response.status}).`;
      throw new Error(message);
    }
    fallbackVoice = response.headers.get('X-Speech-Voice')?.trim() || fallbackVoice;
    fallbackCooldownUntil = 0;
    const blob = await response.blob();
    if (!blob.size) throw new Error('A voz reserva retornou áudio vazio.');
    const audio = await blob.arrayBuffer();
    if (controller.signal.aborted || !isCurrent(run)) throw new DOMException('Fala cancelada.', 'AbortError');
    run.usedFallback = true;
    const entry = { audio, size: blob.size };
    const resolvedCacheKey = JSON.stringify([fallbackVoice, text]);
    fallbackAudioCache.delete(resolvedCacheKey);
    fallbackAudioCache.set(resolvedCacheKey, entry);
    fallbackCacheBytes += entry.size;
    while (fallbackAudioCache.size > FALLBACK_CACHE_MAX_ENTRIES || fallbackCacheBytes > FALLBACK_CACHE_MAX_BYTES) {
      const oldestKey = fallbackAudioCache.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = fallbackAudioCache.get(oldestKey);
      fallbackAudioCache.delete(oldestKey);
      if (oldest) fallbackCacheBytes -= oldest.size;
    }
    return audio.slice(0);
  } finally {
    run.aborts.delete(controller);
    fallbackRequests.delete(controller);
  }
}

/** Unlock the single shared speech AudioContext from an existing gesture handler. */
export function ensureAudio() {
  try {
    const context = ensureSharedAudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
  } catch (error) {
    console.error('Não foi possível iniciar o áudio do Ícaro.', error);
  }
}

/** Call directly from a user gesture when the browser has not unlocked output yet. */
export async function activateAudio(): Promise<boolean> {
  try {
    const context = ensureSharedAudioContext();
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  } catch (error) {
    console.error('Não foi possível ativar o áudio do Ícaro.', error);
    return false;
  }
}

export function getAnalyser(): AnalyserNode | null {
  return outputAnalyser;
}

export const getMicAnalyser = () => micAnalyser;

/** Routes the microphone into the shared context's input-only meter. */
export function connectMic(stream: MediaStream): () => void {
  ensureAudio();
  if (!audioContext) return () => undefined;
  try {
    const meter = audioContext.createAnalyser();
    meter.fftSize = 512;
    meter.smoothingTimeConstant = .5;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(meter);
    if (micSource) {
      try { micSource.disconnect(); } catch { /* noop */ }
    }
    micSource = source;
    micAnalyser = meter;
    return () => {
      try { source.disconnect(); } catch { /* noop */ }
      try { meter.disconnect(); } catch { /* noop */ }
      if (micSource === source) micSource = null;
      if (micAnalyser === meter) micAnalyser = null;
    };
  } catch {
    return () => undefined;
  }
}

export function getLevel(): number {
  if (micAnalyser) {
    const data = new Uint8Array(micAnalyser.fftSize);
    micAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += Math.abs(data[i] - 128);
    return Math.min(1, sum / data.length / 16);
  }
  return ttsLevel;
}

export let lastProvider: string | null = null;

export function releaseSpeechCache() {
  fallbackAudioCache.clear();
  fallbackCacheBytes = 0;
}

function closeSharedAudio() {
  stopOutputMeter();
  if (micSource) {
    try { micSource.disconnect(); } catch { /* noop */ }
    micSource = null;
    micAnalyser = null;
  }
  const context = audioContext;
  audioContext = null;
  outputAnalyser = null;
  if (context && context.state !== 'closed') void context.close().catch(() => undefined);
}

export function stopSpeaking() {
  token++;
  const run = currentRun;
  const engine = player;
  currentRun = null;
  player = null;
  ttsLevel = 0;
  if (run?.startWatchdog) window.clearTimeout(run.startWatchdog);
  abortRunRequests(run ?? undefined);
  for (const request of fallbackRequests) request.abort();
  fallbackRequests.clear();
  if (engine) {
    engine._meter = () => undefined;
    try { engine.stop(); } catch { /* stale engine */ }
  }
  avatar?.stopSpeaking();
}

export function speak(text: string, options: SpeakOpts) {
  stopSpeaking();
  const my = ++token;
  const activeAvatar = avatar;
  if (!text.trim()) {
    options.onChunk(text);
    options.onEnd();
    return;
  }

  const begin = async () => {
    let begunRun: SpeechRun | null = null;
    try {
      await loadIcaroAvatarLibrary();
      if (my !== token) return;
      const Constructor = window.IcaroSpeech;
      if (!Constructor) throw new Error('A biblioteca de voz do Ícaro não foi carregada.');
      if (!activeAvatar || avatar !== activeAvatar) throw new Error('O rosto do Ícaro ainda não está pronto.');
      ensureSharedAudioContext();

      const run: SpeechRun = {
        id: my,
        engine: null as unknown as IcaroSpeechInstance,
        avatar: activeAvatar,
        options,
        started: false,
        completed: false,
        usedFallback: false,
        error: null,
        pendingTimeline: null,
        pendingClock: null,
        sentenceText: '',
        words: [],
        aborts: new Set<AbortController>(),
      };
      const engine = createRunEngine(run, Constructor);
      begunRun = run;
      currentRun = run;
      player = engine;
      try {
        const done = queueSpeechChunks(engine as unknown as SpeechQueueEngine, text);
        void done.catch((error: unknown) => {
          if (!isCurrent(run)) return;
          run.error = asError(error, 'A reprodução da fala falhou.');
          completeRun(run, run.error, true);
        });
      } catch (error) {
        run.error = asError(error, 'Não foi possível iniciar a fila de áudio.');
        completeRun(run, run.error, true);
      }
    } catch (error) {
      if (my !== token) return;
      if (begunRun && isCurrent(begunRun)) {
        completeRun(begunRun, asError(error, 'Não foi possível preparar a fala.'), true);
      } else {
        console.error('Não foi possível preparar a fala do Ícaro.', error);
        options.onError?.(`Não foi possível iniciar o áudio do Ícaro: ${asError(error, 'erro de áudio').message}`);
        options.onEnd();
      }
    }
  };
  void begin();
}

export function setSpeechAvatar(next: IcaroAvatarInstance | null) {
  if (avatar === next) return;
  stopSpeaking();
  avatar = next;
  if (!next) closeSharedAudio();
}

export function setHoloAvatarState(state: 'idle' | 'listening' | 'thinking' | 'talking' | 'intro') {
  avatar?.setState(state === 'talking' ? 'speaking' : state === 'intro' ? 'idle' : state);
}

export function createHoloAvatar(canvas: HTMLCanvasElement): Promise<IcaroAvatarInstance> {
  return loadIcaroAvatarLibrary().then(() => {
    const Constructor = window.IcaroAvatar;
    if (!Constructor) throw new Error('A biblioteca IcaroAvatar não foi carregada.');
    const instance = new Constructor(canvas, { assets: avatarAssetsUrl() });
    const resize = instance._resize?.bind(instance);
    if (resize) instance._resize = () => { if (!instance.__disposed) resize(); };
    return instance;
  });
}

export function detachHoloAvatar(instance: IcaroAvatarInstance) {
  instance.__disposed = true;
  if (avatar === instance) setSpeechAvatar(null);
  instance.stopSpeaking();
  instance.setState('idle');
  void instance.ready.catch(() => undefined).then(() => {
    instance._loop = () => undefined;
    instance.canvas.getContext('2d')?.clearRect(0, 0, instance.canvas.width, instance.canvas.height);
  });
}