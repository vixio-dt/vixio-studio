import { assertLosslessTiling, type LineRange, type SourceText } from "./lines.ts";
import { isSeparatorLine, parseCanonHeader, type CanonHeader } from "./canonHeader.ts";

/**
 * Parsers for the canon documents (00_canon/*.txt). Per the spec
 * (docs/specs/hth-content-model.md §2.4) bodies stay opaque: the software
 * indexes and displays these files, it never interprets their prose. The
 * parse is therefore a lossless segmentation — header / prelude / sections
 * (or categories + items for open-questions) — where every verbatim field is
 * an exact substring of the source and every line is claimed exactly once
 * (assertLosslessTiling), so serialization is the original bytes by
 * construction.
 *
 * The section grammar is derived from the bytes on disk, which deviate from
 * the naive "separator then 第N章" reading in two ways:
 *
 * - `world-rules.txt` opens a section with a ━×23 separator only three
 *   times (核心七則, 第一章, 第七章). Chapters 二..六 and 八..十 follow a
 *   blank line with NO separator, so a standalone 第N章 heading line opens
 *   a section by itself.
 * - `story-bible.txt` has five separator-introduced sections whose headings
 *   are all bare title lines (定位與主題, 人物, 第零集梗概（…）, 第一季架構,
 *   風格與市場) — no 第N章 heading anywhere in the file.
 *
 * `open-questions.txt` is a different shape entirely and gets its own
 * parser: zero ━ separators, bare category headings at block starts, and
 * CJK-numbered items (一、…十七、 plus compound N之M) with optional inline
 * state tokens （已定）/（已定・改） between the ordinal and a ： delimiter.
 * Numbering is continuous across categories and deliberately NOT sorted —
 * 七之四 (line 17) precedes 七之二 (line 18). File order is preserved
 * exactly; nothing here ever sorts.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CanonSection = {
  /** The whole heading line, verbatim. */
  headingRaw: string;
  /** Chapter number decoded from 第N章; null for bare headings (核心七則, 人物, …). */
  ordinal: number | null;
  /**
   * Display title: for 第N章　title headings, the part after the U+3000
   * (null when the heading has no title part); for bare headings, the whole
   * heading line.
   */
  title: string | null;
  /**
   * Line index of the ━×23 separator introducing this section; null when
   * the section opens on a bare chapter heading with no separator above it.
   */
  separatorLine: number | null;
  headingLine: number;
  /**
   * Inclusive line range of the body: everything to the next section or
   * EOF, blank lines included, never trimmed. Null for an empty body.
   */
  body: { from: number; to: number } | null;
  /**
   * True for the private-drawer section that must never reach a prompt or a
   * rendered page (spec §1.1, V=NEVER). Detection: heading or body contains
   * 永不入作品 or 私人燃料. In the real data this is exactly one section,
   * world-rules.txt:142 第十章　宇宙底層（私人燃料，永不入作品）.
   */
  neverShip: boolean;
};

export type CanonReport = {
  sectionCount: number;
  neverShipCount: number;
  warnings: string[];
};

export type CanonDoc = {
  header: CanonHeader;
  /** Lines between the header and the first section (scope note etc.). */
  prelude: { from: number; to: number } | null;
  sections: CanonSection[];
  report: CanonReport;
};

export type OpenQuestionState = "已定" | "已定・改";

export type OpenQuestionItem = {
  /** The numeral token exactly as written, e.g. 七之四 or 十五. */
  ordinalRaw: string;
  ordinalMajor: number;
  /** The M of a compound N之M ordinal; null for simple ordinals. */
  ordinalMinor: number | null;
  /** Inline state token, or null while the item is still open. */
  state: OpenQuestionState | null;
  /** Delimiter found after the ordinal(+state) token: 、 (no state) or ： (with state). */
  delimiter: "、" | "：";
  /**
   * Verbatim text: rest of the first line, then each continuation line
   * joined with \n, U+3000 indent kept. No trim, no normalization.
   */
  textRaw: string;
  /** Inclusive line range: the numbered line plus its continuations. */
  lines: { from: number; to: number };
};

export type OpenQuestionNote = { line: number; text: string };

