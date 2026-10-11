/**
 * Valida o atalho local de conhecimento, a escuta antecipada e a regra visual
 * de que a legenda central mostra apenas a resposta falada do ÍCARO.
 *
 * Uso: pnpm --filter @workspace/scripts exec tsx ./src/validate-fast-knowledge.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  KNOWLEDGE_BANK,
  normalizeKnowledgeText,
  REVISED_KNOWLEDGE_BANK,
  resolveKnowledgeAnswer,
} from "../../artifacts/api-server/src/lib/knowledge-bank";
import { createCerebroLayers } from "../../artifacts/api-server/src/lib/cerebro-camadas";
import { WakeTurnGate } from "../../artifacts/icaro/src/lib/wake-turn-gate";

const root = path.resolve(import.meta.dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const checks: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => checks.push([name, fn]);

check("Banco local tem cobertura suficiente, categorias e IDs únicos", () => {
  assert.ok(KNOWLEDGE_BANK.length >= 24, `entradas=${KNOWLEDGE_BANK.length}`);
  assert.equal(new Set(KNOWLEDGE_BANK.map((entry) => entry.id)).size, KNOWLEDGE_BANK.length);
  assert.ok(KNOWLEDGE_BANK.filter((entry) => entry.category === "evento").length >= 14);
  assert.ok(KNOWLEDGE_BANK.filter((entry) => entry.category === "contabilidade").length >= 8);
  assert.ok(KNOWLEDGE_BANK.filter((entry) => entry.category === "tecnologia").length >= 4);
});

check("Base revisada importada responde sobre valuation sem consultar o embedder", async () => {
  assert.ok(REVISED_KNOWLEDGE_BANK.length >= 1_000, `respostas=${REVISED_KNOWLEDGE_BANK.length}`);
  assert.equal(new Set(REVISED_KNOWLEDGE_BANK.map((entry) => entry.id)).size, REVISED_KNOWLEDGE_BANK.length);
  const answer = resolveKnowledgeAnswer("Explique valuation por fluxo de caixa descontado");
  assert.equal(answer?.id, "cont2-valuation-fcd");

  const dataDir = mkdtempSync(path.join(tmpdir(), "icaro-fast-knowledge-"));
  let embedderCalled = false;
  const cerebro = createCerebroLayers({
    dataDir,
    embed: async () => { embedderCalled = true; return []; },
  });
  try {
    const result = await cerebro.resolve("Explique valuation por fluxo de caixa descontado");
    assert.equal(result.kind, "answer");
    assert.equal(embedderCalled, false);
    await cerebro.flush();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

check("Fatos extraídos do PDF permanecem fiéis no banco", () => {
  const all = KNOWLEDGE_BANK.map((entry) => `${entry.title} ${entry.answer}`).join(" ");
  for (const fact of [
    "21 e 22 de outubro de 2026",
    "Auditório III, Módulo IV",
    "sem transmissão ao vivo",
    "8 horas",
    "75 por cento",
    "23 integrantes",
    "seis frentes",
  ]) assert.ok(all.includes(fact), fact);
});

check("Normalização aceita acento, caixa e pontuação sem exigir digitação perfeita", () => {
  assert.equal(normalizeKnowledgeText("  QUANDO SERÁ o I-ITCONT?! "), "quando sera o itcont");
});

check("Pergunta sobre data do evento é resolvida localmente", () => {
  const hit = resolveKnowledgeAnswer("Quando será o I ITCONT?");
  assert.equal(hit?.id, "itcont-data");
  assert.match(hit.answer, /21 e 22 de outubro de 2026/);
});

check("Pergunta sobre local do evento é resolvida localmente", () => {
  const hit = resolveKnowledgeAnswer("Onde vai acontecer a imersão tecnológica contábil?");
  assert.equal(hit?.id, "itcont-local");
  assert.match(hit.answer, /Auditório III/);
});

check("Certificação e frequência respondem sem consultar IA remota", () => {
  const hit = resolveKnowledgeAnswer("Como recebo o certificado do ITCONT?");
  assert.equal(hit?.id, "itcont-certificado");
  assert.match(hit.answer, /75 por cento/);
});

check("Fundamentos contábeis estáveis usam respostas curtas e faláveis", () => {
  const hit = resolveKnowledgeAnswer("O que é DRE?");
  assert.equal(hit?.id, "contabilidade-dre");
  assert.match(hit.answer, /Demonstração do Resultado/);
  assert.ok(hit.answer.length <= 420);
  assert.doesNotMatch(hit.answer, /[#*_`>\[]/);
});

check("Pergunta contextual ou ambígua não é adivinhada pelo banco", () => {
  assert.equal(resolveKnowledgeAnswer("E onde será?"), null);
  assert.equal(resolveKnowledgeAnswer("Me fale mais sobre isso"), null);
  assert.equal(resolveKnowledgeAnswer("Quais são os palestrantes do ITCONT?"), null);
  assert.equal(resolveKnowledgeAnswer("Explique contabilidade de custos")?.id, "contabilidade-custos");
  assert.equal(resolveKnowledgeAnswer("O que é contabilidade de custos?")?.id, "contabilidade-custos");
  assert.equal(resolveKnowledgeAnswer("O que é contabilidade?")?.id, "contabilidade-conceito");
});

check("Legislação, cotação e temas atuais continuam com o provedor remoto", () => {
  assert.equal(resolveKnowledgeAnswer("Qual é a alíquota atual?"), null);
  assert.equal(resolveKnowledgeAnswer("Qual é a cotação do dólar hoje?"), null);
});

check("Explica com precisão quais dados ao vivo o ÍCARO oferece", () => {
  const hit = resolveKnowledgeAnswer("Por que você não tem informações de tempo real?");
  assert.equal(hit?.id, "geral-icaro-tempo-real");
  assert.match(hit?.answer ?? "", /clima e finanças/);
  assert.match(hit?.answer ?? "", /placares esportivos.*ainda não estão conectados/);
  assert.doesNotMatch(hit?.answer ?? "", /meu treinamento terminou em 2024/);
});

check("Resposta de capacidade correta substitui resposta antiga incorreta em cache", async () => {
  const question = "Por que você não tem informações de tempo real?";
  const dataDir = mkdtempSync(path.join(tmpdir(), "icaro-live-data-faq-"));
  const cerebro = createCerebroLayers({ dataDir });
  try {
    await cerebro.recordAnswer({
      question,
      answer: "Não tenho acesso a dados ao vivo porque meu treinamento terminou em 2024.",
      layer: "L6",
      provider: "test",
      tokensSpent: 20,
    });
    const result = await cerebro.resolve(question);
    assert.equal(result.kind, "answer");
    assert.equal(result.sourceId, "geral-icaro-tempo-real");
    assert.match(result.answer, /clima e finanças/);
    assert.doesNotMatch(result.answer, /meu treinamento terminou em 2024/);
    await cerebro.flush();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

check("Rota consulta o banco antes de qualquer provedor e identifica provider local", () => {
  const route = read("artifacts/api-server/src/routes/ai.ts");
  const localCall = route.indexOf("const layered = await cerebro.resolve(userMessage");
  const gemini = route.indexOf('if (input.provider === "gemini")');
  const openai = route.indexOf('if (input.provider === "openai")');
  const groq = route.indexOf('if (input.provider === "groq")');
  assert.ok(localCall >= 0 && gemini > localCall && openai > localCall && groq > localCall);
  assert.match(route, /input\.persona === "icaro" && !input\.dataset/);
  assert.match(route, /provider: "local"/);
});

check("Contrato permite local apenas como resposta, nunca como provedor escolhido", () => {
  const spec = read("lib/api-spec/openapi.yaml");
  const input = spec.slice(spec.indexOf("AiChatInput:"), spec.indexOf("AiChatResponse:"));
  const response = spec.slice(spec.indexOf("AiChatResponse:"));
  assert.match(input, /enum: \[auto, gemini, openai, groq, claude, cerebras, openrouter, mistral, github, nvidia, cloudflare, huggingface, cohere\]/);
  assert.doesNotMatch(input, /enum: \[[^\]]*local/);
  assert.match(response, /enum: \[auto, gemini, openai, groq, claude, cerebras, openrouter, mistral, github, nvidia, cloudflare, huggingface, cohere, local\]/);
});

check("Limite de tokens fala em voz alta sem deixar respostas longas demais", () => {
  const route = read("artifacts/api-server/src/routes/ai.ts");
  const groq = read("artifacts/api-server/src/lib/groq.ts");
  assert.match(route, /const responseTokenLimit = input\.persona === "icaro" \? 1024 : 8192/);
  assert.match(route, /maxTokens: responseTokenLimit/);
  assert.match(groq, /max_tokens: input\.maxTokens \?\? 1536/);
});

check("Legenda central não exibe Pensando, Preparando, transcrição ou erro de áudio", () => {
  const stage = read("artifacts/icaro/src/pages/stage.tsx");
  const speech = read("artifacts/icaro/src/lib/speech.ts");
  assert.doesNotMatch(stage, /setCaption\(['"](?:Pensando|Preparando a voz)/);
  assert.doesNotMatch(stage, /onTranscript:[\s\S]*?setCaption\(transcript\)/);
  assert.doesNotMatch(stage, /setInterim\(true\)/);
  assert.match(speech, /onError\?: \(message: string\) => void/);
  assert.doesNotMatch(speech, /onChunk\(`Não foi possível iniciar o áudio/);
  assert.match(stage, /onError: \(e\) => \{[\s\S]{0,500}setLog\(/);
  assert.doesNotMatch(stage, /onError: \(e\)[\s\S]{0,300}sayRef\.current/);
});

check("A espera artificial da voz começa em zero e pode ser gerenciada na aba Voz", () => {
  const stage = read("artifacts/icaro/src/pages/stage.tsx");
  assert.match(stage, /const SPEECH_DELAY_KEY = 'icaro\.stage\.speech-delay\.v1'/);
  assert.match(stage, /data-testid="button-manage-delay"/);
  assert.match(stage, /data-testid="input-speech-delay"/);
  assert.match(stage, /min="0" max="3000" step="100"/);
  assert.match(stage, /if \(speechDelayRef\.current > 0\)/);
});

check("Interim estável dispara a pergunta uma única vez antes do resultado final", () => {
  const gate = new WakeTurnGate();
  gate.arm(0);
  const interim = gate.receive("Ok Ícaro, quando será o ITCONT", false, 3, 10, false);
  assert.equal(interim.some((event) => event.type === "transcript"), true);
  const early = gate.commitInterim(3, "quando será o ITCONT", 560);
  assert.deepEqual(early, [{ type: "question", text: "quando será o ITCONT" }]);
  assert.equal(gate.pending, true);
  assert.deepEqual(gate.receive("Ok Ícaro, quando será o ITCONT", true, 3, 900, false), []);

  const incomplete = new WakeTurnGate();
  incomplete.arm(0);
  incomplete.receive("Ok Ícaro, o que é", false, 4, 10, false);
  assert.deepEqual(incomplete.commitInterim(4, "o que é", 570), []);
  assert.equal(incomplete.pending, false);
  assert.equal(
    incomplete.receive("Ok Ícaro, o que é DRE", true, 4, 900, false)
      .filter((event) => event.type === "question").length,
    1,
  );
});

check("Guarda de eco e retomada da captura ficam curtos sem abrir conversa ambiente", () => {
  const gateSource = read("artifacts/icaro/src/lib/wake-turn-gate.ts");
  const hook = read("artifacts/icaro/src/hooks/use-wake-listener.ts");
  assert.match(gateSource, /OUTPUT_ECHO_GUARD_MS = 450/);
  assert.match(hook, /INTERIM_COMMIT_MS = 550/);
  assert.match(hook, /150 \* 2 \*\* failures/);
  assert.match(hook, /maxAlternatives = 1/);
  const echoStop = new WakeTurnGate();
  assert.deepEqual(echoStop.receive("Diga Stop Ícaro", false, 7, 0, true, true), []);
  assert.deepEqual(echoStop.receive("Diga Stop Ícaro para interromper", true, 7, 1000, false, false), []);
  assert.equal(echoStop.active, false);
});

assert.equal(checks.length, 19, `Esperadas exatamente 19 validações; encontradas ${checks.length}.`);
let failed = 0;
for (const [index, [name, fn]] of checks.entries()) {
  try {
    await fn();
    console.log(`✓ ${String(index + 1).padStart(2, "0")}. ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${String(index + 1).padStart(2, "0")}. ${name}`);
    console.log(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} validações de conhecimento e resposta rápida passaram.`);
process.exit(failed ? 1 : 0);
