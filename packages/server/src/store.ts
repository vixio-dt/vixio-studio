/**
 * Git-backed project store.
 *
 * Reads are byte-oriented (Buffer in, Buffer out — never re-encoded strings),
 * writes go through a single commitEdit path that is conflict-checked against
 * a SHA-256 of the bytes the caller based its edit on. Git is always invoked
 * via execFile-style argument arrays (no shell), with cwd set to the project
 * checkout.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectConfig } from "./config.ts";

const execFileAsync = promisify(execFile);

/** A requested document path is absolute, traverses out of, or escapes the project root. */
export class PathViolationError extends Error {}

/** The requested document does not exist (or is not a regular file). */
export class DocNotFoundError extends Error {}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorMessage(err: unknown): string {
  if (isRecord(err) && typeof err["stderr"] === "string" && err["stderr"].trim() !== "") {
    return err["stderr"].trim();
  }
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isErrnoWithCode(err: unknown, code: string): boolean {
  return isRecord(err) && err["code"] === code;
}

/** Run git in the project checkout. Arguments are passed as an array — never through a shell. */
async function runGit(project: ProjectConfig, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...args], {
      cwd: project.path,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    throw new Error(`git ${args[0] ?? ""} failed in project "${project.id}": ${errorMessage(err)}`);
  }
}

interface ResolvedDocPath {
  /** realpath of the project root. */
  root: string;
  /** The validated, repo-relative path (used for git pathspecs). */
  relPath: string;
  /** Absolute path to the file, symlinks fully resolved when the file exists. */
  absPath: string;
  /** Whether the file currently exists on disk. */
  exists: boolean;
}

/**
 * Validate a repo-relative document path and resolve it to an absolute path
 * that is guaranteed to live inside the project root.
 *
 * Rejects: absolute paths, empty/NUL/backslash paths, "." and ".." segments,
 * anything that resolves outside the root after path resolution, and symlinks
 * whose real target lies outside the root.
 */
async function resolveDocPath(
  project: ProjectConfig,
  relPath: string,
  opts: { mustExist: boolean },
): Promise<ResolvedDocPath> {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new PathViolationError("document path must be a non-empty string");
  }
  if (relPath.includes("\0")) {
    throw new PathViolationError("document path must not contain NUL bytes");
  }
  if (relPath.includes("\\")) {
    throw new PathViolationError("document path must use forward slashes only");
  }
  if (path.isAbsolute(relPath)) {
    throw new PathViolationError(`document path must be relative: ${relPath}`);
  }
  for (const segment of relPath.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new PathViolationError(`document path contains an illegal segment: ${relPath}`);
    }
  }

  const root = await realpath(project.path);
  const resolved = path.resolve(root, relPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new PathViolationError(`document path escapes the project root: ${relPath}`);
  }

  let absPath = resolved;
  let exists = true;
  try {
    absPath = await realpath(resolved);
  } catch (err) {
    if (isErrnoWithCode(err, "ENOENT")) {
      if (opts.mustExist) {
        throw new DocNotFoundError(`no such document: ${relPath}`);
      }
      exists = false;
      // The file itself is gone (e.g. a deleted path being asked for history);
      // still refuse if an existing parent directory is a symlink escaping the root.
      try {
        const realParent = await realpath(path.dirname(resolved));
        if (realParent !== root && !realParent.startsWith(root + path.sep)) {
          throw new PathViolationError(`document path escapes the project root: ${relPath}`);
        }
      } catch (parentErr) {
        if (parentErr instanceof PathViolationError) throw parentErr;
        // Parent missing too — nothing more to check; git will simply find no history.
      }
    } else {
      throw err;
    }
  }
  if (exists && absPath !== root && !absPath.startsWith(root + path.sep)) {
    throw new PathViolationError(`document path escapes the project root (symlink): ${relPath}`);
  }

  return { root, relPath, absPath, exists };
}

export interface DocRead {
  bytes: Buffer;
  sha256: string;
  size: number;
}

/** Read a document's exact bytes plus their SHA-256 and size. */
export async function readDoc(project: ProjectConfig, relPath: string): Promise<DocRead> {
  const resolved = await resolveDocPath(project, relPath, { mustExist: true });
  const st = await stat(resolved.absPath);
  if (!st.isFile()) {
    throw new DocNotFoundError(`not a regular file: ${relPath}`);
  }
  const bytes = await readFile(resolved.absPath);
  return { bytes, sha256: sha256Hex(bytes), size: bytes.length };
}

export interface DocEntry {
  relPath: string;
  size: number;
}

/**
 * List tracked documents via `git ls-files` so ignored/untracked files never
 * appear. Entries that no longer exist on disk, are not regular files, or are
 * symlinks escaping the root are skipped.
 */
