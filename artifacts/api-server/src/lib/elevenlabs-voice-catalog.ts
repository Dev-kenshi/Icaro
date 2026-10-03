export type ElevenLabsVoiceOption = {
  voiceId: string;
  name: string;
  category: string | null;
  description: string | null;
  labels: Record<string, string>;
};

export class ElevenLabsVoiceCatalogError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ElevenLabsVoiceCatalogError";
  }
}

type VoicePage = {
  voices?: unknown[];
  has_more?: boolean;
  next_page_token?: string | null;
};

const LIST_CACHE_TTL_MS = 2 * 60_000;
const VALIDATION_CACHE_TTL_MS = 5 * 60_000;
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
const SAFE_LABELS = new Set(["gender", "age", "accent", "language", "use_case"]);
const listCache = new Map<string, { expiresAt: number; voices: ElevenLabsVoiceOption[] }>();
const listInflight = new Map<string, Promise<ElevenLabsVoiceOption[]>>();
const voiceValidationCache = new Map<string, { expiresAt: number; available: boolean }>();

function normalizeVoice(value: unknown): ElevenLabsVoiceOption | null {
  if (!value || typeof value !== "object") return null;
  const voice = value as Record<string, unknown>;
  if (typeof voice.voice_id !== "string" || typeof voice.name !== "string") return null;

  const labels: Record<string, string> = {};
  if (voice.labels && typeof voice.labels === "object" && !Array.isArray(voice.labels)) {
    for (const [key, raw] of Object.entries(voice.labels as Record<string, unknown>)) {
      if (SAFE_LABELS.has(key.toLowerCase()) && typeof raw === "string") {
        labels[key] = raw.trim().slice(0, 100);
      }
    }
  }

  return {
    voiceId: voice.voice_id,
    name: voice.name.trim().slice(0, 120),
    category: typeof voice.category === "string" ? voice.category.slice(0, 60) : null,
    description: typeof voice.description === "string" ? voice.description.trim().slice(0, 300) : null,
    labels,
  };
}

async function fetchVoicePage(url: URL, apiKey: string, fetchImpl: typeof fetch): Promise<VoicePage> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "xi-api-key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ElevenLabsVoiceCatalogError("ElevenLabs voice catalog request failed");
  }

  if (!response.ok) {
    throw new ElevenLabsVoiceCatalogError("ElevenLabs voice catalog request failed", response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ElevenLabsVoiceCatalogError("ElevenLabs returned invalid voice catalog data");
  }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as VoicePage).voices)) {
    throw new ElevenLabsVoiceCatalogError("ElevenLabs returned invalid voice catalog data");
  }
  return payload as VoicePage;
}

export async function listAccountElevenLabsVoices(
  apiKey: string,
  search = "",
  fetchImpl: typeof fetch = fetch,
): Promise<ElevenLabsVoiceOption[]> {
  const key = search.trim().toLocaleLowerCase("pt-BR");
  const cached = listCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.voices;
  const inflight = listInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    const voices = new Map<string, ElevenLabsVoiceOption>();
    let nextPageToken: string | null = null;
    let hasMore = true;

    for (let pageNumber = 0; hasMore && pageNumber < MAX_PAGES; pageNumber += 1) {
      const url = new URL("https://api.elevenlabs.io/v2/voices");
      url.searchParams.set("page_size", String(PAGE_SIZE));
      url.searchParams.set("include_total_count", "false");
      url.searchParams.set("gender", "male");
      if (key) {
        url.searchParams.set("search", search.trim());
      } else {
        url.searchParams.append("language", "pt");
      }
      if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

      const result = await fetchVoicePage(url, apiKey, fetchImpl);
      for (const rawVoice of result.voices ?? []) {
        const voice = normalizeVoice(rawVoice);
        if (voice) voices.set(voice.voiceId, voice);
      }
      hasMore = result.has_more === true;
      nextPageToken = typeof result.next_page_token === "string" ? result.next_page_token : null;
      if (hasMore && !nextPageToken) {
        throw new ElevenLabsVoiceCatalogError("ElevenLabs voice catalog pagination is incomplete");
      }
    }

    if (hasMore) {
      throw new ElevenLabsVoiceCatalogError("ElevenLabs voice catalog exceeds the supported page limit");
    }

    const sorted = [...voices.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    listCache.set(key, { expiresAt: Date.now() + LIST_CACHE_TTL_MS, voices: sorted });
    if (listCache.size > 50) {
      const oldestKey = listCache.keys().next().value;
      if (oldestKey !== undefined) listCache.delete(oldestKey);
    }
    return sorted;
  })();

  listInflight.set(key, request);
  try {
    return await request;
  } finally {
    listInflight.delete(key);
  }
}

export async function isAccountElevenLabsVoice(
  apiKey: string,
  voiceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const cached = voiceValidationCache.get(voiceId);
  if (cached && cached.expiresAt > Date.now()) return cached.available;

  const url = new URL("https://api.elevenlabs.io/v2/voices");
  url.searchParams.set("page_size", "100");
  url.searchParams.set("include_total_count", "false");
  url.searchParams.append("voice_ids", voiceId);
  const result = await fetchVoicePage(url, apiKey, fetchImpl);
  const available = (result.voices ?? []).some((voice) => {
    if (!voice || typeof voice !== "object") return false;
    return (voice as Record<string, unknown>).voice_id === voiceId;
  });
  voiceValidationCache.set(voiceId, {
    expiresAt: Date.now() + VALIDATION_CACHE_TTL_MS,
    available,
  });
  return available;
}