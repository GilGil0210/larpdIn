export const DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";
export const DEFAULT_BASE_URL = "https://api.featherless.ai/v1";

export type Config = {
  port: number;
  host: string;
  featherlessApiKey: string;
  featherlessModel: string;
  featherlessBaseUrl: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: int(env.PORT, 3000),
    host: env.HOST?.trim() || "0.0.0.0",
    featherlessApiKey: env.FEATHERLESS_API_KEY?.trim() ?? "",
    featherlessModel: env.FEATHERLESS_MODEL?.trim() || DEFAULT_MODEL,
    featherlessBaseUrl: (env.FEATHERLESS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    demoAccessToken: env.DEMO_ACCESS_TOKEN?.trim() ?? "",
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

/** Required configuration for /health and for serving generation requests. */
export function isConfigured(config: Config): boolean {
  return config.featherlessApiKey.length > 0 && config.demoAccessToken.length > 0 && config.featherlessModel.length > 0;
}
