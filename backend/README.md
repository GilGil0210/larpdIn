# Larpdin backend

Fastify + Zod service that generates three LinkedIn persona candidates using an OpenAI-compatible chat completions API. **Featherless** (`https://api.featherless.ai/v1`) is the main provider. **Google Gemini** is the fallback, used through Gemini's OpenAI compatibility layer at `https://generativelanguage.googleapis.com/v1beta/openai`. It implements the shared Larpdin contract. It keeps its own copy of the contract types and doesn't import any extension code.

## Endpoints

### `GET /health` (no auth)

- `200 {"status":"ok"}`: `DEMO_ACCESS_TOKEN` and at least one provider key (`FEATHERLESS_API_KEY` or `GEMINI_API_KEY`) are set.
- `503 {"status":"unavailable"}`: otherwise.

### `POST /api/personas/generate`

Requires `Authorization: Bearer <DEMO_ACCESS_TOKEN>` and `Content-Type: application/json`.

- Request body: `{ profile: ProfileContent, brief: string }`. See `src/contract.ts`.
- Response: `{ personas: [PersonaCandidate, PersonaCandidate, PersonaCandidate] }`.

Errors have the shape `{ "error": { "code": "...", "message": "..." } }`:

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Bad JSON, a missing or extra field, wrong types, an empty brief, a field over its limit, or a body over 32 KB |
| 401 | `UNAUTHORIZED` | Missing or wrong bearer token (checked before the body is read or the provider is called) |
| 429 | `RATE_LIMITED` | Over 10 requests/min from one IP, over 60 generations/hour in total, or the last provider tried was rate limited. Includes a `Retry-After` header |
| 502 | `GENERATION_FAILED` | Every configured provider failed: an error from the service, or output still invalid after one repair attempt |
| 504 | `UPSTREAM_TIMEOUT` | The 90-second deadline passed. The deadline covers every attempt, repair and fallback |
| 503 | `SERVICE_UNAVAILABLE` | The server is missing required configuration |

Validation input limits: headline 220 characters, about 2600, brief 2000, education up to 20 entries, and years between 1900 and 2100 or `null`. Unknown keys are rejected.

### Behaviour

- **Generation:** the server makes one call to the provider. With Gemini it also asks for JSON output (`response_format: json_object`) and low reasoning effort. It then cleans up the model output: it trims text to the field limits, turns years into integers or `null`, and drops unknown keys. It requires three distinct personas: names, headlines and About text must all differ, and each persona needs a headline, an About and at least one school. If anything is wrong, it sends the model one repair request that lists the problems. If the repaired output is still invalid, that provider has failed.
- **Fallback:** Featherless is tried first. Gemini takes over when Featherless returns an error, is unreachable or rate limited, takes longer than its 60-second budget (`FEATHERLESS_TIMEOUT_MS`), or still produces unusable output after its repair. Gemini gets whatever remains of the 90-second deadline. After a service-side failure (anything except bad output), Featherless is skipped for 2 minutes (`PROVIDER_COOLDOWN_MS`), so testers don't wait out its timeout on every request. If only one key is set, that provider is used alone and gets the full 90 seconds. Logs record which provider served each request and why a provider failed, never the content.
- **Rate limits:** the per-IP limit counts every generate request, including unauthorized ones, which slows down token guessing. The global hourly limit only counts authorized, valid requests, so bad requests can't use up the demo quota. Both limits are kept in memory, so the service must run as a single instance.
- **CORS:** allowed for any `chrome-extension://<id>` origin, plus the exact origins listed in `CORS_ORIGINS`. Preflight requests for `Authorization` are answered without authentication.
- **Privacy:** nothing is stored. Logs contain only the method, URL, status and timing, plus error types. Request bodies, prompts, model output, tokens and keys are never logged, and JSON parse errors are never echoed back. A test checks this.

## Configuration

