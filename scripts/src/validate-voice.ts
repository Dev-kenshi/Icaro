/**
 * Valida a voz neural e a integração do player de frases do pacote ÍCARO.
 * Não faz pedidos a provedores de voz.
 *
 * Uso: pnpm --filter @workspace/scripts run validate:voice
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createSpeechEngine,
  DEFAULT_GEMINI_TTS_MODELS,
  elevenLabsBody,
  geminiTtsBody,
  ModelRotation,
  normalizeGeminiAudio,
  parseGeminiErrorMessage,
  parseRetryDelayMs,
  pcmToWav,
  speechCacheKey,
  SpeechUnavailableError,
  type SpeechEngineConfig,
} from "../../artifacts/api-server/src/lib/tts";
import { applyTtsPronunciation } from "../../artifacts/api-server/src/lib/tts-timestamps";
import {
  cleanSpeechText,
  planSpeechChunks,
  queueSpeechChunks,
  TIMESTAMP_SAFE_CHUNK_LIMIT,
} from "../../artifacts/icaro/src/lib/speech-plan";

type Call = { url: string; body: unknown };
const PCM = Buffer.alloc(4800, 7);

function geminiOk(mimeType = "audio/L16;codec=pcm;rate=24000", data: Buffer = PCM) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { data: data.toString("base64"), mimeType } }] } }],
  }), { status: 200 });
}
function gemini429(delay = "31s") {
  return new Response(JSON.stringify({
    error: { code: 429, details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }] },
  }), { status: 429 });
}

function harness(opts: {
  handler: (url: string, call: Call, n: number) => Response | Promise<Response>;
  keys?: Partial<Record<"gemini" | "openai" | "elevenlabs", string>>;
  voice?: string;
  dataDir?: string;
  elevenModel?: string;
}) {
  const calls: Call[] = [];
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    else if (init?.body instanceof FormData) body = "form-data";
    const call = { url, body };
    calls.push(call);
    return opts.handler(url, call, calls.length);
  }) as typeof fetch;
  const keys = { gemini: "g", ...opts.keys };
  const cfg: SpeechEngineConfig = {
    geminiKey: () => keys.gemini ?? "",
    openAiKey: () => keys.openai ?? "",
    elevenLabsKey: () => keys.elevenlabs ?? "",
    elevenLabsVoiceId: () => "",
    geminiModels: ["model-a", "model-b"],
    geminiVoice: opts.voice ?? "Orus",
    openAiModel: "gpt-4o-mini-tts",
    openAiVoice: "onyx",
    elevenLabsModel: opts.elevenModel ?? "eleven_flash_v2_5",
    voiceSamplePath: path.resolve(import.meta.dirname, "../../artifacts/api-server/assets/voice/amostra_voz.mp3"),
    dataDir: opts.dataDir ?? mkdtempSync(path.join(os.tmpdir(), "icaro-voice-")),
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
  };
  return { engine: createSpeechEngine(cfg), calls, sleeps, cfg };
}

const checks: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => checks.push([name, fn]);

check("WAV gerado a partir de PCM tem cabeçalho RIFF válido", () => {
  const wav = pcmToWav(PCM, 24000);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), PCM.length);
  assert.equal(wav.length, 44 + PCM.length);
});

check("PCM do Gemini respeita a taxa de amostragem informada", () => {
  const out = normalizeGeminiAudio(PCM, "audio/l16; rate=16000; channels=1");
  assert.equal(out.contentType, "audio/wav");
  assert.equal(out.audio.readUInt32LE(24), 16000);
});

check("WAV pronto (modelos gemini-3.8) não recebe cabeçalho duplicado", () => {
  const wav = pcmToWav(PCM, 24000);
  const out = normalizeGeminiAudio(wav, "audio/wav");
  assert.equal(out.audio, wav);
  assert.equal(out.audio.toString("latin1").split("RIFF").length - 1, 1);
});

check("Tempo de espera da cota é lido do erro 429", () => {
  assert.equal(parseRetryDelayMs('{"retryDelay": "31s"}'), 31_000);
  assert.equal(parseRetryDelayMs("Please retry in 30.650691846s."), 30_651);
  assert.equal(parseRetryDelayMs("sem informação"), null);
});

check("Detalhe de erro Gemini é extraído sem registrar uma chave", () => {
  assert.equal(
    parseGeminiErrorMessage('{"error":{"message":"Bad request with key AIza123456789012345678901234567890123"}}'),
    "Bad request with key [redacted]",
  );
  assert.equal(parseGeminiErrorMessage("resposta inválida"), null);
  assert.equal(parseGeminiErrorMessage('{"error":{"code":400}}'), null);
});

check("Credencial Gemini rejeitada falha rápido sem resfriar os modelos", async () => {
  const h = harness({
    handler: () => new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }), { status: 400 }),
  });
  await assert.rejects(
    h.engine.synthesize("Teste de credencial."),
    (error: unknown) => error instanceof SpeechUnavailableError && error.code === "provider_auth",
  );
  assert.equal(h.calls.length, 1);
  assert.equal(h.engine.rotation.next(), "model-a");
});

check("Gemini TTS usa os modelos ativos e o contrato atual de voz", () => {
  assert.deepEqual(DEFAULT_GEMINI_TTS_MODELS, [
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
  ]);
  assert.deepEqual(geminiTtsBody("Olá, Ícaro.", "Orus"), {
    contents: [{ role: "user", parts: [{ text: "Olá, Ícaro." }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { voice: "Orus" } },
    },
  });
});

check("Rodízio de modelos pula quem está em espera e volta depois", () => {
  let t = 0;
  const r = new ModelRotation(["a", "b"], () => t);
  r.cool("a", 1000);
  assert.equal(r.next(), "b");
  r.cool("b", 500);
  assert.equal(r.next(), null);
  assert.equal(r.earliestReadyAt(), 500);
  t = 1000;
  assert.equal(r.next(), "a");
});

check("Cota esgotada num modelo troca de modelo mantendo a MESMA voz", async () => {
  const h = harness({ handler: (url) => (url.includes("model-a") ? gemini429() : geminiOk()) });
  const res = await h.engine.synthesize("Olá, eu sou o ÍCARO.");
  assert.equal(res.family, "gemini");
  assert.equal(res.model, "model-b");
  assert.equal(h.calls.length, 2);
  for (const c of h.calls) {
    const voice = (c.body as { generationConfig: { speechConfig: { voiceConfig: { voice: string } } } })
      .generationConfig.speechConfig.voiceConfig.voice;
    assert.equal(voice, "Orus");
  }
});

check("Todos os modelos em espera curta: aguarda e fala com a voz neural", async () => {
  const h = harness({ handler: (_u, _c, n) => (n <= 2 ? gemini429("3s") : geminiOk()) });
  const res = await h.engine.synthesize("Aguarde um instante.");
  assert.equal(res.cache, "miss");
  assert.ok(h.sleeps.length >= 1 && h.sleeps[0] <= 3000, `sleeps=${h.sleeps}`);
  assert.equal(h.calls.length, 3);
});

check("Nunca troca para outra voz (OpenAI) quando o Gemini falha", async () => {
  const h = harness({ keys: { openai: "o" }, handler: () => new Response("boom", { status: 500 }) });
  await assert.rejects(h.engine.synthesize("Teste."), SpeechUnavailableError);
  assert.equal(h.calls.filter((c) => c.url.includes("openai.com")).length, 0);
  assert.ok(h.calls.length > 0);
});

check("Voz do zip: clona a amostra uma única vez e usa as configurações do kit", async () => {
  const h = harness({
    keys: { elevenlabs: "e" },
    handler: (url) => url.endsWith("/voices/add")
      ? new Response(JSON.stringify({ voice_id: "voz-icaro" }), { status: 200 })
      : new Response(Buffer.from("ID3fakeaudio"), { status: 200 }),
  });
  assert.equal(h.engine.family(), "elevenlabs");
  await h.engine.synthesize("Primeira frase.");
  await h.engine.synthesize("Segunda frase.");
  assert.equal(h.calls.filter((c) => c.url.endsWith("/voices/add")).length, 1);
  const tts = h.calls.filter((c) => c.url.includes("/text-to-speech/voz-icaro"));
  assert.equal(tts.length, 2);
  const body = tts[0].body as Record<string, unknown>;
  assert.equal(body.language_code, "pt");
  assert.deepEqual(body.voice_settings, { stability: 0.45, similarity_boost: 0.9, style: 0, use_speaker_boost: true });
  const saved = JSON.parse(readFileSync(path.join(h.cfg.dataDir, "elevenlabs-voice.json"), "utf8"));
  assert.equal(saved.voiceId, "voz-icaro");
  assert.equal(elevenLabsBody("x", "eleven_multilingual_v2").language_code, undefined);
});

check("Frases já faladas sobrevivem ao reinício do servidor (cache em disco)", async () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "icaro-voice-"));
  const a = harness({ dataDir, handler: () => geminiOk() });
  const first = await a.engine.synthesize("Bom dia, professor Rômulo.");
  const b = harness({ dataDir, handler: () => { throw new Error("não deveria chamar a API"); } });
  const again = await b.engine.synthesize("Bom dia, professor Rômulo.");
  assert.equal(again.cache, "disk");
  assert.ok(again.audio.equals(first.audio));
  assert.equal(b.calls.length, 0);
});

check("Cache nunca mistura vozes diferentes", async () => {
  assert.notEqual(speechCacheKey("gemini", "Orus", "Oi"), speechCacheKey("gemini", "Puck", "Oi"));
  assert.notEqual(speechCacheKey("gemini", "Orus", "Oi"), speechCacheKey("elevenlabs", "Orus", "Oi"));
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "icaro-voice-"));
  await harness({ dataDir, handler: () => geminiOk() }).engine.synthesize("Oi");
  const other = harness({ dataDir, voice: "Puck", handler: () => geminiOk() });
  const res = await other.engine.synthesize("Oi");
  assert.equal(res.cache, "miss");
  assert.equal(other.calls.length, 1);
});

check("Pedidos simultâneos da mesma frase gastam só 1 chamada de cota", async () => {
  const h = harness({ handler: async () => { await new Promise((r) => setTimeout(r, 20)); return geminiOk(); } });
  const [x, y] = await Promise.all([h.engine.synthesize("Mesma frase."), h.engine.synthesize("Mesma frase.")]);
  assert.equal(h.calls.length, 1);
  assert.ok(x.audio.equals(y.audio));
});

check("Pronúncia mantém UEFS legível sem alterar palavras maiores", () => {
  assert.equal(applyTtsPronunciation("A UEFS fica na Bahia."), "A Uéfis fica na Bahia.");
  assert.equal(applyTtsPronunciation("UEFS, ueFS e Universidade."), "Uéfis, ueFS e Universidade.");
  assert.equal(applyTtsPronunciation("UEFSiana"), "UEFSiana");
});

check("Avatar de voz divide respostas em frases, faz prefetch e cancela áudio/pedidos", () => {
  const player = readFileSync(path.resolve(import.meta.dirname, "../../artifacts/icaro/public/avatar/speech-player.js"), "utf8");
  const visemes = readFileSync(path.resolve(import.meta.dirname, "../../artifacts/icaro/public/avatar/visemes-ptbr.js"), "utf8");
  assert.match(player, /splitSentences/);
  assert.match(visemes, /function splitSentences/);
  assert.match(player, /prefetch:\s*2/);
  assert.match(player, /item\.data\s*=\s*this\._fetch\(item,\s*gen\)/);
  assert.match(player, /this\.queue\.push\(item\)/);
  assert.match(player, /for \(const a of this\.aborts\) a\.abort\(\)/);
  assert.match(player, /this\.gen\+\+/);
  assert.match(player, /for \(const s of this\.sources\) \{ try \{ s\.onended = null; s\.stop\(\)/);
});

check("Facade usa o player do pacote, rota com timestamps e fallback Gemini sem voz de sistema", () => {
  const speech = readFileSync(path.resolve(import.meta.dirname, "../../artifacts/icaro/src/lib/speech.ts"), "utf8");
  const avatar = readFileSync(path.resolve(import.meta.dirname, "../../artifacts/icaro/src/lib/icaro-avatar.ts"), "utf8");
  assert.match(speech, /new Constructor\(\{[\s\S]*?endpoint:\s*`\$\{BASE_URL\}api\/tts-ts`/);
  assert.match(speech, /fetch\(`\$\{BASE_URL\}api\/ai\/tts`/);
  assert.match(speech, /request\.abort\(\)/);
  assert.match(speech, /loadIcaroAvatarLibrary\(\)/);
  assert.match(speech, /if \(!activeAvatar \|\| avatar !== activeAvatar\)/);
  assert.match(speech, /const engine = createRunEngine\(run, Constructor\)/);
  assert.match(speech, /currentRun === run && player === run\.engine/);
  assert.match(avatar, /loadScript\(`\$\{avatarRoot\}speech-player\.js`\)/);
  assert.doesNotMatch(speech, /new SpeechSynthesisUtterance|speechSynthesis\.speak/);
  assert.doesNotMatch(speech.match(/export function speak\(text: string, options: SpeakOpts\) \{[\s\S]*?\n\}/)?.[0] || "", /speechSynthesis|pickVoice/);
});

check("O Secret gemine atualizado prevalece sobre a variável GEMINI_API_KEY antiga", () => {
  const route = readFileSync(path.resolve(import.meta.dirname, "../../artifacts/api-server/src/routes/ai.ts"), "utf8");
  assert.match(route, /return process\.env\.gemine \|\| process\.env\.GEMINI_API_KEY \|\| ""/);
});

check("Rota de timestamps valida texto e responde sem configuração antes de chamar provedor", () => {
  const route = readFileSync(path.resolve(import.meta.dirname, "../../artifacts/api-server/src/routes/tts-timestamps.ts"), "utf8");
  const keyGuard = route.indexOf('if (!apiKey)');
  const voiceGuard = route.indexOf("if (!voiceId)");
  const providerCall = route.indexOf("timestampedSpeech.synthesize({");
  assert.ok(keyGuard >= 0 && voiceGuard > keyGuard && providerCall > voiceGuard);
  assert.match(route, /res\.status\(503\)\.json\(\{ error: "O serviço de áudio com marcação de tempo não está configurado\."\s*\}\)/);
  assert.match(route, /SynthesizeTtsTimestampsBody\.safeParse\(req\.body\)/);
  assert.match(route, /TTS_TIMESTAMP_MAX_TEXT/);
  assert.match(route, /router\.post\("\/tts-ts"/);
});

check("Limpeza de texto remove marcação e normaliza espaços", () => {
  assert.equal(cleanSpeechText("  **Olá,   professor!**  "), "Olá, professor!");
});

check("Agrupa várias frases em menos chamadas e conserva a resposta", () => {
  const text = [
    "A primeira frase explica o resultado com contexto suficiente.",
    "A segunda frase detalha a causa e mantém a voz natural.",
    "A terceira frase apresenta uma recomendação prática.",
    "A quarta frase conclui a resposta.",
  ].join(" ");
  const chunks = planSpeechChunks(text, {
    groupMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
    hardMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
  });
  assert.ok(chunks.length < 4, `chunks=${chunks.length}`);
  assert.equal(cleanSpeechText(chunks.join(" ")), cleanSpeechText(text));
});

check("Chunks longos respeitam o limite seguro do serviço de timestamps", () => {
  const text = Array.from({ length: 18 }, (_, i) =>
    `Etapa ${i} descreve uma orientação contábil com detalhes suficientes para preservar o sentido da explicação.`,
  ).join(" ");
  const chunks = planSpeechChunks(text, {
    groupMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
    hardMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
  });
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= TIMESTAMP_SAFE_CHUNK_LIMIT));
  assert.equal(cleanSpeechText(chunks.join(" ")), cleanSpeechText(text));
});

check("Player recebe os chunks planejados sem voltar a dividir por frase", async () => {
  const text = [
    "A primeira frase explica o resultado com contexto suficiente.",
    "A segunda frase detalha a causa e mantém a voz natural.",
    "A terceira frase apresenta uma recomendação prática.",
    "A quarta frase conclui a resposta.",
  ].join(" ");
  const expected = planSpeechChunks(text, {
    groupMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
    hardMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
  });
  const events: string[] = [];
  const engine = {
    unlock: () => { events.push("unlock"); },
    _enqueue: (chunk: string) => { events.push(`enqueue:${chunk}`); },
    flush: async () => { events.push("flush"); },
  };
  await queueSpeechChunks(engine, text);
  assert.deepEqual(events, ["unlock", ...expected.map((chunk) => `enqueue:${chunk}`), "flush"]);
});

check("A fila espera o término do player e ignora texto vazio", async () => {
  let finish!: () => void;
  let completed = false;
  const events: string[] = [];
  const engine = {
    unlock: () => { events.push("unlock"); },
    _enqueue: (chunk: string) => { events.push(`enqueue:${chunk}`); },
    flush: () => {
      events.push("flush");
      return new Promise<void>((resolve) => { finish = resolve; });
    },
  };
  const pending = queueSpeechChunks(engine, "Uma resposta com conteúdo suficiente para ser falada.");
  void pending.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(events[0], "unlock");
  assert.equal(events.at(-1), "flush");
  finish();
  await pending;
  assert.equal(completed, true);

  const emptyEvents: string[] = [];
  await queueSpeechChunks({
    unlock: () => { emptyEvents.push("unlock"); },
    _enqueue: () => { emptyEvents.push("enqueue"); },
    flush: async () => { emptyEvents.push("flush"); },
  }, "   ");
  assert.deepEqual(emptyEvents, []);
});

check("Planejamento de voz passa 100/100 respostas variadas", () => {
  let passed = 0;
  for (let i = 0; i < 100; i++) {
    const sentenceCount = 1 + (i % 9);
    const sentences = Array.from({ length: sentenceCount }, (_, j) => {
      const details = "detalhe ".repeat((i + j) % 12);
      return `Resposta ${i}, etapa ${j}, explica o próximo passo com clareza ${details}.`;
    });
    const text = sentences.join(" ");
    const chunks = planSpeechChunks(text, {
      groupMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
      hardMax: TIMESTAMP_SAFE_CHUNK_LIMIT,
    });
    assert.ok(chunks.length > 0, `resposta ${i} sem chunks`);
    assert.ok(
      chunks.every((chunk) => chunk.length <= TIMESTAMP_SAFE_CHUNK_LIMIT),
      `resposta ${i} excedeu ${TIMESTAMP_SAFE_CHUNK_LIMIT} caracteres`,
    );
    assert.equal(cleanSpeechText(chunks.join(" ")), cleanSpeechText(text), `resposta ${i} perdeu texto`);
    passed++;
  }
  assert.equal(passed, 100);
});

let failed = 0;
for (const [i, [name, fn]] of checks.entries()) {
  const n = String(i + 1).padStart(2, "0");
  try {
    await fn();
    console.log(`✓ ${n}. ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${n}. ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} validações de voz passaram.`);
process.exit(failed ? 1 : 0);
