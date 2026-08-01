import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseScript } from "../src/script.ts";
import { readSource, serializeLines } from "../src/lines.ts";

/**
 * Synthetic fixture exercising the documented hazards without shipping canon:
 * no-separator marker adjacency, U+3000-separated markers on one line,
 * multi-line continuations at both indent depths, an implicit shape panel,
 * a spread header, prose that must NOT become fields (聲音：, 渲染基調：),
 * a bare —— 音 payload, and trailing text after a page header's `）`.
 */
const FIXTURE = [
  "VIXIO CREATIVES｜《測試》TEST",
  "文件：測試分格腳本",
  "版本 v1｜狀態：測試",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━",
  "序幕（第1至2頁）",
  "",
  "第1頁（2格）",
  "格1（橫長，全黑）畫：純黑。音：滴。",
  "格2　畫：孩子跑遠，回頭揮手。白（孩子）：嚟啦！",
  "　繼續一行，聲音：不是欄位，渲染基調：也不是。",
  "　　第二層縮排繼續。",
  "",
  "第2至3頁（跨頁一）",
  "　畫：山谷全景。",
  "　音：——",
  "　音（棚側，漸遠）：鑼鼓。　白（後台）：開場喇！",
  "　註：第4頁 出現在註文內不算頁首。",
  "",
  "第4頁（整頁一格）——測試尾註",
  "　畫：定鏡。",
  "",
].join("\n");

describe("parseScript", () => {
  const source = readSource(Buffer.from(FIXTURE, "utf-8"));
  const doc = parseScript(source);

  it("round-trips byte-exactly through the line model", () => {
    expect(serializeLines(source.lines)).toBe(FIXTURE);
  });

  it("finds pages, the spread, and the trailing note", () => {
    expect(doc.pages.map((p) => [p.pageStart, p.pageEnd])).toEqual([
      [1, null],
      [2, 3],
      [4, null],
    ]);
    expect(doc.pages[1]!.physicalPages).toEqual([2, 3]);
    expect(doc.pages[2]!.trailingNote).toBe("——測試尾註");
    expect(doc.report.physicalPageCount).toBe(4);
  });

  it("classifies attr slots", () => {
    expect(doc.pages[0]!.attrKind).toBe("panel-count");
    expect(doc.pages[0]!.declaredPanelCount).toBe(2);
    expect(doc.pages[1]!.attrKind).toBe("shape");
  });

  it("opens implicit panels on shape pages", () => {
    expect(doc.pages[1]!.panels).toHaveLength(1);
    expect(doc.pages[1]!.panels[0]!.implicit).toBe(true);
    expect(doc.pages[2]!.panels[0]!.implicit).toBe(true);
  });

  it("splits no-separator and U+3000-separated markers on one line", () => {
    const p1 = doc.pages[0]!.panels[0]!;
    expect(p1.fields.map((f) => f.kind)).toEqual(["畫", "音"]);
    expect(p1.fields[0]!.raw).toBe("純黑。");
    expect(p1.fields[1]!.raw).toBe("滴。");

    const spread = doc.pages[1]!.panels[0]!;
    expect(spread.fields.map((f) => f.kind)).toEqual(["畫", "音", "音", "白", "註"]);
    expect(spread.fields[1]!.raw).toBe("——");
    expect(spread.fields[2]!.paren).toBe("棚側，漸遠");
    expect(spread.fields[3]!.paren).toBe("後台");
  });

  it("rejects a marker preceded by supplementary-plane Han (surrogate-aware guard)", () => {
    // 𠮷 is U+20BB7 (Ext-B): '𠮷音：' must read as prose, not a 音 field.
    const astral = [
      "VIXIO CREATIVES｜《測試》TEST",
      "文件：測試",
      "版本 v1｜狀態：測試",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━",
      "序幕（第1至1頁）",
      "",
      "第1頁（1格）",
      "格1　畫：開場。",
      "　續行提及𠮷音：不是欄位。",
      "",
    ].join("\n");
    const astralDoc = parseScript(readSource(Buffer.from(astral, "utf-8")));
    const panel = astralDoc.pages[0]!.panels[0]!;
    expect(panel.fields.map((f) => f.kind)).toEqual(["畫"]);
    expect(panel.fields[0]!.raw).toContain("𠮷音：不是欄位。");
    expect(astralDoc.report.warnings).toEqual([]);
  });

  it("serializes a file with no trailing newline byte-exactly", () => {
    const unterminated = FIXTURE.slice(0, -1);
    const src = readSource(Buffer.from(unterminated, "utf-8"));
    expect(serializeLines(src.lines)).toBe(unterminated);
  });

  it("treats prose lookalikes as continuations, not fields", () => {
    const p2 = doc.pages[0]!.panels[1]!;
    expect(p2.fields.map((f) => f.kind)).toEqual(["畫", "白"]);
    const bai = p2.fields[1]!;
    expect(bai.raw).toContain("聲音：不是欄位");
    expect(bai.raw).toContain("第二層縮排繼續。");
  });

  it("does not read 第4頁 inside a 註 as a page header", () => {
    expect(doc.pages).toHaveLength(3);
    const zhu = doc.pages[1]!.panels[0]!.fields[4]!;
    expect(zhu.kind).toBe("註");
    expect(zhu.raw).toContain("第4頁");
  });

  it("reports declared-vs-actual panel counts cleanly", () => {
    expect(doc.report.declaredPanelMismatches).toEqual([]);
    expect(doc.report.warnings).toEqual([]);
  });
});

/**
 * Canon loop: the full sweep over the real repo, present only where a
 * checkout exists (dev containers, the VPS). CI runs the synthetic fixtures
 * above; this suite is the oracle that the parser matches the actual data.
 */
const HTH = process.env["HTH_REPO_PATH"];

describe.skipIf(!HTH)("episode-zero-script.txt (real repo)", () => {
  const bytes = readFileSync(`${HTH}/01_script/episode-zero-script.txt`);
  const source = readSource(bytes);
  const doc = parseScript(source);

  it("round-trips byte-exactly", () => {
    expect(Buffer.from(serializeLines(source.lines), "utf-8").equals(bytes)).toBe(true);
  });

  it("matches the audited census", () => {
    expect(doc.report.pageBlockCount).toBe(45);
    expect(doc.report.physicalPageCount).toBe(47);
    expect(doc.report.panelCount).toBe(150);
    expect(doc.report.fieldCounts["畫"]).toBe(150);
  });

  it("matches the audited field-sequence census exactly", () => {
    expect(doc.report.fieldSequenceCensus).toEqual({
      "畫": 64,
      "畫+註": 28,
      "畫+白": 27,
      "畫+白+註": 10,
      "畫+音": 9,
      "畫+音+註": 4,
      "畫+白+白": 3,
      "畫+音+白": 2,
      "畫+音+音+註": 1,
      "畫+題字+頁角小字": 1,
      "畫+頁角題字+註": 1,
    });
  });

  it("declared panel counts all match actual (37/37)", () => {
    expect(doc.report.declaredPanelMismatches).toEqual([]);
  });

  it("surfaces the known act-range lies without correcting them", () => {
    expect(doc.report.actRangeMismatches.length).toBeGreaterThan(0);
  });

  it("parses with no warnings", () => {
    expect(doc.report.warnings).toEqual([]);
  });
});
