import { readSource } from "@vixio/content-model";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_ASPECT_RATIOS,
  assertVerbatim,
  checkRequiredSubstrings,
  compilePanelPrompt,
  DEFAULT_PINS,
  sha256Hex,
  type CastMemberInput,
  type CompileInput,
  type CompileResult,
  type PinTable,
  type Refusal,
} from "../src/compile.ts";

/**
 * All fixture content is synthetic — invented for these tests, nothing
 * copied from the real canon files (content-model test convention).
 */

const STYLE_TEXT =
  "Fixture-school dark TV still, gritty test production.\n" +
  "Rough kinetic fixture lineart, hard-edged two-tone test shadows,\n" +
  "cold muted fixture grade, subtle test grain.";

const PINNED_CORE =
  "Fixture boy, age 14, small-for-his-age, wiry build, ink-black bowl cut, " +
  "patched indigo fixture jacket.";

const SECOND_CORE =
  "Fixture elder, weathered angular face, grey topknot, storm-grey fixture robe.";

const member = (overrides: Partial<CastMemberInput> = {}): CastMemberInput => ({
  id: "char:9-fixture-boy",
  name: "FIXTURE BOY",
  coreRaw: PINNED_CORE,
  negativeRaw: "no adult proportions, no beard, no fixture armor",
  anchorElementId: "el_fixture_boy_v1",
  corePinnedSha256: sha256Hex(PINNED_CORE),
  ...overrides,
});

const secondMember = (overrides: Partial<CastMemberInput> = {}): CastMemberInput => ({
  id: "char:10-fixture-elder",
  name: "FIXTURE ELDER",
  coreRaw: SECOND_CORE,
  negativeRaw: "no youthful features, no fixture armor",
  anchorElementId: "el_fixture_elder_v1",
  corePinnedSha256: sha256Hex(SECOND_CORE),
  ...overrides,
});

const baseInput = (): CompileInput => ({
  styleLock: { text: STYLE_TEXT, sha256: sha256Hex(STYLE_TEXT) },
  cast: [member()],
  set: {
    name: "FIXTURE STAGE",
    raw: "A timber fixture opera stage, red lacquer pillars, paper test lanterns.",
  },
  colorRules: "Muted fixture palette; vermilion reserved for the paper lanterns.",
  direction: [
    "single panel, full color, no text or balloons",
    "low fixture angle, dust motes in a hard spotlight",
  ],
  shot: "The fixture boy lands mid-stage, a ring of dust flaring around his boots.",
  aspectRatio: "4:3",
});

/**
 * The reviewed-pin table for the synthetic fixtures. Production callers use
 * DEFAULT_PINS (the real repo's constants); tests inject this one — passing
 * a table is the explicit seam, defaulting is the guarantee.
 */
const TEST_PINS: PinTable = {
  styleLock: sha256Hex(STYLE_TEXT),
  core: {
    "FIXTURE BOY": sha256Hex(PINNED_CORE),
    "FIXTURE ELDER": sha256Hex(SECOND_CORE),
  },
};

const compile = (input: CompileInput, pins: PinTable = TEST_PINS): CompileResult =>
  compilePanelPrompt(input, pins);

const slugsOf = (result: CompileResult): string[] =>
  result.ok ? [] : result.refusals.map((refusal: Refusal) => refusal.invariant);

const expectRefused = (result: CompileResult): Refusal[] => {
  expect(result.ok).toBe(false);
  // A refused compile carries NO prompt in any form.
  expect("prompt" in result).toBe(false);
  expect("blocks" in result).toBe(false);
  return result.ok ? [] : result.refusals;
};

