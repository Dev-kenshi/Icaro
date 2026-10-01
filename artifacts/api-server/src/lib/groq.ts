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

/** Modelos de raciocínio (gpt-oss, qwen3) pensam antes de responder; em voz ao vivo, pensar pouco. */
export function groqReasoningParams(model: string): Record<string, unknown> {
  if (/gpt-oss/i.test(model)) return { reasoning_effort: "low", include_reasoning: false };
  if (/qwen3/i.test(model)) return { reasoning_effort: "none" };
  return {};
}

export function createGroqTextService(options: GroqTextServiceOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;

  async function request(input: GroqTextInput, stream: boolean, signal?: AbortSignal): Promise<{ response: Response; model: string }> {
    const apiKey = options.getApiKey();
    if (!apiKey) {
      throw new GroqServiceError("Groq API key is not configured.", "missing_key");
    }
    const model = options.getModel?.() ?? getGroqModel();
    const base = {
      model,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.history,
        { role: "user", content: input.userMessage },
      ],
      max_tokens: input.maxTokens ?? 1536,
      ...(stream ? { stream: true } : {}),
    };
    const timeout = AbortSignal.timeout(timeoutMs);
    const send = (body: Record<string, unknown>) => fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const extra = groqReasoningParams(model);
    let response: Response;
    try {
      response = await send({ ...base, ...extra });
      // Se a conta/modelo não aceitar os parâmetros de raciocínio, repete sem eles.
      if (response.status === 400 && Object.keys(extra).length) {
        await response.body?.cancel().catch(() => undefined);
        response = await send(base);
      }
    } catch {
      throw new GroqServiceError("Groq request failed.", "request_failed");
    }
    if (!response.ok) {
      const errorCode = await getGroqProviderErrorCode(response);
      throw new GroqServiceError(
        response.status === 429 ? "Groq rate limit reached." : "Groq request failed.",
        response.status === 429 ? "rate_limit" : "request_failed",
        response.status,
        errorCode,
      );
    }
    return { response, model };
  }

  return {
    /** Streaming: devolve o texto aos pedaços, assim que a Groq gera (SSE do formato OpenAI). */
    async *streamAnswer(input: GroqTextInput, signal?: AbortSignal): AsyncGenerator<string, { model: string }> {
      const { response, model } = await request(input, true, signal);
      if (!response.body) throw new GroqServiceError("Groq returned no stream.", "invalid_response");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalModel = model;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") return { model: finalModel };
            let chunk: { model?: unknown; choices?: Array<{ delta?: { content?: unknown } }> };
            try { chunk = JSON.parse(data); } catch { continue; }
            if (typeof chunk.model === "string" && chunk.model) finalModel = chunk.model;
            const text = chunk.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text) yield text;
          }
        }
      } catch (error) {
        if (signal?.aborted) return { model: finalModel };
        throw error instanceof GroqServiceError ? error : new GroqServiceError("Groq stream failed.", "request_failed");
      } finally {
        reader.releaseLock();
      }
      return { model: finalModel };
    },

    async generateAnswer(input: GroqTextInput): Promise<GroqTextResult> {
      const { response, model } = await request(input, false);
      return parseAnswer(response, model);
    },
  };

  async function parseAnswer(response: Response, model: string): Promise<GroqTextResult> {
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
  }
}