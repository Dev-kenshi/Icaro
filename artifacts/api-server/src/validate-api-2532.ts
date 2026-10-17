import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildBudgetedPrompt } from "./lib/context-budget";
import { createCerebroLayers, normalizeQuestion } from "./lib/cerebro-camadas";
import { rankHybridCandidates } from "./lib/hybrid-ranking";
import { createPerformanceMetrics } from "./lib/performance-metrics";
import { createProviderRouter, FREE_AUTO_PROVIDER_IDS, providerQueue } from "./lib/provider-router";

const topics = [
  ["ativo-circulante", "ativo circulante"],
  ["passivo-circulante", "passivo circulante"],
  ["patrimonio-liquido", "patrimônio líquido"],
  ["depreciacao", "depreciação contábil"],
  ["amortizacao", "amortização contábil"],
  ["custo-fixo", "custo fixo"],
  ["custo-variavel", "custo variável"],
  ["fluxo-caixa", "fluxo de caixa"],
  ["regime-competencia", "regime de competência"],
  ["regime-caixa", "regime de caixa"],
  ["balanco-patrimonial", "balanço patrimonial"],
  ["demonstracao-resultado", "demonstração do resultado"],
  ["auditoria-independente", "auditoria independente"],
  ["auditoria-interna", "auditoria interna"],
  ["receita-bruta", "receita bruta"],
  ["despesas-operacionais", "despesas operacionais"],
  ["controle-estoque", "controle de estoque"],
  ["capital-giro", "capital de giro"],
  ["ponto-equilibrio", "ponto de equilíbrio"],
  ["margem-contribuicao", "margem de contribuição"],
] as const;

const prompts = [
  (topic: string) => `Na prática, explique o tema ${topic}.`,
  (topic: string) => `Quais pontos devo entender sobre ${topic}?`,
  (topic: string) => `Preciso revisar ${topic} para a aula.`,
];
const blindQuestions = topics.flatMap(([expectedId, topic], topicIndex) =>
  prompts.map((makeQuestion, variantIndex) => ({
    question: makeQuestion(topic),
    expectedId,
    semanticScores: topics.map(([id]) => ({
      id,
      score: id === expectedId ? 0.74 + (variantIndex * 0.01) : 0.84 - ((topicIndex + variantIndex) % 4) * 0.01,
    })),
  })),
);

