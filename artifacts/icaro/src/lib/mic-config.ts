// Configuração do microfone do ÍCARO.
// - "navegador": reconhecimento contínuo do Chrome/Edge (palavra de ativação "Ok, Ícaro").
// - "servidor": grava a fala e transcreve com Whisper (Groq) no servidor: funciona mesmo
//   quando a rede bloqueia o serviço de voz do Google ou o navegador não tem reconhecimento.
// - "auto": usa o navegador e troca sozinho para o servidor se o navegador falhar.

export type MicMode = 'auto' | 'browser' | 'server';
const MODE_KEY = 'icaro.micMode';
const DEVICE_KEY = 'icaro.micDevice';
const BASE_URL = import.meta.env.BASE_URL;

/** Erros do reconhecimento do navegador que a transcrição pelo servidor resolve. */
export const SERVER_FALLBACK_ERRORS = new Set(['network', 'service-not-allowed', 'language-not-supported', 'unsupported']);

export function getMicMode(): MicMode {
  try { const v = localStorage.getItem(MODE_KEY); return v === 'browser' || v === 'server' ? v : 'auto'; } catch { return 'auto'; }
}
export function setMicMode(mode: MicMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* só nesta sessão */ }
}
export function getMicDeviceId(): string {
  try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; }
}
export function setMicDeviceId(id: string) {
  try { if (id) localStorage.setItem(DEVICE_KEY, id); else localStorage.removeItem(DEVICE_KEY); } catch { /* só nesta sessão */ }
}

