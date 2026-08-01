import { assertLosslessTiling, type LineRange, type SourceText } from "./lines.ts";
import { isSeparatorLine, parseCanonHeader, type CanonHeader } from "./canonHeader.ts";

/**
 * Parser for the episode panel script (01_script/episode-zero-script.txt).
 *
 * Built to the nine rules the data forces (docs/specs/hth-content-model.md
 * §2.1): markers are scanned anywhere in a line, only the seven whitelisted
 * tokens count, 白 requires its paren group, page/panel markers anchor at
 * column 0, panels open implicitly on shape pages, trailing text after a
 * page header's `）` is kept, paren balancing is never applied to values,
 * and 音 payloads may be a bare `——`.
 *
 * The parse is a lossless segmentation: every line of the file is claimed by
 * exactly one construct, verified by assertLosslessTiling, so serialization
 * is the original text by construction.
 */

export type FieldKind = "畫" | "白" | "音" | "註" | "題字" | "頁角小字" | "頁角題字";

export type FieldPart = {
  line: number;
  /** Character offsets into that line's text. */
  from: number;
  to: number;
};

export type PanelField = {
  kind: FieldKind;
  /** Content of the paren group after the marker, without the parens. */
  paren: string | null;
  /** Exact substrings, in order; continuation lines contribute whole-line parts. */
  parts: FieldPart[];
  /** Convenience reading: parts joined with \n, continuation indent kept. */
  raw: string;
};

export type Panel = {
  /** 1-based ordinal from the 格N marker; null for implicit panels. */
  ordinal: number | null;
  implicit: boolean;
  /** Paren attr on the 格 header, e.g. 橫長，全黑 / 斜分一格為二. */
  attrRaw: string | null;
  headerLine: number | null;
  fields: PanelField[];
};

export type PageBlock = {
  /** 0-based ordinal of the page header in the file. */
  blockIndex: number;
  pageStart: number;
  pageEnd: number | null;
  physicalPages: number[];
  attrRaw: string;
  attrKind: "panel-count" | "shape";
  declaredPanelCount: number | null;
  trailingNote: string | null;
  headerLine: number;
  actIndex: number | null;
  panels: Panel[];
};

export type Act = {
  name: string;
  declaredStart: number | null;
  declaredEnd: number | null;
  headingLine: number;
};

export type ScriptReport = {
  pageBlockCount: number;
  physicalPageCount: number;
  panelCount: number;
  fieldCounts: Record<string, number>;
  /** e.g. "畫+白+註" → 10 */
  fieldSequenceCensus: Record<string, number>;
  declaredPanelMismatches: { blockIndex: number; declared: number; actual: number }[];
  actRangeMismatches: { actIndex: number; declared: string; actual: string }[];
  warnings: string[];
};

export type ScriptDoc = {
  header: CanonHeader;
  acts: Act[];
  pages: PageBlock[];
  report: ScriptReport;
};

export class ScriptParseError extends Error {}

/* ------------------------------------------------------------------ */
/* Line classifiers                                                    */
/* ------------------------------------------------------------------ */

const PAGE_HEADER_RE = /^第(\d+)(?:至(\d+))?頁（([^）]*)）(.*)$/;
const PANEL_HEADER_RE = /^格(\d+)(?:（([^）]*)）)?(.*)$/;
const ACT_HEADING_RE = /^(.+?)（第(\d+)至(\d+)頁）$/;
const PANEL_COUNT_RE = /^(\d+)格$/;

/**
 * The seven field markers, longest alternatives first. The paren group is
 * part of the token; the colon is mandatory.
 */
const MARKER_RE = /(頁角小字|頁角題字|題字|畫|白|音|註)(（[^）]*）)?：/g;

/**
 * A marker occurrence is a real field boundary only when it does not sit
 * inside a word: the preceding character must not be a Han ideograph, an
 * ASCII letter, or a digit. In the data, real mid-line markers are always
 * preceded by punctuation (。！）——) or U+3000. This is what rejects prose
 * like 聲音： and 渲染基調： without a hand-kept denylist.
 */
const WORDLIKE_BEFORE = /[\p{Script=Han}A-Za-z0-9]/u;

type MarkerHit = {
  kind: FieldKind;
  paren: string | null;
  /** Char offset where the marker token starts. */
  start: number;
  /** Char offset just past the colon, where the value begins. */
  valueFrom: number;
};

const scanMarkers = (text: string, fromCol: number): MarkerHit[] => {
  const hits: MarkerHit[] = [];
  MARKER_RE.lastIndex = fromCol;
  for (let m = MARKER_RE.exec(text); m !== null; m = MARKER_RE.exec(text)) {
    const kind = m[1] as FieldKind;
    const parenGroup = m[2];
    const before = m.index > 0 ? text[m.index - 1]! : null;
    const wordlike = before !== null && WORDLIKE_BEFORE.test(before);
    const missingRequiredParen = kind === "白" && parenGroup === undefined;
    if (!wordlike && !missingRequiredParen) {
      hits.push({
        kind,
        paren: parenGroup === undefined ? null : parenGroup.slice(1, -1),
        start: m.index,
        valueFrom: m.index + m[0].length,
      });
    }
  }
  return hits;
};

