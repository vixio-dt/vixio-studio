/**
 * Temp git repo fixture for store/app tests. Never touches any real checkout:
 * everything lives under a fresh mkdtemp directory that is removed on cleanup.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectConfig } from "../src/config.ts";

const execFileAsync = promisify(execFile);

export const CJK_DOC_PATH = "canon/world-rules.md";
/** U+3000 ideographic-space indentation + CJK + fullwidth punctuation. */
export const CJK_DOC_TEXT =
  "# 世界規則 v1.0\n" +
  "　　第一章　狼與燈籠\n" +
  "　　「你聽見了嗎？」她問。\n" +
  "　　——聽見了，那盏紙蓮燈。\n";

export const PLAIN_DOC_PATH = "notes.md";
export const PLAIN_DOC_TEXT = "plain ascii notes\n";

export const OUTSIDE_FILE_NAME = "outside-secret.md";
export const ESCAPE_SYMLINK_PATH = "escape.md";

export interface Fixture {
  /** Temp base dir (contains the repo, the outside file, and projects.json space). */
  base: string;
  /** Path to the git repo checkout. */
  repo: string;
  project: ProjectConfig;
  git: (...args: string[]) => Promise<string>;
  cleanup: () => Promise<void>;
}

export async function makeFixture(): Promise<Fixture> {
  const base = await mkdtemp(path.join(os.tmpdir(), "vixio-server-test-"));
  const repo = path.join(base, "repo");
  await mkdir(repo);

  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync("git", args, { cwd: repo });
    return stdout;
  };

  await git("init", "-q");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Vixio Test");
  await git("config", "commit.gpgsign", "false");

  await mkdir(path.join(repo, "canon"));
  await writeFile(path.join(repo, CJK_DOC_PATH), Buffer.from(CJK_DOC_TEXT, "utf8"));
  await writeFile(path.join(repo, PLAIN_DOC_PATH), Buffer.from(PLAIN_DOC_TEXT, "utf8"));

  // A file outside the repo plus an in-repo symlink pointing at it (untracked).
  await writeFile(path.join(base, OUTSIDE_FILE_NAME), "outside the repo\n");
  await symlink(path.join("..", OUTSIDE_FILE_NAME), path.join(repo, ESCAPE_SYMLINK_PATH));

  await git("add", "--", CJK_DOC_PATH, PLAIN_DOC_PATH);
  await git("commit", "-q", "-m", "init fixture");

  const project: ProjectConfig = { id: "hth", name: "Howl To Heaven", path: repo };

  return {
    base,
    repo,
    project,
    git,
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}
