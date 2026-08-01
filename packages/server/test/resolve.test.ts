/**
 * Resolution-phase tests (spec §3.1).
 *
 * The unit suites run on SYNTHETIC canon — an invented design file and an
 * invented script, both written to the same grammar the real parsers enforce.
 * No canon bytes are copied here; the only canon-shaped constants are the
 * IDENTIFIERS the resolver keys on (the name XIAOTIAN, the panel id
 * ep0_p39_g1), which are the mechanism under test.
 *
 * The env-gated suite at the bottom is the oracle: it resolves a REAL panel
 * out of /workspace/howl-to-heaven and proves that the parsers, the pinned
 * CORE hashes and the compiler all agree on real canon bytes.
 */
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { parseDesignDoc, parseScript, readSource, type ScriptDoc } from "@vixio/content-model";
import { compilePanelPrompt, sha256Hex, type PinTable, type Refusal } from "@vixio/compiler";

import { createApp } from "../src/app.ts";
import {
  characterEntityId,
  compileResolvedPanel,
  parseCompileRequest,
  resolveCompileInput,
  setEntityId,
  type AnchorRegistry,
  type PanelIndexEntry,
  type ResolveArgs,
} from "../src/resolve.ts";

/* ------------------------------------------------------------------ */
/* Synthetic canon                                                     */
/* ------------------------------------------------------------------ */

const SEP = "━".repeat(23);

/** Invented CORE payload — the byte-identity target of the happy path. */
const FIXTURE_CORE = [
  "XIAOTIAN — fixture subject: a carved wooden puppet standing on a bare",
  "table, strings slack, paint worn away at every joint — the stillness of",
  "a thing that was put down and never picked back up.",
  "Palette: bone white, dust grey; one thread of faded red at the wrist.",
].join("\n");

const FIXTURE_NEGATIVE = "no fixture drift, no borrowed bytes, no second subject.";

const FIXTURE_TRUE_FORM = [
  '"TRUE FORM: the same puppet grown tower-tall, cut out of a paper sky as',
  'pure silhouette; one lit seam down the brow, the single lit feature."',
].join("\n");

const FIXTURE_PANEL_PALETTE = [
  "flat fixture vermillion and gold behind the",
  "black silhouette; woodblock register, no other hue.",
].join("\n");

const FIXTURE_PANEL_NEGATIVE = [
  "no disclosed features, no anatomy, no",
  "photorealism.",
].join("\n");

const FIXTURE_COLOR_RULES = [
  "Fixture color rule: lamp light reads warm; the unanswered reads cold.",
  "Color mode: full color (locked). Page binding: left-to-right (locked).",
].join("\n");

const FIXTURE_STYLE_A = [
  '"Fixture painterly style: visible brushwork and invented surface texture,',
  'kept here only so that a superseded block can be asked for."',
].join("\n");

const designText = (opts: { trueForm?: boolean } = {}): string => {
  const trueFormBlock = [
    "VARIANT — TRUE FORM (FIXTURE FREEZE-FRAME ONLY; page 39; this block",
    "REPLACES the standard CORE and NEGATIVE on this one panel):",
    FIXTURE_TRUE_FORM,
    `PALETTE (this panel only, overrides global Color Rules): ${FIXTURE_PANEL_PALETTE}`,
    `NEGATIVE (this panel only): ${FIXTURE_PANEL_NEGATIVE}`,
    "",
  ];
  return (
    [
      "VIXIO CREATIVES | FIXTURE",
      "Document: Synthetic Art Prompts (fixture, not canon)",
      "Version v1 | Status: fixture",
      "",
      SEP,
      "Usage Rules",
      "",
      "1. Fixture rules only; nothing here is canon.",
      "",
      SEP,
      "1. XIAOTIAN",
      "",
      "CORE BLOCK:",
      FIXTURE_CORE,
      "",
      `NEGATIVE: ${FIXTURE_NEGATIVE}`,
      "",
      ...(opts.trueForm === false ? [] : trueFormBlock),
      SEP,
      "2. BETA",
      "",
      "CORE BLOCK:",
      "BETA — fixture subject two: a paper lantern hung on a sagging wire.",
      "",
      "NEGATIVE: no lantern drift.",
      "",
      SEP,
      "Set Blocks",
      "",
      "SET 1 — FIXTURE ROOM (a bare fixture room)",
      '"A bare room with one hanging bulb over a single wooden table."',
      "",
      "SET 2 — FIXTURE STAGE",
      'Stage version: "A lit fixture stage seen from the front."',
      'Backstage version: "The same fixture stage seen from behind."',
      "",
      SEP,
      "Style Blocks",
      "",
      "STYLE BLOCK A (fixture painterly):",
      FIXTURE_STYLE_A,
      "",
      SEP,
      "Color Rules",
      "",
      FIXTURE_COLOR_RULES,
    ].join("\n") + "\n"
  );
};

