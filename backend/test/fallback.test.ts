import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { GenerateResponseSchema } from "../src/contract.js";
import { FEATHERLESS_KEY, auth, exampleRequest, llmCompletion, makeApp, testConfig } from "./helpers.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const FEATHERLESS = "https://api.featherless.ai/v1/chat/completions";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const completion = (content: string) => json({ choices: [{ message: { role: "assistant", content } }] });

type Behaviour = "ok" | "slow" | "error" | "ratelimit" | "garbage" | "hang";

function respond(behaviour: Behaviour, signal: AbortSignal | null | undefined): Promise<Response> {
  switch (behaviour) {
    case "ok":
      return Promise.resolve(json(llmCompletion()));
    case "slow":
      return new Promise((resolve) => setTimeout(() => resolve(json(llmCompletion())), 80));
    case "error":
      return Promise.resolve(json({ error: "down" }, 503));
    case "ratelimit":
      return Promise.resolve(json({}, 429));
    case "garbage":
      return Promise.resolve(completion("I can't produce JSON today"));
    case "hang":
      return new Promise((_r, reject) =>
        signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))),
      );
  }
}

/** Routes provider calls by URL so each provider can be made to fail independently. */
function providers(behaviour: { featherless: Behaviour; gemini: Behaviour }) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const name = u === FEATHERLESS ? "featherless" : u === GEMINI ? "gemini" : "unknown";
    calls.push(name);
    return respond(behaviour[name as "featherless" | "gemini"], init?.signal);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function build(
  behaviour: { featherless: Behaviour; gemini: Behaviour },
  env: Record<string, string> = {},
  overrides: Parameters<typeof testConfig>[1] = {},
  now?: () => number,
) {
  const { fetchImpl, calls } = providers(behaviour);
  // Optional two-provider setup (Featherless first, Gemini fallback); production is Gemini-only.
  app = makeApp({
    config: testConfig({ LLM_PROVIDERS: "featherless,gemini", FEATHERLESS_API_KEY: FEATHERLESS_KEY, ...env }, overrides),
    fetchImpl,
    now,
  });
  return { app, calls };
}

const generate = (a: FastifyInstance, ip = "10.0.0.1") =>
  a.inject({
    method: "POST",
    url: "/api/personas/generate",
    headers: { "content-type": "application/json", ...auth },
    payload: JSON.stringify(exampleRequest()),
    remoteAddress: ip,
  });

describe("optional Featherless-first setup with Gemini fallback", () => {
  it("uses only Featherless when it works", async () => {
    const { app: a, calls } = build({ featherless: "ok", gemini: "ok" });
    const res = await generate(a);
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual(["featherless"]);
  });

  it.each<Behaviour>(["error", "ratelimit"])("falls back to Gemini when Featherless keeps returning %s", async (b) => {
    const { app: a, calls } = build({ featherless: b, gemini: "ok" });
    const res = await generate(a);
    expect(res.statusCode).toBe(200);
    expect(GenerateResponseSchema.safeParse(res.json()).success).toBe(true);
    // Two retries on Featherless first, then the fallback.
    expect(calls).toEqual(["featherless", "featherless", "featherless", "gemini"]);
  });

  it("falls back after Featherless output stays invalid through its repair attempt", async () => {
    const { app: a, calls } = build({ featherless: "garbage", gemini: "ok" });
    const res = await generate(a);
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual(["featherless", "featherless", "gemini"]);
  });

  it("falls back when Featherless exceeds its time budget, within the overall deadline", async () => {
    const { app: a, calls } = build(
      { featherless: "hang", gemini: "ok" },
      { FEATHERLESS_TIMEOUT_MS: "40" },
      { generationDeadlineMs: 2_000 },
    );
    const started = Date.now();
    const res = await generate(a);
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual(["featherless", "gemini"]);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("returns 504 when the overall deadline passes during the fallback", async () => {
    const { app: a, calls } = build(
      { featherless: "hang", gemini: "hang" },
      { FEATHERLESS_TIMEOUT_MS: "30" },
      { generationDeadlineMs: 100 },
    );
    const res = await generate(a);
    expect(res.statusCode).toBe(504);
    expect(res.json().error.code).toBe("UPSTREAM_TIMEOUT");
    expect(calls).toEqual(["featherless", "gemini"]);
  });

  it("returns the fallback's error when both providers fail", async () => {
    const { app: a, calls } = build({ featherless: "error", gemini: "garbage" });
    const res = await generate(a);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("GENERATION_FAILED");
    expect(calls).toEqual(["featherless", "featherless", "featherless", "gemini", "gemini"]);
  });

  it("returns 429 when both providers are rate limited", async () => {
    const { app: a } = build({ featherless: "ratelimit", gemini: "ratelimit" });
    const res = await generate(a);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("skips a failing Featherless during its cooldown, then retries it", async () => {
    let now = 1_000_000;
    const { app: a, calls } = build({ featherless: "error", gemini: "ok" }, { PROVIDER_COOLDOWN_MS: "60000" }, {}, () => now);
    await generate(a, "10.0.0.1");
    await generate(a, "10.0.0.2");
    expect(calls).toEqual(["featherless", "featherless", "featherless", "gemini", "gemini"]);
    now += 60_001;
    await generate(a, "10.0.0.3");
    expect(calls.slice(5)).toEqual(["featherless", "featherless", "featherless", "gemini"]);
  });

  it("does not put Featherless on cooldown for bad output", async () => {
    const { app: a, calls } = build({ featherless: "garbage", gemini: "ok" });
    await generate(a, "10.0.0.1");
    await generate(a, "10.0.0.2");
    expect(calls.filter((c) => c === "featherless")).toHaveLength(4);
  });

  it("does not fall back when only Featherless is configured", async () => {
    const { app: a, calls } = build({ featherless: "error", gemini: "ok" }, { GEMINI_API_KEY: "" });
    const res = await generate(a);
    expect(res.statusCode).toBe(502);
    expect(calls).toEqual(["featherless", "featherless", "featherless"]);
  });

  it("gives a sole Featherless provider the full deadline instead of its fallback budget", async () => {
    // Featherless answers after 80ms, past its 20ms fallback budget; with no fallback it still succeeds.
    const { app: a, calls } = build({ featherless: "slow", gemini: "ok" }, { GEMINI_API_KEY: "", FEATHERLESS_TIMEOUT_MS: "20" });
    expect((await generate(a)).statusCode).toBe(200);
    expect(calls).toEqual(["featherless"]);
  });

  it("falls back when a slow Featherless exceeds its budget and Gemini is configured", async () => {
    const { app: a, calls } = build({ featherless: "slow", gemini: "ok" }, { FEATHERLESS_TIMEOUT_MS: "20" });
    expect((await generate(a)).statusCode).toBe(200);
    expect(calls).toEqual(["featherless", "gemini"]);
  });
});
