import { useEffect, useRef } from 'react';
import { holoGlow, type HoloStageState } from '@/lib/holo-state';
import {
  createHoloAvatar,
  detachHoloAvatar,
  failSpeechAvatarWaiters,
  setHoloAvatarState,
  setSpeechAvatar,
} from '@/lib/speech';
import type { IcaroAvatarInstance } from '@/lib/icaro-avatar';
import type { AvatarLayout } from '@/lib/avatar-layout';
import type { AvatarDefinition } from '@/lib/avatars';
import { HoloPortrait } from '@/components/stage/holo-portrait';

export function HoloFace({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avatarRef = useRef<IcaroAvatarInstance | null>(null);
  const hasPortrait = Boolean(definition.image);
  const stateRef = useRef(state);
  stateRef.current = state;
  const levelRef = useRef(getLevel);
  levelRef.current = getLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let mounted = true;
    void createHoloAvatar(canvas).then((instance) => {
      if (!mounted) {
        detachHoloAvatar(instance);
        return;
      }
      avatarRef.current = instance;
      void instance.ready.then(() => {
        if (!mounted) return;
        setSpeechAvatar(instance);
        setHoloAvatarState(stateRef.current);
      }).catch((error: unknown) => {
        if (mounted) {
          failSpeechAvatarWaiters(error);
          console.error('Não foi possível carregar os arquivos do rosto do Ícaro.', error);
        }
      });
    }).catch((error: unknown) => {
      if (mounted) {
        failSpeechAvatarWaiters(error);
        console.error('Não foi possível iniciar o rosto do Ícaro.', error);
      }
    });
    return () => {
      mounted = false;
      const instance = avatarRef.current;
      avatarRef.current = null;
      if (instance) detachHoloAvatar(instance);
      else canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  useEffect(() => {
    setHoloAvatarState(state);
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
      level += (target - level) * .25;
      const glow = holoGlow(level);
      const mouthOpen = currentState === 'talking'
        ? avatarRef.current?.mouth.open.x ?? 0
        : currentState === 'listening' ? level : 0;
      const root = rootRef.current;
      if (root) {
        root.style.setProperty('--holo-bright', glow.brightness.toFixed(3));
        root.style.setProperty('--holo-sat', glow.saturate.toFixed(3));
        // Keep the parent transform at its static scale; the avatar motor owns head motion.
        root.style.setProperty('--holo-scale', '1');
        root.style.setProperty('--talk', mouthOpen.toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      className="face"
      aria-hidden
      data-avatar-id={definition.id}
      data-user-hidden={layout.hidden ? 'true' : undefined}
      data-testid="holo-face"
    >
      <div className="face-orb" data-testid="holo-face-orb">
        <canvas
          ref={canvasRef}
          className="icaro-face"
          aria-hidden={hasPortrait || undefined}
          data-avatar-engine-hidden={hasPortrait ? 'true' : undefined}
          data-testid="holo-face-canvas"
        />
        {hasPortrait && <HoloPortrait definition={definition} />}
        <span className="orb-ring orb-ring--outer" />
        <span className="orb-ring orb-ring--main" />
        <span className="orb-ring orb-ring--inner" />
        <span className="holo-avatar__scan" aria-hidden="true" />
        <span className="holo-avatar__sweep" aria-hidden="true" />
        <span className="holo-avatar__projector" aria-hidden="true" />
      </div>
    </div>
  );
}