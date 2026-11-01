import { describe, expect, it } from "vitest";
import { isConfigured, loadConfig } from "../src/config.js";

describe("provider selection", () => {
  it("uses Gemini when GEMINI_API_KEY is set", () => {
    const { llm } = loadConfig({ GEMINI_API_KEY: "g" });
    expect(llm).toMatchObject({
      provider: "gemini",
      apiKey: "g",
      model: "gemini-flash-latest",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      jsonMode: true,
      reasoningEffort: "low",
    });
  });

  it("falls back to Featherless when only FEATHERLESS_API_KEY is set", () => {
    const { llm } = loadConfig({ FEATHERLESS_API_KEY: "f" });
    expect(llm).toMatchObject({ provider: "featherless", apiKey: "f", model: "Qwen/Qwen2.5-7B-Instruct", jsonMode: false });
  });

  it("honours LLM_PROVIDER over key detection", () => {
    expect(loadConfig({ LLM_PROVIDER: "featherless", GEMINI_API_KEY: "g", FEATHERLESS_API_KEY: "f" }).llm.apiKey).toBe("f");
    expect(loadConfig({ LLM_PROVIDER: "gemini", FEATHERLESS_API_KEY: "f" }).llm.apiKey).toBe("");
  });

  it("applies per-provider overrides", () => {
    const { llm } = loadConfig({
      GEMINI_API_KEY: "g",
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_BASE_URL: "http://localhost:4010/v1/",
      GEMINI_REASONING_EFFORT: "",
      GEMINI_MAX_TOKENS: "2048",
    });
    expect(llm).toMatchObject({ model: "gemini-2.5-flash", baseUrl: "http://localhost:4010/v1", reasoningEffort: "", maxTokens: 2048 });
  });

  it("is unconfigured without the active provider's key or the demo token", () => {
    expect(isConfigured(loadConfig({ DEMO_ACCESS_TOKEN: "t" }))).toBe(false);
    expect(isConfigured(loadConfig({ GEMINI_API_KEY: "g" }))).toBe(false);
    expect(isConfigured(loadConfig({ GEMINI_API_KEY: "g", DEMO_ACCESS_TOKEN: "t" }))).toBe(true);
  });
});
