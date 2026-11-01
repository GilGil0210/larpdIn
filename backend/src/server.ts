import { buildApp } from "./app.js";
import { isConfigured, loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });

if (!isConfigured(config)) {
  app.log.warn(
    "No provider key or required authentication token set; /health will report unavailable and generation is disabled",
  );
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    { providers: config.providers.map((p) => `${p.provider}:${p.model}`) },
    "larpdin backend ready (providers in fallback order)",
  );
} catch (err) {
  app.log.error({ errType: (err as Error).name }, "failed to start");
  process.exit(1);
}
