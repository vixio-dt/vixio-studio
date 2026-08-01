import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Hono } from "hono";
import { createApp } from "../src/app.ts";
import { sha256Hex } from "../src/store.ts";
import {
  CJK_DOC_PATH,
  CJK_DOC_TEXT,
  makeFixture,
  OUTSIDE_FILE_NAME,
  PLAIN_DOC_PATH,
  type Fixture,
} from "./fixture.ts";

let fx: Fixture;
let app: Hono;

beforeEach(async () => {
  fx = await makeFixture();
  const projectsFile = path.join(fx.base, "projects.json");
  await writeFile(
    projectsFile,
    JSON.stringify([{ id: fx.project.id, name: fx.project.name, path: fx.project.path }]),
  );
  app = await createApp(projectsFile);
});

afterEach(async () => {
  await fx.cleanup();
});

function docUrl(relPath: string): string {
  return `/api/projects/${fx.project.id}/doc?path=${encodeURIComponent(relPath)}`;
}

describe("GET /api/projects", () => {
  it("lists registered projects", async () => {
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      projects: [{ id: "hth", name: "Howl To Heaven" }],
    });
  });
});

describe("GET /api/projects/:id/docs", () => {
  it("returns tracked docs with sizes", async () => {
    const res = await app.request(`/api/projects/${fx.project.id}/docs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { docs: Array<{ relPath: string; size: number }> };
    const byPath = new Map(body.docs.map((d) => [d.relPath, d.size]));
    expect(byPath.get(CJK_DOC_PATH)).toBe(Buffer.from(CJK_DOC_TEXT, "utf8").length);
    expect(byPath.has(PLAIN_DOC_PATH)).toBe(true);
  });

  it("404s for an unknown project", async () => {
    const res = await app.request("/api/projects/nope/docs");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });
});

describe("GET /api/projects/:id/doc", () => {
  it("returns path, sha256, size, and base64 content that decodes to the exact bytes", async () => {
    const res = await app.request(docUrl(CJK_DOC_PATH));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      path: string;
      sha256: string;
      size: number;
      contentBase64: string;
    };
    const expected = Buffer.from(CJK_DOC_TEXT, "utf8");
    const decoded = Buffer.from(body.contentBase64, "base64");
    expect(body.path).toBe(CJK_DOC_PATH);
    expect(decoded.equals(expected)).toBe(true);
    expect(body.sha256).toBe(sha256Hex(expected));
    expect(body.size).toBe(expected.length);
  });

  it("400s when the path query parameter is missing", async () => {
    const res = await app.request(`/api/projects/${fx.project.id}/doc`);
    expect(res.status).toBe(400);
  });

  it("400s on traversal attempts", async () => {
    const res = await app.request(docUrl(`../${OUTSIDE_FILE_NAME}`));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });

  it("404s for a missing document", async () => {
    const res = await app.request(docUrl("no-such.md"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/projects/:id/log", () => {
  it("returns the commit history for a path", async () => {
    const res = await app.request(
      `/api/projects/${fx.project.id}/log?path=${encodeURIComponent(CJK_DOC_PATH)}&limit=5`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ sha: string; date: string; subject: string }>;
    };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.subject).toBe("init fixture");
    expect(body.entries[0]?.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("400s on a bogus limit", async () => {
    const res = await app.request(
      `/api/projects/${fx.project.id}/log?path=${encodeURIComponent(CJK_DOC_PATH)}&limit=zero`,
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/projects/:id/edit", () => {
  const NEW_TEXT = "# 世界規則 v1.1\n　　改動：新的一行。\n";

  async function currentSha(relPath: string): Promise<string> {
    const res = await app.request(docUrl(relPath));
    const body = (await res.json()) as { sha256: string };
    return body.sha256;
  }

  async function editRequest(payload: unknown): Promise<Response> {
    return await app.request(`/api/projects/${fx.project.id}/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  it("commits an edit and the doc round-trips byte-exactly afterwards", async () => {
    const baseSha256 = await currentSha(CJK_DOC_PATH);
    const newBytes = Buffer.from(NEW_TEXT, "utf8");

    const res = await editRequest({
      path: CJK_DOC_PATH,
      baseSha256,
      contentBase64: newBytes.toString("base64"),
      message: "edit via api",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      commitSha: string;
      newSha256: string;
    };
    expect(body.status).toBe("committed");
    expect(body.newSha256).toBe(sha256Hex(newBytes));
    expect(body.commitSha).toBe((await fx.git("rev-parse", "HEAD")).trim());

    const after = await app.request(docUrl(CJK_DOC_PATH));
    const afterBody = (await after.json()) as { contentBase64: string; sha256: string };
    expect(Buffer.from(afterBody.contentBase64, "base64").equals(newBytes)).toBe(true);
    expect(afterBody.sha256).toBe(sha256Hex(newBytes));
  });

  it("409s with the current sha on a stale baseSha256 and does not write", async () => {
    const realSha = await currentSha(CJK_DOC_PATH);
    const staleSha = sha256Hex(Buffer.from("stale", "utf8"));

    const res = await editRequest({
      path: CJK_DOC_PATH,
      baseSha256: staleSha,
      contentBase64: Buffer.from(NEW_TEXT, "utf8").toString("base64"),
      message: "should conflict",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "conflict", currentSha256: realSha });

    // File is untouched.
    expect(await currentSha(CJK_DOC_PATH)).toBe(realSha);
    expect((await fx.git("rev-list", "--count", "HEAD")).trim()).toBe("1");
  });

  it("400s on malformed bodies", async () => {
    const baseSha256 = await currentSha(PLAIN_DOC_PATH);

    const missingField = await editRequest({ path: PLAIN_DOC_PATH, baseSha256 });
    expect(missingField.status).toBe(400);

    const badSha = await editRequest({
      path: PLAIN_DOC_PATH,
      baseSha256: "not-a-sha",
      contentBase64: "aGk=",
      message: "m",
    });
    expect(badSha.status).toBe(400);

    const badBase64 = await editRequest({
      path: PLAIN_DOC_PATH,
      baseSha256,
      contentBase64: "!!!not base64!!!",
      message: "m",
    });
    expect(badBase64.status).toBe(400);

    const notJson = await app.request(`/api/projects/${fx.project.id}/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(notJson.status).toBe(400);
  });

  it("404s for an unknown project", async () => {
    const res = await app.request("/api/projects/nope/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: PLAIN_DOC_PATH,
        baseSha256: "0".repeat(64),
        contentBase64: "aGk=",
        message: "m",
      }),
    });
    expect(res.status).toBe(404);
  });
});
