/**
 * Project registry configuration.
 *
 * The server serves one or more git-backed projects. Which projects exist is
 * declared in a JSON file (an array of { id, name, path } records) whose
 * location comes from the VIXIO_PROJECTS_FILE environment variable, defaulting
 * to ./projects.json relative to the server's working directory.
 */
import { readFile } from "node:fs/promises";

export interface ProjectConfig {
  /** Stable identifier used in URLs, e.g. "howl-to-heaven". */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Filesystem path to the project's git checkout on this host. */
  path: string;
}

const DEFAULT_PROJECTS_FILE = "./projects.json";

/** Resolve which projects file to load: explicit arg > env var > default. */
export function projectsFilePath(explicitPath?: string): string {
  if (explicitPath !== undefined && explicitPath !== "") {
    return explicitPath;
  }
  const fromEnv = process.env["VIXIO_PROJECTS_FILE"];
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  return DEFAULT_PROJECTS_FILE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(
  entry: Record<string, unknown>,
  key: "id" | "name" | "path",
  index: number,
  source: string,
): string {
  const value = entry[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `projects file ${source}: entry ${index} must have a non-empty string "${key}"`,
    );
  }
  return value;
}

/** Validate the raw parsed JSON into a list of ProjectConfig. */
export function parseProjects(raw: unknown, source: string): ProjectConfig[] {
  if (!Array.isArray(raw)) {
    throw new Error(`projects file ${source}: top level must be a JSON array`);
  }
  const projects: ProjectConfig[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const entry: unknown = raw[i];
    if (!isRecord(entry)) {
      throw new Error(`projects file ${source}: entry ${i} must be an object`);
    }
    const id = requireNonEmptyString(entry, "id", i, source);
    const name = requireNonEmptyString(entry, "name", i, source);
    const path = requireNonEmptyString(entry, "path", i, source);
    if (seenIds.has(id)) {
      throw new Error(`projects file ${source}: duplicate project id "${id}"`);
    }
    seenIds.add(id);
    projects.push({ id, name, path });
  }
  return projects;
}

/** Load and validate the project registry from disk. */
export async function loadProjects(explicitPath?: string): Promise<ProjectConfig[]> {
  const file = projectsFilePath(explicitPath);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`cannot read projects file ${file}: ${reason}`, { cause: err });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`projects file ${file} is not valid JSON`);
  }
  return parseProjects(raw, file);
}