export type OpenQuestionCategory = {
  /** The bare heading line, verbatim (人物, 反派, …). */
  nameRaw: string;
  headingLine: number;
  /** Items in exact file order — never sorted (七之四 precedes 七之二). */
  items: OpenQuestionItem[];
  /** Unnumbered, unindented lines inside the category (the 存而不論 prose). */
  notes: OpenQuestionNote[];
};

export type OpenQuestionsReport = {
  categoryCount: number;
  itemCount: number;
  /** Occurrences per inline state token, e.g. { 已定: 4, 已定・改: 1 }. */
  stateCensus: Record<string, number>;
  warnings: string[];
};

export type OpenQuestionsDoc = {
  header: CanonHeader;
  /** The scope-note region between the header and the first category. */
  prelude: { from: number; to: number } | null;
  categories: OpenQuestionCategory[];
  /** All items flattened in exact file order — same objects as in categories. */
  items: OpenQuestionItem[];
  report: OpenQuestionsReport;
};

export class CanonParseError extends Error {}

/* ------------------------------------------------------------------ */
/* CJK numerals                                                        */
/* ------------------------------------------------------------------ */

const CJK_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/**
 * Decode the numeral range the canon actually uses (第一章..第十章, items
 * 一..十七): an optional tens digit, 十, an optional ones digit — or a
 * single digit. Anything else returns null so callers stay loud instead of
 * guessing.
 */
export const decodeCjkNumeral = (raw: string): number | null => {
  const ten = raw.indexOf("十");
  if (ten === -1) {
    return raw.length === 1 ? (CJK_DIGIT[raw] ?? null) : null;
  }
  if (raw.indexOf("十", ten + 1) !== -1) return null;
  const tensRaw = raw.slice(0, ten);
  const onesRaw = raw.slice(ten + 1);
  if (tensRaw.length > 1 || onesRaw.length > 1) return null;
  const tens = tensRaw === "" ? 1 : CJK_DIGIT[tensRaw];
  const ones = onesRaw === "" ? 0 : CJK_DIGIT[onesRaw];
  if (tens === undefined || ones === undefined) return null;
  if (tens === 0 || (onesRaw !== "" && ones === 0)) return null; // 零 is not positional here
  return tens * 10 + ones;
};

/* ------------------------------------------------------------------ */
/* Line classifiers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Chapter heading, whole line: 第 + CJK numerals + 章, then optionally a
 * U+3000 and a title. Anchored full-line so prose such as 第三眼受封…
 * (story-bible.txt:23) can never match. A chapter heading opens a section
 * even with no separator above it — that is how world-rules.txt actually
 * delimits chapters 二..六 and 八..十.
 */
const CHAPTER_HEADING_RE = /^第([一二三四五六七八九十]+)章(?:　(.*))?$/;

/** Tokens that mark the private drawer (world-rules.txt:142). */
const NEVER_SHIP_MARKERS = ["永不入作品", "私人燃料"];

const hasNeverShipMarker = (text: string): boolean =>
  NEVER_SHIP_MARKERS.some((marker) => text.includes(marker));

/**
 * Open-questions item start, anchored at column 0 (continuations are
 * U+3000-indented, so they can never match). Grammar from the bytes:
 *
 *   一、text              plain item, 、 delimiter
 *   七之四（已定）：text     state token between the ordinal and a ： delimiter
 *   十五（已定・改）：text
 *
 * The state alternation is closed (longest first); a paren group with any
 * other content is not an item start and falls through to the note path.
 */
const ITEM_START_RE =
  /^([一二三四五六七八九十]+(?:之[一二三四五六七八九十]+)?)(?:（(已定・改|已定)）)?([、：])(.*)$/;

/** Item continuation lines are U+3000-indented. */
const INDENT_RE = /^　/;

/* ------------------------------------------------------------------ */
/* parseCanonDoc — world-rules.txt / story-bible.txt                   */
/* ------------------------------------------------------------------ */

