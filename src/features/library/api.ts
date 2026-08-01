/**
 * Typed fetch layer for the writing-platform server (packages/server) plus
 * the byte-exact base64 helpers the editor round-trip depends on.
 *
 * Verbatim doctrine: document content crosses the wire as base64 and is kept
 * as bytes. Decoding to a string happens only for display/editing; the string
 * is encoded straight back to UTF-8 bytes on save — never trimmed, never
 * normalized, final-newline state preserved exactly as typed/loaded.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Byte-exact base64 <-> Uint8Array                                    */
/* ------------------------------------------------------------------ */

/** Decode base64 to the exact bytes it encodes. No text decoding involved. */
export const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

/** Encode bytes to base64, chunked so large files don't overflow the stack. */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
};

/**
 * Decode bytes as UTF-8 for display/editing. `fatal` so invalid UTF-8 throws
 * instead of silently substituting U+FFFD — a substituted char would break
 * the byte-exact round-trip, so callers must treat that as "not editable".
 */
export const decodeUtf8 = (bytes: Uint8Array): string =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);

/** Encode an editor string back to the exact UTF-8 bytes it will commit as. */
export const encodeUtf8 = (text: string): Uint8Array =>
  new TextEncoder().encode(text);

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
};

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

export type ProjectSummary = { id: string; name: string };

export type DocEntry = { relPath: string; size: number };

export type DocContent = {
  path: string;
  sha256: string;
  size: number;
  contentBase64: string;
};

export type EditResult =
  | { status: "committed"; commitSha: string; newSha256: string }
  | { status: "unchanged"; sha256: string }
  | { status: "conflict"; currentSha256: string };

/* Parsed views. Fields the renderer does not strictly need are optional so a
 * server that sends less (or more) than expected still renders. */

export type ScriptViewField = {
  kind: string;
  paren?: string | null;
  raw: string;
};

export type ScriptViewPanel = {
  ordinal?: number | null;
  implicit?: boolean;
  attrRaw?: string | null;
  fields?: ScriptViewField[];
};

export type ScriptViewPage = {
  pageStart?: number;
  pageEnd?: number | null;
  attrRaw?: string;
  declaredPanelCount?: number | null;
  panels?: ScriptViewPanel[];
};

export type CanonViewSection = {
  headingRaw: string;
  title?: string | null;
  neverShip?: boolean;
  /** Body text, `{ redacted: true }` outside the author's drawer, or absent. */
  body?: string | { redacted: true } | null;
};

export type OpenQuestionsViewItem = {
  ordinalRaw?: string;
  state?: string | null;
  textRaw: string;
};

export type OpenQuestionsViewCategory = {
  nameRaw: string;
  items?: OpenQuestionsViewItem[];
};

export type DesignViewSubBlock = {
  kind: string;
  label: string;
  payloadRaw: string;
};

export type DesignViewCharacter = {
  ordinal?: number;
  nameLiteral: string;
  qualifier?: string | null;
  subBlocks?: DesignViewSubBlock[];
};

export type DesignViewSet = {
  nameLiteral: string;
  gloss?: string | null;
  payloadRaw?: string;
};

export type DesignViewProp = {
  nameLiteral: string;
  payloadRaw?: string;
};

export type DesignViewStyleBlock = {
  label: string;
  gloss?: string | null;
  payloadRaw?: string;
  superseded?: boolean;
};

export type ManifestViewRow = {
  page?: unknown;
  panel?: unknown;
  version?: unknown;
  seed?: number | null;
  status?: string;
  imageLink?: unknown;
  promptSummary?: string;
  rawLine?: string;
};

export type ScriptView = { kind: "script"; pages?: ScriptViewPage[] };
export type CanonView = { kind: "canon"; sections?: CanonViewSection[] };
export type OpenQuestionsView = {
  kind: "open-questions";
  categories?: OpenQuestionsViewCategory[];
};
export type DesignView = {
  kind: "design";
  characters?: DesignViewCharacter[];
  sets?: DesignViewSet[];
  props?: DesignViewProp[];
  styleBlocks?: DesignViewStyleBlock[];
};
export type ManifestView = {
  kind: "manifest";
  rows?: ManifestViewRow[];
  statusCensus?: Record<string, number>;
};
export type RawView = { kind: "raw"; path?: string; size?: number };
/** Any kind this client does not know renders through a fallback view. */
export type UnknownView = { kind: "unknown"; actualKind: string };

export type DocView =
  | ScriptView
  | CanonView
  | OpenQuestionsView
  | DesignView
  | ManifestView
  | RawView
  | UnknownView;

