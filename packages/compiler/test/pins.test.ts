import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseDesignDoc, readSource } from "@vixio/content-model";

import { compilePanelPrompt, sha256Hex, type CompileInput } from "../src/compile.ts";
import { CORE_PINS, STYLE_LOCK_SHA256 } from "../src/pins.ts";

/**
 * The pin table is the reviewed-constant half of the no-softening guardrail
 * (spec §3b(a)2): when canon changes, these tests force the hash constants
 * to change in the same commit.
 */

describe("pin-table enforcement", () => {
  const syntheticInput = (): CompileInput => ({
    styleLock: { text: "synthetic lock", sha256: sha256Hex("synthetic lock") },
    cast: [
      {
        id: "char:x",
        name: "NOBODY KNOWN",
        coreRaw: "some core",
        negativeRaw: "no things",
        anchorElementId: "el_x",
        corePinnedSha256: sha256Hex("some core"),
      },
    ],
    set: null,
    colorRules: null,
    direction: ["a line"],
    shot: "a shot",
    aspectRatio: "4:3",
  });

  it("DEFAULT_PINS refuses a caller that blesses its own bytes (non-tautology)", () => {
    // The caller hashed its own text — self-consistent, but reviewed
    // nowhere. Default pins must refuse both the style lock and the cast.
    const result = compilePanelPrompt(syntheticInput());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const slugs = result.refusals.map((r) => r.invariant);
    expect(slugs).toContain("style-lock-unpinned");
    expect(slugs).toContain("pin-unknown");
  });

  it("pin-mismatch fires when a known name carries non-pinned bytes", () => {
    const input = syntheticInput();
    input.cast[0]!.name = "XIAOTIAN";
    const result = compilePanelPrompt(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusals.map((r) => r.invariant)).toContain("pin-mismatch");
  });
});

const HTH = process.env["HTH_REPO_PATH"];

describe.skipIf(!HTH)("pins match the real repo (update pins.ts in the same commit as canon edits)", () => {
  it("CORE_PINS equals the hash of every character's CORE BLOCK payload", () => {
    const doc = parseDesignDoc(
      readSource(readFileSync(`${HTH}/02_art/character-design-prompts.txt`)),
    );
    const computed: Record<string, string> = {};
    for (const character of doc.characters) {
      const core = character.subBlocks.find((block) => block.kind === "core");
      expect(core, `character ${character.nameLiteral} has a CORE block`).toBeDefined();
      computed[character.nameLiteral] = sha256Hex(core!.payloadRaw);
    }
    expect(computed).toEqual({ ...CORE_PINS });
  });

  it("STYLE_LOCK_SHA256 equals the frozen quoted block in the pipeline spec", () => {
    const raw = readFileSync(`${HTH}/02_art/production-pipeline-spec.txt`, "utf-8");
    const match = /"(Modern Japanese dark-battle[^"]*)"/.exec(raw);
    expect(match).not.toBeNull();
    expect(sha256Hex(match![1]!)).toBe(STYLE_LOCK_SHA256);
  });
});
