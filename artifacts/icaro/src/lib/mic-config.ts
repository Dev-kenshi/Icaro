// Browser speech recognition is the hands-free default. Server mode records one
// explicit utterance and transcribes it on the API when browser recognition fails.
export type MicMode = 'auto' | 'browser' | 'server';
const MODE_KEY = 'icaro.micMode';
const DEVICE_KEY = 'icaro.micDevice';
const BASE_URL = import.meta.env.BASE_URL;

export const SERVER_FALLBACK_ERRORS = new Set([
  'network',
  'service-not-allowed',
  'language-not-supported',
  'unsupported',
]);

export function getMicMode(): MicMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'browser' || value === 'server' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function setMicMode(mode: MicMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* Keep this session's selection. */ }
}

export function getMicDeviceId(): string {
  try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; }
}

export function setMicDeviceId(id: string) {
  try {
    if (id) localStorage.setItem(DEVICE_KEY, id);
    else localStorage.removeItem(DEVICE_KEY);
  } catch { /* Keep this session's selection. */ }
}

export async function listMicrophones(): Promise<Array<{ id: string; label: string }>> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({ id: device.deviceId, label: device.label || `Microfone ${index + 1}` }));
}

function audioConstraints(deviceId: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

export async function openMicrophone(deviceId = getMicDeviceId()): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador não oferece acesso ao microfone.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
  } catch (error) {
    if (deviceId && error instanceof DOMException && ['OverconstrainedError', 'NotFoundError'].includes(error.name)) {
      setMicDeviceId('');
      return navigator.mediaDevices.getUserMedia({ audio: audioConstraints('') });
    }
    throw error;
  }
}

export function micErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'O microfone está bloqueado para este site. Clique no cadeado ao lado do endereço → Microfone → Permitir e recarregue.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhum microfone foi encontrado. Conecte um microfone ou escolha outro na lista.';
    case 'NotReadableError':
    case 'AbortError':
      return 'O microfone pode estar em uso por outro programa. Feche Teams, Zoom, Discord ou WhatsApp e tente novamente.';
    default:
      return error instanceof Error ? error.message : 'Não foi possível abrir o microfone. Confira o aparelho e a permissão do navegador.';
  }
}

function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return options.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? '';
}

export type RecordOptions = {
  deviceId?: string;
  signal?: AbortSignal;
  onLevel?: (level: number) => void;
  onSpeech?: () => void;
  silenceMs?: number;
  startTimeoutMs?: number;
  maxMs?: number;
};

/** Records one utterance, ending after silence; returns null for silence/cancel. */
export async function recordUtterance(opts: RecordOptions = {}): Promise<Blob | null> {
  const { silenceMs = 900, startTimeoutMs = 8000, maxMs = 15000 } = opts;
  const stream = await openMicrophone(opts.deviceId);
  if (opts.signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }
  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor || typeof MediaRecorder === 'undefined') {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Este navegador não oferece gravação de áudio para a transcrição.');
  }

  let context: AudioContext | null = null;
  try {
    const audioContext = new AudioContextCtor();
    context = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const mimeType = pickMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    return await new Promise<Blob | null>((resolve, reject) => {
      const chunks: Blob[] = [];
      const buffer = new Float32Array(analyser.fftSize);
      const startedAt = performance.now();
      let noise = 0.01;
      let spoke = false;
      let lastVoice = 0;
      let finished = false;
      let timer = 0;
      const cleanup = () => {
        window.clearInterval(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close().catch(() => undefined);
        opts.onLevel?.(0);
      };
      const finish = (keep: boolean) => {
        if (finished) return;
        finished = true;
        opts.signal?.removeEventListener('abort', onAbort);
        recorder.onstop = () => {
          cleanup();
          resolve(keep && spoke && chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
        };
        if (recorder.state !== 'inactive') recorder.stop();
        else { cleanup(); resolve(null); }
      };
      const onAbort = () => finish(false);
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      if (opts.signal?.aborted) { finish(false); return; }
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('A gravação do microfone falhou.'));
      };
      try {
        recorder.start(250);
        timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let index = 0; index < buffer.length; index++) sum += buffer[index] * buffer[index];
          const rms = Math.sqrt(sum / buffer.length);
          const now = performance.now();
          const elapsed = now - startedAt;
          opts.onLevel?.(Math.min(1, rms * 12));
          if (elapsed < 300) { noise = Math.max(noise, rms); return; }
          const threshold = Math.max(0.015, noise * 2.5);
          if (rms > threshold) {
            if (!spoke) opts.onSpeech?.();
            spoke = true;
            lastVoice = now;
          } else if (!spoke) {
            noise = noise * 0.98 + rms * 0.02;
          }
          if (spoke && now - lastVoice > silenceMs) finish(true);
          else if (!spoke && elapsed > startTimeoutMs) finish(false);
          else if (elapsed > maxMs) finish(true);
        }, 50);
      } catch (error) {
        finished = true;
        cleanup();
        reject(error);
      }
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
    throw error;
  }
}

