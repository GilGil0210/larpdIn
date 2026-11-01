import { createHash, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { isConfigured, type Config } from "./config.js";
import { GenerateRequestSchema } from "./contract.js";
import { ApiError, GenerationError, UpstreamRateLimitError, UpstreamTimeoutError } from "./errors.js";
import { createFallbackGenerator } from "./fallback.js";
import { createChatClient, type ChatClientOptions } from "./llm.js";
import { createPersonaGenerator, type GeneratePersonas } from "./personas.js";
import { SlidingWindowLimiter } from "./rateLimit.js";
import { withSignal } from "./signal.js";

export type AppOptions = {
  config: Config;
  /** Override persona generation (tests). Defaults to the configured providers with fallback. */
  generate?: GeneratePersonas;
  /** Clock override for rate-limit and cooldown tests. */
  now?: () => number;
  /** fetch override for provider HTTP calls (tests). */
  fetchImpl?: typeof fetch;
  /** Extra chat client options, e.g. retry policy or an instant sleep (tests). */
  chatOptions?: Partial<Omit<ChatClientOptions, "apiKey" | "model" | "baseUrl">>;
  /** false disables logging; a stream captures it (tests). Defaults to stdout. */
  logger?: false | { level?: string; stream?: NodeJS.WritableStream };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function tokenMatches(provided: string, expected: string): boolean {
  // Hash first so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isAllowedOrigin(origin: string, extra: string[]): boolean {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin) || extra.includes(origin);
}

export function buildApp(options: AppOptions): FastifyInstance {
  const { config } = options;
  const now = options.now ?? Date.now;

  const app = Fastify({
    bodyLimit: config.bodyLimitBytes,
    trustProxy: config.trustProxy,
    // Default request serializers log only method/url/host/ip — never headers or bodies.
    logger:
      options.logger === false
        ? false
        : {
            level: options.logger?.level ?? process.env.LOG_LEVEL ?? "info",
            redact: { paths: ["req.headers.authorization", "headers.authorization"], censor: "[redacted]" },
            ...(options.logger?.stream ? { stream: options.logger.stream } : {}),
          },
  });

  const generate =
    options.generate ??
    createFallbackGenerator(
      config.providers.map((provider) => ({
        name: provider.provider,
        timeoutMs: provider.timeoutMs,
        generate: createPersonaGenerator(
          createChatClient({ ...provider, fetchImpl: options.fetchImpl, ...options.chatOptions }),
        ),
      })),
      { cooldownMs: config.providerCooldownMs, now },
    );

  const perIp = new SlidingWindowLimiter(config.rateLimitPerIpPerMinute, MINUTE, now);
  const global = new SlidingWindowLimiter(config.rateLimitGlobalPerHour, HOUR, now);
  const sweeper = setInterval(() => {
    perIp.sweep();
    global.sweep();
  }, MINUTE);
  sweeper.unref();
  app.addHook("onClose", async () => clearInterval(sweeper));

  app.register(cors, {
    origin: (origin, cb) => {
      // Requests without an Origin (curl, server-to-server) don't need CORS headers.
      if (!origin) return cb(null, false);
      cb(null, isAllowedOrigin(origin, config.corsOrigins));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Retry-After"],
    maxAge: 600,
    strictPreflight: false,
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).headers(error.headers).send(error.toBody());
    }
    if (error instanceof UpstreamTimeoutError) {
      request.log.warn({ errType: error.name }, "generation timed out");
      return reply.code(504).send(new ApiError(504, "UPSTREAM_TIMEOUT", error.message).toBody());
    }
    if (error instanceof UpstreamRateLimitError) {
      request.log.warn({ errType: error.name }, "upstream rate limited");
      const retry = String(error.retryAfterSeconds ?? 30);
      return reply
        .code(429)
        .header("Retry-After", retry)
        .send(new ApiError(429, "RATE_LIMITED", "Generation provider is busy; try again shortly").toBody());
    }
    if (error instanceof GenerationError) {
      request.log.warn({ errType: error.name, reason: error.message }, "generation failed");
      return reply.code(502).send(new ApiError(502, "GENERATION_FAILED", error.message).toBody());
    }

    const fastifyErr = error as { statusCode?: number; code?: string; name?: string };
    const status = fastifyErr.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      // Body parse / size / content-type problems. JSON.parse messages can echo request
      // content, so neither log nor return them verbatim.
      request.log.info({ errCode: fastifyErr.code, statusCode: status }, "rejected invalid request");
      const message =
        status === 413
          ? `Request body exceeds ${config.bodyLimitBytes} bytes`
          : status === 415
            ? "Content-Type must be application/json"
            : "Request body is not valid JSON";
      return reply.code(400).send(new ApiError(400, "INVALID_INPUT", message).toBody());
    }
    request.log.error({ errType: fastifyErr.name, errCode: fastifyErr.code }, "unexpected error");
    return reply.code(500).send(new ApiError(500, "INTERNAL_ERROR", "Unexpected server error").toBody());
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(new ApiError(404, "NOT_FOUND", "Route not found").toBody());
  });

  app.get("/health", async (_request, reply) => {
    if (isConfigured(config)) return reply.code(200).send({ status: "ok" });
    return reply.code(503).send({ status: "unavailable" });
  });

  // Runs before the body is parsed, so unauthorized or throttled callers get
  // 401/429 without touching validation or the LLM provider.
  const guard = async (request: FastifyRequest) => {
    if (!isConfigured(config)) {
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Service is not configured");
    }
    const ipWait = perIp.take(request.ip);
    if (ipWait > 0) {
      throw new ApiError(429, "RATE_LIMITED", "Too many requests from this address; try again later", {
        "Retry-After": String(Math.ceil(ipWait / 1000)),
      });
    }
    const token = bearerToken(request);
    if (config.requireDemoToken && (!token || !tokenMatches(token, config.demoAccessToken))) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid access token", { "WWW-Authenticate": "Bearer" });
    }
  };

  app.post("/api/personas/generate", { onRequest: guard }, async (request, reply) => {
    const parsed = GenerateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      throw new ApiError(400, "INVALID_INPUT", `${where}${first?.message ?? "Invalid request"}`);
    }

    const globalWait = global.take("global");
    if (globalWait > 0) {
      throw new ApiError(429, "RATE_LIMITED", "Demo generation limit reached; try again later", {
        "Retry-After": String(Math.ceil(globalWait / 1000)),
      });
    }

    const controller = new AbortController();
    const deadlineAt = Date.now() + config.generationDeadlineMs;
    const timer = setTimeout(() => controller.abort(new UpstreamTimeoutError()), config.generationDeadlineMs);
    const onClose = () => {
      if (!reply.raw.writableFinished) controller.abort();
    };
    reply.raw.on("close", onClose);
    try {
      const result = await withSignal(
        generate(parsed.data, controller.signal, {
          log: request.log,
          deadlineAt,
        }),
        controller.signal,
      );
      return reply.code(200).send(result);
    } finally {
      clearTimeout(timer);
      reply.raw.off("close", onClose);
    }
  });

  return app;
}
