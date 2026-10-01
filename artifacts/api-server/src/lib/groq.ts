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
  ) {
    super(message);
    this.name = "GroqServiceError";
  }
}

export function createGroqTextService(options: GroqTextServiceOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    async generateAnswer(input: GroqTextInput): Promise<GroqTextResult> {
      const apiKey = options.getApiKey();
      if (!apiKey) {
        throw new GroqServiceError("Groq API key is not configured.", "missing_key");
      }

      const model = options.getModel?.() ?? getGroqModel();
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
          signal: AbortSignal.timeout(timeoutMs),
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
        throw new GroqServiceError("Groq returned invalid JSON.", "invalid_response");
      }

      if (!result || typeof result !== "object") {
        throw new GroqServiceError("Groq returned an invalid response.", "invalid_response");
      }
      const payload = result as {
        model?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new GroqServiceError("Groq returned no text.", "invalid_response");
      }

      return {
        answer: content.trim(),
        model: typeof payload.model === "string" && payload.model.trim()
          ? payload.model
          : model,
      };
    },
  };
}