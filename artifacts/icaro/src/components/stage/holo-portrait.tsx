import { useEffect, useRef } from 'react';
import { holoGlow, type HoloStageState } from '@/lib/holo-state';
import type { AvatarDefinition } from '@/lib/avatars';
import type { AvatarLayout } from '@/lib/avatar-layout';

const base = import.meta.env.BASE_URL;

/**
 * Retrato holográfico realista do Ícaro. Usa a imagem gerada com fundo
 * transparente; uma duplicata mascarada na região da boca reage ao nível de
 * áudio real da voz, e scanlines/varredura mantêm a leitura de holograma.
 */
export function HoloPortrait({
  definition,
  state,
  getLevel,
  layout,
}: {
  definition: AvatarDefinition;
  state: HoloStageState;
  getLevel: () => number;
  layout: AvatarLayout;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const levelRef = useRef(getLevel);
  levelRef.current = getLevel;

  useEffect(() => {
    if (rootRef.current) rootRef.current.style.opacity = state === 'intro' ? '0' : '1';
  }, [state]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty('--holo-offset-x', `${layout.offsetX}vw`);
    root.style.setProperty('--holo-offset-y', `${layout.offsetY}vh`);
    root.style.setProperty('--holo-user-scale', String(layout.scale));
  }, [layout.offsetX, layout.offsetY, layout.scale]);

  useEffect(() => {
    let raf = 0;
    let level = 0;
    const tick = () => {
      const currentState = stateRef.current;
      const active = currentState === 'talking' || currentState === 'listening';
      const target = active ? levelRef.current() : 0;
      level += (target - level) * .22;
      const root = rootRef.current;
      if (root) {
        const glow = holoGlow(level);
        root.style.setProperty('--holo-bright', glow.brightness.toFixed(3));
        root.style.setProperty('--holo-sat', glow.saturate.toFixed(3));
        root.style.setProperty('--holo-scale', '1');
        root.style.setProperty('--talk', level.toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const src = `${base}${definition.image}`;

  return (
    <div ref={rootRef} className="face face--portrait" aria-hidden data-user-hidden={layout.hidden ? 'true' : undefined} data-testid="holo-portrait">
      <div className="holo-portrait">
        <img className="holo-portrait__img" src={src} alt="" draggable={false} />
        <img className="holo-portrait__img holo-portrait__jaw" src={src} alt="" aria-hidden draggable={false} />
        <span className="holo-portrait__scan" aria-hidden="true" />
        <span className="holo-portrait__sweep" aria-hidden="true" />
        <span className="holo-portrait__projector" aria-hidden="true" />
      </div>
    </div>
  );
}
