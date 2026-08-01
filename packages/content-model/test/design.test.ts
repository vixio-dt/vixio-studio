import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseDesignDoc } from "../src/design.ts";
import { readSource, serializeLines } from "../src/lines.ts";

const SEP = "━".repeat(23);

/**
 * Synthetic fixture exercising the documented hazards without shipping canon:
 * region-scoped parsing (an entry-shaped line inside Usage Rules and prop
 * markers shaped exactly like `CORE BLOCK:` must not become entries or
 * sub-blocks), an inline NEGATIVE with a continuation line, a wrapped
 * VARIANT header terminating only at its line-ending colon, a
 * marker-boundary payload chain with no blank lines (variant→palette→
 * negative), mixed-case prose lookalikes (`Palette:`) staying inside CORE,
 * a wrapped Set Blocks region heading, SET sub-versions, and superseded
 * style blocks.
 */
const FIXTURE = [
  "VIXIO CREATIVES | HOWL TO HEAVEN《哮天》",
  "Document: Synthetic Design Fixture",
  "Version v9 | Status: test",
  "(v9: synthetic changelog line — stays in the prelude)",
  "",
  SEP,
  "Usage Rules",
  "",
  "1. Keep CORE BLOCK text separate from STYLE BLOCK text.",
  "3. NEVER DO THIS",
  "",
  SEP,
  "1. ALPHA",
  "",
  "CORE BLOCK:",
  "ALPHA — first test subject, drawn plain.",
  "Palette: chalk white.",
  "",
  "NEGATIVE: no halos, no wings,",
  "no capes.",
  "",
  "VARIANT — LONG NAME (wrapped across two",
  "physical lines for the test):",
  '"alpha in festival dress."',
  "PALETTE (this panel only): chalk and soot.",
  "NEGATIVE (this panel only): no color.",
  "",
  SEP,
  "2. BETA GAMMA (paper puppet)",
  "",
  "CORE BLOCK:",
  "BETA GAMMA — second test subject.",
  "",
  "NEGATIVE: no strings visible.",
  "",
  SEP,
  "Set Blocks (two synthetic sets over",
  "two physical lines)",
  "",
  "SET 1 — TEST YARD (a yard)",
  '"a test yard payload."',
  "",
  "SET 2 — TEST HALL",
  'Stage version: "the hall lit."',
  'Backstage version: "the hall dark,',
  'second line."',
  "",
  SEP,
  "Prop Blocks (payload markers that must not leak)",
  "",
  "SOMETHING:",
  '"a something payload line."',
  "OTHER THING:",
  '"another payload."',
  "",
  SEP,
  "Style Blocks (choose one, append after the CORE BLOCK)",
  "",
  "STYLE BLOCK A (flat):",
  '"flat style payload."',
  "",
  "STYLE BLOCK B (round):",
  '"round style payload."',
  "",
].join("\n");

