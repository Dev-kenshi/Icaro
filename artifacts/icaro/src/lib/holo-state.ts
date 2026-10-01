/** Shared states and restrained glow for the canvas hologram. */
export type HoloStageState = 'idle' | 'listening' | 'thinking' | 'talking' | 'intro';

export const HOLO_MEDIA = {
  avatar: 'holo-avatar.jpg',
} as const;

/** Audio level (0..1) → hologram glow, same curve as the kit's CSS. */
export function holoGlow(level: number) {
  const l = Number.isFinite(level) ? Math.min(Math.max(level, 0), 1) : 0;
  return { brightness: 1 + l * 0.35, saturate: 1 + l * 0.2, scale: 1 + l * 0.012 };
}
