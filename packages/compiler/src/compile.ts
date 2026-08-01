import { createHash } from "node:crypto";

import { CORE_PINS, STYLE_LOCK_SHA256 } from "./pins.ts";

/**
 * The five-block prompt compiler (hth-content-model spec §3, architecture
 * spec §3.3).
 *
 * Pure function of its input: no network, no clock, no randomness, no file
 * reads. Blocks are emitted in the frozen order STYLE LOCK → CONTINUITY →
 * DIRECTION → SHOT → NEGATIVE (production-pipeline-spec.txt §8: Seedream is
 * order-sensitive, the style block always leads), joined by "\n\n".
 *
 * Fail-closed: a prompt that violates an invariant is unbuildable, not
 * warn-and-continue (§3.5). All violations are collected — the result either
 * carries a prompt or a complete list of refusals, never both. There is no
 * auto-repair path anywhere in this module: nothing rewords, re-wraps,
 * normalizes, trims, or substitutes a single byte of a verbatim field
 * (guardrail (a): "Never reword a character's age or build to clear a
 * filter. Canon outranks convenience.").
 */

export type CastMemberInput = {
  id: string;
  name: string;
  /** Verbatim CORE BLOCK payload. Emitted byte-for-byte, never edited. */
  coreRaw: string;
  /** Verbatim NEGATIVE payload. Emitted byte-for-byte, never edited. */
  negativeRaw: string;
  /** Approved reference-element id, or null when this entity has no anchor yet. */
  anchorElementId: string | null;
  /**
   * Pinned sha256 (hex, of the UTF-8 bytes) of the canonical CORE payload.
   * A coreRaw whose hash does not match is a drifted/reworded copy and is
   * refused ("core-drift"); the pin is only ever updated as a deliberate,
   * reviewed canon edit — never here (spec §3b guardrail (a)).
   */
  corePinnedSha256: string;
  /**
   * Style-probe escape hatch for the anchors-precede-panels gate. Honored
   * ONLY when the compile itself sets `probe: true`; a production compile
   * ignores it and still refuses an unanchored member.
   */
  allowUnanchored?: boolean;
};

export type CompileInput = {
  /** The frozen STYLE LOCK: verbatim text plus its pinned sha256. */
  styleLock: { text: string; sha256: string };
  cast: CastMemberInput[];
  set: { name: string; raw: string } | null;
  colorRules: string | null;
  direction: string[];
  shot: string;
  aspectRatio: string;
  /** True only for style-probe compiles (see CastMemberInput.allowUnanchored). */
  probe?: boolean;
};

export type Refusal = { invariant: string; message: string };

export type FiveBlocks = [string, string, string, string, string];

export type CompileResult =
  | { ok: true; prompt: string; blocks: FiveBlocks }
  | { ok: false; refusals: Refusal[] };

/** Block names by emission index, for refusal messages and callers. */
export const PROMPT_BLOCK_NAMES = [
  "STYLE LOCK",
  "CONTINUITY",
  "DIRECTION",
  "SHOT",
  "NEGATIVE",
] as const;

/** The allowed aspect ratios (production-pipeline-spec.txt aspect table). */
export const ALLOWED_ASPECT_RATIOS: ReadonlySet<string> = new Set([
  "2:3",
  "21:9",
  "3:2",
  "16:9",
  "4:3",
  "1:1",
]);

/** sha256 hex digest of a string's UTF-8 bytes — the pinning convention. */
export const sha256Hex = (text: string): string =>
  createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex");

/**
 * Franchise denylist (invariant I4; production-pipeline-spec.txt: "franchise
 * names never go into prompts"). Latin terms match case-insensitively on
 * word boundaries; CJK terms match exactly. 死神 is an ordinary word ("death
 * god"); it is denied only as a title, i.e. adjacent to Bleach.
 */
const FRANCHISE_DENYLIST: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "咒術回戰", pattern: /咒術回戰/u },
  { label: "呪術廻戦", pattern: /呪術廻戦/u },
  { label: "Jujutsu Kaisen", pattern: /\bjujutsu\s+kaisen\b/iu },
  { label: "JJK", pattern: /\bjjk\b/iu },
  { label: "死神 (as a title, adjacent to Bleach)", pattern: /死神\s*bleach|bleach\s*死神/iu },
  { label: "Bleach", pattern: /\bbleach\b/iu },
  { label: "鬼滅", pattern: /鬼滅/u },
  { label: "Demon Slayer", pattern: /\bdemon\s+slayer\b/iu },
];

