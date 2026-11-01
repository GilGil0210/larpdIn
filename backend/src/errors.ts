import type { ErrorBody, ErrorCode } from "./contract.js";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

/**
 * Generation failed (contract status 502). `source` is "provider" when the LLM
 * service itself failed (HTTP error, unreachable) and "output" when it answered
 * but the content was unusable.
 */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly source: "provider" | "output" = "output",
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/** The generation deadline expired or the upstream request timed out (contract status 504). */
export class UpstreamTimeoutError extends Error {
  constructor(message = "Persona generation timed out") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

/** The LLM provider itself rate limited us. */
export class UpstreamRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super("Generation provider is rate limited");
    this.name = "UpstreamRateLimitError";
  }
}
