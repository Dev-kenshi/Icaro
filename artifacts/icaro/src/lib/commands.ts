export type CommandResult =
  | { kind: 'say'; text: string }
  | { kind: 'intro' }
  | { kind: 'fullscreen'; text: string }
  | { kind: 'timer'; seconds: number; text: string }
  | { kind: 'cancelTimer'; text: string }
  | { kind: 'note'; note: string; text: string }
  | { kind: 'listNotes' }
  | { kind: 'search'; query: string; text: string }
  | { kind: 'scene'; scene: 'galaxy' | 'system' | 'earth'; text: string }
  | { kind: 'flyFeira'; text: string }
  | { kind: 'openTour'; tour: 'discipulus' | 'labeducontabil'; text: string }
  | { kind: 'tour'; action: TourCommand; text: string }
  | { kind: 'openMusic'; play: boolean; text: string }
  | { kind: 'flyTo'; query: string; text: string }
  | { kind: 'painel'; abrir: boolean; text: string }
  | { kind: 'tempo'; dia: 'hoje' | 'amanha'; cidade: string | null }
  | { kind: 'globo'; acao: GloboAcao; text: string }
  | { kind: 'ai' };

import { parseOpenTour, parseTourCommand, tourById, type TourCommand } from './demo-tours';
import { parseFlyQuery } from './geo-fly';

export type GloboAcao = 'mais' | 'menos' | 'planeta' | 'onde' | 'girar';

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[!?¿¡]/g, ' ').replace(/\s+/g, ' ').trim();

const WAKE = /^(?:(?:ok|ei|hey)\s+)?(?:icaro|i caro|ikaro|hikaru)[,.:\s]*/;
const TZ = 'America/Sao_Paulo';

const WORDNUM: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, meia: 0.5 };

