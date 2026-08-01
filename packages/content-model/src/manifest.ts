import type { SourceText } from "./lines.ts";

/**
 * Strict codec for the generation manifest (`03_output/manifest.csv`).
 *
 * The file is deliberately primitive CSV (docs/specs/hth-content-model.md
 * §1.8, §2.5): UTF-8, LF, one header plus data rows of exactly seven
 * comma-separated fields, with **no quoting and no escaping** — commas and
 * newlines are forbidden inside field values by design. That discipline is
 * what keeps the file trivially machine-parseable, and this codec defends it
 * from both directions: the parser rejects any row that does not split into
 * exactly seven fields, and the writer rejects a field value containing a
 * comma, CR, or LF rather than quoting it.
 *
 * Every record keeps its exact source line (`rawLine`), so serialization is
 * concatenation and byte-exact round-tripping is structural, not incidental.
 */

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export const MANIFEST_HEADER = "page,panel,version,seed,status,image_link,prompt_summary";

const FIELD_COUNT = 7;

/**
 * `page` is overloaded (§1.8): a script page number for real panels, or an
 * asset-class token — `TURN` (turnarounds), `STYLE-PROBE`, `KEY` (keyframes).
 */
export type ManifestPage = number | "TURN" | "STYLE-PROBE" | "KEY";

/** `panel` is overloaded: a `g<n>` grid ref on numeric pages, else a slug. */
export type ManifestPanel =
  | { kind: "grid"; raw: string; n: number }
  | { kind: "slug"; raw: string };

export const MANIFEST_STATUSES = [
  "completed",
  "refused-filter",
  "pending",
  "invalidated",
] as const;

export type ManifestStatus = (typeof MANIFEST_STATUSES)[number];

/**
 * `version` is `v<n>` with an optional `a`–`d` candidate letter. Three
 * historical rows break the scheme (`styleA-painterly`, `styleB-cel`,
 * `note`); they parse with `parsed` absent and no warning. Any *other*
 * breaker also keeps its raw text but is surfaced in `report.warnings`.
 */
export type ManifestVersion = {
  raw: string;
  parsed?: { n: number; letter: "a" | "b" | "c" | "d" | null };
};

/**
 * `image_link` is a delivered CDN URL, a `job:<uuid>` handle for queued or
 * refused generations (value is the bare uuid), or empty.
 */
export type ManifestImageLink =
  | { kind: "url"; value: string }
  | { kind: "job"; value: string }
  | { kind: "empty"; value: "" };

export type ManifestRecord = {
  /** 0-based line index in the source file (the header is line 0). */
  line: number;
  /** Exact source text of the row, excluding the newline. */
  rawLine: string;
  page: ManifestPage;
  panel: ManifestPanel;
  version: ManifestVersion;
  /** Platform-assigned seed; null when the field is empty (Nano Banana Pro rows, notes). */
  seed: number | null;
  status: ManifestStatus;
  imageLink: ManifestImageLink;
  promptSummary: string;
};

export type ManifestReport = {
  rowCount: number;
  statusCensus: Record<string, number>;
  warnings: string[];
};

export type ManifestDoc = {
  records: ManifestRecord[];
  /** True when the file's last line is `\n`-terminated (the repo file always is). */
  finalNewline: boolean;
  report: ManifestReport;
};

export class ManifestParseError extends Error {}
export class ManifestFieldError extends Error {}

/* ------------------------------------------------------------------ */
/* Field readers                                                       */
/* ------------------------------------------------------------------ */

const INT_RE = /^\d+$/;
const GRID_RE = /^g(\d+)$/;
/** Kebab slug as the data uses it: alnum segments, single-dash separated (e.g. `styleA-nbp`). */
const SLUG_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const VERSION_RE = /^v(\d+)([a-d])?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const DOCUMENTED_VERSION_BREAKERS = new Set(["styleA-painterly", "styleB-cel", "note"]);

const STATUS_SET: ReadonlySet<string> = new Set(MANIFEST_STATUSES);

const parsePage = (raw: string, index: number): ManifestPage => {
  if (raw === "TURN" || raw === "STYLE-PROBE" || raw === "KEY") return raw;
  if (INT_RE.test(raw)) return Number(raw);
  throw new ManifestParseError(
    `Line ${index + 1}: page must be an integer or TURN|STYLE-PROBE|KEY, got ${JSON.stringify(raw)}.`,
  );
};

