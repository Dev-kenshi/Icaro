import { useRef, useState } from 'react';
import { Move } from 'lucide-react';
import type { CosmosFeedsResponse } from '@workspace/api-client-react';
import { CosmosRenderer, type CosmosScene } from './renderer';

type Point = { x: number; y: number };
type Panel = { scene: CosmosScene; label: string };
type DragState = {
  scene: CosmosScene;
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: Point;
  panelRect: DOMRect;
  stageRect: DOMRect;
};

const PANELS: Panel[] = [
  { scene: 'galaxy', label: 'Galáxia' },
  { scene: 'system', label: 'Sistema Solar' },
  { scene: 'earth', label: 'Terra ao vivo' },
];

const INITIAL_POSITIONS: Record<CosmosScene, Point> = {
  galaxy: { x: 0, y: 0 },
  system: { x: 0, y: 0 },
  earth: { x: 0, y: 0 },
};

function clampDelta(
  delta: number,
  stageStart: number,
  stageEnd: number,
  panelStart: number,
  panelEnd: number,
) {
  const margin = 40;
  const minimum = stageStart + margin - panelStart;
  const maximum = stageEnd - margin - panelEnd;
  if (minimum > maximum) return delta;
  return Math.max(minimum, Math.min(maximum, delta));
}

type Props = {
  quality: 'auto' | 'high' | 'medium' | 'low';
  visible: boolean;
  feeds?: CosmosFeedsResponse;
  targetCity: boolean;
  state: string;
  getAudioLevel: () => number;
};

export function CosmosOverview({ quality, visible, feeds, targetCity, state, getAudioLevel }: Props) {
  const [positions, setPositions] = useState(INITIAL_POSITIONS);
  const [draggingScene, setDraggingScene] = useState<CosmosScene | null>(null);
  const positionsRef = useRef(positions);
  const dragRef = useRef<DragState | null>(null);
  positionsRef.current = positions;

  const setPosition = (scene: CosmosScene, position: Point) => {
    setPositions((current) => {
      const next = { ...current, [scene]: position };
      positionsRef.current = next;
      return next;
    });
  };

  const onPointerDown = (scene: CosmosScene, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const handle = event.currentTarget;
    const panel = handle.closest<HTMLElement>('.cosmos-panel');
    const stage = handle.closest<HTMLElement>('.stage');
    if (!panel || !stage) return;

    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      scene,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: positionsRef.current[scene],
      panelRect: panel.getBoundingClientRect(),
      stageRect: stage.getBoundingClientRect(),
    };
    handle.setPointerCapture(event.pointerId);
    setDraggingScene(scene);
  };

  const onPointerMove = (scene: CosmosScene, event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.scene !== scene || drag.pointerId !== event.pointerId) return;

    const deltaX = clampDelta(event.clientX - drag.startX, drag.stageRect.left, drag.stageRect.right, drag.panelRect.left, drag.panelRect.right);
    const deltaY = clampDelta(event.clientY - drag.startY, drag.stageRect.top, drag.stageRect.bottom, drag.panelRect.top, drag.panelRect.bottom);
    setPosition(scene, { x: drag.startOffset.x + deltaX, y: drag.startOffset.y + deltaY });
  };

  const onPointerEnd = (scene: CosmosScene, event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.scene !== scene || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingScene(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onHandleKeyDown = (scene: CosmosScene, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      setPosition(scene, { x: 0, y: 0 });
      return;
    }

    const directions: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();

    const handle = event.currentTarget;
    const panel = handle.closest<HTMLElement>('.cosmos-panel');
    const stage = handle.closest<HTMLElement>('.stage');
    if (!panel || !stage) return;
    const panelRect = panel.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const current = positionsRef.current[scene];
    const step = event.shiftKey ? 32 : 12;
    const deltaX = clampDelta(direction.x * step, stageRect.left, stageRect.right, panelRect.left, panelRect.right);
    const deltaY = clampDelta(direction.y * step, stageRect.top, stageRect.bottom, panelRect.top, panelRect.bottom);
    setPosition(scene, { x: current.x + deltaX, y: current.y + deltaY });
  };

  return (
    <div className="cosmos-overview" role="group" aria-label="Terra, Galáxia e Sistema Solar" data-testid="cosmos-overview">
      {PANELS.map(({ scene, label }) => {
        const position = positions[scene];
        return (
          <section
            key={scene}
            className={`cosmos-panel cosmos-panel--${scene}`}
            aria-label={`Visualização ${label}`}
            data-testid={`panel-scene-${scene}`}
            data-dragging={draggingScene === scene ? 'true' : 'false'}
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
          >
            <div className="cosmos-panel__drift">
              <CosmosRenderer
                scene={scene}
                quality={quality}
                visible={visible}
                transparentBackground
                feeds={feeds}
                targetCity={scene === 'earth' && targetCity}
                state={state}
                getAudioLevel={getAudioLevel}
                navigationLabel={`Controles de ${label}`}
              />
            </div>
            <button
              type="button"
              className="cosmos-panel__label"
              aria-label={`Mover ${label}. Arraste ou use as setas; pressione Home para voltar à posição inicial.`}
              title="Arraste para mover · setas para posicionar · Home para redefinir"
              data-testid={`label-scene-${scene}`}
              onPointerDown={(event) => onPointerDown(scene, event)}
              onPointerMove={(event) => onPointerMove(scene, event)}
              onPointerUp={(event) => onPointerEnd(scene, event)}
              onPointerCancel={(event) => onPointerEnd(scene, event)}
              onKeyDown={(event) => onHandleKeyDown(scene, event)}
            >
              <Move size={12} aria-hidden="true" />
              <span>{label}</span>
            </button>
          </section>
        );
      })}
    </div>
  );
}