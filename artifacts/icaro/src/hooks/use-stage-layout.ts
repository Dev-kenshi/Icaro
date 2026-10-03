import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import {
  clampStagePosition,
  readStageLayout,
  writeStageLayout,
  DEFAULT_STAGE_POSITION,
  type StageChromeId,
  type StageLayout,
  type StagePosition,
} from '@/lib/stage-layout';

export interface StageLayoutController {
  positions: StageLayout;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  /** Props para espalhar no elemento que pode ser movido. */
  chrome: (id: StageChromeId) => {
    'data-chrome-id': StageChromeId;
    style: CSSProperties;
    onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
    onClickCapture?: (event: SyntheticEvent) => void;
  };
  resetLayout: () => void;
}

/**
 * Posições arrastáveis da interface do palco. No modo de edição, o elemento
 * inteiro vira superfície de arraste e os cliques internos ficam bloqueados.
 */
export function useStageLayout(): StageLayoutController {
  const [positions, setPositions] = useState<StageLayout>(readStageLayout);
  const [editing, setEditingState] = useState(false);

  const beginDrag = useCallback((id: StageChromeId, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const base: StagePosition = { ...DEFAULT_STAGE_POSITION, ...readStageLayout()[id] };
    const target = event.currentTarget;
    target.setAttribute('data-dragging', 'true');

    const onMove = (move: PointerEvent) => {
      const next = clampStagePosition({ x: base.x + move.clientX - startX, y: base.y + move.clientY - startY });
      setPositions((current) => ({ ...current, [id]: next }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      target.removeAttribute('data-dragging');
      setPositions((current) => {
        writeStageLayout(current);
        return current;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  const resetLayout = useCallback(() => {
    setPositions({});
    writeStageLayout({});
  }, []);

  const setEditing = useCallback((next: boolean) => setEditingState(next), []);

  const chrome = useCallback<StageLayoutController['chrome']>((id) => {
    const position = positions[id] ?? DEFAULT_STAGE_POSITION;
    return {
      'data-chrome-id': id,
      style: { '--chrome-x': `${position.x}px`, '--chrome-y': `${position.y}px` } as CSSProperties,
      onPointerDown: editing ? (event) => beginDrag(id, event) : undefined,
      onClickCapture: editing
        ? (event) => { event.preventDefault(); event.stopPropagation(); }
        : undefined,
    };
  }, [positions, editing, beginDrag]);

  return { positions, editing, setEditing, chrome, resetLayout };
}