export function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h} hora${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minuto${m > 1 ? 's' : ''}`);
  if (s) parts.push(`${s} segundo${s > 1 ? 's' : ''}`);
  return parts.join(' e ') || '0 segundos';
}

function parseDuration(t: string): number | null {
  const re = /(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta|cinquenta|meia)\s*(segundos?|seg|s\b|minutos?|min|m\b|horas?|h\b)/g;
  let total = 0, found = false, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    found = true;
    const n = WORDNUM[m[1]] ?? Number(m[1].replace(',', '.'));
    const u = m[2][0];
    total += n * (u === 'h' ? 3600 : u === 'm' ? 60 : 1);
  }
  return found ? Math.round(total) : null;
}

// ---- safe math evaluator (shunting-yard) ----
type Tok = { t: 'n'; v: number } | { t: 'o'; v: string } | { t: '(' } | { t: ')' };
function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.,]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.,]/.test(src[j])) j++;
      let raw = src.slice(i, j);
      if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
      const v = Number(raw); if (!Number.isFinite(v)) return null;
      out.push({ t: 'n', v }); i = j; continue;
    }
    if ('+-*/^'.includes(c)) { out.push({ t: 'o', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: '(' }); i++; continue; }
    if (c === ')') { out.push({ t: ')' }); i++; continue; }
    return null;
  }
  return out;
}
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, 'u': 4 };
export function evaluate(expr: string): number | null {
  const toks = tokenize(expr); if (!toks || !toks.length) return null;
  const out: (number | string)[] = []; const ops: string[] = [];
  let prev: Tok | null = null;
  for (const tk of toks) {
    if (tk.t === 'n') out.push(tk.v);
    else if (tk.t === 'o') {
      let op = tk.v;
      if (op === '-' && (!prev || prev.t === 'o' || prev.t === '(')) op = 'u';
      else if (op === '+' && (!prev || prev.t === 'o' || prev.t === '(')) { prev = tk; continue; }
      while (ops.length) {
        const top = ops[ops.length - 1]; if (top === '(') break;
        if (op === '^' && top === 'u') break;
        const right = op === '^' || op === 'u';
        if (PREC[top] > PREC[op] || (PREC[top] === PREC[op] && !right)) out.push(ops.pop()!); else break;
      }
      ops.push(op);
    } else if (tk.t === '(') ops.push('(');
    else {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      if (!ops.length) return null; ops.pop();
    }
    prev = tk;
  }
  while (ops.length) { const o = ops.pop()!; if (o === '(') return null; out.push(o); }
  const st: number[] = [];
  for (const x of out) {
    if (typeof x === 'number') { st.push(x); continue; }
    if (x === 'u') { if (!st.length) return null; st.push(-st.pop()!); continue; }
    const b = st.pop(), a = st.pop(); if (a === undefined || b === undefined) return null;
    if (x === '/' && b === 0) return null;
    st.push(x === '+' ? a + b : x === '-' ? a - b : x === '*' ? a * b : x === '/' ? a / b : Math.pow(a, b));
  }
  return st.length === 1 && Number.isFinite(st[0]) ? st[0] : null;
}

function prepMath(t: string) {
  return t
    .replace(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|do|da|sobre)\s*(\d+(?:[.,]\d+)?)/g, '($2*$1/100)')
    .replace(/(\d)\s*%/g, '$1/100')
    .replace(/\bvezes\b|\bx\b/g, '*').replace(/\bmais\b/g, '+').replace(/\bmenos\b/g, '-')
    .replace(/\bdividido por\b/g, '/').replace(/\belevado a\b/g, '^')
    .replace(/[=?]/g, '').trim();
}

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });

export const HELP = 'Respondo perguntas com inteligência artificial, principalmente sobre contabilidade e dados. Também posso dizer a hora e a data, fazer cálculos, iniciar um temporizador, anotar lembretes, preparar pesquisas na web e tocar a apresentação original.';

export function interpret(input: string): CommandResult {
  const t = normalize(input).replace(WAKE, '').replace(/[.]+$/, '').trim();
  if (!t) return { kind: 'say', text: 'Estou ouvindo, professor.' };

  // Comandos do ÍCARO v5 resolvidos na máquina: painel financeiro, clima e o planeta.
  const v5 = interpretV5(t);
  if (v5) return v5;

  // Só quando o destino é a própria Feira ("voe para Feira de Santana"), não "vá para Bonfim de Feira".
  if (/\b(?:fly|go|travel)\s+to\s+(?:feira de santana|feira)$/.test(t) || /\b(?:voar|voe|ir|va|viajar|leve|voo)\s+(?:para|pra|ate|a)?\s*(?:a |o )?(?:cidade de )?(?:feira de santana|feira)$/.test(t))
    return { kind: 'flyFeira', text: 'Ajustando a visualização para Feira de Santana.' };
  if (/\b(galaxia|galaxy)\b/.test(t) && /\b(mostrar|mostra|mostre|exibir|exiba|ver|abrir|open|show)\b/.test(t))
    return { kind: 'scene', scene: 'galaxy', text: 'Abrindo a visão da galáxia.' };
  if (/\b(sistema solar|planetas|solar system)\b/.test(t) && /\b(mostrar|mostra|mostre|exibir|exiba|ver|abrir|open|show)\b/.test(t))
    return { kind: 'scene', scene: 'system', text: 'Abrindo o sistema solar.' };
  if (/\b(terra|earth)\b/.test(t) && /\b(mostrar|mostra|mostre|exibir|exiba|ver|abrir|open|show)\b/.test(t))
    return { kind: 'scene', scene: 'earth', text: 'Abrindo a visão ao vivo da Terra.' };

  const openTour = parseOpenTour(t);
  if (openTour) return { kind: 'openTour', tour: openTour, text: `Abrindo a demonstração guiada: ${tourById(openTour)?.name ?? openTour}.` };
  const tourAction = parseTourCommand(t);
  if (tourAction) {
    const texts: Record<TourCommand, string> = { next: 'Próxima etapa.', previous: 'Voltando uma etapa.', pause: 'Demonstração pausada.', resume: 'Continuando a demonstração.', close: 'Demonstração encerrada.' };
    return { kind: 'tour', action: tourAction, text: texts[tourAction] };
  }
  if (/\b(musica|musicas|spotify)\b/.test(t) && /\b(toque|tocar|toquei|abra|abrir|mostre|mostrar|reproduza|reproduzir|coloque)\b/.test(t))
    return { kind: 'openMusic', play: /\b(toque|tocar|reproduza|reproduzir|coloque)\b/.test(t), text: 'Abrindo a página de música.' };
  const flyQuery = parseFlyQuery(t);
  if (flyQuery) return { kind: 'flyTo', query: flyQuery, text: `Localizando ${flyQuery} no mapa.` };

  if (/\b(o que|que) significa (o )?(icaro|i caro)|\bo que e (o )?(icaro|i caro)|significado d[eo] (icaro|i caro)/.test(t))
    return { kind: 'say', text: 'Eu sou o ÍCARO. ÍCARO significa Inteligência, Ciência de Dados, Análise de Dados, Resultados e Operações. Sou o assistente de aula da Contabilidade da UEFS.' };
  if (/^(ajuda|comandos)\b|o que (voce|vc) (faz|sabe fazer|pode fazer)/.test(t)) return { kind: 'say', text: HELP };
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai)\b[\s,]*(tudo bem|turma|icaro)?$/.test(t))
    return { kind: 'say', text: 'Olá! Eu sou o ÍCARO. Em que posso ajudar a turma hoje?' };
  if (/apresentacao original|toque a apresentacao|video de apresentacao/.test(t)) return { kind: 'intro' };
  if (/tela cheia|modo apresentacao/.test(t)) return { kind: 'fullscreen', text: 'Modo tela cheia ativado.' };
  if (/que horas|horas sao|hora atual|me diga a hora/.test(t)) {
    const hm = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date());
    return { kind: 'say', text: `Agora são ${hm}, horário de Brasília.` };
  }
  if (/que dia e hoje|qual (e )?a data|data de hoje|^data$/.test(t)) {
    const d = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date());
    return { kind: 'say', text: `Hoje é ${d}.` };
  }
  if (/temporizador|cronometro|contagem regressiva|\btimer\b/.test(t)) {
    if (/\b(parar|pare|cancelar|cancele|desligar|desligue)\b/.test(t)) return { kind: 'cancelTimer', text: 'Temporizador cancelado.' };
    const s = parseDuration(t);
    if (s === null) return { kind: 'say', text: 'Informe o período. Por exemplo: temporizador de 5 minutos.' };
    if (s < 1 || s > 86400) return { kind: 'say', text: 'Escolha um período entre um segundo e 24 horas.' };
    return { kind: 'timer', seconds: s, text: `Temporizador iniciado por ${formatDuration(s)}.` };
  }
  if (/^(minhas notas|minhas anotacoes|listar notas|liste (as )?(minhas )?notas|ler notas|mostrar notas)/.test(t)) return { kind: 'listNotes' };
  const noteM = normalize(input).replace(WAKE, '').match(/^(anotar|anote|nota|lembre-se de|lembre se de|lembrete)[:\s]*(.*)$/);
  if (noteM) {
    // keep original casing/accents from input
    const orig = input.trim().replace(/^(?:(?:ok|ei|hey)\s+)?(?:[íi]caro|i caro|ikaro|hikaru)[,.:\s]*/i, '');
    const idx = orig.toLowerCase().search(/[:\s]/);
    const note = (noteM[2] ? orig.slice(idx + 1).replace(/^(de\s+)?[:\s]*/i, '') : '').trim().slice(0, 300);
    if (!note) return { kind: 'say', text: 'Diga o que deseja anotar.' };
    return { kind: 'note', note, text: `Anotado: ${note}` };
  }
  const sM = t.match(/^(pesquise|pesquisar|busque|buscar|procure|procurar)\s+(?:(?:no google|na web|na internet)\s+)?(?:(?:por|sobre)\s+)?(.+)$/);
  if (sM) {
    const q = sM[2].replace(/^(no google|na web|na internet)\s*/, '').trim();
    return { kind: 'search', query: q, text: `Pesquisa preparada sobre ${q}. Toque no botão para abrir.` };
  }
  const mathM = t.match(/^(?:calcule|calcular|calcula|quanto (?:e|da|sao))\s+(.+)$/);
  const bare = /^[\d\s.,+\-*/^%()x=]+$/.test(t) && /\d/.test(t) && /[+\-*/^%x]/.test(t);
  const expr = prepMath(mathM ? mathM[1] : t);
  // "calcule o custo de um funcionário" é pergunta para o servidor, não expressão.
  const isExpression = !/[a-z]/.test(expr);
  if ((mathM && isExpression) || bare || /^\d+(?:[.,]\d+)?\s*%\s*de\s*\d/.test(t)) {
    const v = evaluate(expr);
    return { kind: 'say', text: v === null ? 'Não consegui calcular essa expressão. Exemplo: calcule 30% de 200.' : `O resultado é ${fmtNum(v)}.` };
  }
  return { kind: 'ai' };
}

export function splitSentences(text: string): string[] {
  const clean = text.replace(/[*#_`>]+/g, '').replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?;:]+[.!?;:]*/g) ?? [clean];
  const chunks: string[] = [];
  for (const p of parts) {
    const s = p.trim(); if (!s) continue;
    if (chunks.length && (chunks[chunks.length - 1].length + s.length) < 90) chunks[chunks.length - 1] += ' ' + s;
    else chunks.push(s);
  }
  return chunks;
}