export const parseCanonDoc = (source: SourceText): CanonDoc => {
  const header = parseCanonHeader(source);
  const lines = source.lines;
  const warnings: string[] = [];
  const sections: CanonSection[] = [];
  const claims: LineRange[] = [{ from: 0, to: header.endLine - 1, owner: "header" }];

  const startsSection = (index: number): boolean => {
    const line = lines[index];
    return (
      line !== undefined && (isSeparatorLine(line.text) || CHAPTER_HEADING_RE.test(line.text))
    );
  };

  // Prelude: everything between the header and the first section start
  // (scope note and its surrounding blanks).
  let cursor = header.endLine;
  while (cursor < lines.length && !startsSection(cursor)) cursor += 1;
  if (cursor === lines.length) {
    throw new CanonParseError(
      "No sections found (no ━ separator, no 第N章 heading) — " +
        "for open-questions.txt use parseOpenQuestions.",
    );
  }
  const prelude = cursor > header.endLine ? { from: header.endLine, to: cursor - 1 } : null;
  if (prelude) claims.push({ ...prelude, owner: "prelude" });

  let i = cursor;
  while (i < lines.length) {
    let separatorLine: number | null = null;
    let headingLine = i;
    if (isSeparatorLine(lines[i]!.text)) {
      separatorLine = i;
      headingLine = i + 1;
      const heading = lines[headingLine];
      if (heading === undefined) {
        throw new CanonParseError(`Separator at EOF (line ${i + 1}) heads no section.`);
      }
      if (heading.text === "" || isSeparatorLine(heading.text)) {
        throw new CanonParseError(
          `Line ${headingLine + 1}: separator is not followed by a heading line.`,
        );
      }
    }

    const headingRaw = lines[headingLine]!.text;
    const chapter = CHAPTER_HEADING_RE.exec(headingRaw);
    let ordinal: number | null = null;
    let title: string | null = headingRaw;
    if (chapter && chapter[1] !== undefined) {
      ordinal = decodeCjkNumeral(chapter[1]);
      if (ordinal === null) {
        warnings.push(
          `L${headingLine + 1}: unreadable chapter numeral ${JSON.stringify(chapter[1])}.`,
        );
      }
      title = chapter[2] ?? null;
    }

    // Body: everything to the next separator / chapter heading / EOF.
    let bodyTo = headingLine;
    let next = headingLine + 1;
    while (next < lines.length && !startsSection(next)) {
      bodyTo = next;
      next += 1;
    }
    const body = bodyTo > headingLine ? { from: headingLine + 1, to: bodyTo } : null;

    let neverShip = hasNeverShipMarker(headingRaw);
    if (body) {
      for (let b = body.from; b <= body.to && !neverShip; b += 1) {
        neverShip = hasNeverShipMarker(lines[b]!.text);
      }
    }

    sections.push({ headingRaw, ordinal, title, separatorLine, headingLine, body, neverShip });
    claims.push({
      from: separatorLine ?? headingLine,
      to: bodyTo,
      owner: `section:${sections.length - 1}`,
    });
    i = next;
  }

  assertLosslessTiling(source, claims);

  return {
    header,
    prelude,
    sections,
    report: {
      sectionCount: sections.length,
      neverShipCount: sections.filter((section) => section.neverShip).length,
      warnings,
    },
  };
};

/* ------------------------------------------------------------------ */
/* parseOpenQuestions — open-questions.txt                             */
/* ------------------------------------------------------------------ */

