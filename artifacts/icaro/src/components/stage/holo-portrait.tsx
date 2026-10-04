import type { CSSProperties } from 'react';
import type { AvatarDefinition } from '@/lib/avatars';

const base = import.meta.env.BASE_URL;

export function HoloPortrait({ definition }: { definition: AvatarDefinition }) {
  if (!definition.image) return null;
  const src = `${base}${definition.image}`;
  const mouth = definition.mouth;
  // A abertura (--talk, 0..1) vem do motor de visemas; aqui só posicionamos a boca.
  const style = mouth
    ? ({ '--mouth-x': mouth.x, '--mouth-y': mouth.y, '--mouth-w': mouth.width, '--mouth-k': mouth.open ?? 0.22 } as CSSProperties)
    : undefined;

  return (
    <div className="holo-avatar__portrait" style={style} data-testid={`avatar-layer-${definition.id}`} aria-hidden="true">
      <img className="holo-avatar__img" src={src} alt="" draggable={false} data-testid={`img-avatar-${definition.id}`} />
      {mouth && (
        <>
          <span className="holo-avatar__mouth-cavity" />
          <img className="holo-avatar__img holo-avatar__jaw" src={src} alt="" draggable={false} />
        </>
      )}
    </div>
  );
}
