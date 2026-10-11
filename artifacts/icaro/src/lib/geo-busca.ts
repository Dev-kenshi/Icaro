/**
 * Busca de lugares no mundo inteiro (cidades, distritos, bairros, ruas, estados, países e regiões),
 * sem chave de API, combinando três bases abertas e escolhendo o melhor candidato:
 *  - Open-Meteo Geocoding (GeoNames): cidades e localidades do mundo, com população e nomes em português;
 *  - Photon (OpenStreetMap): ruas, números, bairros, distritos, pontos de interesse e regiões;
 *  - Nominatim (OpenStreetMap): reserva quando os dois acima não acham.
 * As funções de pontuação não dependem do navegador e são testadas em validate-geo.ts.
 */
import type { GeoTarget } from './geo-fly';

export type TipoLugar = 'pais' | 'estado' | 'cidade' | 'bairro' | 'local';
export type Candidato = GeoTarget & { tipo: TipoLugar; fonte: 'open-meteo' | 'photon' | 'nominatim'; populacao?: number; pais_codigo?: string; nomeExato?: string };
type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Feira de Santana: desempate de homônimos em direção a onde o Ícaro está. */
const CASA = { lat: -12.2664, lon: -38.9663 };

export const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Lugares da região com nome que o reconhecimento de voz costuma errar ou que os
 * geocodificadores não acham pelo nome popular. A chave é o texto normalizado.
 */
export const APELIDOS: Record<string, string> = {
  'bom fim de feira': 'Bonfim de Feira, Feira de Santana, Bahia, Brasil',
  'bonfim de feira': 'Bonfim de Feira, Feira de Santana, Bahia, Brasil',
  'bom fim da feira': 'Bonfim de Feira, Feira de Santana, Bahia, Brasil',
  'humildes': 'Humildes, Feira de Santana, Bahia, Brasil',
  'jaiba': 'Jaíba, Feira de Santana, Bahia, Brasil',
  'jaguara': 'Jaguara, Feira de Santana, Bahia, Brasil',
  'tiquarucu': 'Tiquaruçu, Feira de Santana, Bahia, Brasil',
  'matinha': 'Matinha, Feira de Santana, Bahia, Brasil',
  'ipuacu': 'Ipuaçu, Feira de Santana, Bahia, Brasil',
  'governador joao durval carneiro': 'Governador João Durval Carneiro, Feira de Santana, Bahia, Brasil',
  'maria quiteria distrito': 'Maria Quitéria, Feira de Santana, Bahia, Brasil',
  'uefs': 'Universidade Estadual de Feira de Santana, Feira de Santana, Bahia, Brasil',
  'cidade nova feira': 'Cidade Nova, Feira de Santana, Bahia, Brasil',
  'centro de abastecimento': 'Centro de Abastecimento, Feira de Santana, Bahia, Brasil',
  'feiraguay': 'Feiraguay, Feira de Santana, Bahia, Brasil',
};

/** Endereço, rua ou lugar dentro de uma cidade: vai direto ao OpenStreetMap. */
export function pareceEndereco(q: string) {
  return /\d|,/.test(q) || /^(rua|r\.|avenida|av\.?|travessa|praca|praça|rodovia|estrada|alameda|largo|ladeira|bairro|distrito|condominio|condomínio|loteamento)\b/i.test(q.trim());
}

const distanciaKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const rotulo = (partes: Array<string | undefined>) => partes.filter((p, i, a): p is string => !!p && !!p.trim() && a.indexOf(p) === i).join(', ');

// ---------- leitores de cada serviço ----------
export function lerOpenMeteo(payload: unknown): Candidato[] {
  const r = (payload as { results?: unknown } | null)?.results;
  if (!Array.isArray(r)) return [];
  return r.flatMap((c: Record<string, unknown>) => {
    if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number' || typeof c.name !== 'string') return [];
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
    const code = s(c.feature_code) ?? '';
    const tipo: TipoLugar = /^PCL/.test(code) ? 'pais' : code === 'ADM1' ? 'estado' : /^PPLX/.test(code) ? 'bairro' : 'cidade';
    return [{
      latitude: c.latitude, longitude: c.longitude, city: c.name, state: s(c.admin1), country: s(c.country), street: '',
      label: rotulo([c.name, s(c.admin1), s(c.country)]), tipo, fonte: 'open-meteo' as const,
      populacao: typeof c.population === 'number' ? c.population : 0, pais_codigo: s(c.country_code), nomeExato: c.name,
    }];
  });
}

const TIPO_OSM: Record<string, TipoLugar> = {
  country: 'pais', state: 'estado', region: 'estado', province: 'estado',
  city: 'cidade', town: 'cidade', village: 'cidade', municipality: 'cidade', county: 'cidade', hamlet: 'bairro',
  suburb: 'bairro', neighbourhood: 'bairro', quarter: 'bairro', district: 'bairro', borough: 'bairro', locality: 'bairro', isolated_dwelling: 'bairro',
};