const hexByte = (byte: number): string => `0x${byte.toString(16).padStart(2, "0")}`;

/**
 * Assert that `sourceRaw` appears in `prompt` as a contiguous, byte-identical
 * substring — no normalization, no re-wrapping, no dash/quote substitution
 * (invariant I2). Throws with a byte-diff position message otherwise.
 *
 * Exported for reuse by the server's outbound-call gate.
 */
export function assertVerbatim(sourceRaw: string, prompt: string): void {
  if (prompt.includes(sourceRaw)) return;

  const src = Buffer.from(sourceRaw, "utf-8");
  const hay = Buffer.from(prompt, "utf-8");

  // Longest prefix of src that still occurs somewhere in hay. Occurrence is
  // monotone in prefix length, so binary search. The full source is known
  // not to occur (checked above), so the answer is < src.length.
  let lo = 0;
  let hi = Math.max(0, src.length - 1);
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (hay.indexOf(src.subarray(0, mid)) !== -1) lo = mid;
    else hi = mid - 1;
  }
  const matched = lo;

  if (matched === 0) {
    const firstByte = src[0];
    const first = firstByte === undefined ? "(empty source)" : hexByte(firstByte);
    throw new Error(
      `verbatim violation: no prefix of the source occurs in the prompt; source byte 0 is ${first}`,
    );
  }

  const at = hay.indexOf(src.subarray(0, matched));
  const srcByte = src[matched];
  const promptByte = hay[at + matched];
  throw new Error(
    `verbatim violation: source diverges at source byte ${matched} ` +
      `(source has ${srcByte === undefined ? "(end of source)" : hexByte(srcByte)}, ` +
      `prompt has ${promptByte === undefined ? "(end of prompt)" : hexByte(promptByte)} ` +
      `after the matched ${matched}-byte prefix at prompt byte offset ${at})`,
  );
}

/**
 * Post-assembly REQUIRED-SUBSTRING gate — guardrail (a)'s mechanical form:
 * the style lock and every cast member's CORE must appear in the assembled
 * prompt byte-identically and contiguously. Unreachable through
 * compilePanelPrompt's own assembly (which concatenates the same strings),
 * but kept as a live check so any future refactor that normalizes or rewraps
 * a block fails closed instead of shipping a paraphrase.
 */
