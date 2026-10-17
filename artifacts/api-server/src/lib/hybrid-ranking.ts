export type HybridSearchInput = {
  id: string;
  title: string;
  question: string;
  answer: string;
  source: "cache" | "bank";
  semanticScore?: number;
};

export type RankedHybridCandidate = {
  entry: Omit<HybridSearchInput, "semanticScore">;
  lexical: number;
  semantic: number;
  score: number;
};

const FILLER = new Set([
  "como", "qual", "quais", "quando", "onde", "porque", "por", "que", "quem",
  "explique", "explicar", "explica", "defina", "definir", "fale", "diga",
  "sobre", "para", "favor", "pode", "posso", "quero", "gostaria", "me",
]);

function tokens(text: string): string[] {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/^passage:\s*/, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !FILLER.has(word));
}

function bm25Scores(question: string, documents: string[]): number[] {
  const queryTerms = [...new Set(tokens(question))];
  const corpus = documents.map(tokens);
  const documentFrequencies = new Map<string, number>();
  for (const document of corpus) {
    for (const term of new Set(document)) {
      documentFrequencies.set(term, (documentFrequencies.get(term) ?? 0) + 1);
    }
  }
  const averageLength = corpus.length ? corpus.reduce((sum, document) => sum + document.length, 0) / corpus.length : 0;
  if (!queryTerms.length || !averageLength) return documents.map(() => 0);
  const k1 = 1.2;
  const b = 0.75;
  return corpus.map((document) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = document.filter((word) => word === term).length;
      if (!frequency) continue;
      const df = documentFrequencies.get(term) ?? 0;
      const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
      score += idf * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * document.length / averageLength));
    }
    return score;
  });
}

export function rankHybridCandidates(question: string, candidates: HybridSearchInput[]): RankedHybridCandidate[] {
  const lexicalScores = bm25Scores(question, candidates.map((candidate) => candidate.question));
  const grouped = new Map<string, RankedHybridCandidate>();
  candidates.forEach((candidate, index) => {
    const key = `${candidate.source}:${candidate.id}`;
    const lexical = lexicalScores[index] ?? 0;
    const semantic = Math.max(0, candidate.semanticScore ?? 0);
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, {
        entry: { id: candidate.id, title: candidate.title, question: candidate.question, answer: candidate.answer, source: candidate.source },
        lexical,
        semantic,
        score: 0,
      });
      return;
    }
    if (lexical > previous.lexical || semantic > previous.semantic) {
      previous.entry = {
        id: candidate.id,
        title: candidate.title,
        question: candidate.question,
        answer: candidate.answer,
        source: candidate.source,
      };
    }
    previous.lexical = Math.max(previous.lexical, lexical);
    previous.semantic = Math.max(previous.semantic, semantic);
  });
  const maxLexical = Math.max(0, ...Array.from(grouped.values(), (candidate) => candidate.lexical));
  const maxSemantic = Math.max(0, ...Array.from(grouped.values(), (candidate) => candidate.semantic));
  return Array.from(grouped.values())
    .map((candidate) => ({
      ...candidate,
      score: maxSemantic
        ? 0.55 * (candidate.semantic / maxSemantic) + 0.45 * (maxLexical ? candidate.lexical / maxLexical : 0)
        : maxLexical ? candidate.lexical / maxLexical : 0,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}