const parsePanel = (raw: string, index: number): ManifestPanel => {
  const grid = GRID_RE.exec(raw);
  if (grid) return { kind: "grid", raw, n: Number(grid[1]) };
  if (SLUG_RE.test(raw)) return { kind: "slug", raw };
  throw new ManifestParseError(
    `Line ${index + 1}: panel must be g<n> or a kebab slug, got ${JSON.stringify(raw)}.`,
  );
};

const parseVersion = (raw: string, index: number, warnings: string[]): ManifestVersion => {
  const m = VERSION_RE.exec(raw);
  if (m) {
    const letter = m[2] as "a" | "b" | "c" | "d" | undefined;
    return { raw, parsed: { n: Number(m[1]), letter: letter ?? null } };
  }
  if (!DOCUMENTED_VERSION_BREAKERS.has(raw)) {
    warnings.push(
      `L${index + 1}: version ${JSON.stringify(raw)} is neither v<n>[a-d] nor a documented breaker.`,
    );
  }
  return { raw };
};

const parseSeed = (raw: string, index: number): number | null => {
  if (raw === "") return null;
  if (INT_RE.test(raw)) return Number(raw);
  throw new ManifestParseError(
    `Line ${index + 1}: seed must be an integer or empty, got ${JSON.stringify(raw)}.`,
  );
};

const parseStatus = (raw: string, index: number): ManifestStatus => {
  if (STATUS_SET.has(raw)) return raw as ManifestStatus;
  throw new ManifestParseError(
    `Line ${index + 1}: unknown status ${JSON.stringify(raw)}; ` +
      `expected one of ${MANIFEST_STATUSES.join("|")}.`,
  );
};

const parseImageLink = (raw: string, index: number): ManifestImageLink => {
  if (raw === "") return { kind: "empty", value: "" };
  if (raw.startsWith("job:")) {
    const id = raw.slice(4);
    if (!UUID_RE.test(id)) {
      throw new ManifestParseError(
        `Line ${index + 1}: job handle ${JSON.stringify(raw)} is not job:<uuid>.`,
      );
    }
    return { kind: "job", value: id };
  }
  if (/^https?:\/\/\S+$/.test(raw)) return { kind: "url", value: raw };
  throw new ManifestParseError(
    `Line ${index + 1}: image_link must be a URL, job:<uuid>, or empty, got ${JSON.stringify(raw)}.`,
  );
};

const parseRow = (index: number, text: string, warnings: string[]): ManifestRecord => {
  const fields = text.split(",");
  if (fields.length !== FIELD_COUNT) {
    throw new ManifestParseError(
      `Line ${index + 1}: expected ${FIELD_COUNT} comma-separated fields, got ${fields.length}. ` +
        `The manifest has no quoting; commas are forbidden inside fields.`,
    );
  }
  return {
    line: index,
    rawLine: text,
    page: parsePage(fields[0]!, index),
    panel: parsePanel(fields[1]!, index),
    version: parseVersion(fields[2]!, index, warnings),
    seed: parseSeed(fields[3]!, index),
    status: parseStatus(fields[4]!, index),
    imageLink: parseImageLink(fields[5]!, index),
    promptSummary: fields[6]!,
  };
};

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

export const parseManifest = (source: SourceText): ManifestDoc => {
  const lines = source.lines;
  const header = lines[0];
  if (header === undefined) {
    throw new ManifestParseError("Line 1: file is empty; expected the manifest header.");
  }
  if (header.text !== MANIFEST_HEADER) {
    throw new ManifestParseError(
      `Line 1: header must be exactly ${JSON.stringify(MANIFEST_HEADER)}, ` +
        `got ${JSON.stringify(header.text)}.`,
    );
  }

  const warnings: string[] = [];
  const records: ManifestRecord[] = [];
  const statusCensus: Record<string, number> = {};
  for (const line of lines.slice(1)) {
    const record = parseRow(line.index, line.text, warnings);
    records.push(record);
    statusCensus[record.status] = (statusCensus[record.status] ?? 0) + 1;
  }

  return {
    records,
    finalNewline: lines[lines.length - 1]!.terminated,
    report: { rowCount: records.length, statusCensus, warnings },
  };
};

/* ------------------------------------------------------------------ */
/* Writer                                                              */
/* ------------------------------------------------------------------ */

/**
 * Serialize back to the exact source bytes: header, each record's `rawLine`,
 * LF separators, and the trailing newline exactly as the source had it.
 */
export const serializeManifest = (doc: ManifestDoc): string =>
  [MANIFEST_HEADER, ...doc.records.map((record) => record.rawLine)].join("\n") +
  (doc.finalNewline ? "\n" : "");