describe("compilePanelPrompt — happy path", () => {
  it("emits exactly five blocks in fixed order with byte-identical verbatim spans", () => {
    const input = baseInput();
    const result = compile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.blocks).toHaveLength(5);
    expect(result.prompt).toBe(result.blocks.join("\n\n"));

    // STYLE LOCK leads, verbatim, at byte 0 (I1/I3).
    expect(result.blocks[0]).toBe(STYLE_TEXT);
    expect(result.prompt.indexOf(STYLE_TEXT)).toBe(0);

    // Fixed order asserted via indexOf ordering of unique verbatim spans.
    const styleAt = result.prompt.indexOf(STYLE_TEXT);
    const coreAt = result.prompt.indexOf(PINNED_CORE);
    const directionAt = result.prompt.indexOf("low fixture angle, dust motes");
    const shotAt = result.prompt.indexOf(input.shot);
    const negativeAt = result.prompt.indexOf("no adult proportions");
    expect(styleAt).toBeGreaterThanOrEqual(0);
    expect(coreAt).toBeGreaterThan(styleAt);
    expect(directionAt).toBeGreaterThan(coreAt);
    expect(shotAt).toBeGreaterThan(directionAt);
    expect(negativeAt).toBeGreaterThan(shotAt);

    // Verbatim inclusion of every source span (I2).
    expect(result.prompt.includes(PINNED_CORE)).toBe(true);
    expect(result.prompt.includes(input.set!.raw)).toBe(true);
    expect(result.prompt.includes(input.colorRules!)).toBe(true);
  });

  it("assembles each block exactly as specified", () => {
    const input = baseInput();
    const result = compile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.blocks[1]).toBe(
      `${PINNED_CORE}\n\n${input.set!.raw}\n\n${input.colorRules!}`,
    );
    expect(result.blocks[2]).toBe(input.direction.join("\n"));
    expect(result.blocks[3]).toBe(input.shot);
    expect(result.blocks[4]).toBe("no adult proportions, no beard, no fixture armor");
  });

  it("keeps CONTINUITY in cast order and unions duplicate NEGATIVE entries", () => {
    const input = baseInput();
    const sharedNegative = "no fixture armor, no watermark";
    input.cast = [
      member({ negativeRaw: sharedNegative }),
      secondMember({ negativeRaw: sharedNegative }),
    ];
    const result = compile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.prompt.indexOf(PINNED_CORE)).toBeLessThan(result.prompt.indexOf(SECOND_CORE));
    // Union: the identical negative emits exactly once.
    expect(result.blocks[4]).toBe(sharedNegative);
  });

  it("compiles with cast but no set and no color rules", () => {
    const input = baseInput();
    input.set = null;
    input.colorRules = null;
    const result = compile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks[1]).toBe(PINNED_CORE);
  });

  it("uses the same byte-hashing convention as @vixio/content-model", () => {
    expect(readSource(Buffer.from(STYLE_TEXT, "utf-8")).sha256).toBe(sha256Hex(STYLE_TEXT));
  });
});

describe("style-lock-hash", () => {
  it("refuses when the style lock text does not hash to the pinned sha256", () => {
    const input = baseInput();
    input.styleLock = {
      text: STYLE_TEXT + " (helpfully rewrapped)",
      sha256: sha256Hex(STYLE_TEXT),
    };
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toContain("style-lock-hash");
  });

  it("refuses when the pinned hash itself is wrong for the frozen text", () => {
    const input = baseInput();
    input.styleLock = { text: STYLE_TEXT, sha256: "deadbeef" };
    const result = compile(input);
    expect(slugsOf(result)).toEqual(["style-lock-hash"]);
  });
});

