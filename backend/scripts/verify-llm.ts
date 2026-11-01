/**
 * Verifies real access for each configured provider (Featherless primary, Gemini fallback):
 *   FEATHERLESS_API_KEY=... GEMINI_API_KEY=... npm run verify:llm
 *   npm run verify:llm -- gemini        # only one provider
 * For each: checks the model is listed, then runs one full persona generation
 * from examples/generate-request.json and validates it against the contract.
 */
import { readFileSync } from "node:fs";
import { loadConfig, type LlmConfig } from "../src/config.js";
import { GenerateRequestSchema } from "../src/contract.js";
import { createChatClient } from "../src/llm.js";
import { createPersonaGenerator } from "../src/personas.js";

const config = loadConfig();
const only = process.argv[2]?.toLowerCase();
const providers = config.providers.filter((p) => !only || p.provider === only);
if (providers.length === 0) {
  console.error("No provider configured: set FEATHERLESS_API_KEY and/or GEMINI_API_KEY");
  process.exit(1);
}

const request = GenerateRequestSchema.parse(
  JSON.parse(readFileSync(new URL("../examples/generate-request.json", import.meta.url), "utf8")),
);

async function verify(llm: LlmConfig): Promise<boolean> {
  console.log(`\n== ${llm.provider}: ${llm.model} (${llm.baseUrl})`);
  const models = await fetch(`${llm.baseUrl}/models`, { headers: { Authorization: `Bearer ${llm.apiKey}` } }).catch(
    () => null,
  );
  if (models?.ok) {
    // Gemini lists ids as "models/<name>"; Featherless lists bare ids.
    const ids = (((await models.json()) as { data?: Array<{ id: string }> }).data ?? []).map((m) =>
      m.id.replace(/^models\//, ""),
    );
    if (ids.includes(llm.model)) console.log("model: listed");
    else {
      const some = ids.filter((id) => /flash|instruct/i.test(id)).slice(0, 15);
      console.log(`model: NOT listed by /models (aliases may still work). Some available ids:\n  ${some.join("\n  ")}`);
    }
  } else {
    console.log(`GET /models failed (${models ? `HTTP ${models.status}` : "network error"}); trying a generation anyway`);
  }

  const generate = createPersonaGenerator(createChatClient(llm));
  const started = Date.now();
  try {
    const result = await generate(request, AbortSignal.timeout(config.generationDeadlineMs));
    console.log(`OK: 3 valid personas in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    for (const p of result.personas) {
      console.log(`- ${p.name} | ${p.content.headline} | ${p.content.location} | ${p.content.education.map((e) => e.school).join("; ")}`);
    }
    if (llm.timeoutMs && Date.now() - started > llm.timeoutMs) {
      console.log(`WARNING: slower than its ${llm.timeoutMs / 1000}s fallback budget; the server would fall back`);
    }
    return true;
  } catch (err) {
    console.error(`FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s: ${(err as Error).name}: ${(err as Error).message}`);
    return false;
  }
}

let allOk = true;
for (const p of providers) allOk = (await verify(p)) && allOk;
process.exit(allOk ? 0 : 1);