const SCRIPT_TEXT =
  [
    "VIXIO CREATIVES｜FIXTURE",
    "文件：合成分格腳本（測試用）",
    "版本 v1｜狀態：fixture",
    "格式：頁→格。",
    "",
    SEP,
    "序幕（第1至39頁）",
    "",
    "第1頁（2格）",
    "格1（大格）畫：合成畫面一，桌上有一具木偶。",
    "格2　畫：合成畫面二，燈亮起，木偶未動。",
    "",
    "第2頁（1格）",
    "格1（橫長）畫：合成畫面三，燈滅。",
    "",
    "第39頁（整頁一格）",
    "　畫：合成第三十九頁，木偶站了起來。",
    "　註：測試用。",
    "",
    SEP,
    "（合成腳本完）",
  ].join("\n") + "\n";

/* ------------------------------------------------------------------ */
/* Fixture assembly                                                    */
/* ------------------------------------------------------------------ */

const makeDocs = (opts: { trueForm?: boolean } = {}) => {
  const designSource = readSource(Buffer.from(designText(opts), "utf-8"));
  return {
    design: parseDesignDoc(designSource),
    designSource,
    script: parseScript(readSource(Buffer.from(SCRIPT_TEXT, "utf-8"))),
  };
};

const DOCS = makeDocs();

/** sha256 of a panel's 畫 field raw, as parsed — the freshness key (I13). */
const huaShaOf = (script: ScriptDoc, pageNo: number, ordinal: number): string => {
  const page = script.pages.find((p) => p.physicalPages.includes(pageNo));
  if (!page) throw new Error(`no page ${pageNo}`);
  const panel = page.panels.find((p) => (p.ordinal ?? 1) === ordinal);
  if (!panel) throw new Error(`no panel ${ordinal} on page ${pageNo}`);
  const hua = panel.fields.find((field) => field.kind === "畫");
  if (!hua) throw new Error(`no 畫 on ep0_p${pageNo}_g${ordinal}`);
  return sha256Hex(hua.raw);
};

const FIXTURE_STYLE_LOCK_TEXT =
  "Fixture style lock: invented bytes, frozen for this test, never canon.";
const FIXTURE_STYLE_LOCK = {
  text: FIXTURE_STYLE_LOCK_TEXT,
  sha256: sha256Hex(FIXTURE_STYLE_LOCK_TEXT),
};

const APPROVED_REGISTRY: AnchorRegistry = {
  "char:1-xiaotian": { elementId: "el_fixture_xiaotian", approved: true },
  "char:2-beta": { elementId: "el_fixture_beta", approved: true },
  "set:1-fixture-room": { elementId: "el_fixture_room", approved: true },
  "set:2-fixture-stage": { elementId: "el_fixture_stage", approved: true },
};

/** ep0_p1_g2: an ordinary (unmarked → 4:3) panel with one character and a set. */
const baseEntry = (): PanelIndexEntry => ({
  panelId: "ep0_p1_g2",
  huaSha256: huaShaOf(DOCS.script, 1, 2),
  cast: ["XIAOTIAN"],
  set: "FIXTURE ROOM",
  aspectRatio: "4:3",
  shotEn: "A carved wooden puppet on a bare table as the lamp comes up.",
  shotApproved: true,
});

const args = (
  over: Partial<ResolveArgs> = {},
  entryOver: Partial<PanelIndexEntry> = {},
): ResolveArgs => ({
  design: DOCS.design,
  designSource: DOCS.designSource,
  script: DOCS.script,
  index: { ...baseEntry(), ...entryOver },
  registry: APPROVED_REGISTRY,
  styleLock: FIXTURE_STYLE_LOCK,
  ...over,
});

const slugs = (refusals: Refusal[]): string[] => refusals.map((refusal) => refusal.invariant);

const refusalsOf = (result: ReturnType<typeof resolveCompileInput>): Refusal[] => {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  // Fail-closed shape: a refusing result carries no input, ever.
  expect(Object.hasOwn(result, "input")).toBe(false);
  return result.refusals;
};

/** Pin table over the fixture's own bytes — the compiler's documented test hatch. */
const FIXTURE_PINS: PinTable = {
  styleLock: FIXTURE_STYLE_LOCK.sha256,
  core: {
    XIAOTIAN: sha256Hex(FIXTURE_CORE),
    BETA: sha256Hex(
      "BETA — fixture subject two: a paper lantern hung on a sagging wire.",
    ),
  },
};

/* ------------------------------------------------------------------ */
/* Happy path                                                          */
/* ------------------------------------------------------------------ */

