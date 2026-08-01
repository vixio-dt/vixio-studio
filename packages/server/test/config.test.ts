import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadProjects, parseProjects, projectsFilePath } from "../src/config.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

async function tempProjectsFile(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vixio-config-test-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "projects.json");
  await writeFile(file, content);
  return file;
}

describe("projectsFilePath", () => {
  it("prefers the explicit argument, then the env var, then the default", () => {
    vi.stubEnv("VIXIO_PROJECTS_FILE", "/env/projects.json");
    expect(projectsFilePath("/explicit.json")).toBe("/explicit.json");
    expect(projectsFilePath()).toBe("/env/projects.json");
    vi.stubEnv("VIXIO_PROJECTS_FILE", "");
    expect(projectsFilePath()).toBe("./projects.json");
  });
});

describe("loadProjects", () => {
  it("loads a valid registry", async () => {
    const file = await tempProjectsFile(
      JSON.stringify([{ id: "hth", name: "Howl To Heaven", path: "/repos/hth" }]),
    );
    expect(await loadProjects(file)).toEqual([
      { id: "hth", name: "Howl To Heaven", path: "/repos/hth" },
    ]);
  });

  it("rejects duplicate project ids", async () => {
    const file = await tempProjectsFile(
      JSON.stringify([
        { id: "hth", name: "A", path: "/a" },
        { id: "hth", name: "B", path: "/b" },
      ]),
    );
    await expect(loadProjects(file)).rejects.toThrow(/duplicate project id/);
  });

  it("rejects a non-array top level", async () => {
    const file = await tempProjectsFile(JSON.stringify({ id: "hth" }));
    await expect(loadProjects(file)).rejects.toThrow(/JSON array/);
  });

  it("rejects entries with missing or empty fields", async () => {
    const file = await tempProjectsFile(JSON.stringify([{ id: "hth", name: "X" }]));
    await expect(loadProjects(file)).rejects.toThrow(/"path"/);
    const empty = await tempProjectsFile(JSON.stringify([{ id: "", name: "X", path: "/x" }]));
    await expect(loadProjects(empty)).rejects.toThrow(/"id"/);
  });

  it("rejects invalid JSON and unreadable files", async () => {
    const file = await tempProjectsFile("{not json");
    await expect(loadProjects(file)).rejects.toThrow(/not valid JSON/);
    await expect(loadProjects("/definitely/missing/projects.json")).rejects.toThrow(
      /cannot read projects file/,
    );
  });
});

describe("parseProjects", () => {
  it("rejects non-object entries", () => {
    expect(() => parseProjects(["nope"], "test")).toThrow(/must be an object/);
    expect(() => parseProjects([null], "test")).toThrow(/must be an object/);
  });
});
