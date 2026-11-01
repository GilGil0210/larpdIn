import { readFileSync } from "node:fs";
import { Writable } from "node:stream";
import { buildApp, type AppOptions } from "../src/app.js";
import { loadConfig, type Config, type LlmConfig } from "../src/config.js";
import type { GenerateRequest, GenerateResponse } from "../src/contract.js";

export const TOKEN = "test-demo-token-0123456789";
export const API_KEY = "AIza-secret-api-key-abcdef";

const read = (name: string) => readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8");

export const exampleRequest = (): GenerateRequest => JSON.parse(read("generate-request.json"));
export const exampleResponse = (): GenerateResponse => JSON.parse(read("generate-response.json"));
/** The deterministic mocked LLM chat completion body. */
export const llmCompletion = (): unknown => JSON.parse(read("llm-completion.json"));
/** The assistant text inside the mocked completion. */
export const fixtureCompletionText = (): string =>
  (llmCompletion() as { choices: Array<{ message: { content: string } }> }).choices[0]!.message.content;

export function testConfig(overrides: Partial<Omit<Config, "llm">> & { llm?: Partial<LlmConfig> } = {}): Config {
  const base = loadConfig({ GEMINI_API_KEY: API_KEY, DEMO_ACCESS_TOKEN: TOKEN });
  const { llm, ...rest } = overrides;
  return { ...base, ...rest, llm: { ...base.llm, ...llm } };
}

export function makeApp(options: Partial<AppOptions> & { config?: Config } = {}) {
  return buildApp({ logger: false, ...options, config: options.config ?? testConfig() });
}

export function logCapture() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, text: () => chunks.join("") };
}

export const auth = { authorization: `Bearer ${TOKEN}` };
