/**
 * Posições dos elementos da interface do palco (cabeçalho, leituras, legendas,
 * dock…). Qualquer elemento marcado com `data-chrome-id` pode ser arrastado no
 * modo "Reorganizar" e a posição fica salva neste dispositivo.
 */

export interface StagePosition { x: number; y: number }
export type StageLayout = Record<string, StagePosition>;

export const STAGE_LAYOUT_STORAGE_KEY = 'icaro.stage.chrome-layout';

export const STAGE_CHROME_IDS = [
  'header',
  'readout-left',
  'readout-right',
  'caption',
  'dock',
  'menu',
] as const;
export type StageChromeId = (typeof STAGE_CHROME_IDS)[number];

export const DEFAULT_STAGE_POSITION: StagePosition = { x: 0, y: 0 };

function bounded(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(Math.min(max, Math.max(-max, value)));
}

export function clampStagePosition(position: StagePosition): StagePosition {
  const maxX = typeof window === 'undefined' ? 600 : window.innerWidth * 0.45;
  const maxY = typeof window === 'undefined' ? 400 : window.innerHeight * 0.45;
  return { x: bounded(position.x, maxX), y: bounded(position.y, maxY) };
}

export function parseStageLayout(raw: string | null): StageLayout {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, Partial<StagePosition> | null> | null;
    if (!value || typeof value !== 'object') return {};
    const layout: StageLayout = {};
    for (const [id, position] of Object.entries(value)) {
      if (!STAGE_CHROME_IDS.includes(id as StageChromeId) || !position || typeof position !== 'object') continue;
      layout[id] = clampStagePosition({ x: Number(position.x), y: Number(position.y) });
    }
    return layout;
  } catch {
    return {};
  }
}

export function readStageLayout(): StageLayout {
  try {
    return parseStageLayout(localStorage.getItem(STAGE_LAYOUT_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeStageLayout(layout: StageLayout): boolean {
  try {
    localStorage.setItem(STAGE_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}
