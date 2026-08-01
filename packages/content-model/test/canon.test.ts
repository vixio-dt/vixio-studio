import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CanonParseError,
  decodeCjkNumeral,
  parseCanonDoc,
  parseOpenQuestions,
} from "../src/canon.ts";
import { SEPARATOR } from "../src/canonHeader.ts";
import { readSource, serializeLines, type SourceText } from "../src/lines.ts";

const sourceOf = (fixture: string): SourceText => readSource(Buffer.from(fixture, "utf-8"));

/**
 * Synthetic sectioned canon doc (invented content, nothing copied from the
 * real canon) exercising the documented hazards: a bare heading after a
 * separator, 第N章 chapters both with and without separators, a two-digit
 * CJK ordinal, and never-ship detection via a body marker and via a heading
 * marker.
 */
const CANON_FIXTURE = [
  "VIXIO CREATIVES｜《測試》TEST",
  "文件：測試設定集",
  "版本 9.9｜狀態：測試",
  "",
  "本檔僅供測試，內容皆屬虛構。",
  "",
  SEPARATOR,
  "總則",
  "",
  "甲、測試之骨。",
  "乙、測試之皮。",
  "",
  SEPARATOR,
  "第一章　燈塔",
  "守燈人每夜點燈。",
  "",
  "第二章　霧海",
  "霧來時，海面倒懸。",
  "航者以歌為錨。",
  "",
  "第三章　抽屜",
  "此章之底稿為私人燃料。",
  "",
  "第十一章　底層（永不入作品）",
  "此章永不呈現。",
  "",
].join("\n");

describe("parseCanonDoc", () => {
  const source = sourceOf(CANON_FIXTURE);
  const doc = parseCanonDoc(source);

  it("round-trips byte-exactly through the line model", () => {
    expect(serializeLines(source.lines)).toBe(CANON_FIXTURE);
  });

  it("finds the prelude between the header and the first separator", () => {
    expect(doc.prelude).toEqual({ from: 3, to: 5 });
  });

  it("opens sections on separators AND on bare 第N章 headings", () => {
    expect(doc.sections.map((s) => s.headingRaw)).toEqual([
      "總則",
      "第一章　燈塔",
      "第二章　霧海",
      "第三章　抽屜",
      "第十一章　底層（永不入作品）",
    ]);
    expect(doc.sections.map((s) => s.separatorLine)).toEqual([6, 12, null, null, null]);
  });

  it("decodes CJK chapter ordinals and titles; bare headings get null ordinal", () => {
    expect(doc.sections.map((s) => s.ordinal)).toEqual([null, 1, 2, 3, 11]);
    expect(doc.sections.map((s) => s.title)).toEqual([
      "總則",
      "燈塔",
      "霧海",
      "抽屜",
      "底層（永不入作品）",
    ]);
  });

  it("stores bodies as untrimmed line ranges that reconstruct verbatim", () => {
    const fog = doc.sections[2]!;
    expect(fog.body).toEqual({ from: 17, to: 19 });
    expect(serializeLines(source.lines.slice(fog.body!.from, fog.body!.to + 1))).toBe(
      "霧來時，海面倒懸。\n航者以歌為錨。\n\n",
    );
  });

  it("flags never-ship sections via heading markers and via body markers", () => {
    expect(doc.sections.map((s) => s.neverShip)).toEqual([false, false, false, true, true]);
    expect(doc.report.neverShipCount).toBe(2);
  });

  it("reports section count and no warnings", () => {
    expect(doc.report.sectionCount).toBe(5);
    expect(doc.report.warnings).toEqual([]);
  });

  it("throws on a separator at EOF (unclaimed construct fails loudly)", () => {
    const broken = ["VIXIO CREATIVES｜《測試》TEST", "文件：破檔", "版本 9.9｜狀態：測試", "", SEPARATOR].join(
      "\n",
    );
    expect(() => parseCanonDoc(sourceOf(broken))).toThrow(CanonParseError);
  });

  it("throws when a separator is not followed by a heading line", () => {
    const broken = [
      "VIXIO CREATIVES｜《測試》TEST",
      "文件：破檔",
      "版本 9.9｜狀態：測試",
      SEPARATOR,
      "",
      "第一章　空",
      "",
    ].join("\n");
    expect(() => parseCanonDoc(sourceOf(broken))).toThrow(CanonParseError);
  });
});

/**
 * Synthetic open-questions fixture (invented content): compound ordinals out
 * of file order (三之四 before 三之二), both state tokens, a U+3000-indented
 * continuation, prose containing 已定 that must NOT become a state token,
 * and an unnumbered trailing category (the 存而不論 shape).
 */