export async function listDocs(project: ProjectConfig): Promise<DocEntry[]> {
  const out = await runGit(project, ["ls-files", "-z"]);
  const entries: DocEntry[] = [];
  for (const rel of out.split("\0")) {
    if (rel.length === 0) continue;
    try {
      const resolved = await resolveDocPath(project, rel, { mustExist: true });
      const st = await stat(resolved.absPath);
      if (st.isFile()) {
        entries.push({ relPath: rel, size: st.size });
      }
    } catch (err) {
      if (err instanceof PathViolationError || err instanceof DocNotFoundError) continue;
      throw err;
    }
  }
  return entries;
}

export interface CommitEditInput {
  relPath: string;
  /** SHA-256 (hex) of the bytes the edit was based on. */
  baseSha256: string;
  /** The complete new file content, written verbatim — no encoding transforms. */
  newBytes: Buffer;
  /** Commit message. Passed to git as an argv element, never shell-interpolated. */
  message: string;
}

export type CommitEditResult =
  | { status: "conflict"; currentSha256: string }
  | { status: "unchanged"; sha256: string }
  | { status: "committed"; commitSha: string; newSha256: string };

/**
 * Write serialization: all commitEdit calls for the same project run one at
 * a time, so the sha-check → write → commit sequence can't interleave with
 * another edit's (in this process; a multi-process deployment would need a
 * repo-level lock instead).
 */
const projectWriteChains = new Map<string, Promise<unknown>>();

const withProjectWriteLock = async <T>(
  projectId: string,
  work: () => Promise<T>,
): Promise<T> => {
  const previous = projectWriteChains.get(projectId) ?? Promise.resolve();
  const run = previous.then(work, work);
  // Keep the chain alive regardless of this run's outcome.
  projectWriteChains.set(
    projectId,
    run.catch(() => undefined),
  );
  return run;
};

/**
 * The byte-exact write path:
 *  1. read the current bytes;
 *  2. if their SHA-256 differs from baseSha256 → conflict, nothing written;
 *  3. if newBytes are identical to the current bytes → unchanged, no commit;
 *  4. write newBytes exactly as given;
 *  5. `git add` + `git commit` (argv arrays, cwd = project checkout);
 *  6. on commit failure, best-effort restore of the previous bytes.
 * The whole sequence holds the project's write lock.
 */
export async function commitEdit(
  project: ProjectConfig,
  input: CommitEditInput,
): Promise<CommitEditResult> {
  return withProjectWriteLock(project.id, () => commitEditLocked(project, input));
}

async function commitEditLocked(
  project: ProjectConfig,
  input: CommitEditInput,
): Promise<CommitEditResult> {
  const { relPath, baseSha256, newBytes, message } = input;
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("commit message must be a non-empty string");
  }

  const resolved = await resolveDocPath(project, relPath, { mustExist: true });
  const st = await stat(resolved.absPath);
  if (!st.isFile()) {
    throw new DocNotFoundError(`not a regular file: ${relPath}`);
  }

  const currentBytes = await readFile(resolved.absPath);
  const currentSha256 = sha256Hex(currentBytes);
  if (currentSha256 !== baseSha256) {
    return { status: "conflict", currentSha256 };
  }

  const newSha256 = sha256Hex(newBytes);
  if (newSha256 === currentSha256) {
    // Identical bytes: nothing to write, and `git commit` would fail with
    // "nothing to commit" — report a graceful no-op instead.
    return { status: "unchanged", sha256: currentSha256 };
  }
  await writeFile(resolved.absPath, newBytes);
  try {
    await runGit(project, ["add", "--", resolved.relPath]);
    await runGit(project, ["commit", "-m", message, "--", resolved.relPath]);
  } catch (commitErr) {
    let rollbackErr: unknown;
    try {
      await writeFile(resolved.absPath, currentBytes);
      // Re-stage the restored bytes so the index matches the worktree again.
      await runGit(project, ["add", "--", resolved.relPath]);
    } catch (err) {
      rollbackErr = err;
    }
    const base = `commitEdit failed for ${relPath}: ${errorMessage(commitErr)}`;
    if (rollbackErr !== undefined) {
      throw new Error(`${base}; rollback also failed: ${errorMessage(rollbackErr)}`);
    }
    throw new Error(`${base} (previous bytes restored)`);
  }

  const commitSha = (await runGit(project, ["rev-parse", "HEAD"])).trim();
  return { status: "committed", commitSha, newSha256 };
}

export interface LogEntry {
  sha: string;
  /** Author date, ISO 8601. */
  date: string;
  subject: string;
}

/** Commit history for one document, newest first. */
export async function gitLog(
  project: ProjectConfig,
  relPath: string,
  limit = 20,
): Promise<LogEntry[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  const resolved = await resolveDocPath(project, relPath, { mustExist: false });
  const out = await runGit(project, [
    "log",
    "-n",
    String(limit),
    "--format=%H%x1f%aI%x1f%s",
    "--",
    resolved.relPath,
  ]);
  const entries: LogEntry[] = [];
  for (const line of out.split("\n")) {
    if (line.length === 0) continue;
    const parts = line.split("\u001f");
    entries.push({ sha: parts[0] ?? "", date: parts[1] ?? "", subject: parts[2] ?? "" });
  }
  return entries;
}
