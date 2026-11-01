export type LlmProvider = "gemini" | "featherless";

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
};

export const PROVIDER_DEFAULTS: Record<LlmProvider, Omit<LlmConfig, "provider" | "apiKey">> = {
  gemini: {
    // Alias that Google keeps pointed at the current Flash model.
    model: "gemini-flash-latest",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    // Gemini thinking tokens count against max_tokens, so leave headroom.
    maxTokens: 8192,
    reasoningEffort: "low",
    jsonMode: true,
  },
  featherless: {
    model: "Qwen/Qwen2.5-7B-Instruct",
    baseUrl: "https://api.featherless.ai/v1",
    maxTokens: 4096,
    reasoningEffort: "",
    jsonMode: false,
  },
};

export type Config = {
  port: number;
  host: string;
  llm: LlmConfig;
  demoAccessToken: string;
  /** Extra exact origins allowed for CORS, in addition to chrome-extension://*. */
  corsOrigins: string[];
  /** Total budget for a generate request, including the repair attempt. */
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

/**
 * LLM_PROVIDER picks the provider explicitly. Otherwise Gemini is used when
 * GEMINI_API_KEY is set, then Featherless when FEATHERLESS_API_KEY is set,
 * else Gemini (unconfigured).
 */
export function resolveProvider(env: NodeJS.ProcessEnv): LlmProvider {
  const explicit = str(env.LLM_PROVIDER).toLowerCase();
  if (explicit === "gemini" || explicit === "featherless") return explicit;
  if (str(env.GEMINI_API_KEY)) return "gemini";
  if (str(env.FEATHERLESS_API_KEY)) return "featherless";
  return "gemini";
}

function loadLlmConfig(env: NodeJS.ProcessEnv): LlmConfig {
  const provider = resolveProvider(env);
  const defaults = PROVIDER_DEFAULTS[provider];
  const prefix = provider === "gemini" ? "GEMINI" : "FEATHERLESS";
  const reasoning = env[`${prefix}_REASONING_EFFORT`];
  return {
    provider,
    apiKey: str(env[`${prefix}_API_KEY`]),
    model: str(env[`${prefix}_MODEL`]) || defaults.model,
    baseUrl: (str(env[`${prefix}_BASE_URL`]) || defaults.baseUrl).replace(/\/+$/, ""),
    maxTokens: int(env[`${prefix}_MAX_TOKENS`], defaults.maxTokens),
    reasoningEffort: reasoning === undefined ? defaults.reasoningEffort : reasoning.trim(),
    jsonMode: defaults.jsonMode,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: int(env.PORT, 3000),
    host: str(env.HOST) || "0.0.0.0",
    llm: loadLlmConfig(env),
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

/** Name of the API key variable for the active provider, for messages. */
export const apiKeyVar = (config: Config) => (config.llm.provider === "gemini" ? "GEMINI_API_KEY" : "FEATHERLESS_API_KEY");

/** Required configuration for /health and for serving generation requests. */
export function isConfigured(config: Config): boolean {
  return config.llm.apiKey.length > 0 && config.llm.model.length > 0 && config.demoAccessToken.length > 0;
}
