/**
 * HTTP surface (Hono).
 *
 * Raw byte transport: document content crosses the wire as base64 so the exact
 * bytes survive JSON (U+3000, fullwidth punctuation, any encoding — untouched).
 * Parsed-entity views (content-model) are mounted at /view via ./views.ts,
 * which owns the path dispatch, the projection shapes, and never-ship
 * redaction; this module never touches @vixio/content-model directly.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { loadProjects, type ProjectConfig } from "./config.ts";
import {
  commitEdit,
  DocNotFoundError,
  gitLog,
  listDocs,
  PathViolationError,
  readDoc,
} from "./store.ts";
import { buildDocView, redactNeverShip, type DocView } from "./views.ts";

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
// Strict base64: full quartets with canonical padding. Buffer.from(_, "base64")
// silently tolerates garbage, so validate before decoding to keep the write
// path byte-exact end to end.
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function jsonError(c: Context, status: 400 | 404 | 409 | 422 | 500, message: string): Response {
  return c.json({ error: message }, status);
}

/** Build the app. Loads the project registry eagerly so bad config fails fast. */
export async function createApp(configPath?: string): Promise<Hono> {
  const projects = await loadProjects(configPath);
  const byId = new Map<string, ProjectConfig>(projects.map((p) => [p.id, p]));

  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof PathViolationError) {
      return jsonError(c, 400, err.message);
    }
    if (err instanceof DocNotFoundError) {
      return jsonError(c, 404, err.message);
    }
    // Log server-side, never leak internals (messages may contain paths/stderr).
    console.error(`[vixio-server] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    return jsonError(c, 500, "internal server error");
  });

  app.notFound((c) => jsonError(c, 404, "not found"));

  app.get("/api/projects", (c) =>
    c.json({ projects: projects.map(({ id, name }) => ({ id, name })) }),
  );

  app.get("/api/projects/:id/docs", async (c) => {
    const project = byId.get(c.req.param("id"));
    if (!project) return jsonError(c, 404, "unknown project");
    const docs = await listDocs(project);
    return c.json({ docs });
  });

  app.get("/api/projects/:id/doc", async (c) => {
    const project = byId.get(c.req.param("id"));
    if (!project) return jsonError(c, 404, "unknown project");
    const relPath = c.req.query("path");
    if (relPath === undefined || relPath === "") {
      return jsonError(c, 400, "missing required query parameter: path");
    }
    const doc = await readDoc(project, relPath);
    return c.json({
      path: relPath,
      sha256: doc.sha256,
      size: doc.size,
      contentBase64: doc.bytes.toString("base64"),
    });
  });

  app.get("/api/projects/:id/view", async (c) => {
    const project = byId.get(c.req.param("id"));
    if (!project) return jsonError(c, 404, "unknown project");
    const relPath = c.req.query("path");
    if (relPath === undefined || relPath === "") {
      return jsonError(c, 400, "missing required query parameter: path");
    }
    const doc = await readDoc(project, relPath);
    let view: DocView;
    try {
      view = buildDocView(relPath, doc.bytes);
    } catch (err) {
      // The document exists but does not parse — the file's fault, not ours.
      return jsonError(c, 422, err instanceof Error ? err.message : String(err));
    }
    // NEVER-SHIP gate: private bodies are stripped server-side and
    // structurally unless the author drawer is explicitly requested.
    if (c.req.query("drawer") !== "author") {
      view = redactNeverShip(view);
    }
    return c.json(view);
  });

  app.get("/api/projects/:id/log", async (c) => {
    const project = byId.get(c.req.param("id"));
    if (!project) return jsonError(c, 404, "unknown project");
    const relPath = c.req.query("path");
    if (relPath === undefined || relPath === "") {
      return jsonError(c, 400, "missing required query parameter: path");
    }
    let limit = 20;
    const limitRaw = c.req.query("limit");
    if (limitRaw !== undefined) {
      if (!/^\d+$/.test(limitRaw)) {
        return jsonError(c, 400, "limit must be a positive integer");
      }
      limit = Number.parseInt(limitRaw, 10);
      if (limit < 1 || limit > 1000) {
        return jsonError(c, 400, "limit must be between 1 and 1000");
      }
    }
    const entries = await gitLog(project, relPath, limit);
    return c.json({ entries });
  });

  app.post("/api/projects/:id/edit", async (c) => {
    const project = byId.get(c.req.param("id"));
    if (!project) return jsonError(c, 404, "unknown project");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return jsonError(c, 400, "request body must be valid JSON");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonError(c, 400, "request body must be a JSON object");
    }
    const record = body as Record<string, unknown>;
    const relPath = record["path"];
    const baseSha256 = record["baseSha256"];
    const contentBase64 = record["contentBase64"];
    const message = record["message"];

    if (typeof relPath !== "string" || relPath === "") {
      return jsonError(c, 400, "body.path must be a non-empty string");
    }
    if (typeof baseSha256 !== "string" || !SHA256_HEX_RE.test(baseSha256)) {
      return jsonError(c, 400, "body.baseSha256 must be a 64-char lowercase hex SHA-256");
    }
    if (typeof contentBase64 !== "string" || !BASE64_RE.test(contentBase64)) {
      return jsonError(c, 400, "body.contentBase64 must be valid base64");
    }
    if (typeof message !== "string" || message.trim() === "") {
      return jsonError(c, 400, "body.message must be a non-empty string");
    }

    const newBytes = Buffer.from(contentBase64, "base64");
    const result = await commitEdit(project, { relPath, baseSha256, newBytes, message });
    if (result.status === "conflict") {
      return c.json(result, 409);
    }
    return c.json(result);
  });

  return app;
}
