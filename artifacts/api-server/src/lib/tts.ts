import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * ÍCARO speech engine.
 *
 * Voice consistency rules:
 * - One voice family per server (ElevenLabs clone → Gemini → OpenAI, first configured wins).
 *   There is NO cross-family fallback, so the voice never changes mid-conversation.
 * - Gemini rotates across several TTS models that all use the same prebuilt voice, each
 *   with its own free-tier quota; a model that returns 429 cools down for the delay Google reports.
 * - Every synthesized phrase is cached in memory and on disk, so repeated phrases cost no quota.
 */

export type SpeechAudio = { audio: Buffer; contentType: string };
export type VoiceFamily = "elevenlabs" | "gemini" | "openai";
export type SpeechResult = SpeechAudio & {
  family: VoiceFamily;
  voice: string;
  model: string;
  cache: "memory" | "disk" | "miss";
};

export class SpeechUnavailableError extends Error {
  constructor(
    message: string,
    public retryAfterMs: number | null = null,
    public code: "provider_auth" | "unavailable" = "unavailable",
  ) {
    super(message);
    this.name = "SpeechUnavailableError";
  }
}

/** Voice settings from the jarvis-voice kit (voz.py). */
export const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.9,
  style: 0,
  use_speaker_boost: true,
} as const;

/** The first model is the one that produced the voice the user approved. */
export const DEFAULT_GEMINI_TTS_MODELS = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
];

export function pcmToWav(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function isWav(buf: Buffer) {
  return buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE";
}

/** Gemini TTS models return either raw 16-bit PCM or a ready WAV file depending on the model. */
export function normalizeGeminiAudio(data: Buffer, mimeType: string): SpeechAudio {
  if (isWav(data)) return { audio: data, contentType: "audio/wav" };
  if (/mpeg|mp3/i.test(mimeType)) return { audio: data, contentType: "audio/mpeg" };
  const rate = /rate=(\d+)/i.exec(mimeType);
  return { audio: pcmToWav(data, rate ? Number(rate[1]) : 24000), contentType: "audio/wav" };
}

export function parseRetryDelayMs(body: string): number | null {
  const info = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  if (info) return Math.ceil(Number(info[1]) * 1000);
  const text = /retry in (\d+(?:\.\d+)?)\s*s/i.exec(body);
  if (text) return Math.ceil(Number(text[1]) * 1000);
  return null;
}

export function parseGeminiErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message !== "string") return null;
    return parsed.error.message
      .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
      .slice(0, 400);
  } catch {
    return null;
  }
}

export class ModelRotation {
  private until = new Map<string, number>();
  constructor(readonly models: string[], private now: () => number = Date.now) {}
  next(): string | null {
    const t = this.now();
    return this.models.find((m) => (this.until.get(m) ?? 0) <= t) ?? null;
  }
  cool(model: string, ms: number) {
    this.until.set(model, Math.max(this.until.get(model) ?? 0, this.now() + ms));
  }
  earliestReadyAt(): number {
    let min = Infinity;
    for (const m of this.models) min = Math.min(min, this.until.get(m) ?? 0);
    return min;
  }
}

export function geminiTtsBody(text: string, voice: string) {
  return {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { voice } },
    },
  };
}

export function elevenLabsBody(text: string, model: string) {
  const body: Record<string, unknown> = {
    text,
    model_id: model,
    voice_settings: { ...ELEVENLABS_VOICE_SETTINGS },
  };
  // ElevenLabs only accepts language enforcement on the v2.5 models (flash/turbo).
  if (/v2_5/.test(model)) body.language_code = "pt";
  return body;
}

export function resolveVoiceFamily(available: Record<VoiceFamily, boolean>): VoiceFamily | null {
  if (available.elevenlabs) return "elevenlabs";
  if (available.gemini) return "gemini";
  if (available.openai) return "openai";
  return null;
}

export function speechCacheKey(family: VoiceFamily, voice: string, text: string) {
  return createHash("sha256").update(`${family}\u0000${voice}\u0000${text}`).digest("hex");
}

export class MemoryAudioCache {
  private map = new Map<string, SpeechAudio>();
  private bytes = 0;
  constructor(private maxEntries = 60, private maxBytes = 24 * 1024 * 1024) {}
  get(key: string) {
    const hit = this.map.get(key);
    if (hit) { this.map.delete(key); this.map.set(key, hit); }
    return hit ?? null;
  }
  set(key: string, value: SpeechAudio) {
    const old = this.map.get(key);
    if (old) { this.bytes -= old.audio.length; this.map.delete(key); }
    this.map.set(key, value);
    this.bytes += value.audio.length;
    while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      this.bytes -= this.map.get(oldest)!.audio.length;
      this.map.delete(oldest);
    }
  }
  get size() { return this.map.size; }
  get totalBytes() { return this.bytes; }
}

const EXT: Record<string, string> = { "audio/wav": "wav", "audio/mpeg": "mp3" };