/**
 * The writer's guard (§2.5): the manifest stays quoting-free because values
 * that would need quoting are *rejected*, never escaped.
 */
export const validateField = (value: string): void => {
  // Double quotes are rejected alongside separators (spec §3b(d)): the
  // format has no quoting, and a leading `"` would corrupt the row under
  // any standard CSV tool that later touches the file.
  const bad = /[,"\r\n]/.exec(value);
  if (bad !== null) {
    const name =
      bad[0] === ","
        ? "a comma"
        : bad[0] === '"'
          ? "a double quote"
          : bad[0] === "\r"
            ? "a CR"
            : "an LF";
    throw new ManifestFieldError(
      `Field value ${JSON.stringify(value)} contains ${name}; ` +
        `the manifest has no quoting — rejected.`,
    );
  }
};

/**
 * Input for {@link appendRecord}. `panel` and `version` are given as written
 * (`g3` / `shengtian-stage`, `v4a` / `note`); typed fields are serialized to
 * their CSV form. The built row is re-parsed, so a malformed value fails
 * here, not on the next read.
 */
export type ManifestRecordInit = {
  page: ManifestPage;
  panel: string;
  version: string;
  seed: number | null;
  status: ManifestStatus;
  imageLink: ManifestImageLink;
  promptSummary: string;
};

const imageLinkToCsv = (link: ManifestImageLink): string => {
  switch (link.kind) {
    case "url":
      return link.value;
    case "job":
      return `job:${link.value}`;
    case "empty":
      return "";
    default: {
      // Runtime guard for untyped callers: a malformed link object must
      // fail loudly, not serialize as an empty field.
      const unreachable: never = link;
      throw new ManifestFieldError(
        `Malformed image link ${JSON.stringify(unreachable)}; expected {kind: "url"|"job"|"empty"}.`,
      );
    }
  }
};

/**
 * Append one record, returning a new doc (inputs are never mutated) plus the
 * exact line that was added (without its newline). Every field goes through
 * {@link validateField} first, then the assembled row through the full row
 * parser, so the new doc is byte-for-byte what a re-parse would produce.
 */
export const appendRecord = (
  doc: ManifestDoc,
  record: ManifestRecordInit,
): { doc: ManifestDoc; line: string } => {
  const fields = [
    typeof record.page === "number" ? String(record.page) : record.page,
    record.panel,
    record.version,
    record.seed === null ? "" : String(record.seed),
    record.status,
    imageLinkToCsv(record.imageLink),
    record.promptSummary,
  ];
  for (const field of fields) validateField(field);

  const text = fields.join(",");
  const warnings = [...doc.report.warnings];
  const parsed = parseRow(doc.records.length + 1, text, warnings);
  const records = [...doc.records, parsed];
  const statusCensus = { ...doc.report.statusCensus };
  statusCensus[parsed.status] = (statusCensus[parsed.status] ?? 0) + 1;
  return {
    doc: {
      records,
      finalNewline: doc.finalNewline,
      report: { rowCount: records.length, statusCensus, warnings },
    },
    line: text,
  };
};

/* ------------------------------------------------------------------ */
/* Naming                                                              */
/* ------------------------------------------------------------------ */

/**
 * Canonical asset file name: `ep0_p{page}_g{panel}_v{version}`
 * (production-pipeline-spec.txt §4, example `ep0_p33_g1_v2`). Accepts bare
 * slot values (`panel: 1`, `version: 2`) or manifest-flavoured ones
 * (`panel: "g1"`, `version: "v2"`) — the `g`/`v` prefixes are normalized,
 * never doubled. Anchors use a different scheme (`char_{name}_anchor` /
 * `set_{name}_anchor`) and are not produced here.
 */
export const assetFileName = (ref: {
  page: number | string;
  panel: number | string;
  version: number | string;
}): string => {
  const page = String(ref.page);
  const panelRaw = String(ref.panel);
  const grid = GRID_RE.exec(panelRaw);
  const panel = grid ? grid[1]! : panelRaw;
  const versionRaw = String(ref.version);
  const v = /^v(\d+[a-d]?)$/.exec(versionRaw);
  const version = v ? v[1]! : versionRaw;
  for (const part of [page, panel, version]) {
    if (!/^[A-Za-z0-9-]+$/.test(part)) {
      throw new ManifestFieldError(
        `Asset name part ${JSON.stringify(part)} must be non-empty alphanumeric/kebab.`,
      );
    }
  }
  return `ep0_p${page}_g${panel}_v${version}`;
};
