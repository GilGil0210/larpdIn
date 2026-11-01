export type LlmProvider = "featherless" | "gemini";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL, without a trailing slash. */
  baseUrl: string;
  maxTokens: number;
  /** OpenAI-style reasoning_effort; empty string omits the parameter. */
  reasoningEffort: string;
  /** Send response_format: {type: "json_object"} (supported by Gemini, not assumed for Featherless). */
  jsonMode: boolean;
  /**
   * Max time this provider may spend on one request (first attempt + repair)
   * before falling back. null = whatever remains of the overall deadline.
   */
  timeoutMs: number | null;
};

export const PROVIDER_DEFAULTS: Record<LlmProvider, Omit<LlmConfig, "provider" | "apiKey">> = {
  gemini: {
    // Verified for this deployment; override with GEMINI_MODEL.
    model: "gemini-3.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    // Gemini thinking tokens count against max_tokens, so leave headroom.
    maxTokens: 8192,
    reasoningEffort: "low",
    jsonMode: true,
    timeoutMs: null,
  },
  // Optional, disabled by default; enable with LLM_PROVIDERS=gemini,featherless.
  featherless: {
    model: "Qwen/Qwen2.5-7B-Instruct",
    baseUrl: "https://api.featherless.ai/v1",
    maxTokens: 4096,
    reasoningEffort: "",
    jsonMode: false,
    // Budget before falling back when it's listed ahead of another provider.
    timeoutMs: 60_000,
  },
};

/** Gemini is the default and only enabled provider. */
export const DEFAULT_PROVIDER_ORDER: LlmProvider[] = ["gemini"];

export type Config = {
  port: number;
  host: string;
  /** Configured providers (API key present), in the order they are tried. */
  providers: LlmConfig[];
  /** With several providers, skip one for this long after it fails (error, timeout, rate limit). */
  providerCooldownMs: number;
  demoAccessToken: string;
  /** Extra exact origins allowed for CORS, in addition to chrome-extension://*. */
  corsOrigins: string[];
  /** Total budget for a generate request, including retries, repair and any fallback. */
  generationDeadlineMs: number;
  bodyLimitBytes: number;
  rateLimitPerIpPerMinute: number;
  rateLimitGlobalPerHour: number;
  trustProxy: boolean;
};

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const str = (value: string | undefined) => value?.trim() ?? "";

const ENV_PREFIX: Record<LlmProvider, string> = { featherless: "FEATHERLESS", gemini: "GEMINI" };

export function loadProviderConfig(provider: LlmProvider, env: NodeJS.ProcessEnv): LlmConfig {
  const defaults = PROVIDER_DEFAULTS[provider];
  const prefix = ENV_PREFIX[provider];
  const reasoning = env[`${prefix}_REASONING_EFFORT`];
  const timeout = str(env[`${prefix}_TIMEOUT_MS`]);
  return {
    provider,
    apiKey: str(env[`${prefix}_API_KEY`]),
    model: str(env[`${prefix}_MODEL`]) || defaults.model,
    baseUrl: (str(env[`${prefix}_BASE_URL`]) || defaults.baseUrl).replace(/\/+$/, ""),
    maxTokens: int(env[`${prefix}_MAX_TOKENS`], defaults.maxTokens),
    reasoningEffort: reasoning === undefined ? defaults.reasoningEffort : reasoning.trim(),
    jsonMode: defaults.jsonMode,
    timeoutMs: timeout ? int(timeout, defaults.timeoutMs ?? 0) || null : defaults.timeoutMs,
  };
}

/** LLM_PROVIDERS (e.g. "gemini" or "gemini,featherless") enables providers in order; unknown names are ignored. */
export function providerOrder(env: NodeJS.ProcessEnv): LlmProvider[] {
  const raw = str(env.LLM_PROVIDERS);
  if (!raw) return DEFAULT_PROVIDER_ORDER;
  const names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is LlmProvider => s === "featherless" || s === "gemini");
  return [...new Set(names)];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: int(env.PORT, 3000),
    host: str(env.HOST) || "0.0.0.0",
    providers: providerOrder(env)
      .map((p) => loadProviderConfig(p, env))
      .filter((p) => p.apiKey.length > 0 && p.model.length > 0),
    providerCooldownMs: int(env.PROVIDER_COOLDOWN_MS, 120_000),
    demoAccessToken: str(env.DEMO_ACCESS_TOKEN),
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    generationDeadlineMs: int(env.GENERATION_DEADLINE_MS, 90_000),
    bodyLimitBytes: 32 * 1024,
    rateLimitPerIpPerMinute: 10,
    rateLimitGlobalPerHour: 60,
    // Render (and most PaaS) terminate TLS at a proxy; trust it so request.ip is the client IP.
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === "true" : true,
  };
}

/** Required configuration: at least one enabled provider with an API key, plus the demo token. */
export function isConfigured(config: Config): boolean {
  return config.providers.length > 0 && config.demoAccessToken.length > 0;
}