describe("core-drift — the softening guard (guardrail a)", () => {
  it("refuses a coreRaw whose age adjectives were reworded against the pin, with no prompt output", () => {
    // Simulates the documented failure: the pinned original says
    // "age 14, small-for-his-age"; a caller "softens" it to dodge a filter.
    const softened =
      "A slight young fixture performer, delicate build, ink-black bowl cut, " +
      "patched indigo fixture jacket.";
    const input = baseInput();
    input.cast = [
      member({ coreRaw: softened, corePinnedSha256: sha256Hex(PINNED_CORE) }),
    ];
    const result = compile(input);
    const refusals = expectRefused(result);
    // Both halves of the guard fire: drift against the caller's pin AND
    // mismatch against the reviewed table.
    expect(refusals.map((r) => r.invariant)).toEqual(["core-drift", "pin-mismatch"]);
    // NEVER auto-repaired: the result carries no prompt anywhere.
    expect(JSON.stringify(result).includes("slight young fixture performer")).toBe(false);
    expect(JSON.stringify(result).includes("age 14")).toBe(false);
  });

  it("accepts a changed core only when caller pin AND reviewed table move together", () => {
    const editedCore = "Fixture boy, age 15, still small-for-his-age, wiry build.";
    const input = baseInput();
    input.cast = [member({ coreRaw: editedCore, corePinnedSha256: sha256Hex(editedCore) })];
    // Caller pin alone is NOT enough — the reviewed table still refuses.
    expect(slugsOf(compile(input))).toEqual(["pin-mismatch"]);
    // The deliberate canon edit updates the reviewed table in the same
    // commit; only then does the new core compile.
    const updatedPins: PinTable = {
      styleLock: TEST_PINS.styleLock,
      core: { ...TEST_PINS.core, "FIXTURE BOY": sha256Hex(editedCore) },
    };
    expect(compile(input, updatedPins).ok).toBe(true);
  });
});

describe("per-member integrity", () => {
  it("refuses an empty coreRaw (core-empty)", () => {
    const input = baseInput();
    input.cast = [member({ coreRaw: "" })];
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toContain("core-empty");
  });

  it("refuses a whitespace-only coreRaw (core-empty)", () => {
    const input = baseInput();
    input.cast = [member({ coreRaw: "   \n  " })];
    expect(slugsOf(compile(input))).toContain("core-empty");
  });

  it("refuses an empty negativeRaw (negative-missing)", () => {
    const input = baseInput();
    input.cast = [member({ negativeRaw: "" })];
    expect(slugsOf(compile(input))).toEqual(["negative-missing"]);
  });

  it("refuses a runtime-absent negativeRaw (negative-missing)", () => {
    const input = baseInput();
    input.cast = [member({ negativeRaw: undefined as unknown as string })];
    expect(slugsOf(compile(input))).toContain("negative-missing");
  });
});

describe("staging gates (guardrail c)", () => {
  it("refuses a text-only panel: no cast and no set (stage-text-only)", () => {
    const input = baseInput();
    input.cast = [];
    input.set = null;
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toContain("stage-text-only");
  });

  it("accepts a set-only panel (a set is not text alone)", () => {
    const input = baseInput();
    input.cast = [];
    expect(compile(input).ok).toBe(true);
  });

  it("refuses an unanchored cast member (stage-anchor-missing)", () => {
    const input = baseInput();
    input.cast = [member({ anchorElementId: null })];
    expect(slugsOf(compile(input))).toEqual(["stage-anchor-missing"]);
  });

  it("still refuses under probe: true when the member does not opt in", () => {
    const input = baseInput();
    input.probe = true;
    input.cast = [member({ anchorElementId: null })];
    expect(slugsOf(compile(input))).toEqual(["stage-anchor-missing"]);
  });

  it("still refuses allowUnanchored without a probe compile", () => {
    const input = baseInput();
    input.cast = [member({ anchorElementId: null, allowUnanchored: true })];
    expect(slugsOf(compile(input))).toEqual(["stage-anchor-missing"]);
  });

  it("allows an unanchored member only for probe + allowUnanchored", () => {
    const input = baseInput();
    input.probe = true;
    input.cast = [member({ anchorElementId: null, allowUnanchored: true })];
    expect(compile(input).ok).toBe(true);
  });
});

