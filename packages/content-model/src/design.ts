import { assertLosslessTiling, type LineRange, type SourceText } from "./lines.ts";
import { isSeparatorLine, parseCanonHeader, type CanonHeader } from "./canonHeader.ts";

/**
 * Parser for the character/set/prop design file
 * (02_art/character-design-prompts.txt, English dialect, v4).
 *
 * Built to the rules the data forces (docs/specs/hth-content-model.md §2.2):
 *
 * - The file is a run of `━`×23-separated regions, and parsing is
 *   REGION-SCOPED. The heading grammar alone is insufficient — 15 regions,
 *   only 8 characters — so the region kind is decided by the line after the
 *   separator, and each grammar applies only inside the region that owns it.
 *   A prop payload marker (`PAPER LOTUS LANTERN:`) is lexically identical in
 *   shape to `CORE BLOCK:`; scoping is what keeps it out of the entries.
 * - An entry heading matches `^([1-8])\. NAME[ (qualifier)]$` with NO
 *   trailing colon. Sub-block markers always END in a colon — that absence
 *   is the discriminator between the two.
 * - Sub-blocks are marker-driven, never positional (order varies: #4 and #6
 *   are CORE→VARIANT→NEGATIVE, #2 is CORE→RENDERING NOTE→NEGATIVE→VARIANT).
 *   `CORE BLOCK:` puts its payload on the FOLLOWING lines; `NEGATIVE:` and
 *   `PALETTE (…):` carry it on the SAME line. Both payload styles run until
 *   the next sub-block marker, a blank line, or the region end — whichever
 *   comes first. The marker boundary matters: Xiaotian's TRUE FORM block is
 *   chased by `PALETTE (…):` and `NEGATIVE (this panel only):` with no blank
 *   line between, so blank-line splitting alone merges three nodes into one.
 * - Marker headers may WRAP. A marker line with no colon continues onto the
 *   following lines and terminates only at a line-ENDING colon: TRUE FORM
 *   wraps L64–66, and Shengtian's RENDERING NOTE wraps L98–103 — its
 *   mid-line colon on the second line (`…2026-07-30): the model's…`) does
 *   not terminate the header, only the line-ending colon at L103 does.
 * - Payloads are verbatim-critical byte-exact substrings of the source: no
 *   trim, no rewrap, no normalization. Same-line payloads drop exactly the
 *   `: ` separator; everything else is whole-line slices joined by `\n`.
 * - `STYLE BLOCK A` / `STYLE BLOCK B` parse but are STALE (the author's
 *   final style lives in production-pipeline-spec.txt §8, spec §1.2), so
 *   every StyleBlockEntry carries `superseded: true` and must never be
 *   compiled into a prompt.
 *
 * The parse is a lossless segmentation: every line of the file is claimed by
 * exactly one construct, verified by assertLosslessTiling, so serialization
 * is the original text by construction.
 */

/** Inclusive 0-based line span. */
export type DesignLineSpan = { from: number; to: number };

export type DesignRegionKind =
  | "usage-rules"
  | "render-specs"
  | "character"
  | "sets"
  | "props"
  | "styles"
  | "key-frame"
  | "color-rules"
  | "other";

export type DesignRegion = {
  kind: DesignRegionKind;
  /** Heading line(s) verbatim; wrapped headings keep their line breaks. */
  headingRaw: string;
  /** Span including the leading `━` separator line. */
  lines: DesignLineSpan;
};

export type DesignSubBlockKind = "core" | "negative" | "variant" | "palette" | "rendering-note";

export type DesignSubBlock = {
  kind: DesignSubBlockKind;
  /**
   * Marker text before the terminating colon, e.g. `CORE BLOCK`,
   * `NEGATIVE (this panel only)`, `VARIANT — TRUE FORM (…)`. Wrapped
   * headers keep their line breaks.
   */
  label: string;
  /** Byte-exact payload (verbatim-critical — no trim, no rewrap). */
  payloadRaw: string;
  /** Span of the marker line(s) plus payload lines. */
  lines: DesignLineSpan;
};

