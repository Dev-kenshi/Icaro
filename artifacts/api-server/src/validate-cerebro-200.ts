import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { KNOWLEDGE_BANK } from "./lib/knowledge-bank";
import {
  containsPersonalData,
  createCerebroLayers,
  normalizeQuestion,
  redactPersonalData,
} from "./lib/cerebro-camadas";

const EXPECTED = 200;
let total = 0;
let passed = 0;
const failures: string[] = [];

async function runCase(name: string, check: () => void | Promise<void>) {
  total += 1;
  try {
    await check();
    passed += 1;
  } catch (error) {
    if (failures.length < 20) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const dataDir = await mkdtemp(path.join(tmpdir(), "icaro-cerebro-"));
let currentTime = Date.UTC(2026, 9, 2);
const brain = createCerebroLayers({
  dataDir,
  now: () => currentTime,
  embed: async (text) => text.startsWith("query: soft match") ? [0.85, 0.5267826876] : [1, 0],
});

try {
  for (let index = 0; index < 50; index += 1) {
    await runCase(`detecção PII ${index + 1}`, () => {
      const text = index % 2 === 0
        ? `CPF 123.456.789-${String(index).padStart(2, "0")}`
        : `Contato icaro${index}@exemplo.org`;
      assert(containsPersonalData(text), "o identificador pessoal não foi detectado");
      const redacted = redactPersonalData(text);
      assert(!redacted.includes(index % 2 === 0 ? "123.456.789" : `icaro${index}@`), "o identificador apareceu após a redação");
    });
  }

  for (let index = 0; index < 50; index += 1) {
    await runCase(`sinônimo ITCONT ${index + 1}`, () => {
      const suffix = ` contexto ${index}`;
      const canonical = normalizeQuestion(`ITCONT${suffix}`);
      const longName = normalizeQuestion(`Imersão Tecnológica Contábil${suffix}`);
      assert(canonical === longName, `normalizações diferentes: ${canonical} / ${longName}`);
    });
  }

  for (let index = 0; index < 50; index += 1) {
    await runCase(`cache e privacidade ${index + 1}`, async () => {
      if (index < 25) {
        const question = `pergunta exemplo segura ${index}`;
        const answer = `resposta de teste ${index}`;
        await brain.recordAnswer({ question, answer, layer: "L6", provider: "mock", tokensSpent: 10 });
        const result = await brain.resolve(question);
        assert(result.kind === "answer" && result.layer === "L1", "a resposta salva não foi reutilizada pela camada exata");
      } else {
        const question = `O aluno João ${index} pediu a informação`;
        const answer = `Dados confidenciais ${index}`;
        const pendingBefore = (await brain.listCandidates()).length;
        await brain.recordAnswer({ question, answer, layer: "L6", provider: "mock", tokensSpent: 10 });
        const result = await brain.resolve(question);
        const pendingAfter = (await brain.listCandidates()).length;
        assert(result.kind === "miss", "uma pergunta com nome de estudante foi respondida pelo cache");
        assert(pendingBefore === pendingAfter, "a candidata com nome de estudante foi salva");
      }
    });
  }

  for (let index = 0; index < 20; index += 1) {
    await runCase(`busca semântica L3 ${index + 1}`, async () => {
      const result = await brain.resolve(`paráfrase local segura ${index}`);
      assert(result.kind === "answer" && result.layer === "L3", "a correspondência de vetor alta não foi resolvida em L3");
    });
  }

  for (let index = 0; index < 20; index += 1) {
    await runCase(`composição L5 ${index + 1}`, async () => {
      const result = await brain.resolve(`soft match sem informação direta ${index}`);
      assert(result.kind === "compose" && result.layer === "L5", "a faixa semântica intermediária não pediu composição");
      assert(result.snippets.length > 0 && result.snippets.length <= 6, "a composição não limitou os seis trechos híbridos");
    });
  }

  for (let index = 0; index < 10; index += 1) {
    await runCase(`base L4 e aprovação ${index + 1}`, async () => {
      const trigger = KNOWLEDGE_BANK[0].triggers[0].join(" ");
      const baseResult = await brain.resolve(trigger, "base");
      assert(baseResult.kind === "answer" && baseResult.layer === "L4", "o modo base não respondeu pela camada L4");

      const question = `pergunta aprovada local ${index}`;
      const candidateId = (await import("node:crypto")).createHash("sha256").update(normalizeQuestion(question)).digest("hex").slice(0, 24);
      await brain.recordAnswer({
        question,
        answer: `resposta aprovada ${index}`,
        layer: "L6",
        provider: "mock",
        tokensSpent: 8,
      });
      assert(await brain.approveCandidate(candidateId, "bank"), "a candidata segura não foi aprovada");
      currentTime += 31 * 24 * 60 * 60 * 1_000;
      const approvedResult = await brain.resolve(question);
      assert(approvedResult.kind === "answer" && approvedResult.layer === "L2", "a aprovação não entrou no banco local");
    });
  }

  const stats = await brain.getStats();
  assert(stats.total > 0 && stats.byLayer.L2.count > 0, "as métricas de resolução não foram registradas");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}

if (total !== EXPECTED) failures.push(`contagem interna: esperado ${EXPECTED}, executado ${total}`);
if (passed !== EXPECTED) failures.push(`resultado: esperado ${EXPECTED} aprovados, executado ${passed}`);
console.log(`${passed}/${EXPECTED} validações determinísticas do cérebro passaram.`);
for (const failure of failures) console.error(`✗ ${failure}`);
if (failures.length) process.exitCode = 1;