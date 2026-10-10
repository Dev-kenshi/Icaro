export type GeoTarget = { latitude: number; longitude: number; label: string };

/** Extracts a place name from a normalized voice command ("onde fica Tóquio", "voe para Lisboa", "mostre Salvador no mapa"). */
export function parseFlyQuery(t: string): string | null {
  const m =
    /(?:onde fica|onde e|aonde fica)\s+(?:a |o |as |os )?(.+)$/i.exec(t) ??
    /(?:mostre|mostrar|mostra|exiba|ver)\s+(?:a |o )?(.+?)\s+no mapa$/i.exec(t) ??
    /(?:va|voe|voar|viajar|leve|navegue|ir)\s+(?:para|ate)?\s*(?:a |o |ao )?(.+)$/i.exec(t);
  const q = m?.[1]?.replace(/[.?!]+$/, '').trim();
  return q && q.length >= 2 && q.length <= 80 ? q : null;
}

/** Open-Meteo geocoding: free, keyless, CORS-enabled. */
export function geocodeUrl(name: string) {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt&format=json`;
}

export function parseGeocode(payload: unknown): GeoTarget | null {
  if (!payload || typeof payload !== 'object') return null;
  const results = (payload as { results?: unknown }).results;
  const first = Array.isArray(results) ? results[0] : null;
  if (!first || typeof first !== 'object') return null;
  const place = first as { latitude?: unknown; longitude?: unknown; name?: unknown; admin1?: unknown; country?: unknown };
  if (typeof place.latitude !== 'number' || typeof place.longitude !== 'number') return null;
  const label = [place.name, place.admin1, place.country]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(', ');
  return { latitude: place.latitude, longitude: place.longitude, label: label || 'Local encontrado' };
}
