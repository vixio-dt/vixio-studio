/**
 * Parsed-view projections over @vixio/content-model.
 *
 * buildDocView dispatches on the repo-relative path and projects the parser
 * output into wire shapes. Field names come straight from the parser types
 * (Pick projections, never re-invented); what the views drop is only the
 * line/offset bookkeeping (headerLine, parts, lines, …) that a client
 * rendering an entity view does not need. Canon section bodies — which the
 * parser models as line ranges — are resolved here to their verbatim text so
 * the client never has to fetch the raw bytes to display a section.
 *
 * NEVER-SHIP gating: redactNeverShip structurally replaces the body of every
 * view node flagged neverShip (today: canon sections, the only parser node
 * carrying the flag) with { redacted: true }. Applied server-side by the
 * /view route unless the request carries drawer=author, so the private bytes
 * never appear anywhere in the default response JSON.
 */
import {
  parseCanonDoc,
  parseDesignDoc,
  parseManifest,
  parseOpenQuestions,
  parseScript,
  readSource,
  type Act,
  type CanonHeader,
  type CanonSection,
  type CharacterEntry,
  type DesignSubBlock,
  type ManifestRecord,
  type OpenQuestionsDoc,
  type PageBlock,
  type Panel,
  type PanelField,
  type PropBlock,
  type ScriptReport,
  type SetBlock,
  type SetSubVersion,
  type SourceText,
  type StyleBlockEntry,
} from "@vixio/content-model";

/** Structural stand-in for a never-ship body: the bytes are simply not there. */
export type Redacted = { redacted: true };

/* ------------------------------------------------------------------ */
/* View shapes (projections of the parser types)                       */
/* ------------------------------------------------------------------ */

export type ScriptFieldView = Pick<PanelField, "kind" | "paren" | "raw">;

export type ScriptPanelView = Pick<Panel, "ordinal" | "implicit" | "attrRaw"> & {
  fields: ScriptFieldView[];
};

export type ScriptPageView = Pick<
  PageBlock,
  | "blockIndex"
  | "pageStart"
  | "pageEnd"
  | "attrRaw"
  | "attrKind"
  | "declaredPanelCount"
  | "trailingNote"
> & { panels: ScriptPanelView[] };

export type ScriptView = {
  kind: "script";
  header: CanonHeader;
  acts: Act[];
  pages: ScriptPageView[];
  report: ScriptReport;
};

export type CanonSectionView = Pick<
  CanonSection,
  "headingRaw" | "ordinal" | "title" | "neverShip"
> & {
  /**
   * Verbatim body text (the parser's line range resolved: lines joined with
   * \n, no trim). Null for an empty body; { redacted: true } after never-ship
   * redaction.
   */
  body: string | null | Redacted;
};

export type CanonView = {
  kind: "canon";
  header: CanonHeader;
  sections: CanonSectionView[];
};

/** open-questions carries the parsed doc verbatim (no line spans to strip). */
export type OpenQuestionsView = { kind: "open-questions" } & OpenQuestionsDoc;

export type DesignSubBlockView = Pick<DesignSubBlock, "kind" | "label" | "payloadRaw">;

export type DesignCharacterView = Pick<CharacterEntry, "ordinal" | "nameLiteral" | "qualifier"> & {
  subBlocks: DesignSubBlockView[];
};

export type DesignSetSubVersionView = Pick<SetSubVersion, "label" | "payloadRaw">;

export type DesignSetView = Pick<SetBlock, "ordinal" | "nameLiteral" | "gloss" | "payloadRaw"> & {
  subVersions: DesignSetSubVersionView[];
};

export type DesignPropView = Pick<PropBlock, "nameLiteral" | "payloadRaw">;

/** superseded stays the literal `true` — stale style blocks remain unmistakable. */
export type DesignStyleBlockView = Pick<
  StyleBlockEntry,
  "label" | "gloss" | "payloadRaw" | "superseded"
>;

export type DesignView = {
  kind: "design";
  header: CanonHeader;
  characters: DesignCharacterView[];
  sets: DesignSetView[];
  props: DesignPropView[];
  styleBlocks: DesignStyleBlockView[];
};

export type ManifestView = {
  kind: "manifest";
  rows: ManifestRecord[];
  statusCensus: Record<string, number>;
};

export type RawView = { kind: "raw"; size: number };

export type DocView =
  | ScriptView
  | OpenQuestionsView
  | CanonView
  | DesignView
  | ManifestView
  | RawView;

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

/** Resolve a parser body line-range to its verbatim text (lines joined with \n). */
const bodyText = (
  source: SourceText,
  range: { from: number; to: number } | null,
): string | null =>
  range === null
    ? null
    : source.lines
        .slice(range.from, range.to + 1)
        .map((line) => line.text)
        .join("\n");

