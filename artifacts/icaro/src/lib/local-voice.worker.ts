/// <reference lib="webworker" />
// Voz local do ÍCARO: Piper (pt_BR-faber-medium) rodando em WebAssembly dentro de um Worker.
// Sem chave de API e sem cota. O modelo (~63 MB) é baixado uma vez e fica guardado no
// armazenamento privado do navegador (OPFS); depois a síntese é toda local.
import { TtsSession } from '@mintplex-labs/piper-tts-web';

const LOCAL_VOICE_ID = 'pt_BR-faber-medium';

type InMsg = { type: 'init' } | { type: 'synth'; id: number; text: string } | { type: 'cancel'; id: number };

let session: Promise<TtsSession> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const cancelled = new Set<number>();

function init(): Promise<TtsSession> {
  session ??= TtsSession.create({
    voiceId: LOCAL_VOICE_ID,
    progress: (p) => {
      if (p.total > 0 && /\.onnx$/.test(p.url)) {
        postMessage({ type: 'progress', loaded: p.loaded, total: p.total });
      }
    },
  }).then((s) => { postMessage({ type: 'ready' }); return s; })
    .catch((error: unknown) => {
      session = null;
      postMessage({ type: 'init-error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    });
  return session;
}

self.onmessage = (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  if (msg.type === 'init') { void init().catch(() => undefined); return; }
  if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
  if (msg.type === 'synth') {
    // Uma frase por vez, na ordem de chegada: a 1ª frase da resposta sai primeiro.
    queue = queue.then(async () => {
      if (cancelled.delete(msg.id)) return; // fala interrompida antes da vez desta frase
      const started = performance.now();
      try {
        const s = await init();
        const wav = await (await s.predict(msg.text)).arrayBuffer();
        postMessage({ type: 'audio', id: msg.id, wav, ms: Math.round(performance.now() - started) }, [wav]);
      } catch (error) {
        postMessage({ type: 'error', id: msg.id, message: error instanceof Error ? error.message : String(error) });
      }
    });
  }
};
