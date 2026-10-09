import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { KNOWLEDGE_BANK, normalizeKnowledgeText, resolveKnowledgeAnswer } from "./knowledge-bank";

export type AnswerLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
export type CandidateDestination = "bank" | "base";

export type AnswerCacheEntry = {
  key: string;
  question: string;
  answer: string;
  sourceId: string;
  layer: AnswerLayer;
  createdAt: number;
  expiresAt: number;
  verificationRequired: boolean;
};

export type AnswerCandidate = {
  id: string;
  question: string;
  answer: string;
  layer: "L5" | "L6";
  provider: string;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  status: "pending" | "approved" | "discarded";
  destination?: CandidateDestination;
};

export type LayerResolution =
  | { kind: "answer"; answer: string; layer: "L1" | "L2" | "L3" | "L4"; sourceId: string }
  | { kind: "compose"; snippets: Array<{ id: string; title: string; text: string }>; layer: "L5" }
  | { kind: "miss"; layer: "L6" };

export type LayerStats = {
  total: number;
  byLayer: Record<AnswerLayer, { count: number; percent: number }>;
  tokensSpent: number;
  tokensSaved: number;
  daily: Array<{ date: string; noAiPercent: number; total: number }>;
};

type DailyCounter = { date: string; counts: Record<AnswerLayer, number>; tokensSpent: number; tokensSaved: number };
type DiskState = { cache: AnswerCacheEntry[]; candidates: AnswerCandidate[]; daily: DailyCounter[]; approved: AnswerCandidate[] };
type VectorEntry = { question: string; answer: string; id: string; title: string; vector: number[]; source: "cache" | "bank" };
type Embed = (text: string) => Promise<number[]>;

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const VERIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const CACHE_FILE = "cache-respostas.json";
const CANDIDATES_FILE = "candidatas.jsonl";
const STATS_FILE = "stats-cerebro.json";
const APPROVED_FILE = "conhecimento-aprovado.json";
const REMOTE_FACT_RE = /\b(?:aliquota|al[ií]quota|prazo|vigente|atual|hoje|agora|prefeito|lei|legisla[cç][aã]o|norma)\b/i;
const PII_PATTERNS = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/,
  /\b(?:matr[ií]cula|cpf|telefone|e-?mail)\s*[:#]?\s*[A-Z0-9./@+-]{4,}\b/i,
];
const STUDENT_NAME_CONTEXT = /\b(?:aluno|aluna|estudante|nome|matr[ií]cula)\b/i;
const NAME_TOKEN = /\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,}\b/gu;
const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(?:imersao tecnologica contabil|imers[aã]o tecnol[oó]gica cont[aá]bil|itcont)\b/giu, "itcont"],
  [/\b(?:qdo|quando)\b/giu, "quando"],
  [/\b(?:pra|para)\b/giu, "para"],
  [/\b(?:conta corrente|fluxo financeiro)\b/giu, "fluxo de caixa"],
];

const emptyCounts = (): Record<AnswerLayer, number> => ({
  L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0,
});

export function normalizeQuestion(question: string): string {
  let normalized = normalizeKnowledgeText(question)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of SYNONYMS) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/\s+/g, " ").trim();
}

