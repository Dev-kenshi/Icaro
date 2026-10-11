/**
 * Dados ao vivo do palco (portados do ÍCARO v5 do professor Rômulo):
 * clima da cidade (Open-Meteo) e painel financeiro (AwesomeAPI e Banco Central).
 * Tudo gratuito e sem chave. Cache de 5 minutos para não martelar as fontes.
 */

type Fetch = typeof fetch;

export type Moeda = { codigo: string; nome: string; valor: number; variacao: number | null };
export type Financas = {
  moedas: Moeda[];
  indices: Partial<Record<"selic" | "ipca12" | "cdi", { valor: number; data: string }>>;
  serieDolar: Array<{ d: string; v: number }>;
  atualizado: string;
  falhas: string[];
};
export type Tempo = {
  fala: string;
  cidade?: string;
  regiao?: string;
  pais?: string;
  atual?: number;
  max?: number;
  min?: number;
  chuva?: number | null;
  umidade?: number | null;
  codigo?: number | null;
  desc?: string;
  lat?: number;
  lon?: number;
};

export const MOEDAS: Array<[string, string]> = [["USD", "Dólar"], ["EUR", "Euro"], ["UYU", "Peso uruguaio"], ["ARS", "Peso argentino"], ["BTC", "Bitcoin"]];
const SERIES_BCB = { selic: 432, ipca12: 13522, cdi: 4389 } as const; // Selic meta, IPCA 12 meses, CDI anualizado

