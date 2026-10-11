/** Clima e painel financeiro do palco (formato do ÍCARO v5). */

export type Moeda = { codigo: string; nome: string; valor: number; variacao: number | null };
export type Financas = {
  moedas: Moeda[];
  indices: Partial<Record<'selic' | 'ipca12' | 'cdi', { valor: number; data: string }>>;
  serieDolar: Array<{ d: string; v: number }>;
  atualizado: string;
  falhas: string[];
  fala?: string;
};
export type Tempo = {
  fala: string; cidade?: string; regiao?: string; pais?: string; atual?: number; max?: number; min?: number;
  chuva?: number | null; umidade?: number | null; codigo?: number | null; desc?: string; lat?: number; lon?: number;
};

async function getJson<T>(path: string): Promise<T> {
  // Lido na hora (e não no carregamento) para o módulo também rodar nos testes em Node.
  const base = import.meta.env?.BASE_URL ?? '/';
  const r = await fetch(`${base}${path}`, { credentials: 'include', signal: AbortSignal.timeout(15_000) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(typeof body?.error === 'string' ? body.error : `Falha ${r.status}`);
  return body as T;
}

export const buscarFinancas = () => getJson<Financas>('api/ao-vivo/financas');
export const buscarTempo = (cidade?: string, dia: 'hoje' | 'amanha' = 'hoje') =>
  getJson<Tempo>(`api/ao-vivo/tempo?dia=${dia}${cidade ? `&cidade=${encodeURIComponent(cidade)}` : ''}`);

export function fmt(v: number | null | undefined, casas: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** "R$ 4,99", "R$ 0,003" e "R$ 415 mil", como no painel do v5. */
export function reais(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (v >= 100_000) return `R$ ${fmt(v / 1000, 0)} mil`;
  return `R$ ${fmt(v, v < 1 ? 3 : 2)}`;
}

export function tendencia(p: number | null | undefined): { classe: '' | 'sobe' | 'desce'; texto: string } {
  if (p === null || p === undefined || Number.isNaN(p)) return { classe: '', texto: '–' };
  const sobe = p > 0.005, desce = p < -0.005;
  return { classe: sobe ? 'sobe' : desce ? 'desce' : '', texto: `${sobe ? '▲' : desce ? '▼' : '■'} ${fmt(Math.abs(p), 2)}%` };
}

export function iconeClima(c: number | null | undefined): string {
  if (c === null || c === undefined) return '🌡';
  if (c === 0) return '☀';
  if (c <= 2) return '🌤';
  if (c === 3) return '☁';
  if (c <= 48) return '🌫';
  if (c <= 67 || (c >= 80 && c <= 82)) return '🌧';
  if (c >= 95) return '⛈';
  return '🌥';
}
