import type { LlmConfig } from "./config.js";
import { GenerationError, UpstreamRateLimitError, UpstreamTimeoutError } from "./errors.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Minimal logger surface (Fastify's request.log fits). Never pass content to it. */
export type GenerationLog = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

export type ChatCompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  signal: AbortSignal;
  /** Epoch ms after which no retry may start (the request's overall deadline). */
  deadlineAt?: number;
  log?: GenerationLog;
};

/** Anything that can turn chat messages into assistant text. Swappable in tests. */
export type ChatClient = (options: ChatCompletionOptions) => Promise<string>;

export type RetryPolicy = {
  /** Retries after the first attempt, for transient failures only. */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Don't start a retry unless at least this much time remains before the deadline. */
  minAttemptMs: number;
};

export const DEFAULT_RETRY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  minAttemptMs: 5_000,
};

export type ChatClientOptions = Pick<LlmConfig, "apiKey" | "model" | "baseUrl"> &
  Partial<Pick<LlmConfig, "provider" | "maxTokens" | "reasoningEffort" | "jsonMode">> & {
    fetchImpl?: typeof fetch;
    retry?: Partial<RetryPolicy>;
    /** Injectable for tests. */
    random?: () => number;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    now?: () => number;
  };

/** A failure worth retrying (network error, HTTP 408/429/5xx), with the error to throw if we give up. */
class Transient extends Error {
  constructor(
    readonly finalError: Error,
    readonly status: number | null,
    readonly retryAfterMs: number | null,
  ) {
    super(finalError.message);
  }
}

/**
 * Client for an OpenAI-compatible chat completions endpoint (Gemini's OpenAI
 * compatibility layer, or Featherless). Retries transient failures up to
 * `maxRetries` times, honouring Retry-After or using exponential backoff with
 * jitter, and never starts a retry that can't finish before the deadline.
 * Auth and input errors are not retried. Error messages never include the
 * API key, prompts, or completions.
 */
export function createChatClient(opts: ChatClientOptions): ChatClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retry = { ...DEFAULT_RETRY, ...opts.retry };
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? abortableSleep;
  const now = opts.now ?? Date.now;

  const attempt = async ({ messages, temperature = 0.8, signal }: ChatCompletionOptions): Promise<string> => {
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw new UpstreamTimeoutError();
      throw new Transient(new GenerationError("Could not reach the generation provider", "provider"), null, null);
    }

    if (res.status === 429 || res.status === 408 || res.status >= 500) {
      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), now());
      await res.body?.cancel().catch(() => {});
      const finalError =
        res.status === 429
          ? new UpstreamRateLimitError(retryAfterMs === null ? null : Math.ceil(retryAfterMs / 1000))
          : res.status === 408 || res.status === 504
            ? new UpstreamTimeoutError()
            : new GenerationError(`Generation provider returned HTTP ${res.status}`, "provider");
      throw new Transient(finalError, res.status, retryAfterMs);
    }
    if (!res.ok) {
      // 400/401/403/404 etc.: configuration or input problems; retrying won't help.
      throw new GenerationError(`Generation provider returned HTTP ${res.status}`, "provider");
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw new UpstreamTimeoutError();
      throw new GenerationError("Generation provider returned a non-JSON response", "provider");
    }
    const content = (json as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new GenerationError("Generation provider returned an empty completion", "output");
    }
    return content;
  };

  return async (options) => {
    for (let retriesUsed = 0; ; retriesUsed++) {
      try {
        return await attempt(options);
      } catch (err) {
        if (!(err instanceof Transient)) throw err;
        if (retriesUsed >= retry.maxRetries) throw err.finalError;

        const backoff = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** retriesUsed);
        // "Equal jitter": half fixed, half random, so retries spread out but never fire instantly.
        const delayMs = err.retryAfterMs ?? Math.round(backoff / 2 + random() * (backoff / 2));
        if (options.deadlineAt !== undefined && now() + delayMs + retry.minAttemptMs > options.deadlineAt) {
          throw err.finalError;
        }
        options.log?.warn(
          { provider: opts.provider, status: err.status, retry: retriesUsed + 1, delayMs },
          "transient provider error; retrying",
        );
        await sleep(delayMs, options.signal);
      }
    }
  };
}

/** Retry-After as delta-seconds or an HTTP date; null when absent or invalid. */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
  // HTTP dates always contain letters (day/month names); this rejects e.g. "-3", which Date.parse accepts.
  if (!/[A-Za-z]/.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - nowMs);
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UpstreamTimeoutError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UpstreamTimeoutError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}
