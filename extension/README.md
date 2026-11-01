# Larpdin extension (experimental)

Run `npm install`, `npm test`, `npm run build`, and `npm run test:e2e`. To inspect the unpacked development build, open Chrome Extensions, enable Developer mode, and load the `dist` directory. Run `npm run mock` for the local backend . The mock echoes its input and does not generate realistic personas. Set `MOCK_ERROR=429`, `502`, or `504` to exercise error responses.

The side panel supports manual profile entry, candidate review, local persona storage, and an experimental read-only scan. Prototype Apply has been exercised with isolated browser fixtures, but is **not verified on live LinkedIn**. Use a test profile and keep a separate backup before applying: education scanning can be incomplete and automatic undo may be unavailable. Do not submit this build to the Chrome Web Store yet.

LinkedIn's observed education overview uses lazy-mounted entries without a reliable total. Prototype Apply can proceed when it cannot prove the education snapshot is complete; it records that limitation and refuses automatic restoration from that incomplete backup. Education records containing skills or media also block switching because their restoration is not implemented. Live forms, autocomplete, notifications, cross-country location changes, and restoration still need validation against LinkedIn.

## Backend integration

For a local real-provider run, set `GEMINI_API_KEY`, `LLM_PROVIDERS=gemini`, and `GEMINI_MODEL=gemini-3.5-flash` in the Git-ignored `backend/.env` file. From `backend/`, run `npm ci`, `npm run build`, and `node --env-file=.env dist/server.js`. Use `http://localhost:3000` in the extension settings. Check Gemini with `node --env-file=.env --import tsx scripts/verify-llm.ts gemini`; this consumes API quota. Never put provider keys into the extension. The Render blueprint enables Gemini by default; verify the deployed endpoint before use.

To test the integration without provider keys, run `npm run mock:llm` in one terminal in `backend/`, then run `HOST=127.0.0.1 GEMINI_BASE_URL=http://localhost:4010/v1 GEMINI_API_KEY=mock npm run dev` in a second terminal. From `extension/`, run `npm run build` followed by `LARPDIN_INTEGRATION=1 npx playwright test e2e/backend-integration.spec.ts`.

## Engine handoff

The shared UI boundary is `src/public-api.ts`. `createClient()` in `src/client.ts` implements it for the extension; `createMockClient()` in `src/mock-client.ts` supplies an in-memory implementation. The prototype does not require a demo access token. Snapshots and attachment bytes are not part of the public state. `apply`, `undo`, `restoreOriginal`, and `recover` acknowledge a background command; subscribe to state updates for its outcome. A current scan is required to display a verified active persona.

The worker records checkpoints before writes and reports a stopped worker as interrupted. A recovery captures fresh state instead of replaying a possibly submitted action. Education skills and media restoration, an originally absent or empty About section, and LinkedIn's lazy collection exhaustion are still gated; the attachment store alone does not make media restoration available. The isolated fixture verifies a switch and undo after closing the panel, but it does not establish live LinkedIn compatibility.