export const parseOpenQuestions = (source: SourceText): OpenQuestionsDoc => {
  const header = parseCanonHeader(source);
  const lines = source.lines;
  const warnings: string[] = [];
  const categories: OpenQuestionCategory[] = [];
  const items: OpenQuestionItem[] = [];
  const claims: LineRange[] = [{ from: 0, to: header.endLine - 1, owner: "header" }];

  // The file has zero ━ separators; one showing up means this is the wrong
  // parser (or the file changed shape). Fail loudly either way.
  for (const line of lines) {
    if (isSeparatorLine(line.text)) {
      throw new CanonParseError(
        `Line ${line.index + 1}: ━ separator — open-questions has none; use parseCanonDoc.`,
      );
    }
  }

  // Prelude: the scope-note region, through the first blank line. (The scope
  // note sits directly under the header at line 4, no blank between.)
  let cursor = header.endLine;
  while (cursor < lines.length && lines[cursor]!.text !== "") cursor += 1;
  const preludeTo = cursor < lines.length ? cursor : lines.length - 1;
  const prelude = preludeTo >= header.endLine ? { from: header.endLine, to: preludeTo } : null;
  if (prelude) claims.push({ ...prelude, owner: "prelude" });
  cursor = preludeTo + 1;

  let currentCategory: OpenQuestionCategory | null = null;
  let openItem: OpenQuestionItem | null = null;
  /** True at the start of a block (after the prelude or a blank line). */
  let expectCategory = true;

  for (let i = cursor; i < lines.length; i += 1) {
    const text = lines[i]!.text;

    if (text === "") {
      claims.push({ from: i, to: i, owner: "blank" });
      expectCategory = true;
      openItem = null;
      continue;
    }

    const itemStart = ITEM_START_RE.exec(text);
    if (itemStart && itemStart[1] !== undefined && itemStart[3] !== undefined) {
      if (currentCategory === null) {
        throw new CanonParseError(`Line ${i + 1}: numbered item before any category heading.`);
      }
      const ordinalRaw = itemStart[1];
      const zhi = ordinalRaw.indexOf("之");
      const majorRaw = zhi === -1 ? ordinalRaw : ordinalRaw.slice(0, zhi);
      const minorRaw = zhi === -1 ? null : ordinalRaw.slice(zhi + 1);
      const ordinalMajor = decodeCjkNumeral(majorRaw);
      const ordinalMinor = minorRaw === null ? null : decodeCjkNumeral(minorRaw);
      if (ordinalMajor === null || (minorRaw !== null && ordinalMinor === null)) {
        warnings.push(
          `L${i + 1}: unreadable item ordinal ${JSON.stringify(ordinalRaw)}; kept as a note.`,
        );
        currentCategory.notes.push({ line: i, text });
        claims.push({ from: i, to: i, owner: "note" });
        openItem = null;
        expectCategory = false;
        continue;
      }
      if (expectCategory) {
        warnings.push(
          `L${i + 1}: numbered item at block start; attached to ` +
            `${JSON.stringify(currentCategory.nameRaw)}.`,
        );
      }
      const stateRaw = itemStart[2];
      const item: OpenQuestionItem = {
        ordinalRaw,
        ordinalMajor,
        ordinalMinor,
        state: stateRaw === "已定" || stateRaw === "已定・改" ? stateRaw : null,
        delimiter: itemStart[3] === "：" ? "：" : "、",
        textRaw: itemStart[4] ?? "",
        lines: { from: i, to: i },
      };
      currentCategory.items.push(item);
      items.push(item);
      claims.push({ from: i, to: i, owner: `item:${items.length - 1}` });
      openItem = item;
      expectCategory = false;
      continue;
    }

    if (INDENT_RE.test(text)) {
      if (openItem === null) {
        if (currentCategory === null) {
          throw new CanonParseError(`Line ${i + 1}: indented line before any category heading.`);
        }
        warnings.push(`L${i + 1}: indented line with no open item; kept as a note.`);
        currentCategory.notes.push({ line: i, text });
        claims.push({ from: i, to: i, owner: "note" });
      } else {
        openItem.textRaw += "\n" + text;
        openItem.lines.to = i;
        claims.push({ from: i, to: i, owner: `item:${items.length - 1}:cont` });
      }
      expectCategory = false;
      continue;
    }

    if (expectCategory) {
      currentCategory = { nameRaw: text, headingLine: i, items: [], notes: [] };
      categories.push(currentCategory);
      claims.push({ from: i, to: i, owner: `category:${categories.length - 1}` });
      openItem = null;
      expectCategory = false;
      continue;
    }

    // Unnumbered, unindented line inside a block — the 存而不論 prose. When
    // an item is still open this is more likely a mis-indented continuation,
    // so say so; verbatim caution means we file it as a note, never guess it
    // into the item.
    if (currentCategory === null) {
      throw new CanonParseError(`Line ${i + 1}: content before any category heading.`);
    }
    if (openItem !== null) {
      warnings.push(`L${i + 1}: unindented line after an item; kept as a note, not a continuation.`);
      openItem = null;
    }
    currentCategory.notes.push({ line: i, text });
    claims.push({ from: i, to: i, owner: "note" });
  }

  if (categories.length === 0) {
    throw new CanonParseError("No categories found below the prelude.");
  }

  assertLosslessTiling(source, claims);

  const stateCensus: Record<string, number> = {};
  for (const item of items) {
    if (item.state !== null) stateCensus[item.state] = (stateCensus[item.state] ?? 0) + 1;
  }

  return {
    header,
    prelude,
    categories,
    items,
    report: {
      categoryCount: categories.length,
      itemCount: items.length,
      stateCensus,
      warnings,
    },
  };
};