/** Best-effort persistent cache: failures never break speech. */
export class DiskAudioCache {
  private writes = 0;
  constructor(readonly dir: string, private maxEntries = 500) {}
  async get(key: string): Promise<SpeechAudio | null> {
    for (const [contentType, ext] of Object.entries(EXT)) {
      try {
        const audio = await fs.readFile(path.join(this.dir, `${key}.${ext}`));
        if (audio.length) return { audio, contentType };
      } catch { /* miss */ }
    }
    return null;
  }
  async set(key: string, value: SpeechAudio) {
    const ext = EXT[value.contentType];
    if (!ext) return;
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const file = path.join(this.dir, `${key}.${ext}`);
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, value.audio);
      await fs.rename(tmp, file);
      if (++this.writes % 20 === 0) await this.prune();
    } catch { /* cache is optional */ }
  }
  async prune() {
    const names = (await fs.readdir(this.dir)).filter((n) => /\.(wav|mp3)$/.test(n));
    if (names.length <= this.maxEntries) return;
    const stats = await Promise.all(names.map(async (n) => ({ n, t: (await fs.stat(path.join(this.dir, n))).mtimeMs })));
    stats.sort((a, b) => a.t - b.t);
    for (const { n } of stats.slice(0, stats.length - this.maxEntries)) await fs.rm(path.join(this.dir, n), { force: true });
  }
}

export type SpeechEngineConfig = {
  geminiKey: () => string;
  openAiKey: () => string;
  elevenLabsKey: () => string;
  elevenLabsVoiceId: () => string;
  geminiModels: string[];
  geminiVoice: string;
  openAiModel: string;
  openAiVoice: string;
  elevenLabsModel: string;
  voiceSamplePath: string;
  dataDir: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxCooldownWaitMs?: number;
  deadlineMs?: number;
  log?: { warn: (obj: object, msg: string) => void };
};

type ProviderAudio = SpeechAudio & { model: string };