export async function listMicrophones(): Promise<Array<{ id: string; label: string }>> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microfone ${i + 1}` }));
}

function audioConstraints(deviceId: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

/** Abre o microfone escolhido; se ele sumiu (desconectado), volta para o padrão do sistema. */
export async function openMicrophone(deviceId = getMicDeviceId()): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
  } catch (error) {
    if (deviceId && error instanceof DOMException && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')) {
      setMicDeviceId('');
      return navigator.mediaDevices.getUserMedia({ audio: audioConstraints('') });
    }
    throw error;
  }
}

export function micErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError': case 'SecurityError':
      return 'O microfone está bloqueado para este site. Clique no cadeado ao lado do endereço → Microfone → Permitir, e recarregue a página.';
    case 'NotFoundError': case 'OverconstrainedError':
      return 'Nenhum microfone encontrado. Conecte um microfone ou escolha outro na lista.';
    case 'NotReadableError': case 'AbortError':
      return 'O microfone está em uso por outro programa (Teams, Zoom, Discord, WhatsApp…). Feche-o e tente de novo.';
    default:
      return 'Não foi possível abrir o microfone. Confira o aparelho e a permissão do navegador.';
  }
}

function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return options.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}

export type RecordOptions = {
  deviceId?: string;
  signal?: AbortSignal;
  onLevel?: (level: number) => void;
  onSpeech?: () => void;
  /** Silêncio depois da fala que encerra a gravação. */
  silenceMs?: number;
  /** Tempo máximo esperando alguém começar a falar. */
  startTimeoutMs?: number;
  maxMs?: number;
};

/**
 * Grava uma fala: começa quando a voz passa do ruído de fundo e termina após um silêncio.
 * Devolve null se ninguém falou (ou se foi cancelado).
 */
export async function recordUtterance(opts: RecordOptions = {}): Promise<Blob | null> {
  const { silenceMs = 900, startTimeoutMs = 8000, maxMs = 15000 } = opts;
  const stream = await openMicrophone(opts.deviceId);
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const buf = new Float32Array(analyser.fftSize);

  return new Promise<Blob | null>((resolve) => {
    const t0 = performance.now();
    let noise = 0.01;
    let spoke = false;
    let lastVoice = 0;
    let finished = false;
    const finish = (keep: boolean) => {
      if (finished) return;
      finished = true;
      window.clearInterval(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
        opts.onLevel?.(0);
        resolve(keep && spoke && chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
      };
      if (recorder.state !== 'inactive') recorder.stop(); else recorder.onstop(new Event('stop'));
    };
    const onAbort = () => finish(false);
    opts.signal?.addEventListener('abort', onAbort);
    recorder.start(250);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      const elapsed = now - t0;
      opts.onLevel?.(Math.min(1, rms * 12));
      if (elapsed < 300) { noise = Math.max(noise, rms); return; } // calibra o ruído de fundo
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
  });
}

export async function transcribeOnServer(audio: Blob, signal?: AbortSignal): Promise<string> {
  const r = await fetch(`${BASE_URL}api/ai/stt`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
    signal,
  });
  const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!r.ok) throw new Error(j.error || `Transcrição falhou (${r.status}).`);
  return (j.text || '').trim();
}

export type MicDiagnosis = {
  ok: boolean;
  steps: string[];
  advice: string;
};

/** Testa permissão, aparelho, volume e o reconhecimento do navegador; diz o que fazer. */
export async function diagnoseMicrophone(onLevel?: (level: number) => void): Promise<MicDiagnosis> {
  const steps: string[] = [];
  if (!window.isSecureContext) return { ok: false, steps, advice: 'Abra o Ícaro pelo endereço https.' };
  if (window.top !== window) return { ok: false, steps, advice: 'Esta janela está dentro de outra página (prévia do Replit). Abra o Ícaro em uma aba própria.' };
  let stream: MediaStream;
  try {
    stream = await openMicrophone();
  } catch (error) {
    return { ok: false, steps: ['Microfone: não abriu'], advice: micErrorMessage(error) };
  }
  const label = stream.getAudioTracks()[0]?.label || 'microfone padrão';
  steps.push(`Microfone aberto: ${label}`);
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  await new Promise<void>((resolve) => {
    const t0 = performance.now();
    const id = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 12);
      peak = Math.max(peak, level);
      onLevel?.(level);
      if (performance.now() - t0 > 4000) { window.clearInterval(id); resolve(); }
    }, 50);
  });
  stream.getTracks().forEach((t) => t.stop());
  void ctx.close().catch(() => undefined);
  onLevel?.(0);
  steps.push(`Volume máximo captado: ${Math.round(peak * 100)}%`);
  if (peak < 0.08) {
    return { ok: false, steps, advice: `O microfone "${label}" está mudo ou muito baixo. Escolha outro aparelho na lista, confira se não está no mudo e aumente o volume de entrada no Windows (Configurações → Sistema → Som → Entrada).` };
  }

  const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike });
  const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
  if (!Ctor) {
    steps.push('Reconhecimento do navegador: não existe neste navegador');
    return { ok: true, steps, advice: 'O microfone funciona. Este navegador não reconhece voz sozinho: use o modo "Servidor (Whisper)".' };
  }
  const result = await new Promise<string>((resolve) => {
    const rec = new Ctor();
    rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
    let heard = '';
    const done = window.setTimeout(() => { try { rec.abort(); } catch { /* noop */ } resolve(heard ? `ok:${heard}` : 'sem-fala'); }, 6000);
    rec.onresult = (e) => { heard = e.results[e.results.length - 1][0].transcript; };
    rec.onerror = (e) => { window.clearTimeout(done); resolve(`erro:${e.error}`); };
    rec.onend = () => { window.clearTimeout(done); resolve(heard ? `ok:${heard}` : 'sem-fala'); };
    try { rec.start(); } catch { window.clearTimeout(done); resolve('erro:start'); }
  });
  if (result.startsWith('ok:')) {
    steps.push(`Reconhecimento do navegador: ouviu "${result.slice(3)}"`);
    return { ok: true, steps, advice: 'Tudo funcionando. Pode usar o modo Automático ou Navegador.' };
  }
  if (result === 'sem-fala') {
    steps.push('Reconhecimento do navegador: não captou fala (fale durante o teste)');
    return { ok: false, steps, advice: 'O som chega, mas o navegador não reconheceu fala. Repita o teste falando durante os 6 segundos; se continuar, use o modo "Servidor (Whisper)". O Chrome usa o microfone padrão do sistema: defina-o em chrome://settings/content/microphone.' };
  }
  const code = result.slice(5);
  steps.push(`Reconhecimento do navegador: erro "${code}"`);
  return {
    ok: false,
    steps,
    advice: code === 'network'
      ? 'A rede bloqueia o serviço de voz do Google (comum em redes de universidade e empresa). Use o modo "Servidor (Whisper)": ele funciona nessa rede.'
      : 'O reconhecimento do navegador falhou. Use o modo "Servidor (Whisper)".',
  };
}

type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