describe("parseDesignDoc", () => {
  const source = readSource(Buffer.from(FIXTURE, "utf-8"));
  const doc = parseDesignDoc(source);

  it("round-trips byte-exactly through the line model", () => {
    expect(serializeLines(source.lines)).toBe(FIXTURE);
  });

  it("finds the regions in file order", () => {
    expect(doc.regions.map((r) => r.kind)).toEqual([
      "usage-rules",
      "character",
      "character",
      "sets",
      "props",
      "styles",
    ]);
    expect(doc.regions[3]!.headingRaw).toBe("Set Blocks (two synthetic sets over\ntwo physical lines)");
  });

  it("scopes parsing to regions — lookalikes never leak into entries", () => {
    // `3. NEVER DO THIS` matches the entry-heading grammar but sits inside
    // Usage Rules; `SOMETHING:` is shaped exactly like `CORE BLOCK:` but sits
    // in the props region. Neither may create an entry or a sub-block.
    expect(doc.report.characterCount).toBe(2);
    expect(doc.characters.map((c) => c.nameLiteral)).toEqual(["ALPHA", "BETA GAMMA"]);
    expect(doc.characters[1]!.subBlocks).toHaveLength(2);
    expect(doc.props.map((p) => p.nameLiteral)).toEqual(["SOMETHING", "OTHER THING"]);
    expect(doc.props[0]!.payloadRaw).toBe('"a something payload line."');
    expect(doc.props[1]!.payloadRaw).toBe('"another payload."');
  });

  it("parses entry headings with and without a qualifier", () => {
    expect(doc.characters[0]!.ordinal).toBe(1);
    expect(doc.characters[0]!.qualifier).toBeNull();
    expect(doc.characters[1]!.ordinal).toBe(2);
    expect(doc.characters[1]!.qualifier).toBe("paper puppet");
  });

  it("takes CORE payloads from the following lines, keeping prose lookalikes inside", () => {
    const core = doc.characters[0]!.subBlocks[0]!;
    expect(core.kind).toBe("core");
    expect(core.label).toBe("CORE BLOCK");
    // `Palette: chalk white.` is mixed case, so it is payload, not a marker.
    expect(core.payloadRaw).toBe("ALPHA — first test subject, drawn plain.\nPalette: chalk white.");
  });

  it("takes NEGATIVE payloads from the same line, with continuations", () => {
    const negative = doc.characters[0]!.subBlocks[1]!;
    expect(negative.kind).toBe("negative");
    expect(negative.label).toBe("NEGATIVE");
    expect(negative.payloadRaw).toBe("no halos, no wings,\nno capes.");
  });

  it("wraps variant headers until the line-ending colon", () => {
    const variant = doc.characters[0]!.subBlocks[2]!;
    expect(variant.kind).toBe("variant");
    expect(variant.label).toBe("VARIANT — LONG NAME (wrapped across two\nphysical lines for the test)");
    expect(variant.payloadRaw).toBe('"alpha in festival dress."');
  });

  it("terminates payloads at the next marker even with no blank line between", () => {
    const kinds = doc.characters[0]!.subBlocks.map((b) => b.kind);
    expect(kinds).toEqual(["core", "negative", "variant", "palette", "negative"]);
    const palette = doc.characters[0]!.subBlocks[3]!;
    expect(palette.label).toBe("PALETTE (this panel only)");
    expect(palette.payloadRaw).toBe("chalk and soot.");
    const scopedNegative = doc.characters[0]!.subBlocks[4]!;
    expect(scopedNegative.label).toBe("NEGATIVE (this panel only)");
    expect(scopedNegative.payloadRaw).toBe("no color.");
  });

  it("parses set blocks, including labeled sub-versions", () => {
    expect(doc.sets.map((s) => [s.ordinal, s.nameLiteral, s.gloss])).toEqual([
      [1, "TEST YARD", "a yard"],
      [2, "TEST HALL", null],
    ]);
    expect(doc.sets[0]!.subVersions).toEqual([]);
    expect(doc.sets[0]!.payloadRaw).toBe('"a test yard payload."');
    const hall = doc.sets[1]!;
    expect(hall.subVersions.map((v) => v.label)).toEqual(["Stage version", "Backstage version"]);
    expect(hall.subVersions[0]!.payloadRaw).toBe('"the hall lit."');
    expect(hall.subVersions[1]!.payloadRaw).toBe('"the hall dark,\nsecond line."');
  });

  it("parses style blocks and pins them superseded", () => {
    expect(doc.styleBlocks.map((s) => [s.label, s.gloss])).toEqual([
      ["STYLE BLOCK A", "flat"],
      ["STYLE BLOCK B", "round"],
    ]);
    for (const style of doc.styleBlocks) expect(style.superseded).toBe(true);
  });

  it("keeps every payload a byte-exact substring of the source", () => {
    for (const character of doc.characters) {
      for (const block of character.subBlocks) {
        expect(source.text).toContain(block.payloadRaw);
      }
    }
    for (const prop of doc.props) expect(source.text).toContain(prop.payloadRaw);
    for (const set of doc.sets) expect(source.text).toContain(set.payloadRaw);
  });

  it("reports counts with no warnings", () => {
    expect(doc.report).toEqual({
      characterCount: 2,
      setCount: 2,
      propCount: 2,
      warnings: [],
    });
  });
});

/**
 * Canon loop: the full sweep over the real repo, present only where a
 * checkout exists (dev containers, the VPS). CI runs the synthetic fixtures
 * above; this suite is the oracle that the parser matches the actual data.
 */
const HTH = process.env["HTH_REPO_PATH"];

