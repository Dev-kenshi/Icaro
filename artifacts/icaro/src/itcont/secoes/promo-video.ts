import {
  STORIES_VIDEO_DURATION_SECONDS,
  STORIES_VIDEO_FPS,
  STORIES_VIDEO_HEIGHT,
  STORIES_VIDEO_WIDTH,
  validateStoriesVideoMetadata,
} from "./promo-video-metadata";

export type StoriesVideoExport = { blob: Blob; extension: "mp4" | "webm" };
export type StoriesProgress = (progress: number, message: string) => void;

const TOTAL_FRAMES = STORIES_VIDEO_DURATION_SECONDS * STORIES_VIDEO_FPS;
const MIME_PREFERENCE = [
  { mime: 'video/mp4;codecs="avc1.42E01E"', extension: "mp4" as const },
  { mime: "video/mp4", extension: "mp4" as const },
  { mime: "video/webm;codecs=vp9", extension: "webm" as const },
  { mime: "video/webm;codecs=vp8", extension: "webm" as const },
  { mime: "video/webm", extension: "webm" as const },
];

function makeSnapshot(source: HTMLCanvasElement): HTMLCanvasElement {
  const snapshot = document.createElement("canvas");
  snapshot.width = STORIES_VIDEO_WIDTH;
  snapshot.height = STORIES_VIDEO_HEIGHT;
  const context = snapshot.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem dos Stories.");
  context.drawImage(source, 0, 0, snapshot.width, snapshot.height);
  return snapshot;
}

function drawFrame(source: HTMLCanvasElement, canvas: HTMLCanvasElement, frame: number) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível desenhar o vídeo dos Stories.");
  const progress = frame / Math.max(1, TOTAL_FRAMES - 1);
  const pulse = 0.5 - Math.cos(progress * Math.PI * 2) / 2;
  const zoom = 1.012 + pulse * 0.018;
  const width = STORIES_VIDEO_WIDTH * zoom;
  const height = STORIES_VIDEO_HEIGHT * zoom;
  const panX = Math.sin(progress * Math.PI * 2) * 5;
  const panY = Math.cos(progress * Math.PI * 2) * 7;
  context.fillStyle = "#edf3fb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, (canvas.width - width) / 2 + panX, (canvas.height - height) / 2 + panY, width, height);

  const sweepX = -STORIES_VIDEO_WIDTH * 0.4 + progress * STORIES_VIDEO_WIDTH * 1.8;
  const sheen = context.createLinearGradient(sweepX - 90, 0, sweepX + 90, STORIES_VIDEO_HEIGHT);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.12)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = sheen;
  context.fillRect(0, 0, STORIES_VIDEO_WIDTH, STORIES_VIDEO_HEIGHT);
}

function inspectVideoMetadata(blob: Blob): Promise<{ width: number; height: number; durationSeconds: number }> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timeout = window.setTimeout(() => finish(new Error("O navegador demorou para verificar o vídeo.")), 12_000);
    const finish = (error?: Error) => {
      const metadata = { width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration };
      window.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(metadata);
    };
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish(new Error("O navegador não conseguiu ler os metadados do vídeo."));
    video.src = url;
  });
}

function recordWithMediaRecorder(
  source: HTMLCanvasElement,
  mime: string,
  onProgress: StoriesProgress,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = STORIES_VIDEO_WIDTH;
  canvas.height = STORIES_VIDEO_HEIGHT;
  const snapshot = makeSnapshot(source);
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    throw new Error("A gravação de vídeo não está disponível neste navegador.");
  }
  const stream = canvas.captureStream(STORIES_VIDEO_FPS);
  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = [];
    let animationFrame = 0;
    let stopTimer = 0;
    let settled = false;
    let startedAt = 0;
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
    const cleanup = () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(stopTimer);
      stream.getTracks().forEach((track) => track.stop());
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(new Blob(chunks, { type: recorder.mimeType || mime }));
    };
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => finish(new Error("O navegador interrompeu a gravação dos Stories."));
    recorder.onstop = () => finish();
    const paint = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const frame = Math.min(TOTAL_FRAMES - 1, Math.floor(elapsed / 1_000 * STORIES_VIDEO_FPS));
      drawFrame(snapshot, canvas, frame);
      onProgress(Math.min(82, Math.round((elapsed / 1_000 / STORIES_VIDEO_DURATION_SECONDS) * 82)), "Gravando vídeo no navegador…");
      if (elapsed < STORIES_VIDEO_DURATION_SECONDS * 1_000) animationFrame = requestAnimationFrame(paint);
    };
    try {
      drawFrame(snapshot, canvas, 0);
      recorder.start(250);
      startedAt = performance.now();
      animationFrame = requestAnimationFrame(paint);
      stopTimer = window.setTimeout(() => {
        drawFrame(snapshot, canvas, TOTAL_FRAMES - 1);
        if (recorder.state !== "inactive") recorder.stop();
      }, STORIES_VIDEO_DURATION_SECONDS * 1_000);
    } catch (error) {
      try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* The encoder may already be stopped. */ }
      finish(error instanceof Error ? error : new Error("Não foi possível iniciar a gravação."));
    }
  });
}

