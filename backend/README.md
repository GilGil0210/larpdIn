# Larpdin backend

Fastify + Zod service that generates three LinkedIn persona candidates with **Google Gemini** (`gemini-3.5-flash`). It calls Gemini through its OpenAI-compatible chat completions endpoint at `https://generativelanguage.googleapis.com/v1beta/openai`. It implements the shared Larpdin contract. It keeps its own copy of the contract types and doesn't import any extension code.

Deployed at **https://larpdin-backend.onrender.com**. The extension uses this URL by default.

## Endpoints

### `GET /health` (no auth)

- `200 {"status":"ok"}`: `GEMINI_API_KEY` is set.
- `503 {"status":"unavailable"}`: otherwise.

### `POST /api/personas/generate`

Requires `Content-Type: application/json`. The prototype accepts requests without a demo token; rate limits still apply.

- Request body: `{ profile: ProfileContent, brief: string }`. See `src/contract.ts`.
- Response: `{ personas: [PersonaCandidate, PersonaCandidate, PersonaCandidate] }`.

Errors have the shape `{ "error": { "code": "...", "message": "..." } }`:

| Status | Code | When | Suggested UI message |
| --- | --- | --- | --- |
| 400 | `INVALID_INPUT` | Bad JSON, a missing or extra field, wrong types, an empty brief, a field over its limit, or a body over 32 KB | Show `message`; the user can fix the brief or draft |
| 401 | `UNAUTHORIZED` | Bearer token missing or wrong when optional authentication is enabled | "Your access token isn't valid. Check it in Settings." |
| 429 | `RATE_LIMITED` | Over 10 requests/min from one IP, over 60 generations/hour in total, or Gemini still rate-limited after retries. Includes a `Retry-After` header in seconds | "Too many requests. Try again in N seconds." |
| 502 | `GENERATION_FAILED` | Gemini returned an error after retries, or the output was still invalid after one repair attempt | "Generation is unavailable right now. Your brief is saved; try again." |
| 503 | `SERVICE_UNAVAILABLE` | The server is missing required configuration | "The service isn't set up yet." |
| 504 | `UPSTREAM_TIMEOUT` | The 90-second deadline passed. The deadline covers retries and the repair | "Generation took too long. Try again." |

Render cold start: after about 15 idle minutes the free instance sleeps, and the next request can take 20–60 seconds while it wakes. A client can call `GET /health` first and show "Starting the server…" until it answers.

Validation input limits: headline 220 characters, about 2600, brief 2000, education up to 20 entries, and years between 1900 and 2100 or `null`. Unknown keys are rejected.

### Behaviour

- **Generation:** the server calls Gemini with JSON output mode and low reasoning effort. It then cleans up the model output: it trims text to the field limits, turns years into integers or `null`, and drops unknown keys. Three distinct personas are required: names, headlines and About text must all differ, and each persona needs a headline, an About and at least one school.
- **Brief requirements:** the model first lists the brief's concrete requirements, as a profile field plus the text it must contain (for example location → "Toronto", school → "University of Toronto"). The server checks every persona against that list, ignoring case, accents and spacing. As a backstop, a single school named in the brief must appear in every persona's education, even if the model forgot to list it. The requirements list is internal and never returned.
- **Repair:** any problem above triggers one repair request that lists the problems. If the repaired output still fails, the API returns 502.
- **Retries:** network errors and Gemini HTTP 408/429/5xx are retried up to twice per call. A `Retry-After` header is honoured; otherwise the wait is exponential backoff with jitter (about 0.5–1 s, then 1–2 s). A retry only starts if at least 5 seconds will remain before the 90-second deadline; otherwise the error is returned immediately. Auth and input errors (400/401/403/404) are never retried. Retries and the single repair all share the 90-second deadline.
- **Rate limits:** the per-IP limit counts every generate request, including invalid ones. The global hourly limit only counts valid requests, so bad requests can't use up the demo quota. Both limits are kept in memory, so the service must run as a single instance.
- **CORS:** allowed for any `chrome-extension://<id>` origin, plus the exact origins listed in `CORS_ORIGINS`. Preflight requests for `Authorization` are answered without authentication.
- **Privacy:** nothing is stored. Logs contain only the method, URL, status and timing, plus error types, retry counts and HTTP statuses. Request bodies, prompts, model output, tokens and keys are never logged, and JSON parse errors are never echoed back. A test checks this.

