/**
 * Valida a integração de texto Groq, sua rota e a seleção de provedor no ÍCARO.
 * As verificações locais usam fetch injetado; somente a validação 53 acessa a API local.
 *
 * Uso: pnpm --filter @workspace/scripts run validate:groq
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createGroqTextService,
  getGroqApiKey,
  getGroqModel,
  GroqServiceError,
} from "../../artifacts/api-server/src/lib/groq";
import { normalizeAnswerText } from "../../artifacts/api-server/src/lib/answer-text";

type Call = { url: string; init?: RequestInit };
const checks: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => checks.push([name, fn]);
const input = {
  systemPrompt: "Instruções de sistema.",
  history: [
    { role: "user" as const, content: "Pergunta anterior." },
    { role: "assistant" as const, content: "Resposta anterior." },
  ],
  userMessage: "Pergunta atual.",
};
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function harness(
  handler: (call: Call) => Response | Promise<Response>,
  options: {
    getApiKey?: () => string;
    getModel?: () => string;
    timeoutMs?: number;
    invalidResponseRetries?: number;
    invalidResponseRetryDelayMs?: number;
  } = {},
) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return {
    calls,
    service: createGroqTextService({
      getApiKey: options.getApiKey ?? (() => "mock-groq-key"),
      getModel: options.getModel ?? (() => "mock-model"),
      timeoutMs: options.timeoutMs,
      invalidResponseRetries: options.invalidResponseRetries,
      invalidResponseRetryDelayMs: options.invalidResponseRetryDelayMs,
      fetchImpl,
    }),
  };
}
const read = (relativePath: string) =>
  readFileSync(path.resolve(import.meta.dirname, "../..", relativePath), "utf8");
const expectSource = (source: string, pattern: RegExp, behavior: string) => {
  assert.ok(pattern.test(source), behavior);
};
async function rejectsKind(fn: () => Promise<unknown>, kind: GroqServiceError["kind"]) {
  await assert.rejects(fn, (error: unknown) =>
    error instanceof GroqServiceError && error.kind === kind);
}

check("GROQ_API_KEY tem precedência sobre a chave legada grok", () => {
  assert.equal(getGroqApiKey({ GROQ_API_KEY: " primary ", grok: "legacy" }), "primary");
});
check("Chave Groq configurada é devolvida sem espaços externos", () => {
  assert.equal(getGroqApiKey({ GROQ_API_KEY: "  gsk-example  " }), "gsk-example");
});
check("Alias grok fornece a chave quando GROQ_API_KEY está ausente", () => {
  assert.equal(getGroqApiKey({ grok: " legacy-key " }), "legacy-key");
});
check("Alias grok fornece a chave quando GROQ_API_KEY está vazia", () => {
  assert.equal(getGroqApiKey({ GROQ_API_KEY: "", grok: "legacy-key" }), "legacy-key");
});
check("Chave primária em branco cai para alias não branco", () => {
  assert.equal(getGroqApiKey({ GROQ_API_KEY: "   ", grok: " alias " }), "alias");
});
check("Ausência de ambas as chaves resulta em string vazia", () => {
  assert.equal(getGroqApiKey({}), "");
});
check("Modelo padrão é openai/gpt-oss-120b servido pela Groq", () => {
  assert.equal(getGroqModel({}), "openai/gpt-oss-120b");
});
check("GROQ_MODEL configurado é aplicado com espaços removidos", () => {
  assert.equal(getGroqModel({ GROQ_MODEL: "  llama-custom  " }), "llama-custom");
});
check("GROQ_MODEL vazio usa o modelo padrão", () => {
  assert.equal(getGroqModel({ GROQ_MODEL: "  " }), "openai/gpt-oss-120b");
});
check("Serviço devolve resposta e modelo retornados pelo provedor", async () => {
  const h = harness(() => ok({ model: "llama-response", choices: [{ message: { content: "Olá, Ícaro." } }] }));
  assert.deepEqual(await h.service.generateAnswer(input), { answer: "Olá, Ícaro.", model: "llama-response" });
});
check("Conteúdo em blocos de texto compatíveis com OpenAI é lido corretamente", async () => {
  const h = harness(() => ok({
    choices: [{ message: { content: [{ type: "text", text: "Olá, " }, { type: "text", text: "Ícaro." }] } }],
  }));
  assert.deepEqual(await h.service.generateAnswer(input), { answer: "Olá, Ícaro.", model: "mock-model" });
});
check("Resposta vazia na primeira tentativa é recuperada por uma repetição limitada", async () => {
  let attempts = 0;
  const h = harness(() => {
    attempts++;
    return attempts === 1
      ? ok({ choices: [{ message: { content: "" } }] })
      : ok({ choices: [{ message: { content: "Resposta recuperada." } }] });
  }, { invalidResponseRetries: 1, invalidResponseRetryDelayMs: 0 });
  assert.deepEqual(await h.service.generateAnswer(input), { answer: "Resposta recuperada.", model: "mock-model" });
  assert.equal(h.calls.length, 2);
});
check("JSON inválido na primeira tentativa é recuperado por uma repetição limitada", async () => {
  let attempts = 0;
  const h = harness(() => {
    attempts++;
    return attempts === 1
      ? new Response("{not-json", { status: 200 })
      : ok({ choices: [{ message: { content: "Resposta recuperada." } }] });
  }, { invalidResponseRetries: 1, invalidResponseRetryDelayMs: 0 });
  assert.deepEqual(await h.service.generateAnswer(input), { answer: "Resposta recuperada.", model: "mock-model" });
  assert.equal(h.calls.length, 2);
});
check("Requisição usa endpoint oficial de chat completions Groq", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }));
  await h.service.generateAnswer(input);
  assert.equal(h.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
});
check("Requisição Groq usa método HTTP POST", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }));
  await h.service.generateAnswer(input);
  assert.equal(h.calls[0].init?.method, "POST");
});
check("Requisição Groq define Content-Type JSON", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }));
  await h.service.generateAnswer(input);
  assert.equal((h.calls[0].init?.headers as Record<string, string>)["Content-Type"], "application/json");
});
check("Bearer usa exclusivamente a chave mock injetada", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }), {
    getApiKey: () => "unit-test-key-not-real",
  });
  await h.service.generateAnswer(input);
  assert.equal((h.calls[0].init?.headers as Record<string, string>).Authorization, "Bearer unit-test-key-not-real");
});
check("Payload preserva system prompt, histórico ordenado e mensagem atual", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }));
  await h.service.generateAnswer(input);
  const body = JSON.parse(String(h.calls[0].init?.body));
  assert.deepEqual(body.messages, [
    { role: "system", content: input.systemPrompt },
    ...input.history,
    { role: "user", content: input.userMessage },
  ]);
});
check("Payload limita a resposta a 1536 tokens para reduzir uso da cota gratuita", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }));
  await h.service.generateAnswer(input);
  assert.equal(JSON.parse(String(h.calls[0].init?.body)).max_tokens, 1536);
});
check("Requisição inclui AbortSignal com prazo máximo configurável", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }), { timeoutMs: 1500 });
  await h.service.generateAnswer(input);
  assert.ok(h.calls[0].init?.signal instanceof AbortSignal);
});
check("Chave ausente falha antes de acessar fetch", async () => {
  const h = harness(() => { throw new Error("fetch não deveria ser chamado"); }, { getApiKey: () => "" });
  await rejectsKind(() => h.service.generateAnswer(input), "missing_key");
  assert.equal(h.calls.length, 0);
});
check("Serviço usa modelo explicitamente injetado no payload", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }), { getModel: () => "injected-model" });
  await h.service.generateAnswer(input);
  assert.equal(JSON.parse(String(h.calls[0].init?.body)).model, "injected-model");
});
check("Modelo de resposta ausente cai no modelo configurado", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "ok" } }] }), { getModel: () => "fallback-model" });
  assert.equal((await h.service.generateAnswer(input)).model, "fallback-model");
});
check("Modelo vazio informado pelo provedor também cai na configuração local", async () => {
  const h = harness(() => ok({ model: "   ", choices: [{ message: { content: "ok" } }] }), {
    getModel: () => "configured-model",
  });
  assert.equal((await h.service.generateAnswer(input)).model, "configured-model");
});
check("Texto da resposta é removido de espaços externos", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "  texto útil  \n" } }] }));
  assert.equal((await h.service.generateAnswer(input)).answer, "texto útil");
});
check("Conteúdo vazio do provedor é rejeitado como resposta inválida", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: "" } }] }));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
  assert.equal(h.calls.length, 2, "resposta vazia deve receber só uma repetição");
});
check("Conteúdo só com espaços do provedor é rejeitado", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: " \n\t " } }] }));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
});
check("Conteúdo não textual do provedor não é aceito como resposta", async () => {
  const h = harness(() => ok({ choices: [{ message: { content: 21 } }] }));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
});
check("Resposta sem choices é invalid_response", async () => {
  const h = harness(() => ok({ model: "model-x" }));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
});
check("choices null é tratada como resposta inválida", async () => {
  const h = harness(() => ok({ choices: null }));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
});
check("JSON malformado recebido com status 200 produz invalid_response", async () => {
  const h = harness(() => new Response("{not-json", { status: 200 }));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
});
check("Payload JSON null do provedor é invalid_response", async () => {
  const h = harness(() => new Response("null", { status: 200 }));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
});
check("Payload array sem choices não é interpretado como texto", async () => {
  const h = harness(() => ok([]));
  await rejectsKind(() => h.service.generateAnswer(input), "invalid_response");
});
check("HTTP 429 é classificado como rate_limit", async () => {
  const h = harness(() => new Response("quota", { status: 429 }));
  await rejectsKind(() => h.service.generateAnswer(input), "rate_limit");
});
check("HTTP 401 é classificado como request_failed sem expor corpo", async () => {
  const h = harness(() => new Response("credential-detail", { status: 401 }));
  await rejectsKind(() => h.service.generateAnswer(input), "request_failed");
});
check("HTTP 500 é classificado como request_failed", async () => {
  const h = harness(() => new Response("upstream failure", { status: 500 }));
  await rejectsKind(() => h.service.generateAnswer(input), "request_failed");
});
check("Falha de rede no fetch é classificada como request_failed", async () => {
  const h = harness(() => { throw new TypeError("offline"); });
  await rejectsKind(() => h.service.generateAnswer(input), "request_failed");
});
check("Abort de fetch é classificado como request_failed", async () => {
  const h = harness(() => Promise.reject(new DOMException("Aborted", "AbortError")));
  await rejectsKind(() => h.service.generateAnswer(input), "request_failed");
});
check("Erro de serviço mantém nome e categoria estáveis para tratamento", () => {
  const error = new GroqServiceError("limite", "rate_limit");
  assert.equal(error.name, "GroqServiceError");
  assert.equal(error.kind, "rate_limit");
  assert.ok(error instanceof Error);
});
check("Erro missing_key não incorpora valor de chave", async () => {
  const h = harness(() => ok({}), { getApiKey: () => "" });
  await assert.rejects(h.service.generateAnswer(input), (error: unknown) => {
    assert.ok(error instanceof GroqServiceError);
    assert.equal(error.kind, "missing_key");
    assert.doesNotMatch(error.message, /gsk-|key-value/i);
    return true;
  });
});
check("Travessão em dash é normalizado para vírgula com espaço", () => {
  assert.equal(normalizeAnswerText("Receita—despesa"), "Receita, despesa");
});
check("Travessão en dash é normalizado para vírgula com espaço", () => {
  assert.equal(normalizeAnswerText("Receita–despesa"), "Receita, despesa");
});
check("Barra horizontal Unicode é normalizada para vírgula com espaço", () => {
  assert.equal(normalizeAnswerText("Receita―despesa"), "Receita, despesa");
});
check("Hífens ASCII, URL e valores negativos são preservados", () => {
  const text = "custo-benefício https://exemplo.com/a-b?x=-12, saldo -3";
  assert.equal(normalizeAnswerText(text), text);
});
check("Normalização conserva separação de linhas e newline interno", () => {
  assert.equal(normalizeAnswerText("Primeira linha\nSegunda—linha"), "Primeira linha\nSegunda, linha");
});
check("Normalização reduz espaços horizontais sem juntar palavras", () => {
  assert.equal(normalizeAnswerText("  Uma   frase\tcom   espaços.  "), "Uma frase com espaços.");
  assert.equal(normalizeAnswerText("Receita entre 15–30%"), "Receita entre 15 a 30%");
  assert.equal(normalizeAnswerText("Intervalo: -3–-1"), "Intervalo: -3 a -1");
  assert.equal(normalizeAnswerText("— Olá, professor."), "Olá, professor.");
});
check("Normalização corrige espaços anteriores à pontuação", () => {
  assert.equal(normalizeAnswerText("Resultado   ,   positivo  !"), "Resultado, positivo!");
});
check("Rota de chat integra Groq por serviço de texto e normaliza resposta", () => {
  const route = read("artifacts/api-server/src/routes/ai.ts");
  const start = route.indexOf('if (input.provider === "groq")');
  const end = route.indexOf("\n  const apiKey = process.env.ANTHROPIC_API_KEY", start);
  assert.ok(start >= 0 && end > start, "rota possui ramo Groq delimitado antes do ramo Claude");
  const groqBranch = route.slice(start, end);
  expectSource(groqBranch, /groq\.generateAnswer\(\{[\s\S]*systemPrompt,[\s\S]*history:[\s\S]*userMessage,/,
    "Groq recebe prompt de sistema, histórico e pergunta atual");
  expectSource(groqBranch, /const answer = normalizeAnswerText\(result\.answer\)/,
    "a resposta Groq passa pela normalização textual");
  expectSource(groqBranch, /SendAiMessageResponse\.parse\(\{\s*answer,\s*provider: "groq",\s*model: result\.model/,
    "resposta da rota retorna answer normalizado, provider Groq e modelo usado");
});
check("TTS permanece isolado do serviço Groq e usa a família de voz existente", () => {
  const route = read("artifacts/api-server/src/routes/ai.ts");
  const tts = route.slice(route.indexOf('router.post("/ai/tts"'), route.indexOf('router.post("/ai/chat"'));
  expectSource(tts, /speech\.synthesize\(speechText\)/, "rota TTS continua chamando o mecanismo de voz");
  expectSource(tts, /^(?![\s\S]*(?:groq|generateAnswer))[\s\S]*$/i, "rota TTS não encaminha texto ao Groq");
  expectSource(route, /geminiVoice:\s*process\.env\.GEMINI_TTS_VOICE\s*\|\|\s*"Orus"/,
    "voz Gemini Orus continua configurada");
  expectSource(route, /DEFAULT_GEMINI_TTS_MODELS/, "modelos Gemini de TTS continuam disponíveis");
});
check("Contrato da API inclui Groq entre provedores de entrada e resposta e status", () => {
  const spec = read("lib/api-spec/openapi.yaml");
  expectSource(spec, /enum: \[gemini, openai, groq, claude\]/,
    "contrato declara Groq como provedor de chat");
  expectSource(spec, /groqAvailable:[\s\S]*?type: boolean/,
    "status de configuração Groq tem campo booleano");
  expectSource(spec, /- groqAvailable/, "campo de disponibilidade Groq é obrigatório no contrato");
});
check("Stage inicia com Groq e lista botão habilitado pelo status Groq", () => {
  const stage = read("artifacts/icaro/src/pages/stage.tsx");
  expectSource(stage, /type Provider = [^;]*'groq'/, "Stage inclui Groq no tipo Provider");
  expectSource(stage, /useState<Provider>\('groq'\)/, "Stage seleciona Groq inicialmente");
  expectSource(stage, /\[['"]groq['"],\s*['"]gemini['"],\s*['"]openai['"],\s*['"]claude['"]\]\s+as Provider\[\]/,
    "lista de provedores de conexão inclui Groq");
  expectSource(stage, /p === 'groq'\s*\?\s*status\.data\?\.groqAvailable/,
    "estado habilitado do botão Groq depende de groqAvailable");
  expectSource(stage, /disabled=\{!ok\}[\s\S]*?setProvider\(p\)[\s\S]*?button-provider-\$\{p\}/,
    "botão da conexão habilita e seleciona Groq pelo status");
});
check("Assistant inicia com Groq e expõe seleção/status condizentes com disponibilidade", () => {
  const assistant = read("artifacts/icaro/src/pages/assistant.tsx");
  expectSource(assistant, /type Provider = [^;]*'groq'/, "Assistant inclui Groq no tipo Provider");
  expectSource(assistant, /useState<Provider>\('groq'\)/, "Assistant seleciona Groq inicialmente");
  expectSource(assistant, /provider === 'groq'\s*\?\s*status\.data\?\.groqAvailable/,
    "Assistant calcula disponibilidade ativa de Groq por groqAvailable");
  expectSource(assistant, /<option\s+value="groq"\s+disabled=\{!?status\??\.groqAvailable\}/,
    "opção Groq do seletor desabilita quando status não indica disponibilidade");
  expectSource(assistant, /disabled=\{[^}]*available === false[^}]*\}/,
    "Assistant impede envio quando o provedor selecionado não está disponível");
  expectSource(assistant, /provider,\s*question:\s*trimmed/,
    "envio do Assistant usa o provedor selecionado, inclusive Groq");
});

assert.equal(checks.length, 52, `Esperadas 52 verificações locais; encontradas ${checks.length}.`);
const results: Array<{ number: number; name: string; passed: boolean; detail?: string }> = [];
let failed = 0;
for (const [index, [name, fn]] of checks.entries()) {
  try {
    await fn();
    results.push({ number: index + 1, name, passed: true });
    console.log(`✓ ${String(index + 1).padStart(2, "0")}. ${name}`);
  } catch (error) {
    failed++;
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    results.push({ number: index + 1, name, passed: false, detail });
    console.error(`✗ ${String(index + 1).padStart(2, "0")}. ${name}\n    ${detail}`);
  }
}

let liveStatus: number | null = null;
let liveProvider: string | null = null;
let liveModel: string | null = null;
let liveError: string | undefined;
try {
  const loginResponse = await fetch("http://localhost:80/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "user1", password: process.env.ICARO_USER1_PASSWORD ?? "" }),
  });
  if (!loginResponse.ok) throw new Error(`login de teste falhou: ${loginResponse.status}`);
  const sessionCookie = (loginResponse.headers.get("set-cookie") ?? "").split(";")[0];
  const response = await fetch("http://localhost:80/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify({
      provider: "groq",
      persona: "icaro",
      question: "Responda somente:ConexãoGroqconfirmada",
      history: [],
      dataset: null,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  liveStatus = response.status;
  const data = await response.json().catch(() => null) as {
    answer?: unknown; provider?: unknown; model?: unknown;
  } | null;
  liveProvider = typeof data?.provider === "string" ? data.provider : null;
  liveModel = typeof data?.model === "string" ? data.model : null;
  if (!response.ok) liveError = `HTTP ${response.status}`;
  else if (liveProvider !== "groq" || !liveModel) liveError = "HTTP 200 sem provider/model esperados";
  else if (data?.answer !== "ConexãoGroqconfirmada") liveError = "HTTP 200 com resposta fora da expectativa";
} catch (error) {
  liveError = error instanceof Error && error.name === "TimeoutError"
    ? "HTTP indisponível: timeout"
    : "HTTP indisponível: conexão recusada ou erro de rede";
}
const livePassed = liveError === undefined;
results.push({
  number: 53,
  name: "Única chamada real: chat local Groq com persona Ícaro, histórico vazio e dataset nulo",
  passed: livePassed,
  ...(liveError ? { detail: liveError } : {}),
});
if (!livePassed) failed++;
console.log(
  `53. ${livePassed ? "✓" : "✗"} chamada local · status=${liveStatus ?? "sem resposta"} · provider=${liveProvider ?? "ausente"} · model=${liveModel ?? "ausente"}`,
);
writeFileSync("/tmp/icaro-groq-validation.json", JSON.stringify({
  total: 53,
  passed: 53 - failed,
  failed,
  checks: results,
  live: { passed: livePassed, status: liveStatus, provider: liveProvider, model: liveModel, ...(liveError ? { error: liveError } : {}) },
}, null, 2) + "\n");
console.log(`\n${53 - failed}/53 validações Groq passaram. Relatório: /tmp/icaro-groq-validation.json`);
process.exit(failed ? 1 : 0);