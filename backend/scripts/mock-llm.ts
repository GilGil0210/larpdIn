/**
 * Deterministic local stand-in for an OpenAI-compatible LLM API (Gemini/Featherless).
 *   npm run mock:llm            # listens on :4010
 *   FEATHERLESS_BASE_URL=http://localhost:4010/v1 FEATHERLESS_API_KEY=mock DEMO_ACCESS_TOKEN=dev npm run dev
 * MOCK_MODE=malformed|timeout|ratelimit|error simulates failures.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const completion = readFileSync(new URL("../examples/llm-completion.json", import.meta.url), "utf8");
const port = Number(process.env.MOCK_PORT ?? 4010);
const mode = process.env.MOCK_MODE ?? "ok";

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ data: [{ id: "models/gemini-3.5-flash" }] }));
  }
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    res.writeHead(404).end();
    return;
  }
  req.resume();
  req.on("end", () => {
    switch (mode) {
      case "timeout":
        return; // never respond
      case "ratelimit":
        res.writeHead(429, { "Retry-After": "20" });
        return res.end("{}");
      case "error":
        res.writeHead(500);
        return res.end("{}");
      case "malformed":
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Sure! Here are some ideas..." } }] }));
      default:
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(completion);
    }
  });
}).listen(port, () => console.log(`mock LLM (${mode}) on http://localhost:${port}/v1`));
