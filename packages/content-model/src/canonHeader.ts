import type { SourceText } from "./lines.ts";

/**
 * The 3-line document header every repo file opens with:
 *
 *   VIXIO CREATIVES｜《哮天》HOWL TO HEAVEN     (or the English-order variant)
 *   文件：<title>                               (or "Document: <title>")
 *   版本 <v>｜狀態：<status>                    (or "Version <v> | Status: <status>")
 *
 * Fields are stored raw (verbatim-critical) alongside the parsed reading.
 */

export type CanonHeader = {
  studioLineRaw: string;
  docTitle: string;
  docTitleRaw: string;
  version: string;
  status: string;
  versionLineRaw: string;
  /** Line index just past the header (first line not part of the 3-line block). */
  endLine: number;
};

export class HeaderError extends Error {}

const TITLE_RE = /^(?:文件：|Document: )(.+)$/;
const VERSION_RE = /^(?:版本 (.+?)｜狀態：(.+)|Version (.+?) \| Status: (.+))$/;

export const parseCanonHeader = (source: SourceText): CanonHeader => {
  const [l0, l1, l2] = source.lines;
  if (!l0 || !l1 || !l2) throw new HeaderError("File too short for a canon header.");
  if (!l0.text.includes("VIXIO CREATIVES")) {
    throw new HeaderError(`Line 1 is not a studio line: ${JSON.stringify(l0.text)}`);
  }
  const title = TITLE_RE.exec(l1.text);
  if (!title || title[1] === undefined) {
    throw new HeaderError(`Line 2 is not a 文件/Document line: ${JSON.stringify(l1.text)}`);
  }
  const version = VERSION_RE.exec(l2.text);
  if (!version) {
    throw new HeaderError(`Line 3 is not a 版本/Version line: ${JSON.stringify(l2.text)}`);
  }
  const v = version[1] ?? version[3];
  const status = version[2] ?? version[4];
  if (v === undefined || status === undefined) {
    throw new HeaderError(`Unreadable version line: ${JSON.stringify(l2.text)}`);
  }
  return {
    studioLineRaw: l0.text,
    docTitle: title[1],
    docTitleRaw: l1.text,
    version: v,
    status,
    versionLineRaw: l2.text,
    endLine: 3,
  };
};

/** The macro-separator used across the repo: exactly 23 × U+2501. */
export const SEPARATOR = "━".repeat(23);
export const isSeparatorLine = (text: string): boolean => text === SEPARATOR;