export type CharacterEntry = {
  /** 1–8, from the heading. */
  ordinal: number;
  /** Heading name verbatim, e.g. `SHENGTIAN`. */
  nameLiteral: string;
  /** Heading paren content, e.g. `stage costume`. */
  qualifier: string | null;
  headingLine: number;
  /** Marker-driven, in file order — order is NOT fixed across entries. */
  subBlocks: DesignSubBlock[];
  /** Span from the heading to the end of the entry's region. */
  lines: DesignLineSpan;
};

export type SetSubVersion = {
  /** e.g. `Stage version`. */
  label: string;
  payloadRaw: string;
  lines: DesignLineSpan;
};

export type SetBlock = {
  ordinal: number;
  nameLiteral: string;
  gloss: string | null;
  headerLine: number;
  /** All payload lines verbatim (includes sub-version lines when present). */
  payloadRaw: string;
  /** SET 2 only in v4 (`Stage version:` / `Backstage version:`), file order. */
  subVersions: SetSubVersion[];
  lines: DesignLineSpan;
};

export type PropBlock = {
  nameLiteral: string;
  headerLine: number;
  payloadRaw: string;
  lines: DesignLineSpan;
};

export type StyleBlockEntry = {
  /** e.g. `STYLE BLOCK A`. */
  label: string;
  /** e.g. `painterly`. */
  gloss: string | null;
  headerLine: number;
  payloadRaw: string;
  /**
   * ALWAYS true. STYLE BLOCK A/B in this file are stale — the author's FINAL
   * style block lives in production-pipeline-spec.txt §8 and supersedes them
   * (spec §1.2). These blocks exist for provenance only and MUST NEVER be
   * compiled into a prompt. The literal `true` type makes any code path that
   * wants a non-superseded style block from this file unrepresentable.
   */
  superseded: true;
  lines: DesignLineSpan;
};

export type DesignReport = {
  characterCount: number;
  setCount: number;
  propCount: number;
  warnings: string[];
};

export type DesignDoc = {
  header: CanonHeader;
  /** Every `━`-separated region, in file order. */
  regions: DesignRegion[];
  characters: CharacterEntry[];
  sets: SetBlock[];
  props: PropBlock[];
  styleBlocks: StyleBlockEntry[];
  report: DesignReport;
};

export class DesignParseError extends Error {}

/* ------------------------------------------------------------------ */
/* Line classifiers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Character entry heading — no trailing colon (the discriminator against
 * sub-block markers, which always end in one).
 */
const ENTRY_HEADING_RE = /^([1-8])\. ([A-Z][A-Z ]*[A-Z])(?: \((.+)\))?$/;
const SET_HEADER_RE = /^SET (\d+) — (.+?)(?: \((.+)\))?$/;
/** ALL-CAPS name + colon alone on a line, e.g. `PAPER LOTUS LANTERN:`. */
const PROP_HEADER_RE = /^([A-Z][A-Z -]*[A-Z]):$/;
const STYLE_HEADER_RE = /^(STYLE BLOCK [A-Z])(?: \((.+)\))?:$/;
/** SET 2's labeled sub-versions, `Stage version: "…"`. */
const SET_SUB_VERSION_RE = /^([A-Z][A-Za-z-]* version): (.*)$/;

/**
 * Sub-block markers, matched case-sensitively at column 0 only. Payload
 * prose lookalikes (`Palette:`, `Props:`, `Expression baseline:`) are mixed
 * case and stay inside their payload.
 */
