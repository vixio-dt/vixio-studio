import { createHash } from "node:crypto";

import { CORE_PINS, CORE_VARIANT_PINS, STYLE_LOCK_SHA256 } from "./pins.ts";

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
   * When this member's CORE is a variant that REPLACES the ordinary one
   * (XIAOTIAN's TRUE FORM on page 39), the variant's literal label. The pin
   * lookup then uses the reviewed variant hash instead of the CORE hash.
   */
  variantLabel?: string;
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
  | { ok: true; prompt: string; blocks: FiveBlocks; aspectRatio: string }
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
const FRANCHISE_DENYLIST: ReadonlyArray<{
  label: string;
  pattern: RegExp;
  /**
   * Pattern applied to the whitespace-STRIPPED buffer, closing the
   * character-split straddle (a term broken by a line wrap or a block join:
   * "咒術" / "回戰", "juju" / "tsu"). Omitted where stripping would create a
   * false positive on legitimate canon: single Latin words like "bleach"
   * become substrings of ordinary text once spaces vanish, and the real
   * XIAOTIAN CORE contains "now bleached to dusty rose".
   */
  strippedPattern?: RegExp;
}> = [
  { label: "咒術回戰", pattern: /咒術回戰/u, strippedPattern: /咒術回戰/u },
  { label: "呪術廻戦", pattern: /呪術廻戦/u, strippedPattern: /呪術廻戦/u },
  {
    label: "Jujutsu Kaisen",
    pattern: /\bjujutsu\s+kaisen\b/iu,
    strippedPattern: /jujutsukaisen/iu,
  },
  { label: "JJK", pattern: /\bjjk\b/iu },
  {
    label: "死神 (as a title, adjacent to Bleach)",
    pattern: /死神\s*bleach|bleach\s*死神/iu,
    strippedPattern: /死神bleach|bleach死神/iu,
  },
  { label: "Bleach", pattern: /\bbleach\b/iu },
  { label: "鬼滅", pattern: /鬼滅/u, strippedPattern: /鬼滅/u },
  {
    label: "Demon Slayer",
    pattern: /\bdemon\s+slayer\b/iu,
    strippedPattern: /demonslayer/iu,
  },
];

/**
 * Softening denylist — guardrail §3b(a)4. The pin table protects CORE bytes,
 * but DIRECTION is compiler/caller-written English and SHOT is the translated
 * 畫: exactly the two blocks where the 2026-07-30 softening actually happened
 * ("a slight young performer" standing in for a pinned "age 14" child).
 *
 * Scanned in DIRECTION and SHOT ONLY. CONTINUITY and NEGATIVE are excluded by
 * design: the real per-character NEGATIVE text legitimately reads "no adult
 * proportions", which any adult/age vocabulary list would false-positive on.
 * Phrases here are ones that only appear when a caller is re-describing a
 * character's age or build rather than staging a shot.
 */
const SOFTENING_DENYLIST: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "age-neutral", pattern: /\bage[-\s]*neutral\b/iu },
  { label: "age-ambiguous", pattern: /\bage[-\s]*ambiguous\b/iu },
  { label: "adult framing/proportions in a shot", pattern: /\badult\s+(?:framing|proportions|silhouette|build)\b/iu },
  { label: "an adult in silhouette", pattern: /\ban\s+adult\b/iu },
  { label: "young adult", pattern: /\byoung\s+adult\b/iu },
  { label: "aged up", pattern: /\baged[-\s]*up\b/iu },
  { label: "of indeterminate age", pattern: /\bindeterminate\s+age\b/iu },
  { label: "unspecified age", pattern: /\bunspecified\s+age\b/iu },
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
  // EVERY verbatim field (spec I2), not just the style lock and the COREs:
  // a downstream normalizer that rewrites a set payload, the color rules, a
  // NEGATIVE slice or the shot must fail this gate too.
  check("style lock", input.styleLock.text);
  for (const member of Array.isArray(input.cast) ? input.cast : []) {
    if (typeof member?.coreRaw === "string" && member.coreRaw.length > 0) {
      check(`cast member "${member.id}" CORE`, member.coreRaw);
    }
    if (typeof member?.negativeRaw === "string" && member.negativeRaw.length > 0) {
      check(`cast member "${member.id}" NEGATIVE`, member.negativeRaw);
    }
  }
  if (input.set !== null && typeof input.set?.raw === "string" && input.set.raw.length > 0) {
    check("set block", input.set.raw);
  }
  if (typeof input.colorRules === "string" && input.colorRules.length > 0) {
    check("color rules", input.colorRules);
  }
  if (typeof input.shot === "string" && input.shot.length > 0) {
    check("shot", input.shot);
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
    // Map/Set entries are walked too: a superseded block smuggled inside a
    // collection is still a superseded source.
    if (node instanceof Map) {
      for (const [key, item] of node.entries()) walk(item, `${path}.get(${String(key)})`);
      return;
    }
    if (node instanceof Set) {
      let index = 0;
      for (const item of node) walk(item, `${path}.set[${index++}]`);
      return;
    }
    const record = node as Record<string, unknown>;
    // Truthy string forms count: JSON round-trips and form posts turn a
    // boolean into "true".
    const flag = record["superseded"];
    if (flag === true || flag === "true") hits.push(path === "" ? "(root)" : path);
    for (const [key, child] of Object.entries(record)) {
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  };
  walk(value, "");
  return hits;
};

/**
 * The aspect directive emitted into DIRECTION (spec §3.2: the aspect ratio is
 * a framing invariant and must reach the buffer, not merely be validated).
 */
export const aspectDirective = (aspectRatio: string): string =>
  `Aspect ratio ${aspectRatio}.`;

