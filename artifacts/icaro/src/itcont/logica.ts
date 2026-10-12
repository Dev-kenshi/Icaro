/**
 * Regras do site do ITCONT em funções puras (sem DOM), para serem testadas pelo
 * validate-itcont-site.ts. Os componentes só chamam estas funções.
 * Desenvolvedor do projeto: Emanuel Macêdo Luz
 */
import { ITCONT, type Sessao } from './dados';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Instante absoluto de uma data+hora de Brasília (UTC-3, sem horário de verão desde 2019). */
export function instante(data: string, hora: string): Date {
  return new Date(`${data}T${hora.length === 5 ? `${hora}:00` : hora}${ITCONT.offset}`);
}

export const inicioSessao = (s: Sessao) => instante(s.data, s.inicio);
export const fimSessao = (s: Sessao) => instante(s.data, s.fim);
export const sessoesOrdenadas = (): Sessao[] =>
  [...ITCONT.sessoes].sort((a, b) => inicioSessao(a).getTime() - inicioSessao(b).getTime());
export const aberturaEvento = () => inicioSessao(sessoesOrdenadas()[0]);
export const encerramentoEvento = () => fimSessao(sessoesOrdenadas().at(-1)!);

export type Contagem = { dias: number; horas: number; minutos: number; segundos: number; totalMs: number; terminou: boolean };

/** Contagem regressiva até `alvo`; nunca negativa. */
export function contagem(agora: Date, alvo: Date = aberturaEvento()): Contagem {
  const totalMs = Math.max(0, alvo.getTime() - agora.getTime());
  return {
    dias: Math.floor(totalMs / DIA),
    horas: Math.floor((totalMs % DIA) / HORA),
    minutos: Math.floor((totalMs % HORA) / MIN),
    segundos: Math.floor((totalMs % MIN) / 1000),
    totalMs,
    terminou: totalMs === 0,
  };
}

export type Fase =
  | { fase: 'antes'; proxima: Sessao }
  | { fase: 'ao-vivo'; atual: Sessao; proxima: Sessao | null }
  | { fase: 'intervalo'; proxima: Sessao }
  | { fase: 'encerrado' };

/** Em que momento o evento está: antes, ao vivo (sessão acontecendo), intervalo entre sessões/noites, encerrado. */
export function faseDoEvento(agora: Date): Fase {
  const lista = sessoesOrdenadas();
  const t = agora.getTime();
  const atual = lista.find((s) => t >= inicioSessao(s).getTime() && t < fimSessao(s).getTime());
  const proxima = lista.find((s) => inicioSessao(s).getTime() > t) ?? null;
  if (atual) return { fase: 'ao-vivo', atual, proxima };
  if (!proxima) return { fase: 'encerrado' };
  if (t < aberturaEvento().getTime()) return { fase: 'antes', proxima };
  return { fase: 'intervalo', proxima };
}

export const proximaSessao = (agora: Date): Sessao | null => sessoesOrdenadas().find((s) => inicioSessao(s).getTime() > agora.getTime()) ?? null;

export function sessoesPorDia(): Array<{ data: string; rotulo: string; sessoes: Sessao[] }> {
  const dias = new Map<string, Sessao[]>();
  for (const s of sessoesOrdenadas()) dias.set(s.data, [...(dias.get(s.data) ?? []), s]);
  return [...dias].map(([data, sessoes], i) => ({ data, rotulo: `Noite ${i + 1} · ${dataCurta(data)}`, sessoes }));
}

const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "21/10" */
export function dataCurta(data: string): string {
  const [, m, d] = data.split('-');
  return `${d}/${m}`;
}

/** "quarta-feira, 21 de outubro de 2026" (independe do fuso de quem abre o site). */
export function dataExtenso(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const semana = SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana}, ${d} de ${MESES[m - 1]} de ${a}`;
}

/** "19h", "21h30" */
export function horaCurta(hora: string): string {
  const [h, m] = hora.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export const duracaoMin = (s: Sessao) => Math.round((fimSessao(s).getTime() - inicioSessao(s).getTime()) / MIN);

/** Iniciais para o avatar reserva quando a foto do Even3 não carregar: "Rômulo Benício" → "RB". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes.at(-1)![0] : '')).toUpperCase();
}

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escIcs = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const localTexto = () => `${ITCONT.local.nome}, ${ITCONT.local.cidade} - ${ITCONT.local.uf}`;

/** Arquivo .ics (RFC 5545, linhas com CRLF) com uma sessão ou com o evento inteiro. */
export function gerarICS(sessoes: Sessao[] = sessoesOrdenadas(), agora = new Date()): string {
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UEFS//ITCONT//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const s of sessoes) {
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${s.id}-${s.data}@itcont.uefs`,
      `DTSTAMP:${ics(agora)}`,
      `DTSTART:${ics(inicioSessao(s))}`,
      `DTEND:${ics(fimSessao(s))}`,
      `SUMMARY:${escIcs(`${ITCONT.sigla} · ${s.titulo}`)}`,
      `LOCATION:${escIcs(localTexto())}`,
      `DESCRIPTION:${escIcs(`${ITCONT.titulo}. Inscrição gratuita: ${ITCONT.inscricaoUrl}`)}`,
      `URL:${ITCONT.inscricaoUrl}`,
      'END:VEVENT',
    );
  }
  linhas.push('END:VCALENDAR');
  return linhas.join('\r\n') + '\r\n';
}

/** Link "adicionar ao Google Agenda" de uma sessão. */
export function googleAgendaUrl(s: Sessao): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${ITCONT.sigla} · ${s.titulo}`,
    dates: `${ics(inicioSessao(s))}/${ics(fimSessao(s))}`,
    details: `${ITCONT.titulo}. Inscrição gratuita: ${ITCONT.inscricaoUrl}`,
    location: localTexto(),
    ctz: ITCONT.fuso,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export const mapaUrl = () =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`UEFS Módulo IV, ${ITCONT.local.cidade} - ${ITCONT.local.uf}`)}`;

export function whatsappUrl(urlDoSite: string): string {
  const texto = `${ITCONT.titulo} (${ITCONT.sigla}) · 21 e 22/10, 19h, UEFS. Inscrição gratuita: ${urlDoSite}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

export type Layout = 'celular' | 'celular-deitado' | 'tablet' | 'desktop';

/** Os 4 modos responsivos do site. */
export function layoutPara(largura: number, altura: number): Layout {
  if (altura < 500 && largura > altura && largura < 1024) return 'celular-deitado';
  if (largura < 600) return 'celular';
  if (largura < 1024) return 'tablet';
  return 'desktop';
}

// Contraste WCAG 2.2, usado pelo validador nos pares de cores do tokens.css
function canal(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminancia(hex: string): number {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

/** Escala tipográfica na razão áurea (lei da proporção): passo n a partir de `base` px. */
export const PHI = 1.618;
export const escalaAurea = (n: number, base = 16) => Math.round(base * PHI ** n * 100) / 100;