const SUB_BLOCK_STARTS: readonly (readonly [RegExp, DesignSubBlockKind])[] = [
  [/^CORE BLOCK:/, "core"],
  [/^NEGATIVE[ :(]/, "negative"],
  [/^VARIANT — /, "variant"],
  [/^PALETTE[ :(]/, "palette"],
  [/^RENDERING NOTE[ :(]/, "rendering-note"],
];

const subBlockKindAt = (text: string): DesignSubBlockKind | null => {
  for (const [re, kind] of SUB_BLOCK_STARTS) {
    if (re.test(text)) return kind;
  }
  return null;
};

const classifyRegionHeading = (text: string): DesignRegionKind => {
  if (ENTRY_HEADING_RE.test(text)) return "character";
  if (text.startsWith("Usage Rules")) return "usage-rules";
  if (text.startsWith("Global Render Specs")) return "render-specs";
  if (text.startsWith("Set Blocks")) return "sets";
  if (text.startsWith("Prop Blocks")) return "props";
  if (text.startsWith("Style Blocks")) return "styles";
  if (text.startsWith("KEY FRAME")) return "key-frame";
  if (text.startsWith("Color Rules")) return "color-rules";
  return "other";
};

const REGION_BLOCK_HEADER = {
  sets: SET_HEADER_RE,
  props: PROP_HEADER_RE,
  styles: STYLE_HEADER_RE,
} as const;

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

export const parseDesignDoc = (source: SourceText): DesignDoc => {
  const header = parseCanonHeader(source);
  const lines = source.lines;
  const warnings: string[] = [];
  const claims: LineRange[] = [];
  const regions: DesignRegion[] = [];
  const characters: CharacterEntry[] = [];
  const sets: SetBlock[] = [];
  const props: PropBlock[] = [];
  const styleBlocks: StyleBlockEntry[] = [];

  const rawSpan = (from: number, to: number): string =>
    lines
      .slice(from, to + 1)
      .map((line) => line.text)
      .join("\n");

  /**
   * Read a sub-block marker header starting at `start`.
   * - Colon at line end → single-line header, payload on the following lines.
   * - Colon mid-line → the payload rides the same line, past the `: `.
   * - No colon on the first line → wrapped header: continue onto following
   *   lines and terminate only at a line-ENDING colon. Mid-line colons on
   *   continuation lines do NOT terminate (RENDERING NOTE L98–103).
   */
  const readMarkerHeader = (
    start: number,
    regionEnd: number,
  ): { label: string; headerEnd: number; inlinePayload: string | null } => {
    const first = lines[start]!.text;
    const colon = first.indexOf(":");
    if (colon !== -1) {
      const label = first.slice(0, colon);
      if (colon === first.length - 1) {
        return { label, headerEnd: start, inlinePayload: null };
      }
      const after = first.slice(colon + 1);
      return {
        label,
        headerEnd: start,
        inlinePayload: after.startsWith(" ") ? after.slice(1) : after,
      };
    }
    const parts = [first];
    for (let i = start + 1; i <= regionEnd; i += 1) {
      const text = lines[i]!.text;
      if (text === "") break;
      parts.push(text);
      if (text.endsWith(":")) {
        return { label: parts.join("\n").slice(0, -1), headerEnd: i, inlinePayload: null };
      }
    }
    throw new DesignParseError(
      `L${start + 1}: marker header has no terminating colon before the block boundary.`,
    );
  };

  /**
   * Payload boundary rule: lines from `from` belong to the open block until
   * the first blank line, the first line that starts a new block (per
   * `isBoundary`), or the region end. Returns the last payload line
   * (`from - 1` when the payload is empty).
   */
  const payloadEndFrom = (
    from: number,
    regionEnd: number,
    isBoundary: (text: string) => boolean,
  ): number => {
    let i = from;
    while (i <= regionEnd) {
      const text = lines[i]!.text;
      if (text === "" || isBoundary(text)) break;
      i += 1;
    }
    return i - 1;
  };

  const parseCharacterRegion = (
    sep: number,
    headingLine: number,
    end: number,
    heading: RegExpExecArray,
  ): void => {
    const ordinal = Number(heading[1]);
    const nameLiteral = heading[2]!;
    const qualifier = heading[3] === undefined ? null : heading[3];
    claims.push({ from: sep, to: headingLine, owner: `char:${ordinal}:heading` });

    const subBlocks: DesignSubBlock[] = [];
    let i = headingLine + 1;
    while (i <= end) {
      const text = lines[i]!.text;
      if (text === "") {
        claims.push({ from: i, to: i, owner: "blank" });
        i += 1;
        continue;
      }
      const kind = subBlockKindAt(text);
      if (kind === null) {
        warnings.push(
          `L${i + 1}: orphan line in entry ${ordinal}. ${nameLiteral}: ${JSON.stringify(text)}`,
        );
        claims.push({ from: i, to: i, owner: `char:${ordinal}:orphan` });
        i += 1;
        continue;
      }
      const { label, headerEnd, inlinePayload } = readMarkerHeader(i, end);
      const payloadEnd = payloadEndFrom(headerEnd + 1, end, (t) => subBlockKindAt(t) !== null);
      let payloadRaw: string;
      if (inlinePayload !== null) {
        payloadRaw =
          payloadEnd >= headerEnd + 1
            ? `${inlinePayload}\n${rawSpan(headerEnd + 1, payloadEnd)}`
            : inlinePayload;
      } else if (payloadEnd >= headerEnd + 1) {
        payloadRaw = rawSpan(headerEnd + 1, payloadEnd);
      } else {
        warnings.push(`L${i + 1}: ${kind} marker with an empty payload.`);
        payloadRaw = "";
      }
      const to = Math.max(headerEnd, payloadEnd);
      subBlocks.push({ kind, label, payloadRaw, lines: { from: i, to } });
      claims.push({ from: i, to, owner: `char:${ordinal}:${kind}` });
      i = to + 1;
    }

    if (!subBlocks.some((block) => block.kind === "core")) {
      warnings.push(`Entry ${ordinal}. ${nameLiteral} has no CORE BLOCK.`);
    }
    if (!subBlocks.some((block) => block.kind === "negative")) {
      warnings.push(`Entry ${ordinal}. ${nameLiteral} has no NEGATIVE.`);
    }
    characters.push({
      ordinal,
      nameLiteral,
      qualifier,
      headingLine,
      subBlocks,
      lines: { from: headingLine, to: end },
    });
  };

  /** Shared walk for the sets / props / styles block regions. */
  const walkBlocks = (
    from: number,
    end: number,
    regionLabel: string,
    headerRe: RegExp,
    onBlock: (m: RegExpExecArray, headerLine: number, payloadEnd: number) => string,
  ): void => {
    let i = from;
    while (i <= end) {
      const text = lines[i]!.text;
      if (text === "") {
        claims.push({ from: i, to: i, owner: "blank" });
        i += 1;
        continue;
      }
      const m = headerRe.exec(text);
      if (!m) {
        warnings.push(`L${i + 1}: orphan line in ${regionLabel} region: ${JSON.stringify(text)}`);
        claims.push({ from: i, to: i, owner: `${regionLabel}:orphan` });
        i += 1;
        continue;
      }
      const payloadEnd = payloadEndFrom(i + 1, end, (t) => headerRe.test(t));
      if (payloadEnd < i + 1) {
        warnings.push(`L${i + 1}: block header with an empty payload in ${regionLabel} region.`);
      }
      const to = Math.max(i, payloadEnd);
      const owner = onBlock(m, i, payloadEnd);
      claims.push({ from: i, to, owner });
      i = to + 1;
    }
  };

  const parseSetsRegion = (from: number, end: number): void => {
    walkBlocks(from, end, "sets", SET_HEADER_RE, (m, headerLine, payloadEnd) => {
      const ordinal = Number(m[1]);
      const payloadRaw = payloadEnd >= headerLine + 1 ? rawSpan(headerLine + 1, payloadEnd) : "";
      const subVersions: SetSubVersion[] = [];
      let v = headerLine + 1;
      while (v <= payloadEnd) {
        const sub = SET_SUB_VERSION_RE.exec(lines[v]!.text);
        if (!sub) {
          v += 1;
          continue;
        }
        let subEnd = v;
        while (subEnd + 1 <= payloadEnd && !SET_SUB_VERSION_RE.test(lines[subEnd + 1]!.text)) {
          subEnd += 1;
        }
        const continuation = subEnd > v ? `\n${rawSpan(v + 1, subEnd)}` : "";
        subVersions.push({
          label: sub[1]!,
          payloadRaw: `${sub[2]!}${continuation}`,
          lines: { from: v, to: subEnd },
        });
        v = subEnd + 1;
      }
      sets.push({
        ordinal,
        nameLiteral: m[2]!,
        gloss: m[3] === undefined ? null : m[3],
        headerLine,
        payloadRaw,
        subVersions,
        lines: { from: headerLine, to: Math.max(headerLine, payloadEnd) },
      });
      return `set:${ordinal}`;
    });
  };

  const parsePropsRegion = (from: number, end: number): void => {
    walkBlocks(from, end, "props", PROP_HEADER_RE, (m, headerLine, payloadEnd) => {
      const nameLiteral = m[1]!;
      props.push({
        nameLiteral,
        headerLine,
        payloadRaw: payloadEnd >= headerLine + 1 ? rawSpan(headerLine + 1, payloadEnd) : "",
        lines: { from: headerLine, to: Math.max(headerLine, payloadEnd) },
      });
      return `prop:${nameLiteral}`;
    });
  };

  const parseStylesRegion = (from: number, end: number): void => {
    walkBlocks(from, end, "styles", STYLE_HEADER_RE, (m, headerLine, payloadEnd) => {
      const label = m[1]!;
      styleBlocks.push({
        label,
        gloss: m[2] === undefined ? null : m[2],
        headerLine,
        payloadRaw: payloadEnd >= headerLine + 1 ? rawSpan(headerLine + 1, payloadEnd) : "",
        superseded: true,
        lines: { from: headerLine, to: Math.max(headerLine, payloadEnd) },
      });
      return `style:${label}`;
    });
  };

  /* ---------------- prelude ---------------- */
  // Header, then anything before the first separator (the v4 changelog
  // parenthetical and its trailing blank line).
  let firstSep = header.endLine;
  while (firstSep < lines.length && !isSeparatorLine(lines[firstSep]!.text)) firstSep += 1;
  if (firstSep === lines.length) {
    throw new DesignParseError("No region separator found.");
  }
  claims.push({ from: 0, to: header.endLine - 1, owner: "header" });
  if (firstSep > header.endLine) {
    claims.push({ from: header.endLine, to: firstSep - 1, owner: "prelude" });
  }

  /* ---------------- regions ---------------- */
  const separatorLines: number[] = [];
  for (let i = firstSep; i < lines.length; i += 1) {
    if (isSeparatorLine(lines[i]!.text)) separatorLines.push(i);
  }

  separatorLines.forEach((sep, regionIndex) => {
    const end =
      regionIndex + 1 < separatorLines.length
        ? separatorLines[regionIndex + 1]! - 1
        : lines.length - 1;
    const headingLine = sep + 1;
    if (headingLine > end) {
      throw new DesignParseError(`Separator at line ${sep + 1} opens an empty region.`);
    }
    const headingText = lines[headingLine]!.text;

    const entry = ENTRY_HEADING_RE.exec(headingText);
    if (entry) {
      regions.push({ kind: "character", headingRaw: headingText, lines: { from: sep, to: end } });
      parseCharacterRegion(sep, headingLine, end, entry);
      return;
    }

    const kind = classifyRegionHeading(headingText);
    if (kind === "sets" || kind === "props" || kind === "styles") {
      // The region heading may wrap (Set Blocks spans two lines); it runs to
      // the blank line that follows it, stopping early at a block header.
      const blockRe = REGION_BLOCK_HEADER[kind];
      let headingTo = headingLine;
      while (
        headingTo + 1 <= end &&
        lines[headingTo + 1]!.text !== "" &&
        !blockRe.test(lines[headingTo + 1]!.text)
      ) {
        headingTo += 1;
      }
      regions.push({
        kind,
        headingRaw: rawSpan(headingLine, headingTo),
        lines: { from: sep, to: end },
      });
      claims.push({ from: sep, to: headingTo, owner: `region:${regionIndex}:heading` });
      if (kind === "sets") parseSetsRegion(headingTo + 1, end);
      else if (kind === "props") parsePropsRegion(headingTo + 1, end);
      else parseStylesRegion(headingTo + 1, end);
      return;
    }

    // Unstructured regions (usage rules, global render specs, key frame,
    // color rules) are claimed whole; their bodies stay opaque here.
    if (kind === "other") {
      warnings.push(`L${headingLine + 1}: unrecognized region heading: ${JSON.stringify(headingText)}`);
    }
    regions.push({ kind, headingRaw: headingText, lines: { from: sep, to: end } });
    claims.push({ from: sep, to: end, owner: `region:${regionIndex}:${kind}` });
  });

  characters.forEach((character, index) => {
    if (character.ordinal !== index + 1) {
      warnings.push(
        `Entry ordinal ${character.ordinal} (${character.nameLiteral}) is out of sequence ` +
          `at position ${index + 1}.`,
      );
    }
  });

  assertLosslessTiling(source, claims);

  return {
    header,
    regions,
    characters,
    sets,
    props,
    styleBlocks,
    report: {
      characterCount: characters.length,
      setCount: sets.length,
      propCount: props.length,
      warnings,
    },
  };
};
