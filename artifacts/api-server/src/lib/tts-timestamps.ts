import { createHash } from "node:crypto";

export const TTS_TIMESTAMP_MAX_TEXT = 600;

const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const CACHE_MAX_ENTRIES = 80;
const CACHE_MAX_BYTES = 16 * 1024 * 1024;
const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.42,
  similarity_boost: 0.88,
  style: 0.18,
  use_speaker_boost: true,
} as const;

export function cleanTtsText(value: unknown): string {
  return (typeof value === "string" ? value : "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyTtsPronunciation(text: string): string {
  return text.replace(/(^|[^\p{L}])UEFS(?=[^\p{L}]|$)/gu, "$1Uéfis");
}

export class TimestampedSpeechError extends Error {
  constructor(
    message: string,
    readonly kind: "provider" | "invalid-response" | "timeout" = "provider",
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "TimestampedSpeechError";
  }
}

type TimestampedAudio = {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  normalized_alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  } | null;
};

function isAlignment(value: unknown): value is NonNullable<TimestampedAudio["normalized_alignment"]> {
  if (!value || typeof value !== "object") return false;
  const alignment = value as Record<string, unknown>;
  return Array.isArray(alignment.characters)
    && alignment.characters.every((character) => typeof character === "string")
    && Array.isArray(alignment.character_start_times_seconds)
    && alignment.character_start_times_seconds.every((time) => typeof time === "number" && Number.isFinite(time))
    && Array.isArray(alignment.character_end_times_seconds)
    && alignment.character_end_times_seconds.every((time) => typeof time === "number" && Number.isFinite(time));
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new TimestampedSpeechError("ElevenLabs response exceeded the allowed size", "invalid-response");
  }
  if (!response.body) throw new TimestampedSpeechError("ElevenLabs returned an empty response", "invalid-response");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new TimestampedSpeechError("ElevenLabs request was aborted", "timeout");
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TimestampedSpeechError("ElevenLabs response exceeded the allowed size", "invalid-response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new TimestampedSpeechError("ElevenLabs returned invalid JSON", "invalid-response");
  }
}

export function createTtsTimestampsService(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, { value: TimestampedAudio; bytes: number }>();
  let cacheBytes = 0;

  function getCached(key: string) {
    const entry = cache.get(key);
    if (!entry) return null;
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }

  function setCached(key: string, value: TimestampedAudio) {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > CACHE_MAX_BYTES) return;
    const old = cache.get(key);
    if (old) {
      cacheBytes -= old.bytes;
      cache.delete(key);
    }
    cache.set(key, { value, bytes });
    cacheBytes += bytes;
    while (cache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = cache.get(oldestKey);
      if (oldest) cacheBytes -= oldest.bytes;
      cache.delete(oldestKey);
    }
  }

  async function synthesize(input: {
    text: string;
    previousText: string;
    apiKey: string;
    voiceId: string;
    modelId: string;
    signal: AbortSignal;
  }): Promise<TimestampedAudio> {
    const text = applyTtsPronunciation(cleanTtsText(input.text));
    if (!text) throw new TimestampedSpeechError("Text is empty", "invalid-response");
    if (text.length > TTS_TIMESTAMP_MAX_TEXT) {
      throw new TimestampedSpeechError("Text is too long", "invalid-response");
    }
    const previousText = applyTtsPronunciation(cleanTtsText(input.previousText)).slice(-300);
    const cacheKey = createHash("sha256")
      .update(`${input.modelId}\u0000${input.voiceId}\u0000${text}`)
      .digest("hex");
    if (!previousText) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    const payload: Record<string, unknown> = {
      text,
      model_id: input.modelId,
      voice_settings: ELEVENLABS_VOICE_SETTINGS,
    };
    if (previousText) payload.previous_text = previousText;
    if (/v2_5/.test(input.modelId)) payload.language_code = "pt";

    let response: Response;
    try {
      response = await fetchImpl(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": input.apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: input.signal,
        },
      );
    } catch (error) {
      if (input.signal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
        throw new TimestampedSpeechError("ElevenLabs request timed out", "timeout");
      }
      throw new TimestampedSpeechError("ElevenLabs request failed", "provider");
    }

    if (!response.ok) {
      throw new TimestampedSpeechError("ElevenLabs request failed", "provider", response.status);
    }

    const raw = await readBoundedJson(response, input.signal);
    if (!raw || typeof raw !== "object") {
      throw new TimestampedSpeechError("ElevenLabs returned invalid timestamp data", "invalid-response");
    }
    const data = raw as Record<string, unknown>;
    if (typeof data.audio_base64 !== "string"
      || !data.audio_base64
      || !isAlignment(data.alignment)
      || (data.normalized_alignment != null && !isAlignment(data.normalized_alignment))) {
      throw new TimestampedSpeechError("ElevenLabs returned invalid timestamp data", "invalid-response");
    }

    const result: TimestampedAudio = {
      audio_base64: data.audio_base64,
      alignment: data.alignment,
      normalized_alignment: data.normalized_alignment == null ? null : data.normalized_alignment,
    };
    if (!previousText) setCached(cacheKey, result);
    return result;
  }

  return { synthesize };
}