## Configuration

| Variable | Required | Default |
| --- | --- | --- |
| `REQUIRE_DEMO_TOKEN` | no | `true` enables bearer authentication; default is `false` |
| `DEMO_ACCESS_TOKEN` | conditional | Required only when `REQUIRE_DEMO_TOKEN=true` |
| `GEMINI_API_KEY` | yes | Create a key at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | no | `gemini-3.5-flash` |
| `GEMINI_REASONING_EFFORT` | no | `low`. Set it empty to leave the parameter out |
| `GEMINI_MAX_TOKENS` | no | `8192`. Gemini's thinking tokens count against this |
| `GEMINI_BASE_URL` | no | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `CORS_ORIGINS` | no | comma-separated extra origins |
| `GENERATION_DEADLINE_MS` | no | `90000` |
| `PORT` / `HOST` | no | `3000` / `0.0.0.0` |
| `TRUST_PROXY` | no | `true` (uses `X-Forwarded-For` for the client IP behind Render's proxy) |
| `LOG_LEVEL` | no | `info` |

See `.env.example`.

Featherless support is still in the code but disabled. It's only used if you set `LLM_PROVIDERS` to include it (for example `gemini,featherless`) and provide `FEATHERLESS_API_KEY`. Providers are then tried in that order, with fallback when one fails. Neither the local examples nor Render enable it.

## Local development

```bash
cd backend
npm ci
npm test              # Vitest contract/behaviour suite
npm run typecheck

# Run against the deterministic mock LLM (no key needed)
npm run mock:llm                               # terminal 1, :4010
GEMINI_BASE_URL=http://localhost:4010/v1 GEMINI_API_KEY=mock \
  npm run dev        # terminal 2, :3000

curl -s localhost:3000/health
curl -s -X POST localhost:3000/api/personas/generate \
  -H 'Content-Type: application/json' \
  -d @examples/generate-request.json
```

To simulate failures, start the mock with `MOCK_MODE=malformed|timeout|ratelimit|error`.

Example files:

- `examples/generate-request.json`: an example request with a Toronto / University of Toronto brief.
- `examples/llm-completion.json`: the deterministic mocked Gemini response, including the internal requirements list.
- `examples/generate-response.json`: the API response the mock produces.

## Verify real Gemini access

```bash
GEMINI_API_KEY=... npm run verify:llm
# optional: GEMINI_MODEL=other-model npm run verify:llm
```

The script checks that the model appears in Gemini's `/models` list, and lists some available model IDs if it doesn't. It then runs one full generation from the example request, validates it against the contract, and checks that every option is in Toronto with a University of Toronto education entry. Run it before each deploy and after any model change.

## Deploy to Render

The repo-root `render.yaml` defines one web service with `rootDir: backend`, `numInstances: 1` and a `/health` check. It enables only Gemini (`LLM_PROVIDERS=gemini`, `GEMINI_MODEL=gemini-3.5-flash`) and doesn't need any extension code.

1. In Render, choose **New → Blueprint** and select this repository. An existing service syncs `render.yaml` on its next deploy.
2. Set `GEMINI_API_KEY` in the dashboard if it isn't set already. The endpoint accepts unauthenticated requests in prototype mode. Any old `FEATHERLESS_*` variables can be deleted; with `LLM_PROVIDERS=gemini` they're ignored.
3. Wait for the deploy to finish, then check: `curl https://larpdin-backend.onrender.com/health` → `{"status":"ok"}`.
4. Run `npm run verify:llm` locally with the same key, or run a real generation with `curl` against the deployed URL.
5. Keep the service at one instance. The in-memory limits are only correct with a single instance.

### Gemini free tier

Gemini's free-tier limits apply per Google Cloud project; check AI Studio for the current numbers. Outside the EU, UK and Switzerland, Google may use free-tier prompts to improve its products, and those prompts include testers' LinkedIn profile text. Use a paid (billing-enabled) project if that's a concern.

### Tester access

- **Base URL:** `https://larpdin-backend.onrender.com`, with no path. This is the extension's default.
- **Prototype access:** anyone who can reach the endpoint can submit generation requests, subject to rate limits. The Gemini key stays on the server.
