export interface AvatarLayout {
  offsetX: number;
  offsetY: number;
  scale: number;
  hidden: boolean;
}

export type AvatarLayoutAction =
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'move-down'
  | 'toggle-visibility'
  | 'smaller'
  | 'larger'
  | 'reset';

export const AVATAR_LAYOUT_STORAGE_KEY = 'icaro.stage.avatar-layout';

export const DEFAULT_AVATAR_LAYOUT: AvatarLayout = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  hidden: false,
};

const MOVE_STEP = 6;
const SCALE_STEP = 0.1;
const MIN_OFFSET_X = -42;
const MAX_OFFSET_X = 42;
const MIN_OFFSET_Y = -38;
const MAX_OFFSET_Y = 38;
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.2;

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

export function parseAvatarLayout(raw: string | null): AvatarLayout {
  if (!raw) return { ...DEFAULT_AVATAR_LAYOUT };
  try {
    const value = JSON.parse(raw) as Partial<AvatarLayout> | null;
    if (!value || typeof value !== 'object') return { ...DEFAULT_AVATAR_LAYOUT };
    return {
      offsetX: boundedNumber(value.offsetX, MIN_OFFSET_X, MAX_OFFSET_X, 0),
      offsetY: boundedNumber(value.offsetY, MIN_OFFSET_Y, MAX_OFFSET_Y, 0),
      scale: boundedNumber(value.scale, MIN_SCALE, MAX_SCALE, 1),
      hidden: typeof value.hidden === 'boolean' ? value.hidden : false,
    };
  } catch {
    return { ...DEFAULT_AVATAR_LAYOUT };
  }
}

export function readAvatarLayout(): AvatarLayout {
  try {
    return parseAvatarLayout(localStorage.getItem(AVATAR_LAYOUT_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_AVATAR_LAYOUT };
  }
}

export function updateAvatarLayout(layout: AvatarLayout, action: AvatarLayoutAction): AvatarLayout {
  switch (action) {
    case 'move-left':
      return { ...layout, offsetX: boundedNumber(layout.offsetX - MOVE_STEP, MIN_OFFSET_X, MAX_OFFSET_X, 0) };
    case 'move-right':
      return { ...layout, offsetX: boundedNumber(layout.offsetX + MOVE_STEP, MIN_OFFSET_X, MAX_OFFSET_X, 0) };
    case 'move-up':
      return { ...layout, offsetY: boundedNumber(layout.offsetY - MOVE_STEP, MIN_OFFSET_Y, MAX_OFFSET_Y, 0) };
    case 'move-down':
      return { ...layout, offsetY: boundedNumber(layout.offsetY + MOVE_STEP, MIN_OFFSET_Y, MAX_OFFSET_Y, 0) };
    case 'toggle-visibility':
      return { ...layout, hidden: !layout.hidden };
    case 'smaller':
      return { ...layout, scale: boundedNumber(layout.scale - SCALE_STEP, MIN_SCALE, MAX_SCALE, 1) };
    case 'larger':
      return { ...layout, scale: boundedNumber(layout.scale + SCALE_STEP, MIN_SCALE, MAX_SCALE, 1) };
    case 'reset':
      return { ...layout, offsetX: 0, offsetY: 0, scale: 1 };
  }
}