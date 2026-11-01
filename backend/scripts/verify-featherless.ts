/**
 * Verifies real Featherless access with the configured key and model:
 *   FEATHERLESS_API_KEY=... [FEATHERLESS_MODEL=...] npm run verify:featherless
 * 1. confirms the model is listed, 2. runs one full persona generation using
 * examples/generate-request.json and validates the result against the contract.
 */
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { GenerateRequestSchema } from "../src/contract.js";
import { createFeatherlessClient } from "../src/featherless.js";
import { createPersonaGenerator } from "../src/personas.js";

const config = loadConfig();
if (!config.featherlessApiKey) {
  console.error("FEATHERLESS_API_KEY is not set");
  process.exit(1);
}

const models = await fetch(`${config.featherlessBaseUrl}/models`, {
  headers: { Authorization: `Bearer ${config.featherlessApiKey}` },
});
if (models.ok) {
  const ids = ((await models.json()) as { data?: Array<{ id: string }> }).data?.map((m) => m.id) ?? [];
  console.log(`model ${config.featherlessModel}: ${ids.includes(config.featherlessModel) ? "listed" : "NOT listed in /models"}`);
} else {
  console.log(`GET /models returned HTTP ${models.status}; continuing with a generation call`);
}

const request = GenerateRequestSchema.parse(
  JSON.parse(readFileSync(new URL("../examples/generate-request.json", import.meta.url), "utf8")),
);
const generate = createPersonaGenerator(
  createFeatherlessClient({ apiKey: config.featherlessApiKey, model: config.featherlessModel, baseUrl: config.featherlessBaseUrl }),
);
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