export function containsPersonalData(text: string): boolean {
  if (PII_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (STUDENT_NAME_CONTEXT.test(text)) {
    const names = text.match(NAME_TOKEN) ?? [];
    return names.some((name) => !/^(aluno|aluna|estudante|nome|matricula)$/i.test(name));
  }
  const capitalized = text.match(NAME_TOKEN) ?? [];
  return capitalized.length >= 2;
}

export function redactPersonalData(text: string): string {
  return text
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[e-mail]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]")
    .replace(/\b((?:aluno|aluna|estudante|nome)\s*[:#]?\s*)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)?/giu, "$1[nome]");
}

export function presenterize(text: string): string {
  return text
    .replace(/[*#_`>]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isCacheEntry(value: unknown): value is AnswerCacheEntry {
  return Boolean(value && typeof value === "object"
    && typeof (value as AnswerCacheEntry).key === "string"
    && typeof (value as AnswerCacheEntry).question === "string"
    && typeof (value as AnswerCacheEntry).answer === "string"
    && typeof (value as AnswerCacheEntry).expiresAt === "number");
}

function readJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

function lexicalScore(question: string, candidate: string): number {
  const left = new Set(normalizeQuestion(question).split(" ").filter((word) => word.length > 2));
  const right = new Set(normalizeQuestion(candidate).split(" ").filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / Math.sqrt(left.size * right.size);
}

export function createCerebroLayers(options: { dataDir: string; now?: () => number; embed?: Embed }) {
  const now = options.now ?? Date.now;
  const dataDir = options.dataDir;
  const cachePath = path.join(dataDir, CACHE_FILE);
  const candidatesPath = path.join(dataDir, CANDIDATES_FILE);
  const statsPath = path.join(dataDir, STATS_FILE);
  const approvedPath = path.join(dataDir, APPROVED_FILE);
  let state: DiskState = { cache: [], candidates: [], daily: [], approved: [] };
  let loaded: Promise<void> | null = null;
  let writeQueue = Promise.resolve();
  let embedderPromise: Promise<Embed> | null = null;
  let semanticIndexPromise: Promise<VectorEntry[]> | null = null;
  const injectedEmbedder = options.embed;

  async function ensureLoaded(): Promise<void> {
    if (!loaded) {
      loaded = (async () => {
        await mkdir(dataDir, { recursive: true });
        const [cacheRaw, candidatesRaw, statsRaw, approvedRaw] = await Promise.all([
          readFile(cachePath, "utf8").catch(() => null),
          readFile(candidatesPath, "utf8").catch(() => null),
          readFile(statsPath, "utf8").catch(() => null),
          readFile(approvedPath, "utf8").catch(() => null),
        ]);
        const cacheParsed = readJson<unknown[]>(cacheRaw, []);
        const candidates = (candidatesRaw ?? "").split(/\r?\n/).filter(Boolean).flatMap((line) => {
          try { return [JSON.parse(line) as AnswerCandidate]; } catch { return []; }
        });
        state = {
          cache: cacheParsed.filter(isCacheEntry).filter((entry) => entry.expiresAt > now()),
          candidates,
          daily: readJson<DailyCounter[]>(statsRaw, []),
          approved: readJson<AnswerCandidate[]>(approvedRaw, []),
        };
      })();
    }
    await loaded;
  }

  function persist(): Promise<void> {
    writeQueue = writeQueue.then(async () => {
      await mkdir(dataDir, { recursive: true });
      const tasks = [
        writeFile(`${cachePath}.tmp`, JSON.stringify(state.cache), "utf8").then(() => rename(`${cachePath}.tmp`, cachePath)),
        writeFile(`${candidatesPath}.tmp`, state.candidates.map((item) => JSON.stringify(item)).join("\n") + (state.candidates.length ? "\n" : ""), "utf8")
          .then(() => rename(`${candidatesPath}.tmp`, candidatesPath)),
        writeFile(`${statsPath}.tmp`, JSON.stringify(state.daily), "utf8").then(() => rename(`${statsPath}.tmp`, statsPath)),
        writeFile(`${approvedPath}.tmp`, JSON.stringify(state.approved), "utf8").then(() => rename(`${approvedPath}.tmp`, approvedPath)),
      ];
      await Promise.all(tasks);
    });
    return writeQueue;
  }

  async function getEmbedder(): Promise<Embed> {
    if (injectedEmbedder) return injectedEmbedder;
    if (!embedderPromise) {
      embedderPromise = (async () => {
        const transformers = await import("@huggingface/transformers");
        const extractor = await transformers.pipeline(
          "feature-extraction",
          "Xenova/multilingual-e5-small",
          { device: "cpu", dtype: "fp32" },
        );
        return async (text: string) => {
          const output = await extractor(text, { pooling: "mean", normalize: true });
          return Array.from(output.data as Float32Array);
        };
      })();
    }
    return embedderPromise;
  }

  async function buildSemanticIndex(): Promise<VectorEntry[]> {
    await ensureLoaded();
    const embed = await getEmbedder();
    const entries: Array<Omit<VectorEntry, "vector">> = [];
    for (const entry of KNOWLEDGE_BANK) {
      for (const trigger of entry.triggers) {
        const question = trigger.join(" ");
        entries.push({
          question: `passage: ${question}`,
          answer: entry.answer,
          id: entry.id,
          title: entry.title,
          source: "bank",
        });
      }
    }
    for (const entry of state.cache) {
      entries.push({
        question: `passage: ${entry.question}`,
        answer: entry.answer,
        id: entry.sourceId,
        title: "Resposta anterior",
        source: "cache",
      });
    }
    for (const entry of state.approved) {
      if (entry.status !== "approved" || !entry.destination) continue;
      entries.push({
        question: `passage: ${entry.question}`,
        answer: entry.answer,
        id: entry.id,
        title: "Conhecimento aprovado",
        source: "bank",
      });
    }
    const indexed: VectorEntry[] = [];
    for (const entry of entries) {
      if (containsPersonalData(entry.question) || containsPersonalData(entry.answer)) continue;
      indexed.push({ ...entry, vector: await embed(entry.question) });
    }
    return indexed;
  }

  async function getSemanticIndex(): Promise<VectorEntry[]> {
    if (!semanticIndexPromise) semanticIndexPromise = buildSemanticIndex();
    return semanticIndexPromise;
  }

  function track(layer: AnswerLayer, question: string, answer: string, tokensSpent: number, tokensSaved: number) {
    const date = new Date(now()).toISOString().slice(0, 10);
    let day = state.daily.find((item) => item.date === date);
    if (!day) {
      day = { date, counts: emptyCounts(), tokensSpent: 0, tokensSaved: 0 };
      state.daily.push(day);
    }
    day.counts[layer] += 1;
    day.tokensSpent += tokensSpent;
    day.tokensSaved += tokensSaved;
    state.daily = state.daily.slice(-60);
    void persist();
  }

  async function saveCache(question: string, answer: string, layer: AnswerLayer, sourceId: string, verificationRequired = false): Promise<void> {
    if (containsPersonalData(question) || containsPersonalData(answer)) return;
    const normalized = normalizeQuestion(question);
    if (!normalized) return;
    const timestamp = now();
    const entry: AnswerCacheEntry = {
      key: digest(normalized),
      question: normalized,
      answer,
      sourceId,
      layer,
      createdAt: timestamp,
      expiresAt: timestamp + (verificationRequired || REMOTE_FACT_RE.test(question) ? VERIFIED_TTL_MS : CACHE_TTL_MS),
      verificationRequired: verificationRequired || REMOTE_FACT_RE.test(question),
    };
    state.cache = [entry, ...state.cache.filter((item) => item.key !== entry.key)].slice(0, 5_000);
    const currentIndex = semanticIndexPromise;
    if (currentIndex) {
      void currentIndex.then(async (index) => {
        if (index.some((item) => item.source === "cache" && item.question === `passage: ${normalized}`)) return;
        try {
          const embed = await getEmbedder();
          index.unshift({
            question: `passage: ${normalized}`,
            answer,
            id: sourceId,
            title: "Resposta anterior",
            vector: await embed(`passage: ${normalized}`),
            source: "cache",
          });
        } catch {
          // The exact cache remains usable even when semantic indexing is unavailable.
        }
      }).catch(() => undefined);
    }
    await persist();
  }

  async function resolve(question: string, knowledgeMode: "auto" | "base" = "auto"): Promise<LayerResolution> {
    await ensureLoaded();
    const normalized = normalizeQuestion(question);
    const estimatedTokens = Math.max(1, Math.ceil(question.length / 4));
    if (!normalized || containsPersonalData(question)) return { kind: "miss", layer: "L6" };

    const exact = knowledgeMode === "auto" ? state.cache.find((entry) =>
      entry.key === digest(normalized) && entry.expiresAt > now(),
    ) : undefined;
    if (exact) {
      track("L1", question, exact.answer, 0, estimatedTokens);
      return { kind: "answer", answer: exact.answer, layer: "L1", sourceId: exact.sourceId };
    }

    const approvedBank = knowledgeMode === "auto" ? state.approved.find((entry) =>
      entry.status === "approved" && entry.destination === "bank"
      && normalizeQuestion(entry.question) === normalized,
    ) : undefined;
    if (approvedBank) {
      track("L2", question, approvedBank.answer, 0, estimatedTokens);
      await saveCache(question, approvedBank.answer, "L2", approvedBank.id);
      return { kind: "answer", answer: approvedBank.answer, layer: "L2", sourceId: approvedBank.id };
    }

    // Respostas revisadas do banco local não devem esperar o embedder opcional:
    // isso evita até 3,5 s de espera antes de uma resposta que já está pronta.
    if (knowledgeMode === "auto") {
      const bankMatch = resolveKnowledgeAnswer(question);
      if (bankMatch) {
        track("L4", question, bankMatch.answer, 0, estimatedTokens);
        await saveCache(question, bankMatch.answer, "L4", bankMatch.id);
        return { kind: "answer", answer: bankMatch.answer, layer: "L4", sourceId: bankMatch.id };
      }
    }

    if (knowledgeMode === "base") {
      const bankMatch = resolveKnowledgeAnswer(question);
      if (bankMatch) {
        track("L4", question, bankMatch.answer, 0, estimatedTokens);
        await saveCache(question, bankMatch.answer, "L4", bankMatch.id);
        return { kind: "answer", answer: bankMatch.answer, layer: "L4", sourceId: bankMatch.id };
      }
    }

    let bestVector: VectorEntry | null = null;
    let bestSimilarity = 0;
    try {
      const embeddingSearch = (async () => {
        const embed = await getEmbedder();
        const queryVector = await embed(`query: ${question}`);
        let match: VectorEntry | null = null;
        let similarityMax = 0;
        for (const candidate of await getSemanticIndex()) {
          const similarity = cosineSimilarity(queryVector, candidate.vector);
          if (similarity > similarityMax) {
            similarityMax = similarity;
            match = candidate;
          }
        }
        return { match, similarityMax };
      })();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        embeddingSearch,
        new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), 3_500); }),
      ]).finally(() => { if (timeout) clearTimeout(timeout); });
      if (result) {
        bestVector = result.match;
        bestSimilarity = result.similarityMax;
      }
    } catch {
      // Keep local intent and BM25 answers available if the optional model download is unavailable.
    }

    if (knowledgeMode === "auto" && bestVector && bestSimilarity >= 0.9) {
      track("L3", question, bestVector.answer, 0, estimatedTokens);
      await saveCache(question, bestVector.answer, "L3", bestVector.id);
      return { kind: "answer", answer: bestVector.answer, layer: "L3", sourceId: bestVector.id };
    }

    if (knowledgeMode === "base") {
      if (bestVector && bestSimilarity >= 0.82) {
        track("L4", question, bestVector.answer, 0, estimatedTokens);
        await saveCache(question, bestVector.answer, "L4", bestVector.id);
        return { kind: "answer", answer: bestVector.answer, layer: "L4", sourceId: bestVector.id };
      }
      return { kind: "miss", layer: "L6" };
    }

    if (bestVector && bestSimilarity >= 0.82) {
      const snippets = [{ id: bestVector.id, title: bestVector.title, text: bestVector.answer }];
      const lexical = KNOWLEDGE_BANK
        .map((entry) => ({ entry, score: lexicalScore(question, entry.triggers.map((trigger) => trigger.join(" ")).join(" ")) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(({ entry }) => ({ id: entry.id, title: entry.title, text: entry.answer }));
      const unique = [...new Map([...snippets, ...lexical].map((item) => [item.id, item])).values()].slice(0, 3);
      return { kind: "compose", snippets: unique, layer: "L5" };
    }

    return { kind: "miss", layer: "L6" };
  }

  async function recordAnswer(input: {
    question: string;
    answer: string;
    layer: "L5" | "L6";
    provider: string;
    tokensSpent: number;
  }): Promise<void> {
    await ensureLoaded();
    track(input.layer, input.question, input.answer, input.tokensSpent, 0);
    if (containsPersonalData(input.question) || containsPersonalData(input.answer)) return;
    const normalized = normalizeQuestion(input.question);
    if (!normalized) return;
    const id = digest(normalized).slice(0, 24);
    const timestamp = now();
    const existing = state.candidates.find((item) => item.id === id && item.status === "pending");
    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = timestamp;
    } else {
      state.candidates.unshift({
        id,
        question: normalized,
        answer: input.answer,
        layer: input.layer,
        provider: input.provider,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        count: 1,
        status: "pending",
      });
      state.candidates = state.candidates.slice(0, 2_000);
    }
    await saveCache(input.question, input.answer, input.layer, `generated-${id}`);
    await persist();
  }

  async function listCandidates(): Promise<AnswerCandidate[]> {
    await ensureLoaded();
    return state.candidates
      .filter((candidate) => candidate.status === "pending")
      .sort((left, right) => right.count - left.count || right.lastSeenAt - left.lastSeenAt);
  }

  async function recordLocalAnswer(input: {
    question: string;
    answer: string;
    sourceId: string;
  }): Promise<void> {
    await ensureLoaded();
    if (!input.question.trim() || containsPersonalData(input.question)) return;
    const estimatedTokens = Math.max(1, Math.ceil(input.question.length / 4));
    track("L4", input.question, input.answer, 0, estimatedTokens);
    await saveCache(input.question, input.answer, "L4", input.sourceId);
  }

  async function approveCandidate(id: string, destination: CandidateDestination): Promise<boolean> {
    await ensureLoaded();
    const candidate = state.candidates.find((item) => item.id === id && item.status === "pending");
    if (!candidate || containsPersonalData(candidate.question) || containsPersonalData(candidate.answer)) return false;
    candidate.status = "approved";
    candidate.destination = destination;
    state.approved = [candidate, ...state.approved.filter((item) => item.id !== id)].slice(0, 2_000);
    semanticIndexPromise = null;
    await persist();
    return true;
  }

  async function discardCandidate(id: string): Promise<boolean> {
    await ensureLoaded();
    const candidate = state.candidates.find((item) => item.id === id && item.status === "pending");
    if (!candidate) return false;
    candidate.status = "discarded";
    await persist();
    return true;
  }

  async function getStats(): Promise<LayerStats> {
    await ensureLoaded();
    const counts = emptyCounts();
    for (const day of state.daily) {
      for (const layer of Object.keys(counts) as AnswerLayer[]) counts[layer] += day.counts[layer] || 0;
    }
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const noAi = counts.L1 + counts.L2 + counts.L3 + counts.L4;
    const tokensSpent = state.daily.reduce((sum, day) => sum + day.tokensSpent, 0);
    const tokensSaved = state.daily.reduce((sum, day) => sum + day.tokensSaved, 0);
    return {
      total,
      byLayer: Object.fromEntries((Object.keys(counts) as AnswerLayer[]).map((layer) => [
        layer,
        { count: counts[layer], percent: total ? Math.round((counts[layer] / total) * 10_000) / 100 : 0 },
      ])) as LayerStats["byLayer"],
      tokensSpent,
      tokensSaved,
      daily: state.daily.map((day) => {
        const dayTotal = Object.values(day.counts).reduce((sum, value) => sum + value, 0);
        const dayWithoutAi = day.counts.L1 + day.counts.L2 + day.counts.L3 + day.counts.L4;
        return {
          date: day.date,
          noAiPercent: dayTotal ? Math.round((dayWithoutAi / dayTotal) * 10_000) / 100 : 0,
          total: dayTotal,
        };
      }),
    };
  }

  return {
    resolve,
    recordAnswer,
    recordLocalAnswer,
    listCandidates,
    approveCandidate,
    discardCandidate,
    getStats,
    flush: persist,
  };
}