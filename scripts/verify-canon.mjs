#!/usr/bin/env node
/**
 * Canon verification gate — the half of invariant I9 that CI cannot run.
 *
 * The pin table in packages/compiler/src/pins.ts is a set of reviewed hashes
 * of canon bytes. Canon lives in a DIFFERENT repository (vixio-dt/howl-to-heaven),
 * so "fails the build until the pin is updated in the same commit" is not
 * expressible in this repo's CI: there is no checkout to hash against.
 *
 * This script closes the gap operationally. Run it wherever a canon checkout
 * exists (the VPS, a dev container) after ANY edit to the design prompts or
 * the pipeline spec, and before generating anything:
 *
 *     HTH_REPO_PATH=/path/to/howl-to-heaven npm run verify:canon
 *
 * Exit 0 = pins match canon. Exit 1 = canon moved without the pins, or the
 * pins moved without canon; the message names which characters drifted.
 * Never edit pins.ts to make this pass without reading the canon diff first —
 * that is the review moment the guardrail exists to create.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repo = process.env["HTH_REPO_PATH"];

if (!repo) {
  console.error(
    "verify:canon needs a canon checkout.\n" +
      "  HTH_REPO_PATH=/path/to/howl-to-heaven npm run verify:canon\n\n" +
      "Canon is a separate repository, so this check cannot run in CI. It is\n" +
      "the operator's gate: run it after any canon edit and before generating.",
  );
  process.exit(2);
}
if (!existsSync(path.join(repo, "02_art/character-design-prompts.txt"))) {
  console.error(`HTH_REPO_PATH=${repo} does not look like a howl-to-heaven checkout.`);
  process.exit(2);
}

const compilerDir = path.join(import.meta.dirname, "..", "packages", "compiler");

try {
  execFileSync("npm", ["run", "--silent", "verify:pins"], {
    cwd: compilerDir,
    stdio: "inherit",
    env: { ...process.env, HTH_REPO_PATH: repo },
  });
} catch {
  console.error(
    "\nPins do not match canon.\n" +
      "Read the canon diff, then update packages/compiler/src/pins.ts deliberately.\n" +
      "A pin update is a canon review, not a formality.",
  );
  process.exit(1);
}

console.log(`\nPins match canon at ${repo}.`);