const OQ_FIXTURE = [
  "VIXIO CREATIVES｜《測試》TEST",
  "文件：測試待決清單",
  "版本 9.9｜狀態：測試",
  "本測試清單不阻礙任何事。",
  "",
  "甲類",
  "一、初問之事，已定與否，另議。",
  "二（已定）：次問已有答。",
  "三之四（已定・改）：跳序之問。",
  "三之二、後至之問，跨行者——",
  "　續行之一。",
  "　續行之二。",
  "",
  "乙類",
  "五、獨問。",
  "",
  "存疑",
  "未編號之一行；",
  "再一行。",
  "",
].join("\n");

describe("parseOpenQuestions", () => {
  const source = sourceOf(OQ_FIXTURE);
  const doc = parseOpenQuestions(source);

  it("round-trips byte-exactly through the line model", () => {
    expect(serializeLines(source.lines)).toBe(OQ_FIXTURE);
  });

  it("claims the scope note as the prelude (no blank between header and note)", () => {
    expect(doc.prelude).toEqual({ from: 3, to: 4 });
  });

  it("finds categories at block starts", () => {
    expect(doc.categories.map((c) => c.nameRaw)).toEqual(["甲類", "乙類", "存疑"]);
    expect(doc.categories.map((c) => c.items.length)).toEqual([4, 1, 0]);
  });

  it("preserves exact file order — compound ordinals are NOT sorted", () => {
    expect(doc.items.map((i) => i.ordinalRaw)).toEqual(["一", "二", "三之四", "三之二", "五"]);
    expect(doc.items.map((i) => [i.ordinalMajor, i.ordinalMinor])).toEqual([
      [1, null],
      [2, null],
      [3, 4],
      [3, 2],
      [5, null],
    ]);
  });

  it("reads inline state tokens and their ： delimiter; plain items use 、", () => {
    expect(doc.items.map((i) => i.state)).toEqual([null, "已定", "已定・改", null, null]);
    expect(doc.items.map((i) => i.delimiter)).toEqual(["、", "：", "：", "、", "、"]);
    expect(doc.report.stateCensus).toEqual({ 已定: 1, "已定・改": 1 });
  });

  it("does not mistake 已定 in prose for a state token", () => {
    const first = doc.items[0]!;
    expect(first.state).toBeNull();
    expect(first.textRaw).toBe("初問之事，已定與否，另議。");
  });

  it("attaches U+3000 continuations verbatim, indent kept", () => {
    const spanning = doc.items[3]!;
    expect(spanning.lines).toEqual({ from: 9, to: 11 });
    expect(spanning.textRaw).toBe("後至之問，跨行者——\n　續行之一。\n　續行之二。");
  });

  it("keeps unnumbered category prose as notes, without warnings", () => {
    const tail = doc.categories[2]!;
    expect(tail.notes).toEqual([
      { line: 17, text: "未編號之一行；" },
      { line: 18, text: "再一行。" },
    ]);
    expect(doc.report.warnings).toEqual([]);
  });

  it("reports counts", () => {
    expect(doc.report.categoryCount).toBe(3);
    expect(doc.report.itemCount).toBe(5);
  });

  it("warns on unindented lines after an item and on items at block start", () => {
    const warnFixture = [
      "VIXIO CREATIVES｜《測試》TEST",
      "文件：測試警示清單",
      "版本 9.9｜狀態：測試",
      "前言。",
      "",
      "丙類",
      "一、有問。",
      "散句不縮排。",
      "",
      "四、無類之問。",
      "",
    ].join("\n");
    const warned = parseOpenQuestions(sourceOf(warnFixture));
    expect(warned.report.warnings).toHaveLength(2);
    expect(warned.categories).toHaveLength(1);
    expect(warned.categories[0]!.items.map((i) => i.ordinalRaw)).toEqual(["一", "四"]);
    expect(warned.categories[0]!.notes).toEqual([{ line: 7, text: "散句不縮排。" }]);
    expect(serializeLines(sourceOf(warnFixture).lines)).toBe(warnFixture);
  });

  it("throws on a numbered item before any category heading", () => {
    const broken = [
      "VIXIO CREATIVES｜《測試》TEST",
      "文件：破清單",
      "版本 9.9｜狀態：測試",
      "前言。",
      "",
      "一、太早之問。",
      "",
    ].join("\n");
    expect(() => parseOpenQuestions(sourceOf(broken))).toThrow(CanonParseError);
  });

  it("rejects the other file shape in both directions", () => {
    // A ━ separator means this is not open-questions…
    expect(() => parseOpenQuestions(sourceOf(CANON_FIXTURE))).toThrow(CanonParseError);
    // …and a file with no separators and no 第N章 headings is not a sectioned doc.
    expect(() => parseCanonDoc(sourceOf(OQ_FIXTURE))).toThrow(CanonParseError);
  });
});