export const checkRequiredSubstrings = (input: CompileInput, prompt: string): Refusal[] => {
  const refusals: Refusal[] = [];
  const check = (label: string, raw: string): void => {
    try {
      assertVerbatim(raw, prompt);
    } catch (error) {
      refusals.push({
        invariant: "required-substring",
        message: `${label} is not a byte-identical contiguous substring of the assembled prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  };
  check("style lock", input.styleLock.text);
  for (const member of input.cast) {
    check(`cast member "${member.id}" CORE`, member.coreRaw);
  }
  return refusals;
};

/**
 * Recursive scan for `superseded: true` anywhere in the input (unknown extra
 * fields included). Superseded sources — e.g. the stale STYLE BLOCK A/B in
 * character-design-prompts.txt — must never compile (spec §1.2).
 */
const findSupersededPaths = (value: unknown): string[] => {
  const hits: string[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    const record = node as Record<string, unknown>;
    if (record["superseded"] === true) hits.push(path === "" ? "(root)" : path);
    for (const [key, child] of Object.entries(record)) {
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  };
  walk(value, "");
  return hits;
};

/** Assemble the five blocks. Pure concatenation of verbatim inputs. */
const assembleBlocks = (input: CompileInput): FiveBlocks => {
  const continuityParts: string[] = [];
  for (const member of input.cast) {
    if (typeof member.coreRaw === "string" && member.coreRaw.length > 0) {
      continuityParts.push(member.coreRaw);
    }
  }
  if (input.set !== null && typeof input.set.raw === "string") {
    continuityParts.push(input.set.raw);
  }
  if (input.colorRules !== null && typeof input.colorRules === "string") {
    continuityParts.push(input.colorRules);
  }

  // NEGATIVE is the union of the cast's negatives: exact duplicates emit
  // once, first-occurrence order preserved, each entry verbatim.
  const negativeParts: string[] = [];
  for (const member of input.cast) {
    if (
      typeof member.negativeRaw === "string" &&
      member.negativeRaw.length > 0 &&
      !negativeParts.includes(member.negativeRaw)
    ) {
      negativeParts.push(member.negativeRaw);
    }
  }

  return [
    input.styleLock.text,
    continuityParts.join("\n\n"),
    input.direction.join("\n"),
    input.shot,
    negativeParts.join("\n"),
  ];
};

/**
 * The pin table the compiler verifies against: the reviewed constants from
 * pins.ts by default. Passing a custom table is an explicit, greppable act
 * reserved for tests and for future projects with their own pins module —
 * production call sites use the default, which is what makes the
 * no-softening guard non-tautological (a caller cannot bless its own bytes
 * by hashing them; the hash must also match a constant reviewed into this
 * package).
 */
export type PinTable = {
  styleLock: string;
  core: Readonly<Record<string, string>>;
};

export const DEFAULT_PINS: PinTable = {
  styleLock: STYLE_LOCK_SHA256,
  core: CORE_PINS,
};

/**
 * Compile one panel prompt. Either every invariant holds and the result
 * carries the prompt plus its five blocks, or the result carries ALL
 * refusals (not just the first) and no prompt at all.
 */
export const compilePanelPrompt = (
  input: CompileInput,
  pins: PinTable = DEFAULT_PINS,
): CompileResult => {
  const refusals: Refusal[] = [];

  // superseded-source — a superseded flag anywhere poisons the whole input.
  for (const path of findSupersededPaths(input)) {
    refusals.push({
      invariant: "superseded-source",
      message: `input carries superseded: true at ${path}; superseded sources must never compile`,
    });
  }

  // style-lock-hash — the style block is hash-pinned (I2/I3/I9): the text
  // must be byte-identical to the frozen v3 bytes the pin was computed from.
  const pinnedStyle =
    typeof input.styleLock.sha256 === "string" ? input.styleLock.sha256.toLowerCase() : "";
  const actualStyle = sha256Hex(input.styleLock.text);
  if (actualStyle !== pinnedStyle) {
    refusals.push({
      invariant: "style-lock-hash",
      message:
        `style lock text hashes to ${actualStyle} but the pinned hash is ` +
        `${input.styleLock.sha256}; refusing to emit a drifted style block`,
    });
  }
  // style-lock-unpinned — the caller's hash must also equal the reviewed
  // constant, so a caller hashing its own text cannot bless it.
  if (actualStyle !== pins.styleLock.toLowerCase()) {
    refusals.push({
      invariant: "style-lock-unpinned",
      message:
        `style lock text does not match the reviewed pin ${pins.styleLock}; ` +
        `only the frozen style block compiles`,
    });
  }

  input.cast.forEach((member, index) => {
    const label = typeof member.id === "string" && member.id !== "" ? member.id : `cast[${index}]`;

    // core-empty — a cast member without CORE content cannot appear on a panel.
    if (typeof member.coreRaw !== "string" || member.coreRaw.trim() === "") {
      refusals.push({
        invariant: "core-empty",
        message: `cast member "${label}" has an empty coreRaw; CORE BLOCK is mandatory`,
      });
    } else {
      // core-drift — the softening guard (guardrail (a), I9): a CORE whose
      // bytes do not hash to the pinned constant is a reworded copy. Never
      // auto-repaired, never softened; fix the pin only as a deliberate
      // canon edit in the same commit that edits the canon.
      const pinnedCore =
        typeof member.corePinnedSha256 === "string" ? member.corePinnedSha256.toLowerCase() : "";
      const actualCore = sha256Hex(member.coreRaw);
      if (actualCore !== pinnedCore) {
        refusals.push({
          invariant: "core-drift",
          message:
            `cast member "${label}" coreRaw hashes to ${actualCore} but the pinned hash is ` +
            `${member.corePinnedSha256}; CORE blocks are never reworded to clear a filter — ` +
            `canon outranks convenience`,
        });
      }
      // pin-unknown / pin-mismatch — the member must exist in the reviewed
      // pin table and its bytes must hash to that constant. A new character
      // compiles only after its pin lands here as a reviewed canon edit.
      const reviewedPin = pins.core[member.name];
      if (reviewedPin === undefined) {
        refusals.push({
          invariant: "pin-unknown",
          message:
            `cast member "${label}" (name ${JSON.stringify(member.name)}) has no entry in the ` +
            `reviewed pin table; add its CORE hash to pins.ts in the same commit as the canon edit`,
        });
      } else if (actualCore !== reviewedPin.toLowerCase()) {
        refusals.push({
          invariant: "pin-mismatch",
          message:
            `cast member "${label}" coreRaw hashes to ${actualCore} but the reviewed pin for ` +
            `${JSON.stringify(member.name)} is ${reviewedPin}; the pin table and canon must move together`,
        });
      }
    }

    // negative-missing — NEGATIVE is mandatory for every cast member.
    if (typeof member.negativeRaw !== "string" || member.negativeRaw.length === 0) {
      refusals.push({
        invariant: "negative-missing",
        message: `cast member "${label}" has no negativeRaw; NEGATIVE is mandatory`,
      });
    }

    // stage-anchor-missing — anchors precede panels (guardrail (c)). The
    // only exception is a style-probe compile that explicitly allows this
    // member to run unanchored.
    const probeException = input.probe === true && member.allowUnanchored === true;
    if (member.anchorElementId === null && !probeException) {
      refusals.push({
        invariant: "stage-anchor-missing",
        message:
          `cast member "${label}" has no anchor element; anchors precede panels ` +
          `(unanchored compiles are allowed only with probe: true plus allowUnanchored: true)`,
      });
    }
  });

  // stage-text-only — scene panels are never generated from text alone
  // (guardrail (c)): with no cast and no set there is nothing to anchor.
  if (input.cast.length === 0 && input.set === null) {
    refusals.push({
      invariant: "stage-text-only",
      message: "no cast and no set: scene panels are never generated from text alone",
    });
  }

  // shot-empty — SHOT is the one variable block and it must exist.
  if (typeof input.shot !== "string" || input.shot.trim() === "") {
    refusals.push({
      invariant: "shot-empty",
      message: "shot is empty; the SHOT block is mandatory",
    });
  }

  // aspect-unknown — aspect must come from the spec's table.
  if (!ALLOWED_ASPECT_RATIOS.has(input.aspectRatio)) {
    refusals.push({
      invariant: "aspect-unknown",
      message:
        `aspect ratio "${input.aspectRatio}" is not one of ` +
        `${[...ALLOWED_ASPECT_RATIOS].join(", ")}`,
    });
  }

  // Assemble, then scan the assembled blocks. Assembly is pure string
  // concatenation and safe to run even when refusals exist; its output is
  // discarded unless the compile is clean.
  const blocks = assembleBlocks(input);
  const prompt = blocks.join("\n\n");

  // franchise-denylist (I4) — scanned over the WHOLE outbound buffer, not
  // per block: multi-word patterns use \s+, which matches the "\n\n" block
  // join, so a term straddling a block boundary would otherwise compile
  // clean while the joined prompt matches the denylist. Per-block hits are
  // still attributed by name in the message when locatable.
  for (const rule of FRANCHISE_DENYLIST) {
    if (rule.pattern.test(prompt)) {
      const inBlock = blocks.findIndex((block) => rule.pattern.test(block));
      const where =
        inBlock >= 0
          ? `in ${PROMPT_BLOCK_NAMES[inBlock] ?? `block ${inBlock}`} block`
          : "across a block boundary";
      refusals.push({
        invariant: "franchise-denylist",
        message: `franchise term ${rule.label} found ${where}; franchise names never go into prompts`,
      });
    }
  }

  // required-substring — guardrail (a)'s post-assembly mechanical form.
  refusals.push(...checkRequiredSubstrings(input, prompt));

  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, prompt, blocks };
};