describe("franchise-denylist (I4)", () => {
  it("refuses a multi-word term straddling a block boundary (whole-buffer scan)", () => {
    // "jujutsu" ends CONTINUITY (via colorRules) and "kaisen" begins
    // DIRECTION; the \n\n block join satisfies the pattern's \s+, so a
    // per-block scan would compile this clean. The scan must run over the
    // joined outbound buffer (reviewer gate blocker, spec I4).
    const input = baseInput();
    input.colorRules = "Muted palette homage to jujutsu";
    input.direction = ["kaisen-grade impact frames", "low angle"];
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toEqual(["franchise-denylist"]);
    expect(refusals[0]!.message).toContain("across a block boundary");

    // The same straddle across SHOT → NEGATIVE.
    const input2 = baseInput();
    input2.shot = "He faces the demon";
    input2.cast = [member({ negativeRaw: "slayer tropes, no watermark" })];
    const refusals2 = expectRefused(compile(input2));
    expect(refusals2.map((r) => r.invariant)).toEqual(["franchise-denylist"]);
  });

  it("refuses a Latin franchise name in the SHOT block, case-insensitively", () => {
    const input = baseInput();
    input.shot = "The boy strikes a pose straight out of jujutsu kaisen.";
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toEqual(["franchise-denylist"]);
    expect(refusals[0]!.message).toContain("SHOT");
  });

  it("refuses JJK in the DIRECTION block", () => {
    const input = baseInput();
    input.direction = ["match the JJK lineart energy"];
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toEqual(["franchise-denylist"]);
    expect(refusals[0]!.message).toContain("DIRECTION");
  });

  it("refuses Bleach in the NEGATIVE block", () => {
    const input = baseInput();
    input.cast = [member({ negativeRaw: "no Bleach-style shinigami robes" })];
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toEqual(["franchise-denylist"]);
    expect(refusals[0]!.message).toContain("NEGATIVE");
  });

  it("refuses CJK franchise names in the CONTINUITY block", () => {
    const input = baseInput();
    input.set = { name: "FIXTURE STAGE", raw: "戲台佈景，牆上貼住咒術回戰海報。" };
    expect(slugsOf(compile(input))).toEqual(["franchise-denylist"]);

    const tainted = "Fixture boy, 鬼滅 fan, age 14.";
    const input2 = baseInput();
    // Caller pin AND reviewed table both bless the tainted bytes, so the
    // denylist is isolated as the only refusal.
    input2.cast = [member({ coreRaw: tainted, corePinnedSha256: sha256Hex(tainted) })];
    const taintedPins: PinTable = {
      styleLock: TEST_PINS.styleLock,
      core: { ...TEST_PINS.core, "FIXTURE BOY": sha256Hex(tainted) },
    };
    expect(slugsOf(compile(input2, taintedPins))).toEqual(["franchise-denylist"]);
  });

  it("refuses Demon Slayer and 呪術廻戦 wherever they appear", () => {
    const input = baseInput();
    input.shot = "A demon slayer stance under the lanterns.";
    input.direction = ["呪術廻戦風の構図"];
    const refusals = expectRefused(compile(input));
    const slugs = refusals.map((r) => r.invariant);
    expect(slugs.filter((s) => s === "franchise-denylist")).toHaveLength(2);
  });

  it("denies 死神 only as a title adjacent to Bleach", () => {
    const alone = baseInput();
    alone.shot = "戲台深處，佢望見死神一樣嘅黑影。";
    expect(compile(alone).ok).toBe(true);

    const titled = baseInput();
    titled.shot = "牆上係死神 Bleach 嘅海報。";
    const refusals = expectRefused(compile(titled));
    // Both the adjacency rule and the bare Bleach rule fire — all collected.
    expect(refusals.every((r) => r.invariant === "franchise-denylist")).toBe(true);
    expect(refusals.length).toBeGreaterThanOrEqual(2);
  });

  it("does not false-positive on the ordinary word 'bleached'", () => {
    const input = baseInput();
    input.shot = "Sun-bleached timber boards, a bleached banner overhead.";
    expect(compile(input).ok).toBe(true);
  });
});

describe("superseded-source", () => {
  it("refuses a superseded flag leaked deep inside a nested extra field", () => {
    const input = baseInput();
    const castMember = member() as CastMemberInput & Record<string, unknown>;
    castMember["legacy"] = {
      note: "old style block A",
      meta: { superseded: true },
    };
    input.cast = [castMember];
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toEqual(["superseded-source"]);
    expect(refusals[0]!.message).toContain("cast[0].legacy.meta");
  });

  it("refuses superseded: true at the top level", () => {
    const input = baseInput() as CompileInput & Record<string, unknown>;
    input["superseded"] = true;
    expect(slugsOf(compile(input))).toEqual(["superseded-source"]);
  });

  it("ignores superseded: false and unknown extra fields", () => {
    const input = baseInput();
    const set = input.set as NonNullable<CompileInput["set"]> & Record<string, unknown>;
    set["superseded"] = false;
    set["extraField"] = { anything: "goes" };
    expect(compile(input).ok).toBe(true);
  });
});

