import { describe, expect, it } from "vitest";
import { isConfigured, loadConfig } from "../src/config.js";

const names = (env: Record<string, string>) => loadConfig(env).providers.map((p) => p.provider);

describe("provider configuration", () => {
  it("orders Featherless first and Gemini as fallback", () => {
    expect(names({ FEATHERLESS_API_KEY: "f", GEMINI_API_KEY: "g" })).toEqual(["featherless", "gemini"]);
  });

  it("includes only providers with keys", () => {
    expect(names({ FEATHERLESS_API_KEY: "f" })).toEqual(["featherless"]);
    expect(names({ GEMINI_API_KEY: "g" })).toEqual(["gemini"]);
    expect(names({})).toEqual([]);
  });

  it("honours LLM_PROVIDERS order and ignores unknown names", () => {
    expect(names({ LLM_PROVIDERS: "gemini, featherless, openai", FEATHERLESS_API_KEY: "f", GEMINI_API_KEY: "g" })).toEqual([
      "gemini",
      "featherless",
    ]);
    expect(names({ LLM_PROVIDERS: "featherless", FEATHERLESS_API_KEY: "f", GEMINI_API_KEY: "g" })).toEqual(["featherless"]);
  });

  it("uses provider defaults", () => {
    const [featherless, gemini] = loadConfig({ FEATHERLESS_API_KEY: "f", GEMINI_API_KEY: "g" }).providers;
    expect(featherless).toMatchObject({
      apiKey: "f",
      model: "Qwen/Qwen2.5-7B-Instruct",
      baseUrl: "https://api.featherless.ai/v1",
      jsonMode: false,
      reasoningEffort: "",
      timeoutMs: 60_000,
    });
    expect(gemini).toMatchObject({
      apiKey: "g",
      model: "gemini-flash-latest",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      jsonMode: true,
      reasoningEffort: "low",
      maxTokens: 8192,
      timeoutMs: null,
    });
  });

  it("applies per-provider overrides", () => {
    const [featherless, gemini] = loadConfig({
      FEATHERLESS_API_KEY: "f",
      FEATHERLESS_MODEL: "meta-llama/Meta-Llama-3.1-8B-Instruct",
      FEATHERLESS_TIMEOUT_MS: "45000",
      GEMINI_API_KEY: "g",
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_BASE_URL: "http://localhost:4010/v1/",
      GEMINI_REASONING_EFFORT: "",
      GEMINI_MAX_TOKENS: "2048",
    }).providers;
    expect(featherless).toMatchObject({ model: "meta-llama/Meta-Llama-3.1-8B-Instruct", timeoutMs: 45_000 });
    expect(gemini).toMatchObject({ model: "gemini-2.5-flash", baseUrl: "http://localhost:4010/v1", reasoningEffort: "", maxTokens: 2048 });
  });

  it("is configured with either provider key plus the demo token", () => {
    expect(isConfigured(loadConfig({ DEMO_ACCESS_TOKEN: "t" }))).toBe(false);
    expect(isConfigured(loadConfig({ FEATHERLESS_API_KEY: "f" }))).toBe(false);
    expect(isConfigured(loadConfig({ FEATHERLESS_API_KEY: "f", DEMO_ACCESS_TOKEN: "t" }))).toBe(true);
    expect(isConfigured(loadConfig({ GEMINI_API_KEY: "g", DEMO_ACCESS_TOKEN: "t" }))).toBe(true);
  });
});
