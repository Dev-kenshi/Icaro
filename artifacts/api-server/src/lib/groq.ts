export type GroqEnvironment = Record<string, string | undefined>;

export function getGroqApiKey(env: GroqEnvironment = process.env): string {
  return env.GROQ_API_KEY?.trim() || env.grok?.trim() || "";
}

export type GroqSettings = {
  GROQ_MODEL?: string;
};

export function getGroqModel(settings: GroqSettings = process.env): string {
  return settings.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
}

export type GroqChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GroqTextInput = {
  systemPrompt: string;
  history: GroqChatMessage[];
  userMessage: string;
  maxTokens?: number;
};

export type GroqTextResult = {
  answer: string;
  model: string;
};

export type GroqTextServiceOptions = {
  getApiKey: () => string;
  getModel?: () => string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  invalidResponseRetries?: number;
  invalidResponseRetryDelayMs?: number;
};

export type GroqProviderErrorCode =
  | "invalid_api_key"
  | "model_not_found"
  | "model_decommissioned"
  | "insufficient_quota"
  | "organization_restricted";

const GROQ_PROVIDER_ERROR_CODES = new Set<GroqProviderErrorCode>([
  "invalid_api_key",
  "model_not_found",
  "model_decommissioned",
  "insufficient_quota",
  "organization_restricted",
]);

async function getGroqProviderErrorCode(
  response: Response,
): Promise<GroqProviderErrorCode | undefined> {
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && GROQ_PROVIDER_ERROR_CODES.has(code as GroqProviderErrorCode)
    ? code as GroqProviderErrorCode
    : undefined;
}

export class GroqServiceError extends Error {
  constructor(
    message: string,
    readonly kind: "missing_key" | "rate_limit" | "request_failed" | "invalid_response",
    readonly upstreamStatus?: number,
    readonly errorCode?: GroqProviderErrorCode,
    readonly invalidResponseReason?: GroqInvalidResponseReason,
  ) {
    super(message);
    this.name = "GroqServiceError";
  }
}

export type GroqInvalidResponseReason =
  | "invalid_json"
  | "invalid_payload"
  | "missing_choices"
  | "missing_text"
  | "empty_content"
  | "unsupported_content";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map(collectText)
      .filter((text): text is string => text !== undefined)
      .join("");
  }
  if (isRecord(value) && typeof value.text === "string") return value.text;
  return undefined;
}

function extractText(value: unknown): string | undefined {
  const text = collectText(value)?.trim();
  return text || undefined;
}

function parseGroqResponse(
  result: unknown,
  configuredModel: string,
): GroqTextResult {
  if (!isRecord(result)) {
    throw new GroqServiceError("Groq returned an invalid response.", "invalid_response", undefined, undefined, "invalid_payload");
  }
  const choices = result.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new GroqServiceError("Groq returned no choices.", "invalid_response", undefined, undefined, "missing_choices");
  }

  let lastReason: GroqInvalidResponseReason = "missing_text";
  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) continue;
    const message = choice.message;
    const answer = extractText(message.content) || extractText(message.refusal);
    if (answer) {
      return {
        answer,
        model: typeof result.model === "string" && result.model.trim()
          ? result.model.trim()
          : configuredModel,
      };
    }
    if ("content" in message) {
      lastReason = typeof message.content === "string" || Array.isArray(message.content)
        ? "empty_content"
        : "unsupported_content";
    }
  }

  throw new GroqServiceError(
    "Groq returned no usable text.",
    "invalid_response",
    undefined,
    undefined,
    lastReason,
  );
}

export function createGroqTextService(options: GroqTextServiceOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const invalidResponseRetries = Math.max(0, Math.floor(options.invalidResponseRetries ?? 1));
  const invalidResponseRetryDelayMs = Math.max(0, options.invalidResponseRetryDelayMs ?? 100);

  return {
    async generateAnswer(input: GroqTextInput): Promise<GroqTextResult> {
      const apiKey = options.getApiKey();
      if (!apiKey) {
        throw new GroqServiceError("Groq API key is not configured.", "missing_key");
      }

      const model = options.getModel?.() ?? getGroqModel();
      const deadline = Date.now() + timeoutMs;
      for (let attempt = 0; ; attempt++) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          throw new GroqServiceError("Groq request timed out.", "request_failed");
        }

        let response: Response;
        try {
          response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: input.systemPrompt },
                ...input.history,
                { role: "user", content: input.userMessage },
              ],
              max_tokens: input.maxTokens ?? 1536,
            }),
            signal: AbortSignal.timeout(remainingMs),
          });
        } catch {
          throw new GroqServiceError("Groq request failed.", "request_failed");
        }

        if (!response.ok) {
          const errorCode = await getGroqProviderErrorCode(response);
          if (response.status === 429) {
            throw new GroqServiceError(
              "Groq rate limit reached.",
              "rate_limit",
              response.status,
              errorCode,
            );
          }
          throw new GroqServiceError(
            "Groq request failed.",
            "request_failed",
            response.status,
            errorCode,
          );
        }

        let result: unknown;
        try {
          result = await response.json();
        } catch {
          const error = new GroqServiceError(
            "Groq returned invalid JSON.",
            "invalid_response",
            undefined,
            undefined,
            "invalid_json",
          );
          if (attempt >= invalidResponseRetries) throw error;
          const delay = Math.min(invalidResponseRetryDelayMs, Math.max(0, deadline - Date.now()));
          if (Date.now() + delay >= deadline) throw error;
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        try {
          return parseGroqResponse(result, model);
        } catch (error) {
          if (!(error instanceof GroqServiceError) || error.kind !== "invalid_response") throw error;
          if (attempt >= invalidResponseRetries) throw error;
          const delay = Math.min(invalidResponseRetryDelayMs, Math.max(0, deadline - Date.now()));
          if (Date.now() + delay >= deadline) throw error;
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    },
  };
}