| Variable | Required | Default |
| --- | --- | --- |
| `DEMO_ACCESS_TOKEN` | yes | |
| `FEATHERLESS_API_KEY` | at least one key | Primary provider |
| `FEATHERLESS_MODEL` | no | `Qwen/Qwen2.5-7B-Instruct` |
| `FEATHERLESS_TIMEOUT_MS` | no | `60000`, Featherless's time budget before falling back to Gemini |
| `FEATHERLESS_BASE_URL` | no | `https://api.featherless.ai/v1` |
| `GEMINI_API_KEY` | at least one key | Fallback provider. Create a key at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | no | `gemini-flash-latest`, an alias Google keeps pointed at the current Flash model |
| `GEMINI_REASONING_EFFORT` | no | `low`. Set it empty to leave the parameter out |
| `GEMINI_MAX_TOKENS` | no | `8192`. Gemini's thinking tokens count against this |
| `GEMINI_BASE_URL` | no | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `LLM_PROVIDERS` | no | `featherless,gemini`, the order providers are tried in |
| `PROVIDER_COOLDOWN_MS` | no | `120000`, how long to skip a provider after a service-side failure |
| `CORS_ORIGINS` | no | comma-separated extra origins |
| `GENERATION_DEADLINE_MS` | no | `90000` |
| `PORT` / `HOST` | no | `3000` / `0.0.0.0` |
| `TRUST_PROXY` | no | `true` (uses `X-Forwarded-For` for the client IP behind Render's proxy) |
| `LOG_LEVEL` | no | `info` |

See `.env.example`.

## Local development

```bash
cd backend
npm ci
npm test              # Vitest contract/behaviour suite
npm run typecheck

# Run against the deterministic mock LLM (no key needed)
npm run mock:llm                               # terminal 1, :4010
FEATHERLESS_BASE_URL=http://localhost:4010/v1 FEATHERLESS_API_KEY=mock \
  DEMO_ACCESS_TOKEN=devtoken npm run dev        # terminal 2, :3000

curl -s localhost:3000/health
curl -s -X POST localhost:3000/api/personas/generate \
  -H 'Authorization: Bearer devtoken' -H 'Content-Type: application/json' \
  -d @examples/generate-request.json
```

To simulate failures, start the mock with `MOCK_MODE=malformed|timeout|ratelimit|error`. To exercise the fallback locally, run a second mock with `MOCK_PORT=4011` and point `GEMINI_BASE_URL=http://localhost:4011/v1 GEMINI_API_KEY=mock` at it.

Example files:

- `examples/generate-request.json`: an example request.
- `examples/llm-completion.json`: the deterministic mocked LLM response.
- `examples/generate-response.json`: the API response the mock produces.

## Verify real provider access

```bash
FEATHERLESS_API_KEY=... GEMINI_API_KEY=... npm run verify:llm   # checks each provider
npm run verify:llm -- gemini                                      # just one provider
```

For each configured provider, the script checks that the model appears in `/models`, and lists some available model IDs if it doesn't. It then runs one full generation from the example request and validates the result against the contract. It also warns if Featherless was slower than its fallback budget. Run it before each deploy and after any model change.

## Deploy to Render

The repo-root `render.yaml` defines one web service with `rootDir: backend`, `numInstances: 1` and a `/health` check. It doesn't need any extension code.

1. In Render, choose **New → Blueprint** and select this repository.
2. When asked, enter `FEATHERLESS_API_KEY` and `GEMINI_API_KEY`. Render generates `DEMO_ACCESS_TOKEN` for you. Both models can be changed in the dashboard, followed by a redeploy. If you leave either key empty, the service runs with just the other provider and no fallback.
3. Wait for the deploy to finish, then check: `curl https://<service>.onrender.com/health` → `{"status":"ok"}`.
4. Run a real generation with `curl` against the deployed URL (see above), or run `npm run verify:llm` locally with the same keys.
5. Keep the service at one instance. The in-memory limits are only correct with a single instance.

On the free plan the service sleeps when idle. The first request after a sleep can take about a minute longer, so warm it up with `/health` before a demo.

### Gemini free tier (fallback)

Gemini's free-tier limits apply per Google Cloud project; check AI Studio for the current numbers. Outside the EU, UK and Switzerland, Google may use free-tier prompts to improve its products, and those prompts include testers' LinkedIn profile text. Use a paid (billing-enabled) project if that's a concern.

### Deployed base URL and tester access

- **Base URL:** `https://<service-name>.onrender.com`. Replace this with the real URL after the first deploy. The extension's backend URL setting uses this value with no path.
- **Demo token:** copy `DEMO_ACCESS_TOKEN` from Render → service → Environment, and send it to invited testers through a private channel such as a DM or password manager share. Never put it in Git, issues or the extension build. Testers paste it into the extension settings.
- **Rotating the token:** edit `DEMO_ACCESS_TOKEN` in Render and save. The service redeploys, the old token stops working, and you send the new one to testers.