describe("resolveCompileInput — happy path", () => {
  it("assembles a CompileInput whose payloads are the parser's bytes verbatim", () => {
    const result = resolveCompileInput(args());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const input = result.input;

    expect(input.cast).toHaveLength(1);
    const member = input.cast[0]!;
    expect(member.id).toBe("char:1-xiaotian");
    expect(member.name).toBe("XIAOTIAN");
    expect(member.coreRaw).toBe(FIXTURE_CORE);
    expect(member.negativeRaw).toBe(FIXTURE_NEGATIVE);
    expect(member.anchorElementId).toBe("el_fixture_xiaotian");
    expect(member.corePinnedSha256).toBe(sha256Hex(FIXTURE_CORE));

    expect(input.set).toEqual({
      name: "FIXTURE ROOM",
      raw: '"A bare room with one hanging bulb over a single wooden table."',
    });
    expect(input.colorRules).toBe(FIXTURE_COLOR_RULES);
    expect(input.aspectRatio).toBe("4:3");
    expect(input.shot).toBe(baseEntry().shotEn);
    expect(input.direction).toContain(
      "Sharp focus throughout — crisp shading edges, no soft focus",
    );
    // The aspect directive is the compiler's to emit (it closes DIRECTION
    // from input.aspectRatio); the resolver must not duplicate it.
    expect(input.direction.some((line) => /aspect ratio/i.test(line))).toBe(false);
    expect(input.styleLock.text).toBe(FIXTURE_STYLE_LOCK_TEXT);
  });

  it("emits the CORE payload byte-identically in the compiled prompt", () => {
    const result = resolveCompileInput(args());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Compiled against the fixture's own pins (the compiler's test hatch);
    // the production path in resolve.ts always uses DEFAULT_PINS.
    const compiled = compilePanelPrompt(result.input, FIXTURE_PINS);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    expect(compiled.blocks).toHaveLength(5);
    expect(compiled.blocks[0]).toBe(FIXTURE_STYLE_LOCK_TEXT);
    expect(compiled.prompt.startsWith(FIXTURE_STYLE_LOCK_TEXT)).toBe(true);
    // Byte-identical, contiguous — no rewrap, no normalization (I2).
    expect(compiled.prompt).toContain(FIXTURE_CORE);
    expect(compiled.prompt.indexOf(FIXTURE_CORE)).toBe(compiled.prompt.lastIndexOf(FIXTURE_CORE));
    expect(compiled.blocks[4]).toContain(FIXTURE_NEGATIVE);
    expect(compiled.prompt).toContain(FIXTURE_COLOR_RULES);
    // The compiled aspect reaches the outbound bytes exactly once.
    expect(compiled.blocks[2]!.match(/aspect ratio:? 4:3\./giu)).toHaveLength(1);
  });

  it("hands the compiler DEFAULT_PINS, so unreviewed fixture bytes still refuse", () => {
    const result = compileResolvedPanel(args());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Only pin-table refusals: the resolution phase itself produced a clean input.
    expect(new Set(slugs(result.refusals))).toEqual(
      new Set(["style-lock-unpinned", "pin-mismatch"]),
    );
  });

  it("accepts a page-block + panel-ordinal selector", () => {
    const byOrdinal = resolveCompileInput(args({ panel: { blockIndex: 0, panelOrdinal: 2 } }));
    expect(byOrdinal.ok).toBe(true);
  });

  it("refuses panel-not-found for a panel that is not in the script", () => {
    const result = resolveCompileInput(args({}, { panelId: "ep0_p99_g4" }));
    expect(slugs(refusalsOf(result))).toEqual(["panel-not-found"]);
  });

  it("refuses panel-id-mismatch when the index row names another panel", () => {
    const result = resolveCompileInput(
      args({ panel: { blockIndex: 0, panelOrdinal: 1 } }, { aspectRatio: "3:2" }),
    );
    expect(slugs(refusalsOf(result))).toContain("panel-id-mismatch");
  });
});

/* ------------------------------------------------------------------ */
/* I5 / I6 — attachment ownership and approval                         */
/* ------------------------------------------------------------------ */

