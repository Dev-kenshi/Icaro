import { siGooglecalendar, siGooglemaps, siWhatsapp } from 'simple-icons';

const icons = {
  calendar: siGooglecalendar,
  maps: siGooglemaps,
  whatsapp: siWhatsapp,
};

export function MarcaIcone({ marca }: { marca: keyof typeof icons }) {
  const icon = icons[marca];
  return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill={`#${icon.hex}`}><path d={icon.path} /></svg>;
}
