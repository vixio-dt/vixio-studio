import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";

const portRaw = process.env["PORT"] ?? "8787";
const port = Number.parseInt(portRaw, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[vixio-server] invalid PORT: ${portRaw}`);
  process.exit(1);
}

const app = await createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[vixio-server] listening on http://localhost:${info.port}`);
});
