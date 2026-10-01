// Gerenciador da voz local (Piper no navegador). Ver local-voice.worker.ts.

export type VoiceMode = 'local' | 'server';
export type LocalVoiceStatus =
  | { state: 'idle' }
  | { state: 'loading'; percent: number | null }
  | { state: 'ready' }
  | { state: 'error'; message: string };

const MODE_KEY = 'icaro.voiceMode';
const SYNTH_TIMEOUT_MS = 15_000;

let worker: Worker | null = null;
let status: LocalVoiceStatus = { state: 'idle' };
let nextId = 1;
const pending = new Map<number, { resolve: (wav: ArrayBuffer) => void; reject: (e: Error) => void; timer: number }>();
const listeners = new Set<(s: LocalVoiceStatus) => void>();
let readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

export function localVoiceSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' &&
    typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

export function getVoiceMode(): VoiceMode {
  try { return localStorage.getItem(MODE_KEY) === 'server' ? 'server' : 'local'; } catch { return 'local'; }
}

export function setVoiceMode(mode: VoiceMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* preferência só desta sessão */ }
  if (mode === 'local') warmLocalVoice();
}

export function getLocalVoiceStatus(): LocalVoiceStatus { return status; }

export function onLocalVoiceStatus(fn: (s: LocalVoiceStatus) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function setStatus(next: LocalVoiceStatus) {
  status = next;
  for (const fn of listeners) fn(next);
  if (next.state === 'ready') { for (const w of readyWaiters) w.resolve(); readyWaiters = []; }
  if (next.state === 'error') {
    const error = new Error(next.message);
    for (const w of readyWaiters) w.reject(error);
    readyWaiters = [];
  }
}

function failAll(message: string) {
  for (const [id, p] of pending) { window.clearTimeout(p.timer); p.reject(new Error(message)); pending.delete(id); }
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./local-voice.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent) => {
    const msg = event.data as
      | { type: 'progress'; loaded: number; total: number }
      | { type: 'ready' }
      | { type: 'init-error'; message: string }
      | { type: 'audio'; id: number; wav: ArrayBuffer; ms: number }
      | { type: 'error'; id: number; message: string };
    if (msg.type === 'progress') setStatus({ state: 'loading', percent: Math.min(99, Math.round((msg.loaded / msg.total) * 100)) });
    else if (msg.type === 'ready') setStatus({ state: 'ready' });
    else if (msg.type === 'init-error') { setStatus({ state: 'error', message: msg.message }); failAll(msg.message); }
    else {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      window.clearTimeout(p.timer);
      if (msg.type === 'audio') {
        if (import.meta.env.DEV) console.info(`[voz local] frase sintetizada em ${msg.ms} ms`);
        p.resolve(msg.wav);
      } else p.reject(new Error(msg.message));
    }
  };
  w.onerror = (event) => {
    const message = event.message || 'O módulo de voz local falhou.';
    setStatus({ state: 'error', message });
    failAll(message);
    w.terminate();
    if (worker === w) worker = null;
  };
  worker = w;
  return w;
}

/** Começa a carregar o modelo em segundo plano (download só na primeira vez). */
export function warmLocalVoice() {
  if (!localVoiceSupported() || status.state === 'loading' || status.state === 'ready') return;
  setStatus({ state: 'loading', percent: null });
  ensureWorker().postMessage({ type: 'init' });
}

export function whenLocalVoiceReady(): Promise<void> {
  if (status.state === 'ready') return Promise.resolve();
  warmLocalVoice();
  if (status.state === 'error') return Promise.reject(new Error(status.message));
  return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }));
}

/** Ajustes de pronúncia para o eSpeak/Piper (a legenda continua com o texto original). */
export function localSpokenText(text: string): string {
  return text
    .replace(/\bUEFS\b/gi, 'Uéfis')
    .replace(/\b[IÍ]CARO\b/g, 'Ícaro')
    .replace(/\bIA\b/g, 'i á')
    .replace(/R\$\s?(\d[\d.,]*)(\s?mil(h(ão|ões))?)?/g, (_m, n: string, mult?: string) => `${n}${mult ?? ''} reais`);
}

/** Sintetiza uma frase e devolve um WAV. As chamadas são atendidas em ordem. */
export async function synthLocal(text: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!localVoiceSupported()) throw new Error('Este navegador não suporta a voz local.');
  if (signal?.aborted) throw new DOMException('Fala cancelada.', 'AbortError');
  warmLocalVoice();
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    // O tempo limite só começa a contar depois que o modelo estiver pronto.
    const arm = () => window.setTimeout(() => {
      if (pending.delete(id)) reject(new Error('A voz local demorou demais para responder.'));
    }, SYNTH_TIMEOUT_MS);
    const entry = { resolve, reject, timer: 0 };
    pending.set(id, entry);
    void whenLocalVoiceReady().then(() => { if (pending.has(id)) entry.timer = arm(); }, () => undefined);
    signal?.addEventListener('abort', () => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      window.clearTimeout(p.timer);
      w.postMessage({ type: 'cancel', id });
      reject(new DOMException('Fala cancelada.', 'AbortError'));
    }, { once: true });
    w.postMessage({ type: 'synth', id, text: localSpokenText(text) });
  });
}