const INDENT_RE = /^　+/;

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

export const parseScript = (source: SourceText): ScriptDoc => {
  const header = parseCanonHeader(source);
  const warnings: string[] = [];
  const acts: Act[] = [];
  const pages: PageBlock[] = [];
  const claims: LineRange[] = [];
  const lines = source.lines;

  /** First separator line marks the end of the prelude (title, legend). */
  let cursor = 0;
  while (cursor < lines.length && !isSeparatorLine(lines[cursor]!.text)) cursor += 1;
  if (cursor === lines.length) throw new ScriptParseError("No act separator found.");
  claims.push({ from: 0, to: cursor - 1, owner: "prelude" });

  let currentPage: PageBlock | null = null;
  let currentPanel: Panel | null = null;
  let openField: PanelField | null = null;

  const closePage = () => {
    currentPage = null;
    currentPanel = null;
    openField = null;
  };

  const requirePanel = (line: number): Panel => {
    if (!currentPage) {
      throw new ScriptParseError(`Line ${line + 1}: field content outside any page block.`);
    }
    if (!currentPanel) {
      // Shape pages open their single panel implicitly (8 cases, including
      // both spreads and the title page).
      const panel: Panel = {
        ordinal: null,
        implicit: true,
        attrRaw: null,
        headerLine: null,
        fields: [],
      };
      currentPage.panels.push(panel);
      currentPanel = panel;
    }
    return currentPanel;
  };

  const addFieldsFromLine = (
    lineIndex: number,
    text: string,
    hits: MarkerHit[],
    /** Where content begins on this line (past a 格 header, if any). */
    prefixStart: number,
  ): PanelField => {
    // Text between the content start and the first marker continues the
    // open field.
    const first = hits[0]!;
    if (first.start > prefixStart) {
      const prefix = text.slice(prefixStart, first.start);
      const indentOnly = /^　+$/.test(prefix);
      if (!indentOnly) {
        if (openField) {
          openField.parts.push({ line: lineIndex, from: prefixStart, to: first.start });
        } else {
          warnings.push(`L${lineIndex + 1}: text before first field marker with no open field.`);
        }
      }
    }
    const panel = requirePanel(lineIndex);
    hits.forEach((hit, i) => {
      const valueTo = i + 1 < hits.length ? hits[i + 1]!.start : text.length;
      panel.fields.push({
        kind: hit.kind,
        paren: hit.paren,
        parts: [{ line: lineIndex, from: hit.valueFrom, to: valueTo }],
        raw: "",
      });
    });
    // hits is never empty at the call sites, so a field was just pushed.
    return panel.fields[panel.fields.length - 1]!;
  };

  for (let i = cursor; i < lines.length; i += 1) {
    const line = lines[i]!;
    const text = line.text;

    if (isSeparatorLine(text)) {
      closePage();
      // A separator introduces either an act heading （第N至M頁） or, when
      // the next line doesn't match that grammar, the closing postscript —
      // claim everything to EOF (the file ends with prose after the last
      // separator, e.g. 第零集全稿完…).
      const headingLine = lines[i + 1];
      if (!headingLine) throw new ScriptParseError(`Separator at EOF (line ${i + 1}).`);
      const heading = ACT_HEADING_RE.exec(headingLine.text);
      if (heading) {
        acts.push({
          name: heading[1]!,
          declaredStart: Number(heading[2]),
          declaredEnd: Number(heading[3]),
          headingLine: headingLine.index,
        });
        claims.push({ from: i, to: i + 1, owner: `act:${acts.length - 1}` });
        i += 1;
        continue;
      }
      claims.push({ from: i, to: lines.length - 1, owner: "postscript" });
      break;
    }

    if (text === "") {
      closePage();
      claims.push({ from: i, to: i, owner: "blank" });
      continue;
    }

    const pageHeader = PAGE_HEADER_RE.exec(text);
    if (pageHeader) {
      closePage();
      const pageStart = Number(pageHeader[1]);
      const pageEnd = pageHeader[2] === undefined ? null : Number(pageHeader[2]);
      const attrRaw = pageHeader[3]!;
      const countMatch = PANEL_COUNT_RE.exec(attrRaw);
      const physicalPages: number[] = [];
      for (let p = pageStart; p <= (pageEnd ?? pageStart); p += 1) physicalPages.push(p);
      const page: PageBlock = {
        blockIndex: pages.length,
        pageStart,
        pageEnd,
        physicalPages,
        attrRaw,
        attrKind: countMatch ? "panel-count" : "shape",
        declaredPanelCount: countMatch ? Number(countMatch[1]) : null,
        trailingNote: pageHeader[4] === "" ? null : pageHeader[4]!,
        headerLine: i,
        actIndex: acts.length > 0 ? acts.length - 1 : null,
        panels: [],
      };
      pages.push(page);
      currentPage = page;
      claims.push({ from: i, to: i, owner: `page:${page.blockIndex}` });
      continue;
    }

    const panelHeader = PANEL_HEADER_RE.exec(text);
    if (panelHeader && currentPage) {
      const panel: Panel = {
        ordinal: Number(panelHeader[1]),
        implicit: false,
        attrRaw: panelHeader[2] === undefined ? null : panelHeader[2],
        headerLine: i,
        fields: [],
      };
      currentPage.panels.push(panel);
      currentPanel = panel;
      openField = null;
      claims.push({ from: i, to: i, owner: `panel:${currentPage.blockIndex}:${panel.ordinal}` });
      // The 格 header line may carry fields after the paren (rule 1).
      const rest = panelHeader[3] ?? "";
      if (rest !== "") {
        const restStart = text.length - rest.length;
        const hits = scanMarkers(text, restStart);
        if (hits.length > 0) {
          openField = addFieldsFromLine(i, text, hits, restStart);
        } else {
          warnings.push(`L${i + 1}: trailing text on 格 header with no field marker.`);
        }
      }
      continue;
    }

    // Content line: fields and continuations.
    if (!currentPage) {
      // Prose between the act heading and the first page header (act intro
      // lines). Claimed by the current act.
      claims.push({ from: i, to: i, owner: `act-prose:${acts.length - 1}` });
      continue;
    }

    const hits = scanMarkers(text, 0);
    claims.push({ from: i, to: i, owner: `content:${currentPage.blockIndex}` });
    if (hits.length > 0) {
      openField = addFieldsFromLine(i, text, hits, 0);
      continue;
    }
    // No markers: continuation of the open field.
    if (openField) {
      openField.parts.push({ line: i, from: 0, to: text.length });
      if (!INDENT_RE.test(text)) {
        warnings.push(`L${i + 1}: unindented continuation line.`);
      }
      continue;
    }
    warnings.push(`L${i + 1}: orphan content line (no open field): ${JSON.stringify(text)}`);
  }

  assertLosslessTiling(source, claims);

  /* ---------------- finalize field raw values ---------------- */
  for (const page of pages) {
    for (const panel of page.panels) {
      for (const field of panel.fields) {
        field.raw = field.parts
          .map((part) => lines[part.line]!.text.slice(part.from, part.to))
          .join("\n");
      }
    }
  }

  /* ---------------- report ---------------- */
  const fieldCounts: Record<string, number> = {};
  const fieldSequenceCensus: Record<string, number> = {};
  let panelCount = 0;
  const declaredPanelMismatches: ScriptReport["declaredPanelMismatches"] = [];
  const physical = new Set<number>();

  for (const page of pages) {
    for (const p of page.physicalPages) physical.add(p);
    panelCount += page.panels.length;
    if (page.declaredPanelCount !== null && page.declaredPanelCount !== page.panels.length) {
      declaredPanelMismatches.push({
        blockIndex: page.blockIndex,
        declared: page.declaredPanelCount,
        actual: page.panels.length,
      });
    }
    for (const panel of page.panels) {
      const sequence = panel.fields.map((f) => f.kind).join("+");
      fieldSequenceCensus[sequence] = (fieldSequenceCensus[sequence] ?? 0) + 1;
      for (const field of panel.fields) {
        fieldCounts[field.kind] = (fieldCounts[field.kind] ?? 0) + 1;
      }
    }
  }

  const actRangeMismatches: ScriptReport["actRangeMismatches"] = [];
  acts.forEach((act, actIndex) => {
    const actPages = pages.filter((p) => p.actIndex === actIndex);
    if (actPages.length === 0 || act.declaredStart === null) return;
    const actualStart = actPages[0]!.pageStart;
    const last = actPages[actPages.length - 1]!;
    const actualEnd = last.pageEnd ?? last.pageStart;
    if (actualStart !== act.declaredStart || actualEnd !== act.declaredEnd) {
      actRangeMismatches.push({
        actIndex,
        declared: `${act.declaredStart}–${act.declaredEnd}`,
        actual: `${actualStart}–${actualEnd}`,
      });
    }
  });

  return {
    header,
    acts,
    pages,
    report: {
      pageBlockCount: pages.length,
      physicalPageCount: physical.size,
      panelCount,
      fieldCounts,
      fieldSequenceCensus,
      declaredPanelMismatches,
      actRangeMismatches,
      warnings,
    },
  };
};