describe("aspect-unknown", () => {
  it("accepts every ratio in the allowed set", () => {
    for (const ratio of ALLOWED_ASPECT_RATIOS) {
      const input = baseInput();
      input.aspectRatio = ratio;
      expect(compile(input).ok).toBe(true);
    }
  });

  it("refuses a ratio outside the allowed set", () => {
    const input = baseInput();
    input.aspectRatio = "9:16";
    const refusals = expectRefused(compile(input));
    expect(refusals.map((r) => r.invariant)).toEqual(["aspect-unknown"]);

    const empty = baseInput();
    empty.aspectRatio = "";
    expect(slugsOf(compile(empty))).toEqual(["aspect-unknown"]);
  });
});

describe("shot-empty", () => {
  it("refuses an empty or whitespace-only shot", () => {
    const input = baseInput();
    input.shot = "";
    expect(slugsOf(compile(input))).toEqual(["shot-empty"]);

    const blank = baseInput();
    blank.shot = "   \n ";
    expect(slugsOf(compile(blank))).toEqual(["shot-empty"]);
  });
});

describe("multi-refusal collection", () => {
  it("collects every violation, not just the first", () => {
    const input = baseInput();
    input.styleLock = { text: STYLE_TEXT, sha256: "0000" };
    input.cast = [
      member({
        coreRaw: "A softened fixture description.",
        corePinnedSha256: sha256Hex(PINNED_CORE),
        anchorElementId: null,
      }),
    ];
    input.shot = "";
    input.aspectRatio = "5:4";
    const refusals = expectRefused(compile(input));
    const slugs = refusals.map((r) => r.invariant);
    expect(slugs).toContain("style-lock-hash");
    expect(slugs).toContain("core-drift");
    expect(slugs).toContain("stage-anchor-missing");
    expect(slugs).toContain("shot-empty");
    expect(slugs).toContain("aspect-unknown");
    expect(refusals.length).toBeGreaterThanOrEqual(5);
  });
});

describe("assertVerbatim", () => {
  it("returns silently when the source is a contiguous byte-identical substring", () => {
    expect(() => assertVerbatim("age 14, small", "boy, age 14, small-for-his-age")).not.toThrow();
    expect(() => assertVerbatim("", "anything")).not.toThrow();
  });

  it("reports the byte position of the first divergence", () => {
    // Common prefix "age 1" is 5 bytes; source then has 0x34 ('4'),
    // the prompt has 0x35 ('5').
    expect(() => assertVerbatim("age 14, small", "boy, age 15, small")).toThrow(
      /source byte 5.*0x34.*0x35/,
    );
  });

  it("reports byte offsets through multi-byte CJK divergence", () => {
    // 小神 = 6 UTF-8 bytes of common prefix; divergence at source byte 6.
    expect(() => assertVerbatim("小神甲", "台上小神乙企定")).toThrow(/source byte 6/);
  });

  it("reports when no prefix of the source appears at all", () => {
    expect(() => assertVerbatim("zzz", "abc")).toThrow(/no prefix of the source/);
  });
});

describe("required-substring (post-assembly gate)", () => {
  it("refuses when a downstream mutation broke a verbatim span", () => {
    const input = baseInput();
    const compiled = compile(input);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    // Simulate a later normalization pass rewording the age clause.
    const mutated = compiled.prompt.replace("age 14, small-for-his-age", "aged fourteen, petite");
    const refusals = checkRequiredSubstrings(input, mutated);
    expect(refusals.map((r) => r.invariant)).toEqual(["required-substring"]);
    expect(refusals[0]!.message).toContain("char:9-fixture-boy");
  });

  it("is clean on the compiler's own assembly", () => {
    const input = baseInput();
    const compiled = compile(input);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(checkRequiredSubstrings(input, compiled.prompt)).toEqual([]);
  });
});
