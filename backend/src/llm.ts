import type { LlmConfig } from "./config.js";
import { GenerationError, UpstreamRateLimitError, UpstreamTimeoutError } from "./errors.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatCompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  signal: AbortSignal;
};

/** Anything that can turn chat messages into assistant text. Swappable in tests. */
export type ChatClient = (options: ChatCompletionOptions) => Promise<string>;

export type ChatClientOptions = Pick<LlmConfig, "apiKey" | "model" | "baseUrl"> &
  Partial<Pick<LlmConfig, "maxTokens" | "reasoningEffort" | "jsonMode">> & {
    fetchImpl?: typeof fetch;
  };

/**
 * Minimal client for an OpenAI-compatible chat completions endpoint
 * (Gemini's OpenAI compatibility layer or Featherless). Error messages never
 * include the API key, prompts, or completions.
 */
export function createChatClient(opts: ChatClientOptions): ChatClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async ({ messages, temperature = 0.8, signal }) => {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages,
      temperature,
      max_tokens: opts.maxTokens ?? 4096,
    };
    if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
    if (opts.jsonMode) body.response_format = { type: "json_object" };

    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw new UpstreamTimeoutError();
      throw new GenerationError("Could not reach the generation provider");
    }

    if (res.status === 429) {
      const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      throw new UpstreamRateLimitError(Number.isFinite(retryAfter) ? retryAfter : null);
    }
    if (res.status === 408 || res.status === 504) throw new UpstreamTimeoutError();
    if (!res.ok) {
      throw new GenerationError(`Generation provider returned HTTP ${res.status}`);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw new UpstreamTimeoutError();
      throw new GenerationError("Generation provider returned a non-JSON response");
    }
    const content = (json as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new GenerationError("Generation provider returned an empty completion");
    }
    return content;
  };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}