/* ------------------------------------------------------------------ */
/* Fetch layer                                                         */
/* ------------------------------------------------------------------ */

const API_BASE = "/api";

const readErrorMessage = (payload: unknown, status: number): string => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return `request failed (HTTP ${status})`;
};

const getJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(readErrorMessage(payload, response.status), response.status);
  }
  return payload;
};

/** Accept both a bare array and the server's `{ [key]: [...] }` envelope. */
const unwrapList = (payload: unknown, key: string): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object" && payload !== null && key in payload) {
    const inner = (payload as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner;
  }
  return [];
};

export const fetchProjects = async (): Promise<ProjectSummary[]> => {
  const payload = await getJson(`${API_BASE}/projects`);
  return unwrapList(payload, "projects").filter(
    (entry): entry is ProjectSummary =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as ProjectSummary).id === "string" &&
      typeof (entry as ProjectSummary).name === "string",
  );
};

export const fetchDocs = async (projectId: string): Promise<DocEntry[]> => {
  const payload = await getJson(
    `${API_BASE}/projects/${encodeURIComponent(projectId)}/docs`,
  );
  return unwrapList(payload, "docs").filter(
    (entry): entry is DocEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as DocEntry).relPath === "string",
  );
};

export const fetchDoc = async (
  projectId: string,
  path: string,
): Promise<DocContent> => {
  const payload = await getJson(
    `${API_BASE}/projects/${encodeURIComponent(projectId)}/doc?path=${encodeURIComponent(path)}`,
  );
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as DocContent).sha256 !== "string" ||
    typeof (payload as DocContent).contentBase64 !== "string"
  ) {
    throw new ApiError("malformed document response", 0);
  }
  return payload as DocContent;
};

const KNOWN_VIEW_KINDS: readonly DocView["kind"][] = [
  "script",
  "canon",
  "open-questions",
  "design",
  "manifest",
  "raw",
];

export const fetchView = async (
  projectId: string,
  path: string,
  options: { drawer?: "author" } = {},
): Promise<DocView> => {
  const query = new URLSearchParams({ path });
  if (options.drawer !== undefined) query.set("drawer", options.drawer);
  const payload = await getJson(
    `${API_BASE}/projects/${encodeURIComponent(projectId)}/view?${query.toString()}`,
  );
  if (typeof payload !== "object" || payload === null) {
    throw new ApiError("malformed view response", 0);
  }
  const kind = (payload as { kind?: unknown }).kind;
  if (typeof kind !== "string") {
    throw new ApiError("view response is missing its kind", 0);
  }
  if ((KNOWN_VIEW_KINDS as readonly string[]).includes(kind)) {
    return payload as DocView;
  }
  return { kind: "unknown", actualKind: kind };
};

export type EditRequest = {
  path: string;
  baseSha256: string;
  contentBase64: string;
  message: string;
};

export const postEdit = async (
  projectId: string,
  body: EditRequest,
): Promise<EditResult> => {
  const response = await fetch(
    `${API_BASE}/projects/${encodeURIComponent(projectId)}/edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  const status =
    typeof payload === "object" && payload !== null
      ? (payload as { status?: unknown }).status
      : undefined;

  if (response.status === 409 || status === "conflict") {
    const currentSha256 =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { currentSha256?: unknown }).currentSha256 === "string"
        ? (payload as { currentSha256: string }).currentSha256
        : "";
    return { status: "conflict", currentSha256 };
  }
  if (!response.ok) {
    throw new ApiError(readErrorMessage(payload, response.status), response.status);
  }
  if (status === "committed") {
    const record = payload as { commitSha?: unknown; newSha256?: unknown };
    if (typeof record.newSha256 !== "string") {
      throw new ApiError("committed response is missing newSha256", 0);
    }
    return {
      status: "committed",
      commitSha: typeof record.commitSha === "string" ? record.commitSha : "",
      newSha256: record.newSha256,
    };
  }
  if (status === "unchanged") {
    const record = payload as { sha256?: unknown };
    return {
      status: "unchanged",
      sha256: typeof record.sha256 === "string" ? record.sha256 : "",
    };
  }
  throw new ApiError("unrecognized edit response", response.status);
};

/* ------------------------------------------------------------------ */
/* Small shared formatting helpers                                     */
/* ------------------------------------------------------------------ */

export const formatBytes = (size: number): string => {
  if (!Number.isFinite(size)) return "?";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/** Top-level directory of a relPath; files at the root group under "/". */
export const topLevelDir = (relPath: string): string => {
  const slash = relPath.indexOf("/");
  return slash === -1 ? "/" : relPath.slice(0, slash);
};
