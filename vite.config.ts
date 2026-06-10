import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev-only helper: POST { name, dataUrl } to /__save and the decoded file
 * lands in docs/proof/. Used for capturing generated media during manual
 * verification; never part of the production build.
 */
const proofSaver = (): Plugin => ({
  name: "vixio-proof-saver",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__save", (req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const { name, dataUrl } = JSON.parse(body) as {
            name: string;
            dataUrl: string;
          };
          const safeName = path.basename(name);
          const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          const dir = path.resolve(__dirname, "docs/proof");
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, safeName), Buffer.from(base64, "base64"));
          res.statusCode = 200;
          res.end(JSON.stringify({ saved: safeName }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    });
  },
});

export default defineConfig({
  // Deploys under a subpath on GitHub Pages; "/" everywhere else.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss(), proofSaver()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5180,
  },
});