export function lerPhoton(payload: unknown): Candidato[] {
  const feats = (payload as { features?: unknown } | null)?.features;
  if (!Array.isArray(feats)) return [];
  return feats.flatMap((f: { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }) => {
    const c = f.geometry?.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return [];
    const p = f.properties ?? {};
    const t = (k: string) => (typeof p[k] === 'string' && (p[k] as string).trim() ? (p[k] as string) : undefined);
    const valor = t('osm_value') ?? '', chave = t('osm_key') ?? '', tipoP = t('type') ?? '';
    const tipo: TipoLugar = TIPO_OSM[tipoP] ?? TIPO_OSM[valor] ?? (chave === 'highway' || t('street') || t('housenumber') ? 'local' : chave === 'place' ? 'cidade' : 'local');
    const nome = t('name');
    const rua = rotulo([t('street'), t('housenumber')]);
    const cidade = t('city') ?? t('county');
    const label = tipo === 'local'
      ? rotulo([nome && nome !== t('street') ? nome : undefined, rua || undefined, t('district'), cidade, t('state'), t('country')])
      : rotulo([nome, tipo === 'bairro' ? (cidade ?? t('district')) : undefined, t('state'), t('country')]);
    return [{
      latitude: c[1], longitude: c[0], city: tipo === 'cidade' ? nome ?? cidade : cidade, state: t('state'), country: t('country'),
      street: tipo === 'local' ? (rua || nome || '') : '', label: label || nome || 'Local encontrado', tipo, fonte: 'photon' as const,
      pais_codigo: t('countrycode')?.toUpperCase(), nomeExato: nome,
    }];
  });
}

export function lerNominatim(payload: unknown): Candidato[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((r: Record<string, unknown>) => {
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const a = (r.address ?? {}) as Record<string, string>;
    const tipoR = String(r.addresstype ?? r.type ?? '');
    const tipo: TipoLugar = TIPO_OSM[tipoR] ?? (a.road ? 'local' : 'cidade');
    const nome = typeof r.name === 'string' && r.name ? r.name : String(r.display_name ?? '').split(',')[0];
    const cidade = a.city ?? a.town ?? a.village ?? a.municipality;
    return [{
      latitude: lat, longitude: lon, city: tipo === 'cidade' ? nome : cidade, state: a.state, country: a.country,
      street: tipo === 'local' ? rotulo([a.road, a.house_number]) || nome : '', tipo, fonte: 'nominatim' as const,
      label: rotulo([nome, tipo !== 'cidade' ? cidade : undefined, a.state, a.country]), pais_codigo: a.country_code?.toUpperCase(), nomeExato: nome,
    }];
  });
}

// ---------- escolha do melhor ----------
/** Nota de um candidato para a pergunta: nome igual, tamanho do lugar, Brasil e proximidade de casa desempatam. */
export function pontuar(c: Candidato, consulta: string): number {
  const q = norm(consulta.split(',')[0]), nome = norm(c.nomeExato ?? c.label.split(',')[0]);
  let s = 0;
  if (nome === q) s += 6; else if (nome.startsWith(q) || q.startsWith(nome)) s += 2.5; else if (nome.includes(q)) s += 1;
  else s -= 4;                                               // nome antigo/alternativo ("Bahia" → Salvador) não vale o lugar pedido
  if (c.tipo === 'local' && !pareceEndereco(consulta)) s -= 3; // pediu um lugar, não uma rua com esse nome
  // pistas extras escritas na consulta ("Salvador, Bahia", "Paris Texas") precisam aparecer no rótulo
  const extras = norm(consulta).split(' ').filter((w) => w.length > 3 && !q.split(' ').includes(w));
  const lab = norm(c.label);
  for (const w of extras) s += lab.includes(w) ? 1.5 : -1;
  s += Math.log10((c.populacao ?? 0) + 10) * 0.9;           // capital ou metrópole vence vilarejo homônimo
  if (c.tipo === 'pais') s += 3; else if (c.tipo === 'estado') s += 2;
  if (c.pais_codigo === 'BR') s += 1.6;                      // a plateia está no Brasil
  const km = distanciaKm(CASA, { lat: c.latitude, lon: c.longitude });
  if (km < 150) s += 1.2; else if (km < 1500) s += 0.5;
  if (c.fonte === 'open-meteo' && c.tipo === 'cidade' && !pareceEndereco(consulta)) s += 0.4;
  return s;
}

export function escolher(cands: Candidato[], consulta: string): Candidato | null {
  let melhor: Candidato | null = null, nota = -Infinity;
  for (const c of cands) {
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180) continue;
    const n = pontuar(c, consulta);
    if (n > nota) { nota = n; melhor = c; }
  }
  return melhor;
}

// ---------- URLs ----------
export const urlOpenMeteo = (q: string) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=pt&format=json`;
export const urlPhoton = (q: string) => `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lat=${CASA.lat}&lon=${CASA.lon}&location_bias_scale=0.15`;
/** Sem preferência por Feira: estados, países e regiões famosas aparecem primeiro. */
export const urlPhotonMundo = (q: string) => `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`;
export const urlNominatim = (q: string) => `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=5&accept-language=pt-BR`;

/** Busca o lugar no mundo inteiro. Devolve null se nenhuma base achar. */
export async function buscarLugar(consulta: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Candidato | null> {
  const q = APELIDOS[norm(consulta)] ?? consulta.trim();
  if (!q) return null;
  const pegar = async (url: string, ler: (p: unknown) => Candidato[], ms: number) => {
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(ms) });
      return r.ok ? ler(await r.json()) : [];
    } catch { return []; }
  };
  const nomeSolto = !pareceEndereco(q);
  // Cidades/países pelo nome: Open-Meteo e Photon em paralelo; endereço: só OpenStreetMap.
  const vazio = Promise.resolve([] as Candidato[]);
  const [om, ph, mundo] = await Promise.all([
    nomeSolto ? pegar(urlOpenMeteo(q), lerOpenMeteo, 8000) : vazio,
    pegar(urlPhoton(q), lerPhoton, 10000),
    nomeSolto ? pegar(urlPhotonMundo(q), lerPhoton, 10000) : vazio,
  ]);
  const todos = [...om, ...ph, ...mundo];
  let melhor = escolher(todos, q);
  if (!melhor || pontuar(melhor, q) < 2) {
    const nom = await pegar(urlNominatim(q), lerNominatim, 10000);
    melhor = escolher([...todos, ...nom], q) ?? melhor;
  }
  return melhor;
}