/** Códigos WMO do Open-Meteo, como no v5. */
export const CLIMA: Record<number, string> = {
  0: "céu limpo", 1: "céu quase limpo", 2: "parcialmente nublado", 3: "nublado", 45: "neblina", 48: "neblina",
  51: "garoa fraca", 53: "garoa", 55: "garoa forte", 61: "chuva fraca", 63: "chuva", 65: "chuva forte",
  80: "pancadas de chuva", 81: "pancadas de chuva", 82: "pancadas fortes", 95: "trovoada", 96: "trovoada com granizo", 99: "trovoada com granizo",
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

async function getJson(url: string, f: Fetch): Promise<any> {
  const r = await f(url, { headers: { "User-Agent": "IcaroUEFS/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const cache = new Map<string, { at: number; value: unknown }>();
async function emCache<T>(chave: string, ms: number, montar: () => Promise<T>): Promise<T> {
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.at < ms) return hit.value as T;
  const value = await montar();
  cache.set(chave, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return value;
}

const agoraBR = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function financas(f: Fetch = fetch): Promise<Financas> {
  return emCache("financas", 5 * 60_000, async () => {
    const out: Financas = { moedas: [], indices: {}, serieDolar: [], atualizado: agoraBR(), falhas: [] };
    try {
      const d = await getJson(`https://economia.awesomeapi.com.br/json/last/${MOEDAS.map(([c]) => `${c}-BRL`).join(",")}`, f);
      for (const [codigo, nome] of MOEDAS) {
        const q = d?.[`${codigo}BRL`];
        const valor = num(q?.bid);
        if (valor !== null) out.moedas.push({ codigo, nome, valor, variacao: num(q?.pctChange) });
      }
    } catch (e) { out.falhas.push(`cotações: ${e instanceof Error ? e.message : e}`); }
    try {
      const serie = await getJson("https://economia.awesomeapi.com.br/json/daily/USD-BRL/30", f);
      if (Array.isArray(serie)) {
        out.serieDolar = serie.slice().reverse().flatMap((p: any) => {
          const v = num(p?.bid), t = num(p?.timestamp);
          if (v === null || t === null) return [];
          const d = new Date(t * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
          return [{ d, v: Math.round(v * 10_000) / 10_000 }];
        });
      }
    } catch (e) { out.falhas.push(`série do dólar: ${e instanceof Error ? e.message : e}`); }
    await Promise.all(Object.entries(SERIES_BCB).map(async ([nome, cod]) => {
      try {
        const v = await getJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados/ultimos/1?formato=json`, f);
        const ult = Array.isArray(v) ? v[v.length - 1] : null;
        const valor = num(ult?.valor);
        if (valor !== null) out.indices[nome as keyof Financas["indices"]] = { valor, data: String(ult?.data ?? "") };
      } catch (e) { out.falhas.push(`Banco Central ${nome}: ${e instanceof Error ? e.message : e}`); }
    }));
    return out;
  });
}

/** Clima da cidade (hoje ou amanhã), com a frase que o Ícaro fala. */
export async function previsao(cidadeEntrada: string | undefined, dia: "hoje" | "amanha" = "hoje", f: Fetch = fetch): Promise<Tempo> {
  const cidade = (cidadeEntrada || "Feira de Santana").trim().slice(0, 80);
  return emCache(`tempo:${cidade.toLowerCase()}:${dia}`, 10 * 60_000, async () => {
    const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=pt&name=${encodeURIComponent(cidade)}`, f);
    const lugar = geo?.results?.[0];
    if (!lugar) return { fala: `Não encontrei a cidade ${cidade}.` };
    const d = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lugar.latitude}&longitude=${lugar.longitude}&timezone=auto&forecast_days=3`
      + "&current=temperature_2m,relative_humidity_2m,weather_code"
      + "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code", f);
    return montarTempo(lugar, d, dia);
  });
}

/** Separado da rede para poder ser testado com respostas gravadas. */
export function montarTempo(lugar: any, d: any, dia: "hoje" | "amanha"): Tempo {
  const nome = String(lugar?.name ?? "a cidade");
  const dd = d?.daily ?? {};
  const i = dia === "amanha" ? 1 : 0;
  const mx = Math.round(num(dd.temperature_2m_max?.[i]) ?? NaN);
  const mn = Math.round(num(dd.temperature_2m_min?.[i]) ?? NaN);
  const chuva = num(dd.precipitation_probability_max?.[i]);
  const desc = CLIMA[num(dd.weather_code?.[i]) ?? -1] ?? "tempo variável";
  const c = d?.current ?? {};
  const codigoAgora = num(c.weather_code);
  const atual = Math.round(num(c.temperature_2m) ?? mx);
  const agoraDesc = codigoAgora !== null ? CLIMA[codigoAgora] ?? desc : desc;
  let fala = i === 0
    ? `Agora em ${nome} faz ${atual} graus, ${agoraDesc}. Hoje a máxima é de ${mx} e a mínima de ${mn} graus`
    : `Amanhã em ${nome}: ${desc}, máxima de ${mx} e mínima de ${mn} graus`;
  fala += chuva === null ? "." : chuva < 10 ? ", sem previsão de chuva." : `, com ${Math.round(chuva)} por cento de chance de chuva.`;
  return {
    fala, cidade: nome, regiao: String(lugar?.admin1 ?? ""), pais: String(lugar?.country ?? ""),
    atual, max: mx, min: mn, chuva, umidade: num(c.relative_humidity_2m), codigo: codigoAgora,
    desc: i === 0 ? agoraDesc : desc, lat: num(lugar?.latitude) ?? undefined, lon: num(lugar?.longitude) ?? undefined,
  };
}

/** Frase curta do painel financeiro, como no v5. */
export function falaFinancas(fin: Financas): string {
  const fmt = (v: number, c = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  const m = (cod: string) => fin.moedas.find((x) => x.codigo === cod);
  const partes: string[] = [];
  const usd = m("USD"), eur = m("EUR");
  if (usd) partes.push(`O dólar está a ${fmt(usd.valor)} reais`);
  if (eur) partes.push(`o euro a ${fmt(eur.valor)}`);
  if (fin.indices.selic) partes.push(`a Selic está em ${fmt(fin.indices.selic.valor)} por cento ao ano`);
  if (fin.indices.ipca12) partes.push(`e o IPCA de 12 meses em ${fmt(fin.indices.ipca12.valor)} por cento`);
  if (!partes.length) return "Não consegui consultar as cotações agora.";
  return `${partes.join(", ")}. Os valores estão no painel. São informativos.`;
}
