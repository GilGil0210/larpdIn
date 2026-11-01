import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { GenerateResponseSchema } from "../src/contract.js";
import { createFeatherlessClient, type ChatClient } from "../src/featherless.js";
import { createPersonaGenerator } from "../src/personas.js";
import {
  API_KEY,
  TOKEN,
  auth,
  exampleRequest,
  exampleResponse,
  featherlessCompletion,
  fixtureCompletionText,
  logCapture,
  makeApp,
  testConfig,
} from "./helpers.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const post = (a: FastifyInstance, body: unknown, headers: Record<string, string> = auth, remoteAddress = "10.0.0.1") =>
  a.inject({
    method: "POST",
    url: "/api/personas/generate",
    headers: { "content-type": "application/json", ...headers },
    payload: typeof body === "string" ? body : JSON.stringify(body),
    remoteAddress,
  });

/** Fetch stub that answers like Featherless with the deterministic fixture. */
function featherlessFetch(responses: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const completionWith = (content: string) => ({ choices: [{ message: { role: "assistant", content } }] });

function featherlessApp(responses: Array<() => Response | Promise<Response>>, configOverrides = {}) {
  const config = testConfig(configOverrides);
  const { fetchImpl, calls } = featherlessFetch(responses);
  const chat = createFeatherlessClient({
    apiKey: config.featherlessApiKey,
    model: config.featherlessModel,
    baseUrl: config.featherlessBaseUrl,
    fetchImpl,
  });
  app = makeApp({ config, generate: createPersonaGenerator(chat) });
  return { app, calls };
}

describe("GET /health", () => {
  it("returns ok when configured", async () => {
    app = makeApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it.each([{ featherlessApiKey: "" }, { demoAccessToken: "" }])("returns 503 when config is missing (%o)", async (o) => {
    app = makeApp({ config: testConfig(o) });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
  });

  it("does not require auth", async () => {
    app = makeApp();
    const res = await app.inject({ method: "GET", url: "/health", headers: { authorization: "Bearer wrong" } });
    expect(res.statusCode).toBe(200);
  });
});

describe("authentication", () => {
  it.each([
    ["missing header", {}],
    ["wrong token", { authorization: "Bearer nope" }],
    ["wrong scheme", { authorization: `Basic ${TOKEN}` }],
    ["token prefix", { authorization: `Bearer ${TOKEN.slice(0, -1)}` }],
  ])("rejects %s with 401 before calling the generator", async (_label, headers) => {
    const generate = vi.fn();
    app = makeApp({ generate });
    const res = await post(app, exampleRequest(), headers as Record<string, string>);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
    expect(res.headers["www-authenticate"]).toBe("Bearer");
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects unauthorized requests before Featherless is contacted", async () => {
    const { app: a, calls } = featherlessApp([() => jsonResponse(featherlessCompletion())]);
    const res = await post(a, exampleRequest(), { authorization: "Bearer nope" });
    expect(res.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("returns 401 rather than 400 for unauthorized malformed bodies", async () => {
    app = makeApp({ generate: vi.fn() });
    const res = await post(app, "{not json", {});
    expect(res.statusCode).toBe(401);
  });
});

describe("request validation", () => {
  const cases: Array<[string, (r: ReturnType<typeof exampleRequest>) => unknown]> = [
    ["missing brief", ({ brief: _b, ...rest }) => rest],
    ["empty brief", (r) => ({ ...r, brief: "   " })],
    ["missing profile.about", (r) => ({ ...r, profile: { ...r.profile, about: undefined } })],
    ["null text field", (r) => ({ ...r, profile: { ...r.profile, industry: null } })],
    ["string year", (r) => ({ ...r, profile: { ...r.profile, education: [{ ...r.profile.education[0], startYear: "2014" }] } })],
    ["missing education field", (r) => ({ ...r, profile: { ...r.profile, education: [{ school: "X" }] } })],
    ["unknown top-level key", (r) => ({ ...r, extra: true })],
    ["headline too long", (r) => ({ ...r, profile: { ...r.profile, headline: "x".repeat(221) } })],
    ["not an object", () => [1, 2, 3]],
  ];

  it.each(cases)("rejects %s with 400", async (_label, mutate) => {
    const generate = vi.fn();
    app = makeApp({ generate });
    const res = await post(app, mutate(exampleRequest()));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "INVALID_INPUT", message: expect.any(String) } });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON with 400 without echoing the body", async () => {
    app = makeApp({ generate: vi.fn() });
    const res = await post(app, '{"brief": "SECRET-BRIEF-TEXT"');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_INPUT");
    expect(res.body).not.toContain("SECRET-BRIEF-TEXT");
  });

  it("rejects bodies over 32 KB with 400", async () => {
    app = makeApp({ generate: vi.fn() });
    const req = exampleRequest();
    const res = await post(app, { ...req, profile: { ...req.profile, about: "a".repeat(33 * 1024) } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_INPUT");
  });

  it("accepts an empty education list and null years", async () => {
    const generate = vi.fn(async () => exampleResponse());
    app = makeApp({ generate });
    const req = exampleRequest();
    const res = await post(app, { ...req, profile: { ...req.profile, education: [] } });
    expect(res.statusCode).toBe(200);
    const res2 = await post(app, {
      ...req,
      profile: { ...req.profile, education: [{ ...req.profile.education[0]!, startYear: null, endYear: null }] },
    });
    expect(res2.statusCode).toBe(200);
  });

  it("uses the contract error shape for unknown routes", async () => {
    app = makeApp();
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "NOT_FOUND", message: expect.any(String) } });
  });
});

describe("generation through the Featherless client (mocked HTTP)", () => {
  it("returns exactly three contract-valid personas", async () => {
    const { app: a, calls } = featherlessApp([() => jsonResponse(featherlessCompletion())]);
    const res = await post(a, exampleRequest());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(GenerateResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual(exampleResponse());
    expect(body.personas).toHaveLength(3);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.featherless.ai/v1/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent.model).toBe("Qwen/Qwen2.5-7B-Instruct");
    expect(sent.messages[1].content).toContain("University of Toronto");
  });

  it("uses FEATHERLESS_MODEL when configured", async () => {
    const { app: a, calls } = featherlessApp([() => jsonResponse(featherlessCompletion())], {
      featherlessModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    });
    await post(a, exampleRequest());
    expect(JSON.parse(String(calls[0]!.init.body)).model).toBe("meta-llama/Meta-Llama-3.1-8B-Instruct");
  });

  it("repairs malformed output once and succeeds", async () => {
    const { app: a, calls } = featherlessApp([
      () => jsonResponse(completionWith("Sure! Here are three personas: ...")),
      () => jsonResponse(featherlessCompletion()),
    ]);
    const res = await post(a, exampleRequest());
    expect(res.statusCode).toBe(200);
    expect(calls).toHaveLength(2);
    const repairMessages = JSON.parse(String(calls[1]!.init.body)).messages;
    expect(repairMessages).toHaveLength(4);
    expect(repairMessages[2]).toEqual({ role: "assistant", content: "Sure! Here are three personas: ..." });
    expect(repairMessages[3].content).toContain("could not be used");
  });

  it("repairs when only two distinct personas are returned", async () => {
    const two = JSON.parse(fixtureCompletionText());
    two.personas[2] = two.personas[0];
    const { app: a, calls } = featherlessApp([
      () => jsonResponse(completionWith(JSON.stringify(two))),
      () => jsonResponse(featherlessCompletion()),
    ]);
    const res = await post(a, exampleRequest());
    expect(res.statusCode).toBe(200);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1]!.init.body)).messages[3].content).toContain("duplicates");
  });

  it("returns 502 after exactly one failed repair", async () => {
    const { app: a, calls } = featherlessApp([() => jsonResponse(completionWith("not json at all"))]);
    const res = await post(a, exampleRequest());
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: { code: "GENERATION_FAILED", message: expect.any(String) } });
    expect(calls).toHaveLength(2);
  });

  it("maps upstream HTTP errors to 502", async () => {
    const { app: a } = featherlessApp([() => jsonResponse({ error: "boom" }, 500)]);
    const res = await post(a, exampleRequest());
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("GENERATION_FAILED");
  });

  it("maps upstream 429 to 429 with Retry-After", async () => {
    const { app: a } = featherlessApp([() => jsonResponse({}, 429, { "retry-after": "17" })]);
    const res = await post(a, exampleRequest());
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBe("17");
  });

  it("returns 504 when Featherless does not answer before the deadline", async () => {
    const config = testConfig({ generationDeadlineMs: 50 });
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    const chat = createFeatherlessClient({ apiKey: API_KEY, model: "m", baseUrl: "http://x/v1", fetchImpl: hang });
    app = makeApp({ config, generate: createPersonaGenerator(chat) });
    const res = await post(app, exampleRequest());
    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({ error: { code: "UPSTREAM_TIMEOUT", message: expect.any(String) } });
  });

  it("applies the deadline across the repair attempt too", async () => {
    const config = testConfig({ generationDeadlineMs: 80 });
    let calls = 0;
    const chat: ChatClient = async ({ signal }) => {
      calls++;
      if (calls === 1) {
        await new Promise((r) => setTimeout(r, 50));
        return "garbage";
      }
      return new Promise((_r, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    app = makeApp({ config, generate: createPersonaGenerator(chat) });
    const started = Date.now();
    const res = await post(app, exampleRequest());
    expect(res.statusCode).toBe(504);
    expect(calls).toBe(2);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("enforces the deadline even if the generator ignores its signal", async () => {
    app = makeApp({ config: testConfig({ generationDeadlineMs: 30 }), generate: () => new Promise(() => {}) });
    const res = await post(app, exampleRequest());
    expect(res.statusCode).toBe(504);
  });
});

describe("rate limits", () => {
  it("allows 10 requests/minute/IP, then 429 with Retry-After, then recovers", async () => {
    let now = 1_000_000;
    const generate = vi.fn(async () => exampleResponse());
    app = makeApp({ generate, now: () => now });
    for (let i = 0; i < 10; i++) expect((await post(app, exampleRequest())).statusCode).toBe(200);
    const limited = await post(app, exampleRequest());
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: { code: "RATE_LIMITED", message: expect.any(String) } });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(generate).toHaveBeenCalledTimes(10);

    // A different IP is unaffected.
    expect((await post(app, exampleRequest(), auth, "10.0.0.2")).statusCode).toBe(200);

    now += 60_001;
    expect((await post(app, exampleRequest())).statusCode).toBe(200);
  });

  it("counts unauthorized attempts against the per-IP limit", async () => {
    app = makeApp({ generate: vi.fn() });
    for (let i = 0; i < 10; i++) expect((await post(app, exampleRequest(), {})).statusCode).toBe(401);
    expect((await post(app, exampleRequest(), {})).statusCode).toBe(429);
  });

  it("allows 60 authorized generations/hour globally across IPs", async () => {
    let now = 5_000_000;
    const generate = vi.fn(async () => exampleResponse());
    app = makeApp({ generate, now: () => now });
    for (let i = 0; i < 60; i++) {
      expect((await post(app, exampleRequest(), auth, `10.1.${i}.1`)).statusCode).toBe(200);
    }
    const limited = await post(app, exampleRequest(), auth, "10.2.0.1");
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(generate).toHaveBeenCalledTimes(60);

    now += 3_600_001;
    expect((await post(app, exampleRequest(), auth, "10.2.0.1")).statusCode).toBe(200);
  });

  it("does not spend the global budget on unauthorized or invalid requests", async () => {
    const generate = vi.fn(async () => exampleResponse());
    app = makeApp({ generate });
    for (let i = 0; i < 70; i++) await post(app, exampleRequest(), {}, `10.3.${i}.1`);
    for (let i = 0; i < 70; i++) await post(app, { bad: true }, auth, `10.4.${i}.1`);
    expect((await post(app, exampleRequest(), auth, "10.5.0.1")).statusCode).toBe(200);
  });

  it("uses X-Forwarded-For behind Render's proxy", async () => {
    app = makeApp({ generate: vi.fn(async () => exampleResponse()) });
    for (let i = 0; i < 10; i++) await post(app, exampleRequest(), { ...auth, "x-forwarded-for": "203.0.113.9" });
    expect((await post(app, exampleRequest(), { ...auth, "x-forwarded-for": "203.0.113.9" })).statusCode).toBe(429);
    expect((await post(app, exampleRequest(), { ...auth, "x-forwarded-for": "203.0.113.10" })).statusCode).toBe(200);
  });
});

describe("CORS for the extension", () => {
  const extOrigin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

  it("answers authorization preflight from an extension origin without auth", async () => {
    app = makeApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/personas/generate",
      headers: {
        origin: extOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(extOrigin);
    expect(String(res.headers["access-control-allow-headers"]).toLowerCase()).toContain("authorization");
    expect(String(res.headers["access-control-allow-methods"])).toContain("POST");
  });

  it("adds CORS headers to actual responses, including errors", async () => {
    app = makeApp({ generate: vi.fn(async () => exampleResponse()) });
    const ok = await post(app, exampleRequest(), { ...auth, origin: extOrigin });
    expect(ok.headers["access-control-allow-origin"]).toBe(extOrigin);
    const unauthorized = await post(app, exampleRequest(), { origin: extOrigin }, "10.9.9.9");
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["access-control-allow-origin"]).toBe(extOrigin);
  });

  it("does not allow arbitrary web origins", async () => {
    app = makeApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/personas/generate",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows origins listed in CORS_ORIGINS", async () => {
    app = makeApp({ config: testConfig({ corsOrigins: ["http://localhost:5173"] }) });
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/personas/generate",
      headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("configuration guard", () => {
  it("returns 503 for generation when not configured", async () => {
    const generate = vi.fn();
    app = makeApp({ config: testConfig({ featherlessApiKey: "" }), generate });
    const res = await post(app, exampleRequest());
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("SERVICE_UNAVAILABLE");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("log redaction", () => {
  it("never logs credentials, prompts, profile content, or generated content", async () => {
    const logs = logCapture();
    const config = testConfig();
    const responses = [
      () => jsonResponse(featherlessCompletion()),
      () => jsonResponse(completionWith("garbage")),
      () => jsonResponse(completionWith("garbage")),
      () => jsonResponse({}, 500),
    ];
    let i = 0;
    const { fetchImpl } = featherlessFetch([() => responses[Math.min(i++, responses.length - 1)]!()]);
    const chat = createFeatherlessClient({ apiKey: API_KEY, model: "m", baseUrl: config.featherlessBaseUrl, fetchImpl });
    app = makeApp({ config, generate: createPersonaGenerator(chat), logger: { level: "trace", stream: logs.stream } });

    const req = exampleRequest();
    await post(app, req); // success
    await post(app, req); // malformed -> repair -> 502
    await post(app, req); // upstream 500
    await post(app, req, { authorization: "Bearer wrong-token-value" }); // 401
    await post(app, '{"brief": "LEAKY-BRIEF-IN-BAD-JSON', auth); // invalid JSON

    const text = logs.text();
    expect(text.length).toBeGreaterThan(0);
    for (const secret of [
      TOKEN,
      API_KEY,
      "wrong-token-value",
      "LEAKY-BRIEF-IN-BAD-JSON",
      req.brief,
      req.profile.about,
      req.profile.headline,
      "University of Toronto",
      exampleResponse().personas[0]!.content.about,
      "garbage",
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});
