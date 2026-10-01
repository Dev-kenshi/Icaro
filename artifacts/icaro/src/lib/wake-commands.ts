/**
 * Wake words are processed before ordinary text can reach the assistant.
 *
 * O reconhecimento de voz do navegador raramente entrega "Ok, Ícaro" com essa
 * grafia exata: chegam "Ok e Caro", "O K Icaro", "Ok hicaro" etc. Por isso a
 * comparação é feita sobre tokens normalizados (minúsculos, sem acento, sem
 * pontuação), com uma tabela de variantes de transcrição. A pergunta continua
 * sendo extraída do texto ORIGINAL, a partir do fim do último token do comando.
 */

type Token = { raw: string; norm: string; end: number };

const normalizeToken = (raw: string) =>
  raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Divide a transcrição em tokens de palavra, guardando o deslocamento final de
 * cada um no texto original para recortar a pergunta sem perder a grafia. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const norm = normalizeToken(m[0]);
    if (norm) tokens.push({ raw: m[0], norm, end: m.index + m[0].length });
  }
  return tokens;
}

// "Ok" como o navegador costuma transcrever. "O.K." chega como os tokens
// "o" + "k" (a pontuação separa), cobertos pelo par o+k no matchOk.
const OK_SINGLE = new Set(['ok', 'okay', 'okey', 'okei', 'oquei']);
// "Ícaro" como o navegador costuma transcrever: junto, com consoante espúria
// na frente, ou separado ("e caro").
const NAME_SINGLE = new Set(['icaro', 'ikaro', 'hicaro', 'ycaro', 'icaru']);
// O par só vale se o primeiro token for exatamente e/i/y SEM acento:
// "Ok e Caro" é o nome; "Ok, é caro demais" é frase sobre preço, não comando.
const NAME_PAIR_SECOND = new Set(['caro']);
// Hesitações que podem sair na frente da ativação ("ah, ok, ícaro").
const FILLER = new Set(['ah', 'ahn', 'hum', 'hmm', 'eh', 'uh']);
const STOP_WORDS = new Set(['stop', 'estope', 'pare']);

/** Quantos tokens o "ok" ocupa a partir de i (0 = não é ok). */
function matchOk(tokens: Token[], i: number): number {
  const t = tokens[i];
  if (!t) return 0;
  if (OK_SINGLE.has(t.norm)) return 1;
  if (t.norm === 'o' && tokens[i + 1]?.norm === 'k') return 2;
  return 0;
}

/** Quantos tokens o nome "Ícaro" ocupa a partir de i (0 = não é o nome). */
function matchName(tokens: Token[], i: number): number {
  const t = tokens[i];
  if (!t) return 0;
  if (NAME_SINGLE.has(t.norm)) return 1;
  if (/^[eiy]$/i.test(t.raw) && NAME_PAIR_SECOND.has(tokens[i + 1]?.norm ?? '')) return 2;
  return 0;
}

export function parseWakeCommand(text: string, active: boolean) {
  text = text.normalize('NFC');
  const tokens = tokenize(text);

  // Stop tem prioridade e vale em qualquer ponto da frase ("Ok, Ícaro, stop, Ícaro").
  for (let i = 0; i < tokens.length; i++) {
    if (STOP_WORDS.has(tokens[i].norm) && matchName(tokens, i + 1)) {
      return { stop: true, wake: false, question: '' };
    }
  }

  // A ativação precisa abrir a frase — mencionar "ok, Ícaro" no meio de uma
  // conversa não é chamar o assistente. Tolera no máximo 2 hesitações antes.
  let i = 0;
  let fillers = 0;
  while (fillers < 2 && tokens[i] && FILLER.has(tokens[i].norm)) { i++; fillers++; }
  const okLen = matchOk(tokens, i);
  const nameLen = okLen ? matchName(tokens, i + okLen) : 0;
  const wake = okLen > 0 && nameLen > 0;

  const question = wake
    ? text.slice(tokens[i + okLen + nameLen - 1].end).replace(/^[\s,.!?;:—-]+/, '').trim()
    : active ? text.trim() : '';
  return { stop: false, wake, question };
}
