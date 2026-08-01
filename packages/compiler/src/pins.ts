/**
 * The pinned-constant table (spec §3b(a)2, invariant I9): hashes of the
 * verbatim payloads the compiler is allowed to emit. These are REVIEWED
 * CONSTANTS — when the author revises a CORE block or the style lock, the
 * corresponding hash must be updated in the same commit, which is exactly
 * the review moment the guardrail exists to create. A caller cannot make
 * the no-softening check tautological by hashing its own input: compile
 * refuses any cast member or style lock whose pin is absent from, or
 * disagrees with, this table.
 *
 * Provenance: computed from vixio-dt/howl-to-heaven @ e7aa5c6
 * (02_art/character-design-prompts.txt v4 CORE BLOCK payloads as parsed by
 * @vixio/content-model parseDesignDoc; style lock = the frozen v3 block
 * quoted in 02_art/production-pipeline-spec.txt §"LOCKED"). The env-gated
 * oracle test in test/pins.test.ts recomputes these from the real checkout
 * and fails on any drift.
 */

/** sha256 of the frozen style-lock v3 text (the quoted block, 426 bytes). */
export const STYLE_LOCK_SHA256 =
  "7239206521e1bbb7f957de1a3bfb206ab3e8166048fbc32dcd43d18920fe55d6";

/**
 * sha256 of each character's VARIANT payloads, keyed by design-doc name then
 * by the variant's literal label. A variant REPLACES the ordinary CORE for
 * the panels it governs (XIAOTIAN's TRUE FORM on page 39 is the author-ruled
 * case), so it needs its own reviewed pin — otherwise the climax panel is
 * uncompilable and the only "fix" would be weakening the pin check.
 */
export const CORE_VARIANT_PINS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "XIAOTIAN": {
    "VARIANT — SEALED-EYE FLICKER (specified panels only)":
      "16d6c20196ffe406d69f41c24e36d7c23a812263eebc29ff2d161254ff2d6eeb",
    "VARIANT — TRUE FORM (FREEZE-FRAME ONLY; Episode Zero page 39; this\nblock REPLACES the standard Xiaotian CORE and NEGATIVE on this one\npanel, author ruling, open-questions 15-2/15-3)":
      "fa590a3ed0ae906a7bdd5a66d8b921d4a4bb20ef700c96e45a4cc33c4c377836",
  },
  "SHENGTIAN": {
    "VARIANT — STREET CLOTHES":
      "5dfa04768917fad82c0e7eedd8d1f59ff4ff0aadb20e796735ee0cda2af12d8f",
  },
  "THE WOMAN": {
    "VARIANT — DEMON STATE":
      "6f48a7f004ef9baa818eb40b0e89438ebc55a6d941ace4a15a1865cfc1eaf5f3",
  },
  "THE ENFORCER": {
    "VARIANT — POSSESSED STATE":
      "122ee1cce656ba75360619815281e0c2de0d8cbfed10dc293dd102b78a1f9a62",
  },
};

/** sha256 of each character's CORE BLOCK payload, keyed by design-doc name. */
export const CORE_PINS: Readonly<Record<string, string>> = {
  "XIAOTIAN": "8514be796aed3862a108d36ff8cfbabc4ac3f2b9f59e0b66db9bd24d8f205136",
  "SHENGTIAN": "b2523ccd1acd560de7ae84b5c81a8839cae32572a3f90d4ec9a773fab65597fd",
  "THE MASTER": "ca48883ad90ef87e31540cbfe5d27b66521d31f0fa2c52d04a1fda12139c0eb4",
  "THE WOMAN": "81a62cffa7d36937e6e6ce21b6d7f0a4d9154f8e0ac4b46d1f1dd182db7b1748",
  "BLACKIE": "d5761765c99285790c4c31a41bdb64e132ce54de19a5429f49eef1e1e5d48665",
  "THE ENFORCER": "1446a8b43b15cd4f8c8c8c4d121088c961a35c591b92bc880b367e93989fcb06",
  "THE OLD FACE": "d5ae3dfe4c0627faf0966ef6bb22e913018a1dd777572c72319e291a59caa0c2",
  "THE GATE OFFICER": "aef8fcdd97d6f004dad67c390a3f0f1f1831be6c784109ba4c90a482e885ba2e",
};