async function encodeWithFfmpeg(source: HTMLCanvasElement, onProgress: StoriesProgress): Promise<Blob> {
  onProgress(2, "Carregando o codificador local…");
  const [{ FFmpeg }, { toBlobURL }, coreAsset, wasmAsset] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
    import("@ffmpeg/core?url"),
    import("@ffmpeg/core/wasm?url"),
  ]);
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(coreAsset.default, "text/javascript"),
      wasmURL: await toBlobURL(wasmAsset.default, "application/wasm"),
    });
    const canvas = document.createElement("canvas");
    canvas.width = STORIES_VIDEO_WIDTH;
    canvas.height = STORIES_VIDEO_HEIGHT;
    const snapshot = makeSnapshot(source);
    for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
      drawFrame(snapshot, canvas, frame);
      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível preparar um quadro do vídeo.")), "image/jpeg", 0.78);
      });
      await ffmpeg.writeFile(`frame${String(frame).padStart(4, "0")}.jpg`, new Uint8Array(await image.arrayBuffer()));
      onProgress(5 + Math.round(((frame + 1) / TOTAL_FRAMES) * 78), "Preparando quadros localmente…");
    }
    ffmpeg.on("progress", ({ progress }) => onProgress(84 + Math.round(Math.min(1, progress) * 14), "Codificando MP4 localmente…"));
    await ffmpeg.exec([
      "-framerate", String(STORIES_VIDEO_FPS),
      "-i", "frame%04d.jpg",
      "-t", String(STORIES_VIDEO_DURATION_SECONDS),
      "-an",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-b:v", "1400k",
      "-movflags", "+faststart",
      "stories.mp4",
    ]);
    const output = await ffmpeg.readFile("stories.mp4");
    if (typeof output === "string") throw new Error("O codificador não retornou um vídeo MP4.");
    const safeOutput = new Uint8Array(output.byteLength);
    safeOutput.set(output);
    return new Blob([safeOutput.buffer], { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
  }
}

export async function createStoriesVideo(source: HTMLCanvasElement, onProgress: StoriesProgress): Promise<StoriesVideoExport> {
  if (source.width < STORIES_VIDEO_WIDTH || source.height < STORIES_VIDEO_HEIGHT) {
    throw new Error("Selecione o formato Stories antes de gerar o vídeo.");
  }
  const supported = typeof MediaRecorder === "undefined"
    ? []
    : MIME_PREFERENCE.filter((item) => MediaRecorder.isTypeSupported(item.mime));
  let lastError: Error | null = null;
  for (const option of supported) {
    try {
      const blob = await recordWithMediaRecorder(source, option.mime, onProgress);
      const metadata = await inspectVideoMetadata(blob);
      validateStoriesVideoMetadata({ ...metadata, bytes: blob.size });
      return { blob, extension: option.extension };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("A gravação do vídeo falhou.");
    }
  }

  onProgress(1, "Usando o codificador local de reserva…");
  try {
    const blob = await encodeWithFfmpeg(source, onProgress);
    const metadata = await inspectVideoMetadata(blob);
    validateStoriesVideoMetadata({ ...metadata, bytes: blob.size });
    return { blob, extension: "mp4" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : lastError?.message || "falha no codificador";
    throw new Error(`Não foi possível gerar um vídeo Stories neste navegador: ${detail}`);
  }
}