export async function transcribeOnServer(audio: Blob, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${BASE_URL}api/ai/stt`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
    signal,
  });
  const payload = await response.json().catch(() => ({})) as { text?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || `Transcrição falhou (${response.status}).`);
  return (payload.text || '').trim();
}

export type MicDiagnosis = { ok: boolean; steps: string[]; advice: string };

/** Checks permission, selected device, captured level, and browser recognition. */
export async function diagnoseMicrophone(onLevel?: (level: number) => void): Promise<MicDiagnosis> {
  const steps: string[] = [];
  if (!window.isSecureContext) return { ok: false, steps, advice: 'Abra o Ícaro por um endereço seguro (HTTPS).' };
  if (window.top !== window) {
    return { ok: false, steps, advice: 'A prévia está dentro de outra página. Abra o Ícaro em uma aba própria para permitir o microfone.' };
  }

  let stream: MediaStream;
  try {
    stream = await openMicrophone();
  } catch (error) {
    return { ok: false, steps: ['Microfone: não abriu'], advice: micErrorMessage(error) };
  }

  const label = stream.getAudioTracks()[0]?.label || 'microfone padrão';
  steps.push(`Microfone aberto: ${label}`);
  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    stream.getTracks().forEach((track) => track.stop());
    return { ok: false, steps, advice: 'Este navegador não oferece medição de áudio. Experimente Chrome ou Edge.' };
  }
  const context = new AudioContextCtor();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  let peak = 0;
  await new Promise<void>((resolve) => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let index = 0; index < buffer.length; index++) sum += buffer[index] * buffer[index];
      const level = Math.min(1, Math.sqrt(sum / buffer.length) * 12);
      peak = Math.max(peak, level);
      onLevel?.(level);
      if (performance.now() - startedAt > 4000) { window.clearInterval(timer); resolve(); }
    }, 50);
  });
  stream.getTracks().forEach((track) => track.stop());
  await context.close().catch(() => undefined);
  onLevel?.(0);
  steps.push(`Volume máximo captado: ${Math.round(peak * 100)}%`);
  if (peak < 0.08) {
    return {
      ok: false,
      steps,
      advice: `O microfone "${label}" está mudo ou muito baixo. Escolha outro aparelho, confira o botão de mudo e aumente o volume de entrada do sistema.`,
    };
  }

  const recognitionWindow = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Recognition = recognitionWindow.SpeechRecognition ?? recognitionWindow.webkitSpeechRecognition;
  if (!Recognition) {
    steps.push('Reconhecimento do navegador: indisponível');
    return { ok: true, steps, advice: 'O microfone recebe som. Use o modo Servidor (Whisper) neste navegador.' };
  }

  const result = await new Promise<string>((resolve) => {
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;
    let heard = '';
    let settled = false;
    let done = 0;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(done);
      resolve(value);
    };
    done = window.setTimeout(() => {
      finish(heard ? `ok:${heard}` : 'sem-fala');
      try { recognition.abort(); } catch { /* The recognition may already have stopped. */ }
    }, 6000);
    recognition.onresult = (event) => {
      heard = event.results[event.results.length - 1]?.[0]?.transcript || '';
    };
    recognition.onerror = (event) => {
      finish(`erro:${event.error}`);
    };
    recognition.onend = () => {
      finish(heard ? `ok:${heard}` : 'sem-fala');
    };
    try { recognition.start(); } catch { finish('erro:start'); }
  });

  if (result.startsWith('ok:')) {
    steps.push(`Reconhecimento do navegador: ouviu "${result.slice(3)}"`);
    return { ok: true, steps, advice: 'O microfone e o reconhecimento do navegador estão funcionando.' };
  }
  if (result === 'sem-fala') {
    steps.push('Reconhecimento do navegador: não captou fala');
    return { ok: false, steps, advice: 'O microfone recebe som, mas o reconhecimento não entendeu. Fale durante todo o teste; se continuar, confira o microfone padrão do Chrome ou use o modo Servidor (Whisper).' };
  }
  const code = result.slice(5);
  steps.push(`Reconhecimento do navegador: erro "${code}"`);
  return {
    ok: false,
    steps,
    advice: code === 'network'
      ? 'A rede pode bloquear o serviço de voz do navegador. Use o modo Servidor (Whisper).'
      : 'O reconhecimento do navegador falhou. Use o modo Servidor (Whisper) ou confira a permissão do microfone.',
  };
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};