/** Painel financeiro, clima e controle do planeta (frases do LEIA-ME do ÍCARO v5). */
export function interpretV5(t: string): CommandResult | null {
  if (/\b(feche|fechar|esconda|esconder|tire|tirar|oculte)\b.*\bpainel\b/.test(t))
    return { kind: 'painel', abrir: false, text: 'Fechando o painel.' };
  if (/\bpainel (financeiro|de cotacoes|de mercado)\b|\b(mostre|mostra|abra|abrir|exiba)\b.*\b(cotacoes|cambio|painel)\b|\bcotacao do (dolar|euro|peso)\b|\b(?:quanto (?:esta|ta|custa) o|qual (?:e )?o valor do) (dolar|euro|peso|bitcoin)\b/.test(t))
    return { kind: 'painel', abrir: true, text: 'Abrindo o painel financeiro.' };
  if (/\b(temperatura|clima|previsao do tempo|vai chover|como esta o tempo|esta chovendo|faz calor|faz frio)\b/.test(t) && !/\bclima (organizacional|de trabalho|empresarial)\b/.test(t)) {
    const dia = /\bamanha\b/.test(t) ? 'amanha' : 'hoje';
    const m = /\b(?:em|de|para)\s+([a-z][a-z ]{2,40}?)(?:\s+(?:hoje|amanha|agora))?$/.exec(t);
    const cidade = m && !/^(hoje|amanha|agora|chuva|tempo)$/.test(m[1]) ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : null;
    return { kind: 'tempo', dia, cidade };
  }
  if (/\bonde (nos )?estamos\b|\bonde (voce|o icaro) esta\b/.test(t)) return { kind: 'globo', acao: 'onde', text: 'Localizando onde estamos.' };
  if (/\b(volte|voltar) (para|pro|ao) (o )?(planeta|globo|espaco)\b|\bplaneta inteiro\b|\bvisao (global|do planeta)\b|\bmostre (a terra|o planeta|o globo)\b/.test(t))
    return { kind: 'globo', acao: 'planeta', text: 'Voltando para o planeta.' };
  if (/^(aproxime|aproxima|aproximar|chegue mais perto|zoom in|mais zoom|de zoom)\b/.test(t)) return { kind: 'globo', acao: 'mais', text: 'Aproximando.' };
  if (/^(afaste|afasta|afastar|menos zoom|zoom out|tire o zoom)\b/.test(t)) return { kind: 'globo', acao: 'menos', text: 'Afastando.' };
  if (/\bgir[ae] (a terra|o planeta|o globo)\b/.test(t)) return { kind: 'globo', acao: 'girar', text: 'Girando o planeta.' };
  return null;
}
