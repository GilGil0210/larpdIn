/**
 * Verifies real LLM access with the configured provider, key and model:
 *   GEMINI_API_KEY=... [GEMINI_MODEL=...] npm run verify:llm
 *   LLM_PROVIDER=featherless FEATHERLESS_API_KEY=... npm run verify:llm
 * 1. checks the model is listed by the provider, 2. runs one full persona
 * generation from examples/generate-request.json and validates it against the contract.
 */
import { readFileSync } from "node:fs";
import { apiKeyVar, loadConfig } from "../src/config.js";
import { GenerateRequestSchema } from "../src/contract.js";
import { createChatClient } from "../src/llm.js";
import { createPersonaGenerator } from "../src/personas.js";

const config = loadConfig();
const { llm } = config;
if (!llm.apiKey) {
  console.error(`${apiKeyVar(config)} is not set`);
  process.exit(1);
}
console.log(`provider ${llm.provider}, model ${llm.model}, ${llm.baseUrl}`);

const models = await fetch(`${llm.baseUrl}/models`, { headers: { Authorization: `Bearer ${llm.apiKey}` } });
if (models.ok) {
  // Gemini lists ids as "models/<name>"; Featherless lists bare ids.
  const ids = (((await models.json()) as { data?: Array<{ id: string }> }).data ?? []).map((m) => m.id.replace(/^models\//, ""));
  if (ids.includes(llm.model)) {
    console.log(`model ${llm.model}: listed`);
  } else {
    const suggestions = ids.filter((id) => /flash|instruct/i.test(id)).slice(0, 15);
    console.log(`model ${llm.model}: NOT listed by /models (aliases may still work). Some available ids:\n  ${suggestions.join("\n  ")}`);
  }
} else {
  console.log(`GET /models returned HTTP ${models.status}; continuing with a generation call`);
}

const request = GenerateRequestSchema.parse(
  JSON.parse(readFileSync(new URL("../examples/generate-request.json", import.meta.url), "utf8")),
);
const generate = createPersonaGenerator(createChatClient(llm));
const started = Date.now();
try {
  const result = await generate(request, AbortSignal.timeout(config.generationDeadlineMs));
  console.log(`OK: 3 valid personas in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const p of result.personas) {
    console.log(`- ${p.name} | ${p.content.headline} | ${p.content.location} | ${p.content.education.map((e) => e.school).join("; ")}`);
  }
} catch (err) {
  console.error(`FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s: ${(err as Error).name}: ${(err as Error).message}`);
  process.exit(1);
}