export function createSpeechEngine(cfg: SpeechEngineConfig) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const now = cfg.now ?? Date.now;
  const sleep = cfg.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWait = cfg.maxCooldownWaitMs ?? 25_000;
  const rotation = new ModelRotation(cfg.geminiModels, now);
  const memory = new MemoryAudioCache();
  const disk = new DiskAudioCache(path.join(cfg.dataDir, "tts-cache"));
  const inflight = new Map<string, Promise<SpeechResult>>();
  let clonePromise: Promise<string> | null = null;

  function family() {
    return resolveVoiceFamily({
      elevenlabs: Boolean(cfg.elevenLabsKey()),
      gemini: Boolean(cfg.geminiKey()),
      openai: Boolean(cfg.openAiKey()),
    });
  }

  function voiceLabel(f: VoiceFamily) {
    if (f === "gemini") return cfg.geminiVoice;
    if (f === "openai") return cfg.openAiVoice;
    return cfg.elevenLabsVoiceId() || "clone-amostra";
  }

  async function elevenLabsVoiceId(): Promise<string> {
    const fromEnv = cfg.elevenLabsVoiceId();
    if (fromEnv) return fromEnv;
    const file = path.join(cfg.dataDir, "elevenlabs-voice.json");
    try {
      const saved = JSON.parse(await fs.readFile(file, "utf8")) as { voiceId?: unknown };
      if (typeof saved.voiceId === "string" && saved.voiceId) return saved.voiceId;
    } catch { /* not cloned yet */ }
    clonePromise ??= (async () => {
      const sample = await fs.readFile(cfg.voiceSamplePath);
      const form = new FormData();
      form.append("name", "ICARO");
      form.append("remove_background_noise", "true");
      form.append("description", "Voz do ÍCARO clonada da amostra do jarvis-voice");
      form.append("labels", JSON.stringify({ language: "pt-BR" }));
      form.append("files", new Blob([new Uint8Array(sample)], { type: "audio/mpeg" }), "amostra_voz.mp3");
      const r = await fetchImpl("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": cfg.elevenLabsKey() },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) throw new SpeechUnavailableError(`elevenlabs clone ${r.status}`);
      const j = (await r.json()) as { voice_id?: string };
      if (!j.voice_id) throw new SpeechUnavailableError("elevenlabs clone returned no voice_id");
      await fs.mkdir(cfg.dataDir, { recursive: true });
      await fs.writeFile(file, JSON.stringify({ voiceId: j.voice_id, createdAt: new Date(now()).toISOString() }));
      return j.voice_id;
    })().catch((e) => { clonePromise = null; throw e; });
    return clonePromise;
  }

  async function elevenLabs(text: string, deadline: number): Promise<ProviderAudio> {
    const voiceId = await elevenLabsVoiceId();
    const r = await fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": cfg.elevenLabsKey(), Accept: "audio/mpeg" },
        body: JSON.stringify(elevenLabsBody(text, cfg.elevenLabsModel)),
        signal: AbortSignal.timeout(Math.max(1000, deadline - now())),
      },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new SpeechUnavailableError(`elevenlabs ${r.status}`, r.status === 429 ? parseRetryDelayMs(body) ?? 30_000 : null);
    }
    const audio = Buffer.from(await r.arrayBuffer());
    if (!audio.length) throw new SpeechUnavailableError("elevenlabs empty audio");
    return { audio, contentType: "audio/mpeg", model: cfg.elevenLabsModel };
  }

  async function gemini(text: string, deadline: number): Promise<ProviderAudio> {
    let lastError = "no model tried";
    for (let attempt = 0; attempt < cfg.geminiModels.length * 3; attempt++) {
      const model = rotation.next();
      if (!model) {
        const wait = rotation.earliestReadyAt() - now();
        if (wait <= maxWait && now() + wait < deadline - 4000) { await sleep(Math.max(wait, 50)); continue; }
        throw new SpeechUnavailableError("all gemini tts models are cooling down", Math.max(wait, 1000));
      }
      const remaining = deadline - now();
      if (remaining < 4000) break;
      let r: Response;
      try {
        r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.geminiKey() },
          body: JSON.stringify(geminiTtsBody(text, cfg.geminiVoice)),
          signal: AbortSignal.timeout(Math.min(remaining, 45_000)),
        });
      } catch {
        rotation.cool(model, 15_000);
        lastError = `${model} network`;
        cfg.log?.warn({ model }, "Gemini TTS request errored");
        continue;
      }
      if (r.ok) {
        const j = (await r.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
        };
        const inline = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
        if (inline?.data) return { ...normalizeGeminiAudio(Buffer.from(inline.data, "base64"), inline.mimeType || ""), model };
        rotation.cool(model, 15_000);
        lastError = `${model} empty audio`;
        continue;
      }
      const body = await r.text().catch(() => "");
      const providerMessage = parseGeminiErrorMessage(body);
      if (r.status === 401 || r.status === 403
        || (r.status === 400 && /api[_ ]key.{0,40}(not valid|invalid)|invalid.{0,20}api[_ ]key/i.test(providerMessage ?? ""))) {
        cfg.log?.warn({ model, status: r.status, providerMessage }, "Gemini TTS credentials rejected");
        throw new SpeechUnavailableError("gemini tts credentials rejected", null, "provider_auth");
      }
      const coolMs = r.status === 429 ? parseRetryDelayMs(body) ?? 60_000
        : r.status === 404 ? 60 * 60_000
          : r.status === 400 ? 30_000
            : 15_000;
      rotation.cool(model, coolMs);
      lastError = `${model} ${r.status}${providerMessage ? `: ${providerMessage}` : ""}`;
      cfg.log?.warn({ model, status: r.status, coolMs, providerMessage }, "Gemini TTS model unavailable, rotating");
    }
    const wait = rotation.earliestReadyAt() - now();
    throw new SpeechUnavailableError(`gemini tts failed: ${lastError}`, wait > 0 ? wait : null);
  }

  async function openAi(text: string, deadline: number): Promise<ProviderAudio> {
    const r = await fetchImpl("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.openAiKey()}` },
      body: JSON.stringify({ model: cfg.openAiModel, voice: cfg.openAiVoice, input: text, response_format: "mp3" }),
      signal: AbortSignal.timeout(Math.max(1000, deadline - now())),
    });
    if (!r.ok) throw new SpeechUnavailableError(`openai-tts ${r.status}`, r.status === 429 ? 60_000 : null);
    const audio = Buffer.from(await r.arrayBuffer());
    if (!audio.length) throw new SpeechUnavailableError("openai-tts empty audio");
    return { audio, contentType: "audio/mpeg", model: cfg.openAiModel };
  }

  async function run(f: VoiceFamily, voice: string, key: string, text: string): Promise<SpeechResult> {
    const fromDisk = await disk.get(key);
    if (fromDisk) {
      memory.set(key, fromDisk);
      return { ...fromDisk, family: f, voice, model: "cache", cache: "disk" };
    }
    const deadline = now() + (cfg.deadlineMs ?? 70_000);
    const out = f === "gemini" ? await gemini(text, deadline)
      : f === "elevenlabs" ? await elevenLabs(text, deadline)
        : await openAi(text, deadline);
    const audio = { audio: out.audio, contentType: out.contentType };
    memory.set(key, audio);
    await disk.set(key, audio);
    return { ...audio, family: f, voice, model: out.model, cache: "miss" };
  }

  async function synthesize(text: string): Promise<SpeechResult> {
    const f = family();
    if (!f) throw new SpeechUnavailableError("no speech provider configured");
    const voice = voiceLabel(f);
    const key = speechCacheKey(f, voice, text);
    const hit = memory.get(key);
    if (hit) return { ...hit, family: f, voice, model: "cache", cache: "memory" };
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = run(f, voice, key, text).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return { synthesize, family, voiceLabel, rotation, memory, disk };
}