describe("decodeCjkNumeral", () => {
  it("decodes the corpus range", () => {
    expect(decodeCjkNumeral("一")).toBe(1);
    expect(decodeCjkNumeral("九")).toBe(9);
    expect(decodeCjkNumeral("十")).toBe(10);
    expect(decodeCjkNumeral("十五")).toBe(15);
    expect(decodeCjkNumeral("十七")).toBe(17);
    expect(decodeCjkNumeral("二十")).toBe(20);
    expect(decodeCjkNumeral("二十一")).toBe(21);
    expect(decodeCjkNumeral("零")).toBe(0);
  });

  it("returns null for non-numerals instead of guessing", () => {
    expect(decodeCjkNumeral("")).toBeNull();
    expect(decodeCjkNumeral("一二")).toBeNull();
    expect(decodeCjkNumeral("十十")).toBeNull();
    expect(decodeCjkNumeral("零十")).toBeNull();
    expect(decodeCjkNumeral("章")).toBeNull();
  });
});

/**
 * Canon loop: the oracle sweep over the real repo, present only where a
 * checkout exists (dev containers, the VPS). CI runs the synthetic fixtures
 * above; this suite pins the parser to the actual bytes. The real files are
 * loaded lazily so that collection cannot throw when the checkout is absent
 * and the suite skips cleanly.
 */
const HTH = process.env["HTH_REPO_PATH"];

const memo = <T,>(compute: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= compute());
};

const loadCanonDoc = (relPath: string) =>
  memo(() => {
    const bytes = readFileSync(`${HTH}/${relPath}`);
    const source = readSource(bytes);
    return { bytes, source, doc: parseCanonDoc(source) };
  });

