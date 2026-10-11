export type GeoTarget = {
  latitude: number;
  longitude: number;
  label: string;
  city?: string;
  state?: string;
  country?: string;
  street?: string;
  /** país, estado, cidade, bairro/distrito ou local (rua, endereço, ponto): define o zoom do globo. */
  tipo?: 'pais' | 'estado' | 'cidade' | 'bairro' | 'local';
};

/**
 * Tira do nome do lugar o que é comando ou fala solta: "Salvador no mapa", "o distrito de Bonfim de Feira",
 * "Lisboa pra mim", "... Amém". Sem isso, "salvador no mapa" vai para o geocodificador e volta El Salvador.
 */
export function limparLugar(bruto: string): string {
  let q = bruto.replace(/[.?!;]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const antes = q;
    q = q
      .replace(/\s*,?\s*\b(?:amem|amém|por favor|obrigad[oa]|agora|rapido|rápido)$/i, '')
      .replace(/\s+(?:no|do|pelo|na|em|via)\s+(?:mapa|globo|planeta|google maps|google earth|maps|street view|satelite|satélite)\b.*$/i, '')
      .replace(/\s+(?:pra|para)\s+(?:mim|gente|nos|nós|turma)$/i, '')
      .replace(/^(?:a |o |as |os |um |uma )/i, '')
      .replace(/^(?:cidade|municipio|município|distrito|bairro|povoado|vila|estado|pais|país|regiao|região|capital)\s+(?:de|do|da|dos|das)\s+/i, '')
      .trim();
    if (q === antes) break;
  }
  return q;
}

/** Extracts a place name from a normalized voice command ("onde fica Tóquio", "voe para Lisboa", "mostre Salvador no mapa"). */
export function parseFlyQuery(t: string): string | null {
  const knownPoint = /(?:mostre|mostrar|localize|localizar|encontre)\s+(?:a |o )?(uefs|abrini)(?:\s+em\s+(.+))?$/i.exec(t);
  if (knownPoint) {
    const name = knownPoint[1].toLowerCase() === 'uefs' ? 'UEFS' : 'Abrini';
    return knownPoint[2] ? `${name}, ${knownPoint[2]}` : `${name}, Feira de Santana, Bahia, Brasil`;
  }
  // "mostre Feira de Santana" (sem "no mapa") é o destino de casa; "Bonfim de Feira" segue o caminho normal.
  if (/\b(?:mostre|mostrar|mostra|exiba|abra|abrir)\s+(?:a |o )?(?:cidade de )?feira(?: de santana)?$/i.test(t)) return 'Feira de Santana, Bahia, Brasil';
  const m =
    /(?:onde fica|onde e|aonde fica)\s+(?:a |o |as |os )?(.+)$/i.exec(t) ??
    /(?:mostre|mostrar|mostra|exiba|ver)\s+(?:a |o )?(.+?)\s+no mapa$/i.exec(t) ??
    /(?:localize|localizar|encontre no mapa|pesquise no mapa)\s+(?:a |o |um |uma )?(.+)$/i.exec(t) ??
    /(?:abra|abrir)\s+(?:o )?(?:google maps|maps|street view)\s+(?:de|para)\s+(.+)$/i.exec(t) ??
    /(?:va|voe|voar|viajar|leve|navegue|ir)\s+(?:para|ate)?\s*(?:a |o |ao )?(.+)$/i.exec(t);
  const q = m?.[1] ? limparLugar(m[1]) : '';
  if (!q || q.length < 2 || q.length > 80) return null;
  // Só "Feira" ou "Feira de Santana" é a cidade de casa; "Bonfim de Feira" é outro lugar.
  if (/^feira(?: de santana)?(?:,? ?(?:bahia|ba))?$/i.test(q)) return 'Feira de Santana, Bahia, Brasil';
  return q;
}

/** Photon geocoding supports cities, street names, and street numbers. */
export function geocodeUrl(name: string) {
  return `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=1`;
}

/**
 * Nome solto de cidade/país ("Montevidéu", "Tóquio"): o Open-Meteo ordena por população e
 * entende nomes em português; o Photon devolveria um vilarejo homônimo no Brasil.
 * Endereços (com número ou vírgula) continuam no Photon.
 */
export function cidadeUrl(name: string) {
  const q = name.trim();
  if (!q || /[\d,]/.test(q) || /^(?:rua|avenida|av\.?|travessa|praca|praça|rodovia|estrada)\b/i.test(q)) return null;
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=pt&format=json`;
}

export function parseCidade(payload: unknown): GeoTarget | null {
  const r = (payload as { results?: unknown } | null)?.results;
  const c = Array.isArray(r) ? r[0] as Record<string, unknown> : null;
  if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number' || typeof c.name !== 'string') return null;
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const city = c.name, state = s(c.admin1), country = s(c.country);
  const label = [city, state, country].filter((p, i, a): p is string => !!p && a.indexOf(p) === i).join(', ');
  return { latitude: c.latitude, longitude: c.longitude, label, city, state, country, street: '' };
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
  // Google Street View's embeddable panorama requires an API key. Open its
  // official coordinate deep-link instead of embedding an unsupported URL.
  if (view === 'street') return '';
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
