export const STORIES_VIDEO_WIDTH = 1080;
export const STORIES_VIDEO_HEIGHT = 1920;
export const STORIES_VIDEO_DURATION_SECONDS = 8;
export const STORIES_VIDEO_FPS = 30;
export const STORIES_VIDEO_MAX_BYTES = 15 * 1024 * 1024;

export type StoriesVideoMetadata = {
  width: number;
  height: number;
  durationSeconds: number;
  bytes: number;
};

export function validateStoriesVideoMetadata(metadata: StoriesVideoMetadata): void {
  if (metadata.width !== STORIES_VIDEO_WIDTH || metadata.height !== STORIES_VIDEO_HEIGHT) {
    throw new Error("O vídeo precisa ter 1080 × 1920 pixels.");
  }
  if (!Number.isFinite(metadata.durationSeconds)
    || metadata.durationSeconds < 7
    || metadata.durationSeconds > 9) {
    throw new Error("O vídeo precisa durar entre 7 e 9 segundos.");
  }
  if (!Number.isFinite(metadata.bytes) || metadata.bytes <= 0 || metadata.bytes >= STORIES_VIDEO_MAX_BYTES) {
    throw new Error("O vídeo ultrapassou o limite de 15 MB.");
  }
}
