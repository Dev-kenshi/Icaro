export type AutoProviderId =
  | "groq"
  | "gemini"
  | "cerebras"
  | "openrouter"
  | "mistral"
  | "github"
  | "nvidia"
  | "cloudflare"
  | "huggingface"
  | "cohere";

export type ProviderId = AutoProviderId | "openai" | "claude";
export type ProviderMode = "fast" | "deep";
export type ProviderState = "not_configured" | "ready" | "cooldown" | "model_unavailable" | "auth_error" | "degraded";

export type ProviderHealth = {
  id: ProviderId;
  name: string;
  configured: boolean;
  available: boolean;
  state: ProviderState;
  model: string;
  privacyNote: string;
  averageFirstTokenMs: number | null;
  errorRate: number;
  cooldownMs: number;
};

type ProviderDefinition = {
  id: AutoProviderId;
  name: string;
  keyNames: string[];
  baseUrl: (env: NodeJS.ProcessEnv) => string | null;
  modelName: string;
  defaultModel: string;
  privacyNote: string;
  canListModels?: boolean;
};

const definitions: ProviderDefinition[] = [
  {
    id: "groq",
    name: "Groq",
    keyNames: ["GROQ_API_KEY", "grok"],
    baseUrl: () => "https://api.groq.com/openai/v1",
    modelName: "GROQ_MODEL",
    defaultModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
    canListModels: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    keyNames: ["gemine", "GEMINI_API_KEY"],
    baseUrl: () => "https://generativelanguage.googleapis.com/v1beta/openai",
    modelName: "GEMINI_MODEL",
    defaultModel: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
    privacyNote: "Dados podem ser tratados conforme as configurações e os termos da conta Google.",
    canListModels: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    keyNames: ["CEREBRAS_API_KEY"],
    baseUrl: () => "https://api.cerebras.ai/v1",
    modelName: "CEREBRAS_MODEL",
    defaultModel: process.env.CEREBRAS_MODEL || "llama-3.3-70b",
    privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
    canListModels: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    keyNames: ["OPENROUTER_API_KEY"],
    baseUrl: () => "https://openrouter.ai/api/v1",
    modelName: "OPENROUTER_MODEL",
    defaultModel: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
    privacyNote: "O roteamento pode envolver provedores diferentes; não envie dados identificáveis.",
    canListModels: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    keyNames: ["MISTRAL_API_KEY"],
    baseUrl: () => "https://api.mistral.ai/v1",
    modelName: "MISTRAL_MODEL",
    defaultModel: process.env.MISTRAL_MODEL || "mistral-small-latest",
    privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
    canListModels: true,
  },
  {
    id: "github",
    name: "GitHub Models",
    keyNames: ["GITHUB_TOKEN"],
    baseUrl: () => "https://models.github.ai/inference",
    modelName: "GITHUB_MODEL",
    defaultModel: process.env.GITHUB_MODEL || "openai/gpt-4.1-mini",
    privacyNote: "Use apenas conteúdo que possa ser compartilhado com o serviço de inferência.",
    canListModels: true,
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    keyNames: ["NVIDIA_API_KEY"],
    baseUrl: () => "https://integrate.api.nvidia.com/v1",
    modelName: "NVIDIA_MODEL",
    defaultModel: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
    privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
    canListModels: true,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    keyNames: ["CLOUDFLARE_API_TOKEN"],
    baseUrl: (env) => env.CLOUDFLARE_ACCOUNT_ID
      ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1`
      : null,
    modelName: "CLOUDFLARE_MODEL",
    defaultModel: process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.1-8b-instruct",
    privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    keyNames: ["HUGGINGFACE_API_KEY", "HF_TOKEN"],
    baseUrl: () => "https://router.huggingface.co/v1",
    modelName: "HUGGINGFACE_MODEL",
    defaultModel: process.env.HUGGINGFACE_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
    privacyNote: "A retenção pode variar conforme o modelo e o serviço de inferência selecionados.",
    canListModels: true,
  },
  {
    id: "cohere",
    name: "Cohere",
    keyNames: ["COHERE_API_KEY"],
    baseUrl: () => "https://api.cohere.com/compatibility/v1",
    modelName: "COHERE_MODEL",
    defaultModel: process.env.COHERE_MODEL || "command-a-03-2025",
    privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
    canListModels: true,
  },
];

const fastQueue: AutoProviderId[] = [
  "groq", "cerebras", "gemini", "mistral", "openrouter", "github",
  "nvidia", "cloudflare", "huggingface", "cohere",
];
const deepQueue: AutoProviderId[] = [
  "gemini", "openrouter", "groq", "nvidia", "mistral", "cerebras",
  "github", "cloudflare", "huggingface", "cohere",
];

export function classifyProviderMode(question: string): ProviderMode {
  const normalized = question.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return question.length > 360
    || /\b(calcul(?:e|ar|o)|analise detalhada|parecer|legislacao|lei|norma|artigo|comparacao|auditoria)\b/.test(normalized)
    ? "deep"
    : "fast";
}

export function providerQueue(mode: ProviderMode): AutoProviderId[] {
  return [...(mode === "deep" ? deepQueue : fastQueue)];
}

export function isAutoProviderId(value: string): value is AutoProviderId {
  return definitions.some((def) => def.id === value);
}

function configuredKey(def: ProviderDefinition, env: NodeJS.ProcessEnv): string {
  for (const keyName of def.keyNames) {
    const value = env[keyName];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function parseRetryAfter(value: string | null, now: number): number {
  if (!value) return 20_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1_000, Math.min(300_000, seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1_000, Math.min(300_000, date - now)) : 20_000;
}

function textFromDelta(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) =>
      part && typeof part === "object" && "text" in part && typeof part.text === "string"
        ? part.text
        : "",
    ).join("");
  }
  return "";
}

function openAiContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const delta = (choices[0] as { delta?: { content?: unknown }; message?: { content?: unknown } });
  return textFromDelta(delta.delta?.content ?? delta.message?.content);
}

type RouterOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => number;
  firstTokenTimeoutMs?: Partial<Record<ProviderMode, number>>;
};

type ChatInput = {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  maxTokens: number;
  mode?: ProviderMode;
  providerId?: AutoProviderId;
  onProvider?: (provider: AutoProviderId, model: string) => void;
  onToken?: (token: string) => void;
};

export type AutoChatResult = {
  answer: string;
  provider: AutoProviderId;
  model: string;
  mode: ProviderMode;
  attempted: AutoProviderId[];
  partial: boolean;
};

type HealthState = {
  attempts: number;
  errors: number;
  averageFirstTokenMs: number | null;
  cooldownUntil: number;
  modelAvailable: boolean | null;
  authRejected: boolean;
};

export function createProviderRouter(options: RouterOptions = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const health = new Map<AutoProviderId, HealthState>();
  const stateFor = (id: AutoProviderId) => {
    let state = health.get(id);
    if (!state) {
      state = {
        attempts: 0,
        errors: 0,
        averageFirstTokenMs: null,
        cooldownUntil: 0,
        modelAvailable: null,
        authRejected: false,
      };
      health.set(id, state);
    }
    return state;
  };

  function getHealth(): ProviderHealth[] {
    const automated: ProviderHealth[] = definitions.map((def) => {
      const current = stateFor(def.id);
      const configured = Boolean(configuredKey(def, env) && def.baseUrl(env));
      const coolingDown = current.cooldownUntil > now();
      const state: ProviderState = !configured
        ? "not_configured"
        : current.modelAvailable === false
          ? "model_unavailable"
          : current.authRejected
            ? "auth_error"
            : coolingDown
              ? "cooldown"
              : current.errors > 0 && current.errors / Math.max(current.attempts, 1) >= 0.5
                ? "degraded"
                : "ready";
      return {
        id: def.id,
        name: def.name,
        configured,
        available: configured && current.modelAvailable !== false && !current.authRejected && !coolingDown,
        state,
        model: env[def.modelName]?.trim() || def.defaultModel,
        privacyNote: def.privacyNote,
        averageFirstTokenMs: current.averageFirstTokenMs,
        errorRate: current.attempts ? Math.round((current.errors / current.attempts) * 1000) / 1000 : 0,
        cooldownMs: Math.max(0, current.cooldownUntil - now()),
      };
    });

    for (const legacy of [
      {
        id: "openai" as const,
        name: "OpenAI",
        configured: Boolean(env.OPENAI_API_KEY || env.gpt),
        model: env.OPENAI_MODEL || "gpt-5.4-mini",
        privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
      },
      {
        id: "claude" as const,
        name: "Claude",
        configured: Boolean(env.ANTHROPIC_API_KEY),
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        privacyNote: "Verifique as regras de retenção do provedor antes de enviar dados pessoais.",
      },
    ]) {
      automated.push({
        ...legacy,
        available: legacy.configured,
        state: legacy.configured ? "ready" : "not_configured",
        averageFirstTokenMs: null,
        errorRate: 0,
        cooldownMs: 0,
      });
    }
    return automated;
  }

  async function complete(input: ChatInput): Promise<AutoChatResult> {
    const mode = input.mode ?? classifyProviderMode(input.userMessage);
    const firstTokenTimeoutMs = options.firstTokenTimeoutMs?.[mode] ?? (mode === "deep" ? 6_000 : 2_500);
    const attempted: AutoProviderId[] = [];
    let lastError = "No configured provider could complete the request";

    for (const id of input.providerId ? [input.providerId] : providerQueue(mode)) {
      const def = definitions.find((item) => item.id === id)!;
      const key = configuredKey(def, env);
      const baseUrl = def.baseUrl(env);
      const current = stateFor(id);
      if (!key || !baseUrl || current.authRejected || current.modelAvailable === false || current.cooldownUntil > now()) continue;

      const model = env[def.modelName]?.trim() || def.defaultModel;
      attempted.push(id);
      current.attempts += 1;
      input.onProvider?.(id, model);
      const controller = new AbortController();
      const startedAt = now();
      let firstTokenMs: number | null = null;
      let answer = "";

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        };
        if (id === "openrouter") {
          headers["HTTP-Referer"] = "https://icaro.uefs.br";
          headers["X-Title"] = "Icaro";
        }
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            stream: true,
            messages: [
              { role: "system", content: input.systemPrompt },
              ...input.history.map(({ role, content }) => ({ role, content })),
              { role: "user", content: input.userMessage },
            ],
            max_tokens: Math.min(input.maxTokens, mode === "deep" ? 4_096 : 1_536),
            temperature: 0.7,
            stream_options: { include_usage: true },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const retryAfter = parseRetryAfter(response.headers.get("retry-after"), now());
          await response.body?.cancel().catch(() => undefined);
          current.errors += 1;
          if (response.status === 429) current.cooldownUntil = now() + retryAfter;
          if (response.status === 401 || response.status === 403) current.authRejected = true;
          lastError = `${id} returned HTTP ${response.status}`;
          continue;
        }
        if (!response.body) {
          current.errors += 1;
          lastError = `${id} returned no streaming body`;
          continue;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamDone = false;

        while (!streamDone) {
          const waitMs = firstTokenMs === null
            ? firstTokenTimeoutMs - (now() - startedAt)
            : 30_000;
          if (waitMs <= 0) {
            controller.abort();
            throw new Error("first_token_timeout");
          }
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const next = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error(firstTokenMs === null ? "first_token_timeout" : "stream_idle_timeout")), waitMs);
            }),
          ]).finally(() => { if (timeout) clearTimeout(timeout); });
          streamDone = next.done;
          buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !streamDone });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            let payload: unknown;
            try { payload = JSON.parse(raw); } catch { continue; }
            const token = openAiContent(payload);
            if (!token) continue;
            if (firstTokenMs === null) {
              firstTokenMs = Math.max(0, now() - startedAt);
              current.averageFirstTokenMs = current.averageFirstTokenMs === null
                ? firstTokenMs
                : Math.round(current.averageFirstTokenMs * 0.7 + firstTokenMs * 0.3);
            }
            answer += token;
            input.onToken?.(token);
          }
        }

        if (!answer.trim()) {
          current.errors += 1;
          lastError = `${id} returned an empty response`;
          continue;
        }
        current.cooldownUntil = 0;
        current.authRejected = false;
        return { answer: answer.trim(), provider: id, model, mode, attempted, partial: false };
      } catch (error) {
        controller.abort();
        current.errors += 1;
        lastError = error instanceof Error ? error.message : "provider request failed";
        if (answer.trim()) {
          return { answer: answer.trim(), provider: id, model, mode, attempted, partial: true };
        }
      }
    }

    throw new Error(`No available AI provider completed the request (${attempted.length} attempted): ${lastError}`);
  }

  async function refreshModels(): Promise<void> {
    await Promise.all(definitions.filter((def) => def.canListModels).map(async (def) => {
      const key = configuredKey(def, env);
      const baseUrl = def.baseUrl(env);
      if (!key || !baseUrl) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_500);
      try {
        const response = await fetchImpl(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json() as { data?: Array<{ id?: unknown }>; models?: Array<{ name?: unknown; id?: unknown }> };
        const ids = [
          ...(Array.isArray(payload.data) ? payload.data.map((item) => item.id) : []),
          ...(Array.isArray(payload.models) ? payload.models.flatMap((item) => [item.id, item.name]) : []),
        ].filter((value): value is string => typeof value === "string");
        if (!ids.length) return;
        const model = env[def.modelName]?.trim() || def.defaultModel;
        stateFor(def.id).modelAvailable = ids.some((id) => id === model || id.endsWith(`/${model}`) || model.endsWith(`/${id}`));
      } catch {
        // A transient models-list failure leaves the provider in an unknown, usable state.
      } finally {
        clearTimeout(timeout);
      }
    }));
  }

  return { complete, getHealth, refreshModels };
}