/** Assemble the five blocks. Pure concatenation of verbatim inputs. */
const assembleBlocks = (input: CompileInput): FiveBlocks => {
  const cast = Array.isArray(input.cast) ? input.cast : [];
  const directionLines = Array.isArray(input.direction) ? input.direction : [];
  const continuityParts: string[] = [];
  for (const member of cast) {
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
  for (const member of cast) {
    if (
      typeof member.negativeRaw === "string" &&
      member.negativeRaw.length > 0 &&
      !negativeParts.includes(member.negativeRaw)
    ) {
      negativeParts.push(member.negativeRaw);
    }
  }

  // The aspect directive always closes DIRECTION, so the compiled ratio is
  // present in the outbound bytes and readable back by downstream stages.
  const directionParts = [...directionLines, aspectDirective(input.aspectRatio)];

  return [
    input.styleLock.text,
    continuityParts.join("\n\n"),
    directionParts.join("\n"),
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
  /** name → variant label → hash, for CORE-replacing variants. */
  variants?: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

export const DEFAULT_PINS: PinTable = {
  styleLock: STYLE_LOCK_SHA256,
  core: CORE_PINS,
  variants: CORE_VARIANT_PINS,
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

  // Runtime shape guards: an untyped seam (the server's compile route) must
  // get a refusal list, not a TypeError.
  if (!Array.isArray(input.cast)) {
    refusals.push({
      invariant: "input-malformed",
      message: "cast must be an array",
    });
  }
  if (!Array.isArray(input.direction)) {
    refusals.push({
      invariant: "input-malformed",
      message: "direction must be an array of strings",
    });
  }

  const castList: CastMemberInput[] = Array.isArray(input.cast) ? input.cast : [];
  /** Members carrying real CORE content — what "has cast" means for staging. */
  const anchoredCast = castList.filter(
    (member) => typeof member?.coreRaw === "string" && member.coreRaw.trim().length > 0,
  );

  castList.forEach((member, index) => {
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
      // A CORE-replacing VARIANT (e.g. XIAOTIAN's TRUE FORM on page 39) is
      // pinned under its own label: the variant bytes are canon too, and
      // must be reviewed as deliberately as the ordinary CORE.
      const variantLabel = member.variantLabel;
      const reviewedPin =
        typeof variantLabel === "string" && variantLabel.length > 0
          ? pins.variants?.[member.name]?.[variantLabel]
          : pins.core[member.name];
      if (reviewedPin === undefined) {
        const which =
          typeof variantLabel === "string" && variantLabel.length > 0
            ? `variant ${JSON.stringify(variantLabel)} of ${JSON.stringify(member.name)}`
            : `name ${JSON.stringify(member.name)}`;
        refusals.push({
          invariant: "pin-unknown",
          message:
            `cast member "${label}" (${which}) has no entry in the ` +
            `reviewed pin table; add its hash to pins.ts in the same commit as the canon edit`,
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
  // (guardrail (c)). Tested on CONTENT, not object identity: a set of
  // `{}` or `{raw: "   "}` is not an anchor, and treating it as one is
  // exactly the documented failure (a panel compiled from prose alone).
  const hasAnchoredCast = anchoredCast.length > 0;
  const hasSetContent =
    input.set !== null &&
    typeof input.set?.raw === "string" &&
    input.set.raw.trim().length > 0;
  if (!hasAnchoredCast && !hasSetContent) {
    refusals.push({
      invariant: "stage-text-only",
      message:
        "no cast member with CORE content and no non-empty set block: " +
        "scene panels are never generated from text alone",
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
  // The stripped buffer closes the character-split straddle: CJK terms carry
  // no whitespace tolerance, so 咒術 ending one block and 回戰 starting the
  // next — or a single field line-wrapped mid-term — passes a raw scan while
  // the reader still sees the franchise name.
  const strippedPrompt = prompt.replace(/\s+/gu, "");
  for (const rule of FRANCHISE_DENYLIST) {
    const rawHit = rule.pattern.test(prompt);
    const strippedHit = rule.strippedPattern?.test(strippedPrompt) ?? false;
    if (!rawHit && !strippedHit) continue;
    const inBlock = blocks.findIndex((block) => rule.pattern.test(block));
    const where =
      inBlock >= 0
        ? `in ${PROMPT_BLOCK_NAMES[inBlock] ?? `block ${inBlock}`} block`
        : "split across a line or block boundary";
    refusals.push({
      invariant: "franchise-denylist",
      message: `franchise term ${rule.label} found ${where}; franchise names never go into prompts`,
    });
  }

  // softening-denylist — guardrail §3b(a)4, scanned in DIRECTION and SHOT
  // only (see SOFTENING_DENYLIST for why CONTINUITY/NEGATIVE are excluded).
  // These are the compiler/caller-written blocks the pin table cannot cover.
  const softenTargets: Array<[string, string]> = [
    ["DIRECTION", blocks[2]],
    ["SHOT", blocks[3]],
  ];
  for (const [blockName, text] of softenTargets) {
    const stripped = text.replace(/\s+/gu, " ");
    for (const rule of SOFTENING_DENYLIST) {
      if (rule.pattern.test(stripped)) {
        refusals.push({
          invariant: "softening-denylist",
          message:
            `softening phrase "${rule.label}" found in the ${blockName} block; ` +
            `a character's age or build is never re-described to clear a filter — ` +
            `route to the fallback model instead`,
        });
      }
    }
  }

  // required-substring — guardrail (a)'s post-assembly mechanical form.
  refusals.push(...checkRequiredSubstrings(input, prompt));

  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, prompt, blocks, aspectRatio: input.aspectRatio };
};
