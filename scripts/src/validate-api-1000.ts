/**
 * 1.000 casos determinísticos de contrato da API.
 * Não chama provedores externos nem consome limites de serviços de IA.
 */
import {
  GetAiStatusResponse,
  SendAiMessageBody,
  SendAiMessageResponse,
  SpeakAiTextBody,
  SynthesizeTtsTimestampsBody,
} from "../../lib/api-zod/src/generated/api";

const EXPECTED_CASES = 1_000;
let passed = 0;
let failed = 0;
let total = 0;
const failures: string[] = [];

function runCase(name: string, test: () => void) {
  total++;
  try {
    test();
    passed++;
  } catch (error) {
    failed++;
    if (failures.length < 20) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function expectParse(
  schema: { safeParse(value: unknown): { success: boolean } },
  input: unknown,
  expected: boolean,
) {
  const actual = schema.safeParse(input).success;
  if (actual !== expected) {
    throw new Error(`esperava ${expected ? "válido" : "inválido"}, recebeu ${actual ? "válido" : "inválido"}`);
  }
}

function textOfLength(length: number, seed: number) {
  const unit = seed % 3 === 0 ? "á" : seed % 3 === 1 ? "Í" : "x";
  return unit.repeat(length);
}

function chatBody(overrides: Record<string, unknown> = {}) {
  return {
    provider: "groq",
    persona: "icaro",
    question: "Explique o fluxo contábil.",
    history: [],
    dataset: null,
    ...overrides,
  };
}

const providers = ["gemini", "openai", "groq", "claude"] as const;
const personas = ["analyst", "icaro"] as const;

// 100 limites válidos + 100 entradas inválidas para síntese de voz.
for (let i = 0; i < 100; i++) {
  runCase(`tts válido ${i + 1}`, () => {
    const length = 1 + ((i * 37) % 1_200);
    const text = textOfLength(length, i);
    const parsed = SpeakAiTextBody.safeParse({ text });
    if (!parsed.success || parsed.data.text !== text) throw new Error(`limite ${length} rejeitado ou alterado`);
  });
  runCase(`tts inválido ${i + 1}`, () => {
    const badInput = i % 4 === 0
      ? { text: "" }
      : i % 4 === 1
        ? { text: textOfLength(1_201 + (i % 31), i) }
        : i % 4 === 2
          ? { text: null }
          : { text: 42 };
    expectParse(SpeakAiTextBody, badInput, false);
  });
}

// 100 mensagens válidas com combinações de provedor/persona + 100 rejeições de envelope.
for (let i = 0; i < 100; i++) {
  runCase(`chat básico válido ${i + 1}`, () => {
    const body = chatBody({
      provider: providers[i % providers.length],
      persona: personas[i % personas.length],
      question: textOfLength(1 + ((i * 41) % 4_000), i),
    });
    expectParse(SendAiMessageBody, body, true);
  });
  runCase(`chat básico inválido ${i + 1}`, () => {
    const invalid = i % 4 === 0
      ? chatBody({ provider: "unknown" })
      : i % 4 === 1
        ? chatBody({ question: "" })
        : i % 4 === 2
          ? chatBody({ persona: "unknown" })
          : chatBody({ question: textOfLength(4_001 + (i % 17), i) });
    expectParse(SendAiMessageBody, invalid, false);
  });
}

// Histórico no máximo permitido e recusas para tamanho, papel e conteúdo inválidos.
for (let i = 0; i < 100; i++) {
  runCase(`histórico válido ${i + 1}`, () => {
    const count = i % 9;
    const history = Array.from({ length: count }, (_, j) => ({
      role: j % 2 === 0 ? "user" : "assistant",
      content: textOfLength((i * 43 + j) % 4_001, i + j),
    }));
    expectParse(SendAiMessageBody, chatBody({ history }), true);
  });
  runCase(`histórico inválido ${i + 1}`, () => {
    const invalid = i % 4 === 0
      ? chatBody({ history: Array.from({ length: 9 }, () => ({ role: "user", content: "oi" })) })
      : i % 4 === 1
        ? chatBody({ history: [{ role: "user", content: textOfLength(4_001, i) }] })
        : i % 4 === 2
          ? chatBody({ history: [{ role: "system", content: "não permitido" }] })
          : chatBody({ history: [{ role: "assistant", content: 7 }] });
    expectParse(SendAiMessageBody, invalid, false);
  });
}

// Datasets válidos nos limites e quatro tipos comuns de corrupção.
for (let i = 0; i < 100; i++) {
  runCase(`dataset válido ${i + 1}`, () => {
    const columnsCount = i % 61;
    const rowsCount = i % 51;
    const dataset = {
      name: textOfLength(1 + (i % 160), i),
      columns: Array.from({ length: columnsCount }, (_, j) => `col-${i}-${j}`),
      sampleRows: Array.from({ length: rowsCount }, (_, j) => ({
        [`col-${j}`]: j % 2 === 0 ? `valor-${i}-${j}` : null,
      })),
      ...(i % 2 ? { summary: textOfLength(i % 6_001, i) } : {}),
    };
    expectParse(SendAiMessageBody, chatBody({ dataset }), true);
  });
  runCase(`dataset inválido ${i + 1}`, () => {
    const invalidDataset = i % 4 === 0
      ? { name: textOfLength(161, i), columns: [], sampleRows: [] }
      : i % 4 === 1
        ? { name: "dados", columns: Array.from({ length: 61 }, (_, j) => `c${j}`), sampleRows: [] }
        : i % 4 === 2
          ? { name: "dados", columns: [], sampleRows: Array.from({ length: 51 }, () => ({})) }
          : { name: "dados", columns: [], sampleRows: [], summary: textOfLength(6_001, i) };
    expectParse(SendAiMessageBody, chatBody({ dataset: invalidDataset }), false);
  });
}

// Status/response envelopes e limites da rota de timestamps.
for (let i = 0; i < 100; i++) {
  runCase(`envelopes de resposta ${i + 1}`, () => {
    const status = {
      geminiAvailable: i % 2 === 0,
      openaiAvailable: i % 3 === 0,
      groqAvailable: i % 5 === 0,
      claudeAvailable: i % 7 === 0,
      speechAvailable: i % 11 === 0,
    };
    const statusInput = i % 2 === 0 ? status : { ...status, speechAvailable: "yes" };
    expectParse(GetAiStatusResponse, statusInput, i % 2 === 0);
    const response = {
      answer: textOfLength(i % 300, i),
      provider: providers[i % providers.length],
      model: `model-${i}`,
    };
    expectParse(SendAiMessageResponse, response, true);
  });
  runCase(`timestamps ${i + 1}`, () => {
    const text = textOfLength(1 + ((i * 17) % 600), i);
    const previous = textOfLength((i * 29) % 1_201, i + 1);
    const valid = { text, previous_text: previous };
    if (i % 2 === 0) {
      expectParse(SynthesizeTtsTimestampsBody, valid, true);
    } else {
      const invalid = i % 4 === 1
        ? { text: textOfLength(601, i) }
        : i % 4 === 3
          ? { text, previous_text: textOfLength(1_201, i) }
          : { text: 12 };
      expectParse(SynthesizeTtsTimestampsBody, invalid, false);
    }
  });
}

if (total !== EXPECTED_CASES) {
  failures.push(`contagem interna: esperado ${EXPECTED_CASES}, executado ${total}`);
  failed++;
}

console.log(`${passed}/${EXPECTED_CASES} validações determinísticas da API passaram.`);
if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
}
if (failed > 0) process.exitCode = 1;