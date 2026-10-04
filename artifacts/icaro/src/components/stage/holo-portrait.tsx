import type { AvatarDefinition } from '@/lib/avatars';

const base = import.meta.env.BASE_URL;

export function HoloPortrait({ definition }: { definition: AvatarDefinition }) {
  if (!definition.image) return null;
  const src = `${base}${definition.image}`;

  return (
    <div className="holo-avatar__portrait" data-testid={`avatar-layer-${definition.id}`} aria-hidden="true">
      <img className="holo-avatar__img" src={src} alt="" draggable={false} data-testid={`img-avatar-${definition.id}`} />
      <img className="holo-avatar__img holo-avatar__jaw" src={src} alt="" draggable={false} />
    </div>
  );
}