const scriptView = (source: SourceText): ScriptView => {
  const doc = parseScript(source);
  return {
    kind: "script",
    header: doc.header,
    acts: doc.acts,
    pages: doc.pages.map((page) => ({
      blockIndex: page.blockIndex,
      pageStart: page.pageStart,
      pageEnd: page.pageEnd,
      attrRaw: page.attrRaw,
      attrKind: page.attrKind,
      declaredPanelCount: page.declaredPanelCount,
      trailingNote: page.trailingNote,
      panels: page.panels.map((panel) => ({
        ordinal: panel.ordinal,
        implicit: panel.implicit,
        attrRaw: panel.attrRaw,
        fields: panel.fields.map(({ kind, paren, raw }) => ({ kind, paren, raw })),
      })),
    })),
    report: doc.report,
  };
};

const canonView = (source: SourceText): CanonView => {
  const doc = parseCanonDoc(source);
  return {
    kind: "canon",
    header: doc.header,
    sections: doc.sections.map((section) => ({
      headingRaw: section.headingRaw,
      ordinal: section.ordinal,
      title: section.title,
      neverShip: section.neverShip,
      body: bodyText(source, section.body),
    })),
  };
};

const designView = (source: SourceText): DesignView => {
  const doc = parseDesignDoc(source);
  return {
    kind: "design",
    header: doc.header,
    characters: doc.characters.map((entry) => ({
      ordinal: entry.ordinal,
      nameLiteral: entry.nameLiteral,
      qualifier: entry.qualifier,
      subBlocks: entry.subBlocks.map(({ kind, label, payloadRaw }) => ({
        kind,
        label,
        payloadRaw,
      })),
    })),
    sets: doc.sets.map((set) => ({
      ordinal: set.ordinal,
      nameLiteral: set.nameLiteral,
      gloss: set.gloss,
      payloadRaw: set.payloadRaw,
      subVersions: set.subVersions.map(({ label, payloadRaw }) => ({ label, payloadRaw })),
    })),
    props: doc.props.map(({ nameLiteral, payloadRaw }) => ({ nameLiteral, payloadRaw })),
    styleBlocks: doc.styleBlocks.map(({ label, gloss, payloadRaw, superseded }) => ({
      label,
      gloss,
      payloadRaw,
      superseded,
    })),
  };
};

const manifestView = (source: SourceText): ManifestView => {
  const doc = parseManifest(source);
  return { kind: "manifest", rows: doc.records, statusCensus: doc.report.statusCensus };
};

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

/** 01_script/*.txt (single segment — the glob does not cross directories). */
const SCRIPT_PATH_RE = /^01_script\/[^/]+\.txt$/;
const CANON_PATH_RE = /^00_canon\/[^/]+\.txt$/;
const OPEN_QUESTIONS_PATH = "00_canon/open-questions.txt";
const DESIGN_PATH = "02_art/character-design-prompts.txt";
const MANIFEST_PATH = "03_output/manifest.csv";

/**
 * Build the parsed view for a document. Throws whatever the content-model
 * parser throws (EncodingError, HeaderError, *ParseError) — the route maps
 * any throw to 422.
 */
export function buildDocView(relPath: string, bytes: Buffer): DocView {
  if (SCRIPT_PATH_RE.test(relPath)) {
    return scriptView(readSource(bytes));
  }
  if (relPath === OPEN_QUESTIONS_PATH) {
    return { kind: "open-questions", ...parseOpenQuestions(readSource(bytes)) };
  }
  if (CANON_PATH_RE.test(relPath)) {
    return canonView(readSource(bytes));
  }
  if (relPath === DESIGN_PATH) {
    return designView(readSource(bytes));
  }
  if (relPath === MANIFEST_PATH) {
    return manifestView(readSource(bytes));
  }
  return { kind: "raw", size: bytes.length };
}

/**
 * Server-side never-ship gate: replace the body of every neverShip-flagged
 * node with { redacted: true }. Canon sections are the only parser node that
 * carries the flag; other view kinds pass through untouched. The replacement
 * is structural — after this, the private bytes exist nowhere in the view.
 *
 * INTENTIONAL: the section's headingRaw/title remain visible in the default
 * view — the UI renders a sealed placeholder that names what is sealed
 * (e.g. 第十章's heading), which requires the heading. Only the body is
 * private. Two documented boundaries live OUTSIDE this gate, both
 * author-only surfaces today: GET /doc serves raw bytes (the editor's own
 * path), and 422 details mirror parser messages. Neither may ever feed a
 * model context or search index without passing through redaction first
 * (architecture §3.4).
 */
export function redactNeverShip(view: DocView): DocView {
  if (view.kind !== "canon") return view;
  return {
    ...view,
    sections: view.sections.map((section) =>
      section.neverShip ? { ...section, body: { redacted: true } } : section,
    ),
  };
}