describe.skipIf(!HTH)("00_canon/world-rules.txt (real repo)", () => {
  const real = loadCanonDoc("00_canon/world-rules.txt");

  it("round-trips byte-exactly", () => {
    const { bytes, source } = real();
    expect(Buffer.from(serializeLines(source.lines), "utf-8").equals(bytes)).toBe(true);
  });

  it("reads the header", () => {
    const { doc } = real();
    expect(doc.header.docTitle).toBe("世界觀設定集（內部・後台）");
    expect(doc.header.version).toBe("2.0");
    expect(doc.header.status).toBe("現行");
  });

  it("finds 11 sections: 核心七則 plus 第一章..第十章", () => {
    const { doc } = real();
    expect(doc.report.sectionCount).toBe(11);
    expect(doc.sections.map((s) => s.ordinal)).toEqual([null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("sees separators on exactly three sections (核心七則, 第一章, 第七章)", () => {
    const { doc } = real();
    const separated = doc.sections
      .map((s, index) => (s.separatorLine !== null ? index : null))
      .filter((index) => index !== null);
    expect(separated).toEqual([0, 1, 7]);
  });

  it("flags exactly one never-ship section and pins its heading", () => {
    const { doc } = real();
    expect(doc.report.neverShipCount).toBe(1);
    const drawer = doc.sections[10]!;
    expect(drawer.neverShip).toBe(true);
    expect(drawer.headingRaw).toBe("第十章　宇宙底層（私人燃料，永不入作品）");
    expect(drawer.ordinal).toBe(10);
    expect(drawer.title).toBe("宇宙底層（私人燃料，永不入作品）");
    expect(doc.sections.filter((s) => s.neverShip)).toHaveLength(1);
  });

  it("tiles the whole file: header + prelude + sections reconstruct the bytes", () => {
    const { source, doc } = real();
    const pieces = [
      serializeLines(source.lines.slice(0, doc.header.endLine)),
      doc.prelude ? serializeLines(source.lines.slice(doc.prelude.from, doc.prelude.to + 1)) : "",
      ...doc.sections.map((s) =>
        serializeLines(
          source.lines.slice(s.separatorLine ?? s.headingLine, (s.body?.to ?? s.headingLine) + 1),
        ),
      ),
    ];
    expect(pieces.join("")).toBe(source.text);
  });

  it("parses with no warnings", () => {
    const { doc } = real();
    expect(doc.report.warnings).toEqual([]);
  });
});

describe.skipIf(!HTH)("00_canon/story-bible.txt (real repo)", () => {
  const real = loadCanonDoc("00_canon/story-bible.txt");

  it("round-trips byte-exactly", () => {
    const { bytes, source } = real();
    expect(Buffer.from(serializeLines(source.lines), "utf-8").equals(bytes)).toBe(true);
  });

  it("finds 5 bare-heading sections, every one separator-introduced", () => {
    const { doc } = real();
    expect(doc.header.docTitle).toBe("故事聖經");
    expect(doc.sections.map((s) => s.headingRaw)).toEqual([
      "定位與主題",
      "人物",
      "第零集梗概（孩子之一話・共28頁；頁面詳見分格腳本）",
      "第一季架構",
      "風格與市場",
    ]);
    expect(doc.sections.every((s) => s.ordinal === null)).toBe(true);
    expect(doc.sections.every((s) => s.separatorLine !== null)).toBe(true);
  });

  it("has no never-ship section", () => {
    const { doc } = real();
    expect(doc.report.neverShipCount).toBe(0);
  });

  it("keeps the trailing blank lines inside the last section body", () => {
    const { source, doc } = real();
    const last = doc.sections[4]!;
    expect(last.body?.to).toBe(source.lines.length - 1);
  });

  it("parses with no warnings", () => {
    const { doc } = real();
    expect(doc.report.warnings).toEqual([]);
  });
});

describe.skipIf(!HTH)("00_canon/open-questions.txt (real repo)", () => {
  const real = memo(() => {
    const bytes = readFileSync(`${HTH}/00_canon/open-questions.txt`);
    const source = readSource(bytes);
    return { bytes, source, doc: parseOpenQuestions(source) };
  });

  it("round-trips byte-exactly", () => {
    const { bytes, source } = real();
    expect(Buffer.from(serializeLines(source.lines), "utf-8").equals(bytes)).toBe(true);
  });

  it("finds the six categories with the audited item counts", () => {
    const { doc } = real();
    expect(doc.header.docTitle).toBe("待決事項清單");
    expect(doc.categories.map((c) => c.nameRaw)).toEqual([
      "人物",
      "反派",
      "世界與戲文",
      "視覺",
      "製作",
      "存而不論",
    ]);
    expect(doc.categories.map((c) => c.items.length)).toEqual([5, 6, 3, 7, 2, 0]);
    expect(doc.report.itemCount).toBe(23);
  });

  it("pins the exact ordinal sequence in file order — never sorted", () => {
    const { doc } = real();
    expect(doc.items.map((i) => i.ordinalRaw)).toEqual([
      "一", "二", "三", "四", "五",
      "六", "六之二", "七", "七之四", "七之二", "七之三",
      "八", "九", "十",
      "十一", "十二", "十三", "十四", "十五", "十五之二", "十五之三",
      "十六", "十七",
    ]);
    // The documented out-of-order pair: 七之四 (L17) precedes 七之二 (L18).
    const ordinals = doc.items.map((i) => i.ordinalRaw);
    expect(ordinals.indexOf("七之四")).toBe(8);
    expect(ordinals.indexOf("七之二")).toBe(9);
    expect(ordinals.indexOf("七之四")).toBeLessThan(ordinals.indexOf("七之二"));
  });

  it("decodes compound ordinals", () => {
    const { doc } = real();
    const compound = doc.items.find((i) => i.ordinalRaw === "十五之二")!;
    expect(compound.ordinalMajor).toBe(15);
    expect(compound.ordinalMinor).toBe(2);
    const outOfOrder = doc.items.find((i) => i.ordinalRaw === "七之四")!;
    expect(outOfOrder.ordinalMajor).toBe(7);
    expect(outOfOrder.ordinalMinor).toBe(4);
  });

  it("matches the audited state census: 已定 ×4, 已定・改 ×1", () => {
    const { doc } = real();
    expect(doc.report.stateCensus).toEqual({ 已定: 4, "已定・改": 1 });
    expect(doc.items.filter((i) => i.state !== null).map((i) => i.ordinalRaw)).toEqual([
      "七之四",
      "十五",
      "十五之二",
      "十五之三",
      "十七",
    ]);
    // Every state-bearing item uses ：, every open item uses 、.
    expect(doc.items.every((i) => (i.state === null) === (i.delimiter === "、"))).toBe(true);
  });

  it("attaches the multi-line items' continuations", () => {
    const { doc } = real();
    const fifteen = doc.items.find((i) => i.ordinalRaw === "十五")!;
    expect(fifteen.lines).toEqual({ from: 34, to: 38 });
    expect(fifteen.textRaw.split("\n")).toHaveLength(5);
  });

  it("keeps the 存而不論 prose as two notes on the last category", () => {
    const { doc } = real();
    const tail = doc.categories[5]!;
    expect(tail.items).toHaveLength(0);
    expect(tail.notes).toHaveLength(2);
    expect(tail.notes.map((n) => n.line)).toEqual([50, 51]);
  });

  it("parses with no warnings", () => {
    const { doc } = real();
    expect(doc.report.warnings).toEqual([]);
  });
});
