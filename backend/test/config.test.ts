import { describe, expect, it } from "vitest";
import { isConfigured, loadConfig } from "../src/config.js";

const names = (env: Record<string, string>) => loadConfig(env).providers.map((p) => p.provider);

describe("provider configuration", () => {
  it("enables only Gemini by default", () => {
    expect(names({ GEMINI_API_KEY: "g" })).toEqual(["gemini"]);
    // A leftover Featherless key does nothing unless Featherless is enabled.
    expect(names({ GEMINI_API_KEY: "g", FEATHERLESS_API_KEY: "f" })).toEqual(["gemini"]);
    expect(names({ FEATHERLESS_API_KEY: "f" })).toEqual([]);
    expect(names({})).toEqual([]);
  });

  it("can opt into Featherless with LLM_PROVIDERS, in the given order", () => {
    const env = { GEMINI_API_KEY: "g", FEATHERLESS_API_KEY: "f" };
    expect(names({ ...env, LLM_PROVIDERS: "gemini,featherless" })).toEqual(["gemini", "featherless"]);
    expect(names({ ...env, LLM_PROVIDERS: "featherless, gemini, openai" })).toEqual(["featherless", "gemini"]);
    expect(names({ ...env, LLM_PROVIDERS: "featherless" })).toEqual(["featherless"]);
  });

  it("uses Gemini 3.5 Flash defaults", () => {
    const [gemini] = loadConfig({ GEMINI_API_KEY: "g" }).providers;
    expect(gemini).toMatchObject({
      provider: "gemini",
      apiKey: "g",
      model: "gemini-3.5-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      jsonMode: true,
      reasoningEffort: "low",
      maxTokens: 8192,
      timeoutMs: null,
    });
  });

  it("keeps Featherless defaults for the optional setup", () => {
    const [featherless] = loadConfig({ LLM_PROVIDERS: "featherless", FEATHERLESS_API_KEY: "f" }).providers;
    expect(featherless).toMatchObject({
      model: "Qwen/Qwen2.5-7B-Instruct",
      baseUrl: "https://api.featherless.ai/v1",
      jsonMode: false,
      reasoningEffort: "",
      timeoutMs: 60_000,
    });
  });

  it("applies per-provider overrides", () => {
    const [gemini, featherless] = loadConfig({
      LLM_PROVIDERS: "gemini,featherless",
      GEMINI_API_KEY: "g",
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_BASE_URL: "http://localhost:4010/v1/",
      GEMINI_REASONING_EFFORT: "",
      GEMINI_MAX_TOKENS: "2048",
      FEATHERLESS_API_KEY: "f",
      FEATHERLESS_MODEL: "meta-llama/Meta-Llama-3.1-8B-Instruct",
      FEATHERLESS_TIMEOUT_MS: "45000",
    }).providers;
    expect(gemini).toMatchObject({ model: "gemini-2.5-flash", baseUrl: "http://localhost:4010/v1", reasoningEffort: "", maxTokens: 2048 });
    expect(featherless).toMatchObject({ model: "meta-llama/Meta-Llama-3.1-8B-Instruct", timeoutMs: 45_000 });
  });

  it("is configured with the Gemini key plus the demo token", () => {
    expect(isConfigured(loadConfig({ DEMO_ACCESS_TOKEN: "t" }))).toBe(false);
    expect(isConfigured(loadConfig({ GEMINI_API_KEY: "g" }))).toBe(false);
    expect(isConfigured(loadConfig({ FEATHERLESS_API_KEY: "f", DEMO_ACCESS_TOKEN: "t" }))).toBe(false);
    expect(isConfigured(loadConfig({ GEMINI_API_KEY: "g", DEMO_ACCESS_TOKEN: "t" }))).toBe(true);
  });
});
