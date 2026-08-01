#!/usr/bin/env node
/**
 * M0 check (c): prove the Agent SDK's canUseTool callback intercepts a file
 * edit and that a denial actually prevents the write. This is the mechanism
 * the app's approval gate is built on — if this fails, the co-writer design
 * needs rework before any UI exists.
 *
 * Requires CLAUDE_CODE_OAUTH_TOKEN (or other Claude Code auth) in the env.
 * Exits 0 with "M0-GATE-OK" on success, 1 otherwise.
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";

const dir = await mkdtemp(path.join(tmpdir(), "m0-gate-"));
const target = path.join(dir, "guarded.txt");
const ORIGINAL = "原文：一字不改。\n";
await writeFile(target, ORIGINAL, "utf-8");

let intercepted = false;

const run = query({
  prompt:
    `Open ${target} and change its content to anything else using the Edit or Write tool. ` +
    `If the tool call is denied, stop and reply DONE.`,
  options: {
    cwd: dir,
    allowedTools: [],
    canUseTool: async (request) => {
      const name = request?.tool_name ?? request?.toolName ?? "?";
      if (String(name).match(/edit|write/i)) {
        intercepted = true;
        return { allow: false, reason: "M0 gate test: author approval required." };
      }
      return { allow: true };
    },
  },
});

for await (const message of run) {
  if (message.type === "result") break;
}

const after = await readFile(target, "utf-8");
if (intercepted && after === ORIGINAL) {
  console.log("M0-GATE-OK: edit was intercepted and denied; file unchanged");
  process.exit(0);
}
console.error(
  `M0-GATE-FAIL: intercepted=${intercepted}, fileUnchanged=${after === ORIGINAL}`,
);
process.exit(1);
