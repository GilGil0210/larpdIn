# Larpdin extension (experimental)

Run `npm install`, `npm test`, `npm run build`, and `npm run test:e2e`. To inspect the unpacked development build, open Chrome Extensions, enable Developer mode, and load the `dist` directory. Run `npm run mock` for the local backend and use token `demo`. The mock echoes its input and does not generate realistic personas. Set `MOCK_ERROR=429`, `502`, or `504` to exercise error responses.

The side panel supports manual profile entry, candidate review, local persona storage, and an experimental read-only scan. Switching and restoration have been exercised with isolated browser fixtures, but are **not verified on live LinkedIn**. Do not use this build to modify a real profile or submit it to the Chrome Web Store yet.

LinkedIn's observed education overview uses lazy-mounted entries without a reliable total. The extension therefore refuses a switch when it cannot prove that the education snapshot is complete. Education records containing skills or media also block switching because their restoration is not implemented. Live forms, autocomplete, notifications, cross-country location changes, and restoration still need validation against LinkedIn.

## Backend integration

For a local real-provider run, set `GEMINI_API_KEY`, `DEMO_ACCESS_TOKEN`, `LLM_PROVIDERS=gemini`, and `GEMINI_MODEL=gemini-3.5-flash` in the Git-ignored `backend/.env` file. From `backend/`, run `npm ci`, `npm run build`, and `node --env-file=.env dist/server.js`. Use `http://localhost:3000` and the same demo token in the extension settings. Check Gemini with `node --env-file=.env --import tsx scripts/verify-llm.ts gemini`; this consumes API quota. Never put provider keys into the extension. The Render blueprint still defaults to Featherless first: set `LLM_PROVIDERS=gemini` and `GEMINI_MODEL=gemini-3.5-flash` in Render before using that deployment, and verify the deployed endpoint.

To test the integration without provider keys, run `npm run mock:llm` in one terminal in `backend/`, then run `HOST=127.0.0.1 FEATHERLESS_BASE_URL=http://localhost:4010/v1 FEATHERLESS_API_KEY=mock DEMO_ACCESS_TOKEN=devtoken npm run dev` in a second terminal. From `extension/`, run `npm run build` followed by `LARPDIN_INTEGRATION=1 npx playwright test e2e/backend-integration.spec.ts`.