describe("I5/I6 — anchors", () => {
  it("refuses anchor-unapproved when the entity's own anchor is not approved", () => {
    const registry: AnchorRegistry = {
      ...APPROVED_REGISTRY,
      "char:1-xiaotian": { elementId: "el_fixture_xiaotian", approved: false },
    };
    const result = resolveCompileInput(args({ registry }));
    expect(slugs(refusalsOf(result))).toEqual(["anchor-unapproved"]);
  });

  it("refuses anchor-foreign when the element belongs to another entity too", () => {
    // The 2026-07-30 failure, in registry form: one character's element id
    // registered against a second character.
    const registry: AnchorRegistry = {
      ...APPROVED_REGISTRY,
      "char:2-beta": { elementId: "el_fixture_xiaotian", approved: true },
    };
    const result = resolveCompileInput(args({ registry }, { cast: ["XIAOTIAN", "BETA"] }));
    const refusals = refusalsOf(result);
    expect(slugs(refusals).filter((slug) => slug === "anchor-foreign")).toHaveLength(2);
    expect(refusals[0]!.message).toContain("el_fixture_xiaotian");
  });

  it("attaches nothing but the entity's own element (no cross-attachment path exists)", () => {
    const result = resolveCompileInput(args({}, { cast: ["XIAOTIAN", "BETA"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.cast.map((m) => [m.id, m.anchorElementId])).toEqual([
      ["char:1-xiaotian", "el_fixture_xiaotian"],
      ["char:2-beta", "el_fixture_beta"],
    ]);
  });

  it("leaves an unregistered entity unanchored, and the compiler refuses the panel", () => {
    const result = resolveCompileInput(args({ registry: { "set:1-fixture-room": { elementId: "el_fixture_room", approved: true } } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.cast[0]!.anchorElementId).toBeNull();
    const compiled = compilePanelPrompt(result.input, FIXTURE_PINS);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(slugs(compiled.refusals)).toContain("stage-anchor-missing");
  });

  it("refuses set-anchor-missing when the set has no registered anchor (I6)", () => {
    const registry: AnchorRegistry = {
      "char:1-xiaotian": { elementId: "el_fixture_xiaotian", approved: true },
    };
    const result = resolveCompileInput(args({ registry }));
    expect(slugs(refusalsOf(result))).toEqual(["set-anchor-missing"]);
  });

  it("refuses anchor-unapproved for an unapproved SET anchor", () => {
    const registry: AnchorRegistry = {
      ...APPROVED_REGISTRY,
      "set:1-fixture-room": { elementId: "el_fixture_room", approved: false },
    };
    const result = resolveCompileInput(args({ registry }));
    expect(slugs(refusalsOf(result))).toEqual(["anchor-unapproved"]);
  });
});

/* ------------------------------------------------------------------ */
/* I13 — freshness                                                     */
/* ------------------------------------------------------------------ */

describe("I13 — shot freshness", () => {
  it("refuses shot-stale when the index entry's huaSha256 is not the live 畫 hash", () => {
    const result = resolveCompileInput(args({}, { huaSha256: sha256Hex("an older 畫") }));
    const refusals = refusalsOf(result);
    expect(slugs(refusals)).toEqual(["shot-stale"]);
    expect(refusals[0]!.message).toContain(huaShaOf(DOCS.script, 1, 2));
  });

  it("refuses shot-stale when the panel's 畫 is edited under a stored entry", () => {
    // Same index row, a script whose 畫 changed by one character.
    const edited = parseScript(
      readSource(Buffer.from(SCRIPT_TEXT.replace("木偶未動", "木偶未動了"), "utf-8")),
    );
    const result = resolveCompileInput(args({ script: edited }));
    expect(slugs(refusalsOf(result))).toEqual(["shot-stale"]);
  });

  it("refuses shot-unapproved when the author has not approved shot_en", () => {
    const result = resolveCompileInput(args({}, { shotApproved: false }));
    expect(slugs(refusalsOf(result))).toEqual(["shot-unapproved"]);
  });
});

/* ------------------------------------------------------------------ */
/* I11 — the TRUE FORM replace-path                                    */
/* ------------------------------------------------------------------ */

describe("I11 — ep0_p39_g1 TRUE FORM replace-path", () => {
  const p39 = (): Partial<PanelIndexEntry> => ({
    panelId: "ep0_p39_g1",
    huaSha256: huaShaOf(DOCS.script, 39, 1),
    cast: ["XIAOTIAN"],
    set: null,
    aspectRatio: "2:3",
    shotEn: "The puppet, tower-tall, frozen against a paper sky.",
  });

  it("substitutes CORE, NEGATIVE and the global Color Rules", () => {
    const result = resolveCompileInput(args({}, p39()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const member = result.input.cast[0]!;
    expect(member.coreRaw).toBe(FIXTURE_TRUE_FORM);
    expect(member.coreRaw).not.toBe(FIXTURE_CORE);
    expect(member.negativeRaw).toBe(FIXTURE_PANEL_NEGATIVE);
    expect(member.negativeRaw).not.toBe(FIXTURE_NEGATIVE);
    // The panel-scoped PALETTE overrides the global Color Rules.
    expect(result.input.colorRules).toBe(FIXTURE_PANEL_PALETTE);
    expect(result.input.colorRules).not.toBe(FIXTURE_COLOR_RULES);
  });

  it("never leaks the TRUE FORM payload onto any other panel", () => {
    const result = resolveCompileInput(args());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.cast[0]!.coreRaw).toBe(FIXTURE_CORE);
    expect(result.input.cast[0]!.negativeRaw).toBe(FIXTURE_NEGATIVE);
    expect(result.input.colorRules).toBe(FIXTURE_COLOR_RULES);
  });

  it("refuses true-form-missing when the block is absent from the design file", () => {
    const docs = makeDocs({ trueForm: false });
    const result = resolveCompileInput(
      args({ design: docs.design, designSource: docs.designSource }, p39()),
    );
    const refusals = refusalsOf(result);
    expect(slugs(refusals)).toContain("true-form-missing");
    expect(refusals[0]!.message).toContain("VARIANT — TRUE FORM");
  });
});

/* ------------------------------------------------------------------ */
/* §1.2 — superseded style blocks                                      */
/* ------------------------------------------------------------------ */

describe("§1.2 — superseded style blocks are never selectable", () => {
  it("refuses superseded-source when asked to lock STYLE BLOCK A", () => {
    const styleA = DOCS.design.styleBlocks[0]!;
    expect(styleA.superseded).toBe(true);
    const result = resolveCompileInput(
      args({ styleLock: { text: styleA.payloadRaw, sha256: sha256Hex(styleA.payloadRaw) } }),
    );
    expect(slugs(refusalsOf(result))).toContain("superseded-source");
  });

  it("refuses the same block passed without its enclosing quotes", () => {
    const interior = DOCS.design.styleBlocks[0]!.payloadRaw.slice(1, -1);
    const result = resolveCompileInput(
      args({ styleLock: { text: interior, sha256: sha256Hex(interior) } }),
    );
    expect(slugs(refusalsOf(result))).toContain("superseded-source");
  });

  it("refuses a style lock that carries superseded: true", () => {
    const result = resolveCompileInput(
      args({ styleLock: { ...FIXTURE_STYLE_LOCK, superseded: true } }),
    );
    expect(slugs(refusalsOf(result))).toEqual(["superseded-source"]);
  });
});

/* ------------------------------------------------------------------ */
/* Cast, set and aspect resolution                                     */
/* ------------------------------------------------------------------ */

describe("cast / set / aspect resolution", () => {
  it("refuses cast-unknown for a name that is not in the design doc", () => {
    const result = resolveCompileInput(args({}, { cast: ["GAMMA"] }));
    expect(slugs(refusalsOf(result))).toContain("cast-unknown");
  });

  it("refuses cast-duplicate", () => {
    const result = resolveCompileInput(args({}, { cast: ["XIAOTIAN", "XIAOTIAN"] }));
    expect(slugs(refusalsOf(result))).toEqual(["cast-duplicate"]);
  });

  it("refuses set-unknown", () => {
    const result = resolveCompileInput(args({}, { set: "NOWHERE" }));
    expect(slugs(refusalsOf(result))).toEqual(["set-unknown"]);
  });

  it("refuses set-subkey-required for a set with sub-versions, and resolves with one", () => {
    const required = resolveCompileInput(args({}, { set: "FIXTURE STAGE" }));
    expect(slugs(refusalsOf(required))).toEqual(["set-subkey-required"]);

    const unknown = resolveCompileInput(
      args({}, { set: "FIXTURE STAGE", setSubKey: "Rooftop version" }),
    );
    expect(slugs(refusalsOf(unknown))).toEqual(["set-subkey-unknown"]);

    const ok = resolveCompileInput(
      args({}, { set: "FIXTURE STAGE", setSubKey: "Backstage version" }),
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.input.set).toEqual({
      name: "FIXTURE STAGE",
      raw: '"The same fixture stage seen from behind."',
    });
  });

  it("refuses aspect-override-required for 大格 without a 3:2 / 16:9 override (I12)", () => {
    const result = resolveCompileInput(
      args({}, { panelId: "ep0_p1_g1", huaSha256: huaShaOf(DOCS.script, 1, 1), aspectRatio: "4:3" }),
    );
    expect(slugs(refusalsOf(result))).toEqual(["aspect-override-required"]);

    const ok = resolveCompileInput(
      args({}, { panelId: "ep0_p1_g1", huaSha256: huaShaOf(DOCS.script, 1, 1), aspectRatio: "16:9" }),
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.input.direction).toContain("Panel size: large panel, dominant on the page.");
  });

  it("refuses aspect-mismatch when the index disagrees with the shape table", () => {
    const result = resolveCompileInput(
      args({}, { panelId: "ep0_p2_g1", huaSha256: huaShaOf(DOCS.script, 2, 1), aspectRatio: "4:3" }),
    );
    expect(slugs(refusalsOf(result))).toEqual(["aspect-mismatch"]);
    // 橫長 → 21:9.
    const ok = resolveCompileInput(
      args({}, { panelId: "ep0_p2_g1", huaSha256: huaShaOf(DOCS.script, 2, 1), aspectRatio: "21:9" }),
    );
    expect(ok.ok).toBe(true);
  });

  it("collects every refusal at once rather than short-circuiting", () => {
    const result = resolveCompileInput(
      args(
        { registry: { "char:1-xiaotian": { elementId: "el_fixture_xiaotian", approved: false } } },
        { shotApproved: false, huaSha256: sha256Hex("stale") },
      ),
    );
    expect(new Set(slugs(refusalsOf(result)))).toEqual(
      new Set(["shot-stale", "shot-unapproved", "anchor-unapproved", "set-anchor-missing"]),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Request validation                                                  */
/* ------------------------------------------------------------------ */

describe("parseCompileRequest", () => {
  const body = () => ({
    panelIndexEntry: { ...baseEntry() },
    registry: { ...APPROVED_REGISTRY },
    styleLock: { ...FIXTURE_STYLE_LOCK },
  });

  it("accepts a well-formed body", () => {
    const parsed = parseCompileRequest(body());
    expect(parsed.ok).toBe(true);
  });

  it("rejects a non-hex huaSha256", () => {
    const bad = body();
    bad.panelIndexEntry.huaSha256 = "not-a-hash";
    const parsed = parseCompileRequest(bad);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain("huaSha256");
  });

  it("rejects a registry entry with a non-boolean approved", () => {
    const bad = body() as unknown as Record<string, Record<string, unknown>>;
    bad["registry"] = { "char:1-xiaotian": { elementId: "el", approved: "yes" } };
    const parsed = parseCompileRequest(bad);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain("approved");
  });

  it("rejects a non-object body", () => {
    expect(parseCompileRequest("nope").ok).toBe(false);
    expect(parseCompileRequest(null).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/projects/:id/compile                                      */
/* ------------------------------------------------------------------ */

const tempDirs: string[] = [];

const makeProjectApp = async (files: Array<{ relPath: string; text: string }>) => {
  const base = await mkdtemp(path.join(os.tmpdir(), "vixio-resolve-test-"));
  tempDirs.push(base);
  const repo = path.join(base, "repo");
  for (const file of files) {
    const abs = path.join(repo, file.relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, Buffer.from(file.text, "utf-8"));
  }
  const projectsFile = path.join(base, "projects.json");
  await writeFile(projectsFile, JSON.stringify([{ id: "fx", name: "Fixture", path: repo }]));
  return createApp(projectsFile);
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("POST /api/projects/:id/compile", () => {
  const post = (app: Awaited<ReturnType<typeof createApp>>, body: unknown, id = "fx") =>
    app.request(`/api/projects/${id}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const appWithFixture = () =>
    makeProjectApp([
      { relPath: "02_art/character-design-prompts.txt", text: designText() },
      { relPath: "01_script/episode-zero-script.txt", text: SCRIPT_TEXT },
    ]);

  it("422s with refusals and NEVER a prompt", async () => {
    const app = await appWithFixture();
    const res = await post(app, {
      panelIndexEntry: { ...baseEntry(), shotApproved: false },
      registry: APPROVED_REGISTRY,
      styleLock: FIXTURE_STYLE_LOCK,
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["ok"]).toBe(false);
    expect(Object.hasOwn(json, "prompt")).toBe(false);
    expect(Object.hasOwn(json, "blocks")).toBe(false);
    expect(slugs(json["refusals"] as Refusal[])).toContain("shot-unapproved");
  });

  it("422s with the compiler's pin refusals for unreviewed bytes", async () => {
    const app = await appWithFixture();
    const res = await post(app, {
      panelIndexEntry: baseEntry(),
      registry: APPROVED_REGISTRY,
      styleLock: FIXTURE_STYLE_LOCK,
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as { ok: boolean; refusals: Refusal[] };
    expect(slugs(json.refusals)).toContain("style-lock-unpinned");
  });

  it("400s on a malformed body", async () => {
    const app = await appWithFixture();
    const res = await post(app, { panelIndexEntry: {}, registry: {}, styleLock: {} });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown project", async () => {
    const app = await appWithFixture();
    const res = await post(
      app,
      { panelIndexEntry: baseEntry(), registry: APPROVED_REGISTRY, styleLock: FIXTURE_STYLE_LOCK },
      "nope",
    );
    expect(res.status).toBe(404);
  });

  it("404s when the project has no design document", async () => {
    const app = await makeProjectApp([
      { relPath: "01_script/episode-zero-script.txt", text: SCRIPT_TEXT },
    ]);
    const res = await post(app, {
      panelIndexEntry: baseEntry(),
      registry: APPROVED_REGISTRY,
      styleLock: FIXTURE_STYLE_LOCK,
    });
    expect(res.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/* ORACLE — the real repo                                              */
/* ------------------------------------------------------------------ */

const HTH = process.env["HTH_REPO_PATH"];

/**
 * End-to-end proof on real canon: parsers → pinned CORE hashes → compiler.
 *
 * Panel ep0_p37_g1 (第37頁 格1（大格）, "門——連框砸開。"): a single-character
 * panel, XIAOTIAN, in SET 5 THE OUTER ROOM, with the 大格 aspect override the
 * spec demands. The PanelIndexEntry is plausible author data (§2.5 — this
 * record has no home in the repo yet); its huaSha256 is computed from the
 * parsed 畫 field, which is exactly the freshness key I13 checks.
 */
describe.skipIf(!HTH)("oracle — a real panel compiles from real canon", () => {
  const readHth = () => {
    const designSource = readSource(readFileSync(`${HTH}/02_art/character-design-prompts.txt`));
    const design = parseDesignDoc(designSource);
    const script = parseScript(readSource(readFileSync(`${HTH}/01_script/episode-zero-script.txt`)));
    const pipeline = readFileSync(`${HTH}/02_art/production-pipeline-spec.txt`, "utf-8");
    // The frozen style-lock v3 bytes: the interior of the quoted block in §8.
    const match = /"(Modern Japanese dark-battle[^"]*)"/.exec(pipeline);
    if (!match?.[1]) throw new Error("style lock block not found in the pipeline spec");
    const styleLock = { text: match[1], sha256: sha256Hex(match[1]) };
    return { design, designSource, script, styleLock };
  };

  const realEntry = (docs: ReturnType<typeof readHth>): PanelIndexEntry => ({
    panelId: "ep0_p37_g1",
    huaSha256: huaShaOf(docs.script, 37, 1),
    cast: ["XIAOTIAN"],
    set: "THE OUTER ROOM",
    // 大格 has no tiebreak in the spec — the author's explicit override.
    aspectRatio: "3:2",
    shotEn:
      "The door is smashed in, frame and all. White light cuts into the dark room; " +
      "a figure in a torn changshan stands in the doorway, a faded red band across the brow.",
    shotApproved: true,
  });

  const realRegistry = (docs: ReturnType<typeof readHth>): AnchorRegistry => {
    const xiaotian = docs.design.characters.find((c) => c.nameLiteral === "XIAOTIAN")!;
    const outerRoom = docs.design.sets.find((s) => s.nameLiteral === "THE OUTER ROOM")!;
    return {
      [characterEntityId(xiaotian)]: { elementId: "el_xiaotian_anchor", approved: true },
      [setEntityId(outerRoom)]: { elementId: "el_outer_room_anchor", approved: true },
    };
  };

  it("compiles ep0_p37_g1 with the pinned CORE bytes present verbatim", () => {
    const docs = readHth();
    const result = compileResolvedPanel({
      design: docs.design,
      designSource: docs.designSource,
      script: docs.script,
      index: realEntry(docs),
      registry: realRegistry(docs),
      styleLock: docs.styleLock,
    });
    if (!result.ok) {
      throw new Error(`expected a clean compile, got: ${JSON.stringify(result.refusals, null, 2)}`);
    }

    const xiaotian = docs.design.characters.find((c) => c.nameLiteral === "XIAOTIAN")!;
    const core = xiaotian.subBlocks.find((b) => b.kind === "core")!.payloadRaw;
    const negative = xiaotian.subBlocks.find(
      (b) => b.kind === "negative" && !b.label.includes("this panel only"),
    )!.payloadRaw;

    // The bytes the compiler's reviewed pin table blesses (I9), emitted whole.
    expect(sha256Hex(core)).toBe(
      "8514be796aed3862a108d36ff8cfbabc4ac3f2b9f59e0b66db9bd24d8f205136",
    );
    expect(result.prompt).toContain(core);
    expect(result.blocks[0]).toBe(docs.styleLock.text);
    expect(result.blocks[1]).toContain(core);
    expect(result.blocks[3]).toBe(realEntry(docs).shotEn);
    expect(result.blocks[4]).toContain(negative);
    // The 畫 bytes travel in the record, never in the buffer (§3.2 Block 3).
    expect(result.prompt).not.toContain("門——連框砸開");
    expect(result.blocks[2]!.match(/aspect ratio:? 3:2\./giu)).toHaveLength(1);
  });

  it("refuses a deliberately stale huaSha256 on the same real panel", () => {
    const docs = readHth();
    const result = compileResolvedPanel({
      design: docs.design,
      designSource: docs.designSource,
      script: docs.script,
      index: { ...realEntry(docs), huaSha256: sha256Hex("a 畫 the author has since rewritten") },
      registry: realRegistry(docs),
      styleLock: docs.styleLock,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(slugs(result.refusals)).toEqual(["shot-stale"]);
    expect(Object.hasOwn(result, "prompt")).toBe(false);
  });

  it("refuses the real superseded STYLE BLOCK A as a style lock", () => {
    const docs = readHth();
    const styleA = docs.design.styleBlocks.find((b) => b.label === "STYLE BLOCK A")!;
    const result = compileResolvedPanel({
      design: docs.design,
      designSource: docs.designSource,
      script: docs.script,
      index: realEntry(docs),
      registry: realRegistry(docs),
      styleLock: { text: styleA.payloadRaw, sha256: sha256Hex(styleA.payloadRaw) },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(slugs(result.refusals)).toContain("superseded-source");
  });

  it("takes the TRUE FORM replace-path on the real ep0_p39_g1 (I11)", () => {
    const docs = readHth();
    const xiaotian = docs.design.characters.find((c) => c.nameLiteral === "XIAOTIAN")!;
    const trueForm = xiaotian.subBlocks.find(
      (b) => b.kind === "variant" && b.label.includes("TRUE FORM"),
    )!;
    const panelNegative = xiaotian.subBlocks.find(
      (b) => b.kind === "negative" && b.label.includes("this panel only"),
    )!;
    const palette = xiaotian.subBlocks.find((b) => b.kind === "palette")!;

    const resolved = resolveCompileInput({
      design: docs.design,
      designSource: docs.designSource,
      script: docs.script,
      index: {
        panelId: "ep0_p39_g1",
        huaSha256: huaShaOf(docs.script, 39, 1),
        cast: ["XIAOTIAN"],
        set: null,
        aspectRatio: "2:3",
        shotEn:
          "Frozen full-page tableau: the doorway holds a sky-filling silhouette in " +
          "opera armor, back-flags rising, one vertical slit of light at the brow.",
        shotApproved: true,
      },
      registry: realRegistry(docs),
      styleLock: docs.styleLock,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.input.cast[0]!.coreRaw).toBe(trueForm.payloadRaw);
    expect(resolved.input.cast[0]!.negativeRaw).toBe(panelNegative.payloadRaw);
    expect(resolved.input.colorRules).toBe(palette.payloadRaw);
    // The ordinary CORE is gone from this panel entirely.
    const ordinaryCore = xiaotian.subBlocks.find((b) => b.kind === "core")!.payloadRaw;
    expect(resolved.input.cast[0]!.coreRaw).not.toBe(ordinaryCore);
    // The variant label rides along so the compiler pins the VARIANT hash
    // rather than the ordinary CORE hash.
    expect(resolved.input.cast[0]!.variantLabel).toBe(trueForm.label);
  });

  it("COMPILES the real climax panel ep0_p39_g1 end to end", () => {
    // The full path: parsed canon → resolution (TRUE FORM replace-path) →
    // compiler with DEFAULT_PINS, which must accept the variant against its
    // own reviewed variant pin. This panel was uncompilable until the pin
    // table learned about CORE-replacing variants.
    const docs = readHth();
    const xiaotian = docs.design.characters.find((c) => c.nameLiteral === "XIAOTIAN")!;
    const trueForm = xiaotian.subBlocks.find(
      (b) => b.kind === "variant" && b.label.includes("TRUE FORM"),
    )!;

    const result = compileResolvedPanel({
      design: docs.design,
      designSource: docs.designSource,
      script: docs.script,
      index: {
        panelId: "ep0_p39_g1",
        huaSha256: huaShaOf(docs.script, 39, 1),
        cast: ["XIAOTIAN"],
        set: null,
        aspectRatio: "2:3",
        shotEn:
          "Frozen full-page tableau: the doorway holds a sky-filling silhouette in " +
          "opera armor, back-flags rising, one vertical slit of light at the brow.",
        shotApproved: true,
      },
      registry: realRegistry(docs),
      styleLock: docs.styleLock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The TRUE FORM bytes ship verbatim, exactly once.
    expect(result.prompt).toContain(trueForm.payloadRaw);
    expect(result.prompt.split(trueForm.payloadRaw)).toHaveLength(2);
    // Style lock still leads; the page-39 aspect reaches the buffer.
    expect(result.prompt.indexOf(docs.styleLock.text)).toBe(0);
    expect(result.prompt).toContain("Aspect ratio 2:3.");
    expect(result.aspectRatio).toBe("2:3");
  });

  it("serves a real compiled prompt over POST /compile", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "vixio-resolve-oracle-"));
    tempDirs.push(base);
    const projectsFile = path.join(base, "projects.json");
    await writeFile(projectsFile, JSON.stringify([{ id: "hth", name: "HTH", path: HTH }]));
    const app = await createApp(projectsFile);
    const docs = readHth();
    const res = await app.request("/api/projects/hth/compile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        panelIndexEntry: realEntry(docs),
        registry: realRegistry(docs),
        styleLock: docs.styleLock,
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; prompt: string; blocks: string[] };
    expect(json.ok).toBe(true);
    expect(json.blocks).toHaveLength(5);
    const core = docs.design.characters
      .find((c) => c.nameLiteral === "XIAOTIAN")!
      .subBlocks.find((b) => b.kind === "core")!.payloadRaw;
    expect(json.prompt).toContain(core);
    expect(json.prompt.startsWith(docs.styleLock.text)).toBe(true);
  });
});
