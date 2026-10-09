import { normalizeKnowledgeText } from "./knowledge-bank";

export type CalculationMatch = {
  id: string;
  familia: string;
  resposta: string;
};

type CalculationRow = CalculationMatch & {
  chave: string;
  numeros: string[];
};

type CalculationRequest = {
  familia: string;
  numeros: string[];
  termos: string[];
};

type CalculationSqlClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};

const STOP_WORDS = new Set([
  "a", "o", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "um", "uma", "para", "por", "com", "que", "qual", "quais", "como", "sobre",
  "explique", "defina", "fale", "diga", "me", "pode", "poderia", "voce", "icaro",
  "quem", "quanto", "onde", "quando", "porque", "isso", "esse", "essa", "este",
  "esta", "ser", "foi", "sao", "significa", "serve", "ola", "favor", "gostaria",
  "saber", "queria", "entao", "mais", "muito", "the",
]);

const FAMILY_RULES: Array<[string, RegExp]> = [
  ["te", /\b(?:taxa.*equivalente|equivalente.*taxa)\b/],
  ["lanc", /\b(?:lancamento|lancar|debitar|creditar|debito|credito)\b/],
  ["cf", /\b(?:funcionario|folha|salario|custo.*funcionario)\b/],
  ["mk", /\bmarkup\b/],
  ["dep", /\bdepreciacao\b/],
  ["pe", /\b(?:ponto.*equilibrio|break even|breakeven)\b/],
  ["price", /\b(?:tabela price|sistema price|price)\b/],
  ["sac", /\b(?:tabela sac|sistema sac|sac|amortizacao constante)\b/],
  ["dc", /\b(?:desconto comercial|desconto simples.*titulo)\b/],
  ["jc", /\bjuros compostos?\b/],
  ["js", /\bjuros simples?\b/],
  ["vp", /\b(?:valor presente|valor atual)\b/],
  ["ah", /\b(?:analise horizontal|variacao percentual|variacao entre periodos)\b/],
  ["lc", /\b(?:liquidez corrente|liquidez)\b/],
  ["roe", /\b(?:roe|retorno sobre patrimonio)\b/],
  ["roa", /\b(?:roa|retorno sobre ativo)\b/],
  ["ml", /\b(?:margem liquida|margem liquida de vendas)\b/],
  ["eg", /\b(?:endividamento geral|indice de endividamento)\b/],
  ["ga", /\b(?:giro do ativo|rotacao do ativo)\b/],
];

export function numbersFromQuestion(text: string): string[] {
  const values = new Set<string>();
  const pattern = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(\s*mil(?![\p{L}]))?/giu;

  for (const match of text.matchAll(pattern)) {
    let raw = match[1];
    raw = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");
    let value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (match[2]) value *= 1_000;
    values.add(String(Math.round((value + Number.EPSILON) * 100) / 100));
  }

  if (/(?:^|[^\p{L}\d\s])\s*mil(?![\p{L}])|(?:^|\s)mil(?![\p{L}])/iu.test(text)
    && !/\d\s*mil(?![\p{L}])/iu.test(text)) {
    values.add("1000");
  }

  return [...values];
}

function calculationTerms(question: string): string[] {
  const words = normalizeKnowledgeText(question)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
  return [...new Set(words)].slice(0, 12);
}

function familyFromQuestion(question: string): string | null {
  const normalized = normalizeKnowledgeText(question)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return FAMILY_RULES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

export function parseCalculationRequest(question: string): CalculationRequest | null {
  const familia = familyFromQuestion(question);
  if (!familia) return null;

  const numeros = numbersFromQuestion(question);
  const termos = calculationTerms(question);
  if (!numeros.length || !termos.length) return null;

  return { familia, numeros, termos };
}

function termRoot(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word;
}

function coverage(terms: string[], candidate: string): number {
  if (!terms.length) return 0;
  const candidateRoots = new Set(
    normalizeKnowledgeText(candidate)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(termRoot),
  );
  return terms.filter((term) => candidateRoots.has(termRoot(term))).length / terms.length;
}

function chooseCandidate(rows: CalculationRow[], request: CalculationRequest): CalculationRow | null {
  const ranked = rows
    .map((row) => ({
      row,
      score: coverage(request.termos, row.chave),
      orderedNumbersMatch: row.numeros.join("\0") === request.numeros.join("\0"),
    }))
    .sort((left, right) =>
      right.score - left.score
      || Number(right.orderedNumbersMatch) - Number(left.orderedNumbersMatch)
      || left.row.id.localeCompare(right.row.id));
  const best = ranked[0];
  if (!best || best.score < 0.5) return null;

  // Some families reuse the same numeric inputs (for example, both employee
  // cost regimes and several journal-entry types). Parameter order can break
  // ties when the wording lists the inputs in the same order as the base.
  const tied = ranked.filter((item) =>
    item.score === best.score && item.orderedNumbersMatch === best.orderedNumbersMatch);
  if (tied.length > 1 && new Set(tied.map((item) => item.row.resposta)).size > 1) return null;
  return best.row;
}

export function createCalculationLookup(pool: CalculationSqlClient) {
  return async (question: string): Promise<CalculationMatch | null> => {
    const request = parseCalculationRequest(question);
    if (!request) return null;

    const result = await pool.query(
      `SELECT id, familia, resposta, chave, numeros
         FROM public.icaro_calculos
        WHERE familia = $1
          AND numeros @> $2::text[]
          AND numeros <@ $2::text[]
        ORDER BY id
        LIMIT 60`,
      [request.familia, request.numeros],
    );
    return chooseCandidate(result.rows as CalculationRow[], request);
  };
}