let passed = 0;
const check = async (name: string, run: () => void | Promise<void>) => {
  try {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

await check("60 blind questions rank the specific hybrid-search topic above a stronger generic vector match", () => {
  assert.equal(blindQuestions.length, 60);
  for (const testCase of blindQuestions) {
    const ranked = rankHybridCandidates(testCase.question, topics.map(([id, title]) => ({
      id,
      title,
      question: title,
      answer: `Resposta de referência para ${title}.`,
      source: "bank" as const,
      semanticScore: testCase.semanticScores.find((candidate) => candidate.id === id)!.score,
    })));
    assert.equal(ranked[0]?.entry.id, testCase.expectedId, `consulta sem rótulo esperado: ${testCase.question}`);
  }
});

await check("Ícaro prompt stays under its token budget with six summarized recent messages and drops weaker excerpts first", () => {
  const prepared = buildBudgetedPrompt({
    fixedInstructions: "instruções fixas ".repeat(180),
    baseContext: "contexto de dados ".repeat(1_200),
    snippets: Array.from({ length: 8 }, (_, index) => ({
      score: 8 - index,
      content: `fonte ${index} ${"conteúdo especializado ".repeat(120)}`,
    })),
    history: Array.from({ length: 9 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      content: `mensagem ${index} ${"explicação resumida ".repeat(15)}`,
    })),
    userMessage: `pergunta ${"tema detalhado ".repeat(150)}`,
    tokenCap: 6_000,
  });
  assert.ok(prepared.estimatedTokens <= 6_000);
  assert.equal(prepared.history.length, 6);
  assert.ok(prepared.snippets.length <= 6);
  assert.ok(prepared.snippets.every((snippet, index, all) => !index || all[index - 1].score >= snippet.score));

  const trimmed = buildBudgetedPrompt({
    fixedInstructions: "instruções ".repeat(80),
    baseContext: "dados ".repeat(330),
    snippets: Array.from({ length: 8 }, (_, index) => ({
      score: 8 - index,
      content: `fonte ${index} ${"informação útil ".repeat(120)}`,
    })),
    history: Array.from({ length: 6 }, (_, index) => ({ role: "user" as const, content: `histórico ${index} ${"contexto ".repeat(20)}` })),
    userMessage: `pergunta ${"detalhe ".repeat(80)}`,
    tokenCap: 2_150,
  });
  assert.ok(trimmed.estimatedTokens <= 2_150);
  assert.deepEqual(trimmed.snippets.map((snippet) => snippet.score), [8, 7, 6, 5]);
});

await check("automatic provider order is exactly Groq, Gemini, GitHub Models, Cerebras", () => {
  const expected = ["groq", "gemini", "github", "cerebras"];
  assert.deepEqual(FREE_AUTO_PROVIDER_IDS, expected);
  assert.deepEqual(providerQueue("fast"), expected);
  assert.deepEqual(providerQueue("deep"), expected);
});

const providerEnv = {
  GROQ_API_KEY: "test-groq",
  GEMINI_API_KEY: "test-gemini",
  GITHUB_TOKEN: "test-github",
  CEREBRAS_API_KEY: "test-cerebras",
};
await check("HTTP 429 opens a five-minute provider circuit and automatic routing falls through in order", async () => {
  const requested: string[] = [];
  const router = createProviderRouter({
    env: providerEnv,
    now: () => 1_000,
    firstTokenTimeoutMs: { fast: 100, deep: 100 },
    fetch: async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("api.groq.com")) return new Response(null, { status: 429 });
      return new Response('data: {"choices":[{"delta":{"content":"resposta"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  const result = await router.complete({
    systemPrompt: "Responda.",
    history: [],
    userMessage: "Pergunta de teste",
    maxTokens: 32,
  });
  assert.equal(result.provider, "gemini");
  assert.deepEqual(result.attempted, ["groq", "gemini"]);
  assert.ok(requested[0].includes("api.groq.com"));
  const groq = router.getHealth().find((provider) => provider.id === "groq");
  assert.equal(groq?.state, "cooldown");
  assert.equal(groq?.cooldownMs, 300_000);
});

await check("three consecutive provider failures open a five-minute circuit", async () => {
  const router = createProviderRouter({
    env: providerEnv,
    now: () => 5_000,
    firstTokenTimeoutMs: { fast: 100, deep: 100 },
    fetch: async () => new Response(null, { status: 503 }),
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(router.complete({
      systemPrompt: "Responda.",
      history: [],
      userMessage: "Pergunta de teste",
      maxTokens: 32,
    }));
  }
  for (const provider of router.getHealth().filter((item) => FREE_AUTO_PROVIDER_IDS.some((id) => id === item.id))) {
    assert.equal(provider.state, "cooldown", `${provider.id} não entrou em pausa`);
    assert.equal(provider.cooldownMs, 300_000, `${provider.id} não respeitou os cinco minutos`);
  }
});

await check("performance samples fail both simulated P95 targets and expose only aggregate token counts", () => {
  const metrics = createPerformanceMetrics();
  metrics.recordLatency("local", 1_499);
  metrics.recordLatency("cache", 1_501);
  metrics.recordLatency("llm", 3_001);
  metrics.recordEstimatedTokens(100);
  metrics.recordEstimatedTokens(300);
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.p95LocalCacheMs, 1_501);
  assert.equal(snapshot.localCacheTargetMet, false);
  assert.equal(snapshot.p95LlmMs, 3_001);
  assert.equal(snapshot.llmTargetMet, false);
  assert.equal(snapshot.averageEstimatedTokens, 200);
});

const cacheDir = await mkdtemp(path.join(tmpdir(), "icaro-api-2532-"));
try {
  const now = Date.UTC(2026, 9, 17);
  const entries = Array.from({ length: 501 }, (_, index) => ({
    key: `cache-${index}`,
    question: `pergunta de cache ${index}`,
    answer: `resposta ${index}`,
    sourceId: "fixture",
    layer: "L1" as const,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1_000,
    verificationRequired: false,
  }));
  entries[0].expiresAt = now - 1;
  await writeFile(path.join(cacheDir, "cache-respostas.json"), JSON.stringify(entries), "utf8");
  const brain = createCerebroLayers({ dataDir: cacheDir, now: () => now, embed: async () => [1, 0] });
  await check("cache removes expired entries and stays within 500 items for 24 hours", async () => {
    assert.deepEqual(await brain.getCacheStats(), { entries: 500, capacity: 500, ttlHours: 24 });
    const question = "pergunta cache nova sem fatos remotos";
    await brain.recordAnswer({ question, answer: "resposta local", layer: "L6", provider: "fixture", tokensSpent: 1 });
    await brain.flush();
    const persisted = JSON.parse(await readFile(path.join(cacheDir, "cache-respostas.json"), "utf8")) as Array<{
      question: string;
      createdAt: number;
      expiresAt: number;
    }>;
    const saved = persisted.find((entry) => entry.question === normalizeQuestion(question));
    assert.ok(saved);
    assert.equal(saved.expiresAt - saved.createdAt, 24 * 60 * 60 * 1_000);
    assert.equal(persisted.length, 500);
  });
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}

console.log(`${passed}/7 validações do escopo API 2532 passaram; 60 perguntas cegas inclusas.`);