describe.skipIf(!HTH)("character-design-prompts.txt (real repo)", () => {
  const bytes = readFileSync(`${HTH}/02_art/character-design-prompts.txt`);
  const source = readSource(bytes);
  const doc = parseDesignDoc(source);

  it("round-trips byte-exactly", () => {
    expect(Buffer.from(serializeLines(source.lines), "utf-8").equals(bytes)).toBe(true);
  });

  it("reads the v4 English-dialect header", () => {
    expect(doc.header.docTitle).toBe("Art Generation Prompts (Characters, Sets, Props)");
    expect(doc.header.version).toBe("v4");
    expect(doc.header.status.startsWith("current")).toBe(true);
  });

  it("finds the 15 audited regions in order", () => {
    expect(doc.regions.map((r) => r.kind)).toEqual([
      "usage-rules",
      "render-specs",
      "character",
      "character",
      "character",
      "character",
      "character",
      "character",
      "character",
      "character",
      "sets",
      "props",
      "styles",
      "key-frame",
      "color-rules",
    ]);
  });

  it("parses exactly the eight audited characters", () => {
    expect(doc.report.characterCount).toBe(8);
    expect(doc.characters.map((c) => c.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(doc.characters.map((c) => c.nameLiteral)).toEqual([
      "XIAOTIAN",
      "SHENGTIAN",
      "THE MASTER",
      "THE WOMAN",
      "BLACKIE",
      "THE ENFORCER",
      "THE OLD FACE",
      "THE GATE OFFICER",
    ]);
    expect(doc.characters.map((c) => c.qualifier)).toEqual([
      null,
      "stage costume",
      "opera troupe leader",
      "fake mother",
      "the dog",
      "teen gang member",
      null,
      null,
    ]);
  });

  it("gives every character at least one CORE BLOCK and one NEGATIVE", () => {
    for (const character of doc.characters) {
      expect(character.subBlocks.some((b) => b.kind === "core")).toBe(true);
      expect(character.subBlocks.some((b) => b.kind === "negative")).toBe(true);
    }
    // 8 CORE + 9 NEGATIVE + 5 VARIANT + 1 PALETTE + 1 RENDERING NOTE.
    expect(doc.characters.flatMap((c) => c.subBlocks)).toHaveLength(24);
  });

  it("absorbs the order-variance trap — sub-blocks by marker, never position", () => {
    const kinds = new Map(doc.characters.map((c) => [c.nameLiteral, c.subBlocks.map((b) => b.kind)]));
    expect(kinds.get("XIAOTIAN")).toEqual([
      "core",
      "negative",
      "variant",
      "variant",
      "palette",
      "negative",
    ]);
    expect(kinds.get("SHENGTIAN")).toEqual(["core", "rendering-note", "negative", "variant"]);
    expect(kinds.get("THE WOMAN")).toEqual(["core", "variant", "negative"]);
    expect(kinds.get("THE ENFORCER")).toEqual(["core", "variant", "negative"]);
  });

  it("slices CORE and NEGATIVE payloads byte-exactly at the audited lines", () => {
    const xiaotian = doc.characters[0]!;
    const core = xiaotian.subBlocks[0]!;
    expect(core.lines).toEqual({ from: 41, to: 54 });
    expect(core.payloadRaw.startsWith("XIAOTIAN — middle-aged male drifter")).toBe(true);
    expect(core.payloadRaw.endsWith("vermillion at the brow.")).toBe(true);
    // Mixed-case `Palette:` stays inside the CORE payload.
    expect(core.payloadRaw).toContain("Palette: ink blue, slate grey, charcoal");
    const negative = xiaotian.subBlocks[1]!;
    expect(negative.payloadRaw).toBe(
      "no glowing eyes, no visible third eye, no fantasy armor,\n" +
        "no weapon, no modern clothing, no muscular hero physique.",
    );
    const shengtianCore = doc.characters[1]!.subBlocks[0]!;
    expect(shengtianCore.payloadRaw).toContain("Chinese boy, age 14, small-for-his-age");
  });

  it("parses Xiaotian's TRUE FORM replace-block with its chained palette and negative", () => {
    const xiaotian = doc.characters[0]!;
    // The v4 addition: a variant whose wrapped label names the TRUE FORM.
    const trueForm = xiaotian.subBlocks.find(
      (b) => b.kind === "variant" && b.label.includes("TRUE FORM"),
    );
    expect(trueForm).toBeDefined();
    expect(trueForm!.label).toBe(
      "VARIANT — TRUE FORM (FREEZE-FRAME ONLY; Episode Zero page 39; this\n" +
        "block REPLACES the standard Xiaotian CORE and NEGATIVE on this one\n" +
        "panel, author ruling, open-questions 15-2/15-3)",
    );
    expect(trueForm!.lines).toEqual({ from: 63, to: 73 });
    expect(trueForm!.payloadRaw.startsWith('"ERLANG SHEN as pure silhouette')).toBe(true);
    // No blank line separates the next two blocks from the variant payload —
    // the marker boundary is what splits them.
    const palette = xiaotian.subBlocks[4]!;
    expect(palette.label).toBe("PALETTE (this panel only, overrides global Color Rules)");
    expect(palette.lines).toEqual({ from: 74, to: 77 });
    const scopedNegative = xiaotian.subBlocks[5]!;
    expect(scopedNegative.label).toBe("NEGATIVE (this panel only)");
    expect(scopedNegative.lines).toEqual({ from: 78, to: 79 });
    expect(scopedNegative.payloadRaw).toBe(
      "no visible facial features, no disclosed\n" +
        "anatomy, no photorealism, no modern rendering, no digital glitch.",
    );
  });

  it("reads Shengtian's RENDERING NOTE as a 6-line wrapped header plus quoted appendix", () => {
    const note = doc.characters[1]!.subBlocks[1]!;
    expect(note.kind).toBe("rendering-note");
    expect(note.lines).toEqual({ from: 97, to: 106 });
    expect(note.label.split("\n")).toHaveLength(6);
    expect(note.label.startsWith("RENDERING NOTE (prompt-craft")).toBe(true);
    // The mid-line colon on the header's second line must not terminate it.
    expect(note.label).toContain("2026-07-30): the model's prior for");
    expect(note.label.endsWith("describe the FACE before the costume")).toBe(true);
    expect(note.payloadRaw.startsWith('"A child\'s face:')).toBe(true);
    expect(note.payloadRaw.endsWith('short limbs."')).toBe(true);
  });

  it("pins the audited set census — six sets, sub-versions on SET 2 only", () => {
    expect(doc.report.setCount).toBe(6);
    expect(doc.sets.map((s) => [s.ordinal, s.nameLiteral])).toEqual([
      [1, "TEMPLE & WALL"],
      [2, "BAMBOO THEATER"],
      [3, "WALLED CITY GATE"],
      [4, "ALLEY & STAIRWELL"],
      [5, "THE OUTER ROOM"],
      [6, "THE INNER ROOM"],
    ]);
    expect(doc.sets[0]!.gloss).toBe("Hou Wang Temple and the wall base");
    expect(doc.sets[5]!.gloss).toBe("the cold-open room");
    for (const set of doc.sets) {
      expect(set.subVersions.length).toBe(set.ordinal === 2 ? 2 : 0);
    }
    const theater = doc.sets[1]!;
    expect(theater.subVersions.map((v) => v.label)).toEqual(["Stage version", "Backstage version"]);
    expect(theater.subVersions[0]!.payloadRaw.startsWith('"Night.')).toBe(true);
    expect(theater.subVersions[1]!.payloadRaw.startsWith('"Backstage:')).toBe(true);
  });

  it("pins the audited prop census — four props, no blank lines between them", () => {
    expect(doc.report.propCount).toBe(4);
    expect(doc.props.map((p) => p.nameLiteral)).toEqual([
      "PAPER LOTUS LANTERN",
      "WOODEN STAGE AXE",
      "PAPER-WRAPPED BUN",
      "TIN BISCUIT BOX",
    ]);
    expect(doc.props[1]!.payloadRaw).toBe(
      '"child-sized wooden opera prop axe, chipped gold paint over wood,\n' +
        'stage-worn notched edge."',
    );
  });

  it("parses STYLE BLOCK A and B, both superseded, never compilable", () => {
    expect(doc.styleBlocks.map((s) => [s.label, s.gloss])).toEqual([
      ["STYLE BLOCK A", "painterly"],
      ["STYLE BLOCK B", "modern late-night seinen"],
    ]);
    for (const style of doc.styleBlocks) expect(style.superseded).toBe(true);
    expect(doc.styleBlocks[0]!.payloadRaw.startsWith('"Painterly 2D/3D hybrid')).toBe(true);
  });

  it("keeps every payload a byte-exact substring of the source", () => {
    for (const character of doc.characters) {
      for (const block of character.subBlocks) {
        expect(source.text).toContain(block.payloadRaw);
      }
    }
    for (const set of doc.sets) expect(source.text).toContain(set.payloadRaw);
    for (const prop of doc.props) expect(source.text).toContain(prop.payloadRaw);
    for (const style of doc.styleBlocks) expect(source.text).toContain(style.payloadRaw);
  });

  it("parses with no warnings", () => {
    expect(doc.report.warnings).toEqual([]);
  });
});
