export type GeoTarget = {
  latitude: number;
  longitude: number;
  label: string;
  city?: string;
  state?: string;
  country?: string;
  street?: string;
};

/** Extracts a place name from a normalized voice command ("onde fica Tóquio", "voe para Lisboa", "mostre Salvador no mapa"). */
export function parseFlyQuery(t: string): string | null {
  const m =
    /(?:onde fica|onde e|aonde fica)\s+(?:a |o |as |os )?(.+)$/i.exec(t) ??
    /(?:mostre|mostrar|mostra|exiba|ver)\s+(?:a |o )?(.+?)\s+no mapa$/i.exec(t) ??
    /(?:va|voe|voar|viajar|leve|navegue|ir)\s+(?:para|ate)?\s*(?:a |o |ao )?(.+)$/i.exec(t);
  const q = m?.[1]?.replace(/[.?!]+$/, '').trim();
  return q && q.length >= 2 && q.length <= 80 ? q : null;
}

/** Photon geocoding supports cities, street names, and street numbers. */
export function geocodeUrl(name: string) {
  return `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=1&lang=pt`;
}

export function parseGeocode(payload: unknown): GeoTarget | null {
  if (!payload || typeof payload !== 'object') return null;
  const first = (payload as { features?: unknown }).features;
  const feature = Array.isArray(first) ? first[0] : null;
  if (!feature || typeof feature !== 'object') return null;
  const f = feature as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };
  const coords = f.geometry?.coordinates;
  const p = f.properties ?? {};
  if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') return null;
  const longitude = coords[0], latitude = coords[1];
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const text = (...keys: string[]) => keys.map((key) => p[key]).find((v): v is string => typeof v === 'string' && !!v.trim()) as string | undefined;
  const city = text('city', 'locality', 'district', 'name');
  const state = text('state');
  const country = text('country');
  const street = [text('housenumber'), text('street')].filter(Boolean).join(' ');
  const label = [street, city, state, country].filter((part, i, all): part is string => !!part && all.indexOf(part) === i).join(', ');
  return { latitude, longitude, label: label || 'Local encontrado', city, state, country, street };
}

export type MapView = 'map' | 'satellite' | 'street';

export function googleMapEmbedUrl(target: GeoTarget, view: MapView, zoom = 15) {
  if (!isValidGeoTarget(target)) return '';
  const point = `${target.latitude},${target.longitude}`;
  if (view === 'street') return `https://maps.google.com/maps?layer=c&cbll=${point}&cbp=12,90,0,0,0&output=svembed`;
  const safeZoom = Math.max(2, Math.min(20, Math.round(zoom)));
  const type = view === 'satellite' ? 'k' : 'm';
  return `https://www.google.com/maps?q=${point}&z=${safeZoom}&t=${type}&output=embed`;
}

export function googleMapsLink(target: GeoTarget, view: MapView) {
  if (!isValidGeoTarget(target)) return '';
  const point = `${target.latitude},${target.longitude}`;
  return view === 'street'
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point}`
    : `https://www.google.com/maps/search/?api=1&query=${point}`;
}

export function isValidGeoTarget(target: GeoTarget) {
  return Number.isFinite(target.latitude) && target.latitude >= -90 && target.latitude <= 90
    && Number.isFinite(target.longitude) && target.longitude >= -180 && target.longitude <= 180;
}
