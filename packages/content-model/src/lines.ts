import { createHash } from "node:crypto";

/**
 * Byte-faithful line model. Every parser in this package segments files into
 * whole lines and never rewrites a line it did not mean to touch, so
 * "serialize" is string concatenation and round-trip byte-equality is a
 * structural property, not an aspiration.
 *
 * The encoding contract is the repo's: UTF-8, LF, no BOM. We verify it on
 * read instead of assuming it, and we verify that decode→encode reproduces
 * the input bytes exactly, so downstream code may safely work in string
 * space while byte offsets stay meaningful.
 */

export type Line = {
  /** 0-based line index. */
  index: number;
  /** Line content, excluding the trailing newline. */
  text: string;
  /** Byte offset of the first byte of this line in the file. */
  byteStart: number;
  /** Byte length of the content, excluding the trailing newline. */
  byteLength: number;
  /** True when the line is terminated by \n (false only for a last line at EOF). */
  terminated: boolean;
};

export type SourceText = {
  bytes: Buffer;
  text: string;
  lines: Line[];
  sha256: string;
};

export class EncodingError extends Error {}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/** Read a file's bytes into the line model, enforcing the encoding contract. */
export const readSource = (bytes: Buffer): SourceText => {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new EncodingError("File starts with a UTF-8 BOM; the repo contract is no BOM.");
  }
  if (bytes.includes(0x0d)) {
    throw new EncodingError("File contains CR bytes; the repo contract is LF-only.");
  }
  let text: string;
  try {
    text = utf8Decoder.decode(bytes);
  } catch {
    throw new EncodingError("File is not valid UTF-8.");
  }
  if (!Buffer.from(text, "utf-8").equals(bytes)) {
    // Decode succeeded but re-encoding drifted (should be impossible for
    // valid UTF-8; kept as a tripwire because everything downstream leans
    // on string space being byte-faithful).
    throw new EncodingError("UTF-8 round-trip drifted; refusing to parse.");
  }

  const lines: Line[] = [];
  let byteStart = 0;
  let index = 0;
  let from = 0;
  while (from <= text.length) {
    const nl = text.indexOf("\n", from);
    if (nl === -1) {
      // Final unterminated line. An empty one means the file ended with \n,
      // which is not a line of its own.
      if (from < text.length) {
        const content = text.slice(from);
        lines.push({
          index,
          text: content,
          byteStart,
          byteLength: Buffer.byteLength(content, "utf-8"),
          terminated: false,
        });
      }
      break;
    }
    const content = text.slice(from, nl);
    const byteLength = Buffer.byteLength(content, "utf-8");
    lines.push({ index, text: content, byteStart, byteLength, terminated: true });
    byteStart += byteLength + 1;
    index += 1;
    from = nl + 1;
  }

  return {
    bytes,
    text,
    lines,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

/** Reassemble the exact original text from the line model. */
export const serializeLines = (lines: readonly Line[]): string =>
  lines.map((line) => line.text + (line.terminated ? "\n" : "")).join("");

/**
 * Assert that a set of claimed line ranges tiles the whole file: every line
 * claimed exactly once, in order, no gaps. Parsers call this at the end so a
 * new construct in a source file fails loudly instead of being skipped.
 */
export type LineRange = { from: number; to: number; owner: string };

export const assertLosslessTiling = (
  source: SourceText,
  ranges: readonly LineRange[],
): void => {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  let next = 0;
  for (const range of sorted) {
    if (range.from !== next) {
      throw new Error(
        `Lossless tiling violated: expected a claim starting at line ${next}, ` +
          `got [${range.from}, ${range.to}] owned by ${range.owner}.`,
      );
    }
    if (range.to < range.from) {
      throw new Error(`Empty/inverted claim [${range.from}, ${range.to}] by ${range.owner}.`);
    }
    next = range.to + 1;
  }
  if (next !== source.lines.length) {
    throw new Error(
      `Lossless tiling violated: lines ${next}..${source.lines.length - 1} are unclaimed.`,
    );
  }
};
