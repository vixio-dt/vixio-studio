/**
 * THE RESOLUTION PHASE (hth-content-model spec §3.1).
 *
 * The compiler (@vixio/compiler) is a pure function of a hand-built
 * CompileInput. This module is the seam that derives that input from the
 * repo: parsed ScriptDoc + parsed DesignDoc + the per-panel facts that live
 * in no file today (§2.5: cast, set, aspect override, shot_en, approvals),
 * which the server accepts as an explicit `PanelIndexEntry` rather than
 * inventing a file or inferring them from prose (§1.7: cast is "stored,
 * human-confirmed. NOT inferred at generation time").
 *
 * The plan ledger assigns four invariants to this seam, because none of them
 * is expressible in the compiler's input shape:
 *
 *   I5 / I6  attachment ownership + approval. A cast member may carry only
 *            ITS OWN anchor element, and only when that registry entry is
 *            approved. The API has exactly one attachment constructor,
 *            `attachOwnAnchor(entityId)` (§3.3) — it takes an entity id and
 *            nothing else, so "attach this image to that character" is not
 *            expressible. The ownership assertion is still re-run over the
 *            assembled input as a tripwire against future refactors.
 *   I11      the ep0_p39_g1 TRUE FORM replace-path: Xiaotian's TRUE FORM
 *            variant substitutes CORE, its panel-scoped NEGATIVE substitutes
 *            the ordinary NEGATIVE, and its PALETTE substitutes the global
 *            Color Rules (design file v4 L64–79, spec §1.3/§3.1(5)).
 *   I13      freshness: the index entry is invalidated by any edit to the
 *            panel's 畫 field (hua_sha256), and an unapproved shot_en never
 *            reaches the SHOT block.
 *   §1.2     superseded style blocks (STYLE BLOCK A/B in the character file)
 *            are never selectable as the style lock.
 *
 * Fail-closed, same shape as the compiler: the result carries either a
 * CompileInput or a complete list of {invariant, message} refusals, never
 * both. Nothing here rewords, re-wraps, trims or normalizes a verbatim
 * payload: CORE / NEGATIVE / SET / PALETTE / Color Rules bytes are passed
 * through exactly as the parser sliced them out of the file.
 */
import {
  compilePanelPrompt,
  sha256Hex,
  type CastMemberInput,
  type CompileInput,
  type CompileResult,
  type Refusal,
} from "@vixio/compiler";
import {
  parseDesignDoc,
  parseScript,
  readSource,
  type CharacterEntry,
  type DesignDoc,
  type DesignSubBlock,
  type PageBlock,
  type Panel,
  type ScriptDoc,
  type SetBlock,
  type SourceText,
} from "@vixio/content-model";

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** Repo-relative paths of the two documents the resolution phase reads. */
export const DESIGN_DOC_PATH = "02_art/character-design-prompts.txt";
export const SCRIPT_DOC_PATH = "01_script/episode-zero-script.txt";

/**
 * The per-panel record that has no home in the repo today (spec §2.5). It is
 * an INPUT to the server, not something the server derives: `cast`, `set`,
 * the `大格` aspect override and the English `shot_en` cannot be inferred
 * from the script (speaker strings are not entity ids; 畫 prose uses three
 * different names for one character), and CLAUDE.md forbids inventing the
 * file that would hold them without asking the author.
 *
 * `huaSha256` is what makes the record self-invalidating: it is the sha256 of
 * the panel's 畫 field raw as parsed, so any edit to that field mechanically
 * staleness-fails every downstream translation (I13).
 */
export type PanelIndexEntry = {
  /** `ep0_p{page}_g{panel}` — the asset filename scheme (§1.7). */
  panelId: string;
  /** sha256 (hex) of the 畫 field raw this entry was written against. */
  huaSha256: string;
  /** Design-doc character names, author-confirmed, in emission order. */
  cast: string[];
  /** Design-doc set name (`SetBlock.nameLiteral`), or null for no set. */
  set: string | null;
  /**
   * Optional SET sub-key (§1.4: "A SET selector must accept an optional
   * sub-key. No other set has one." — SET 2's Stage / Backstage versions).
   */
  setSubKey?: string;
  /** Explicit aspect ratio; the `大格` override lives here (I12). */
  aspectRatio: string;
  /** The English translation/expansion of 畫 — the only generated text. */
  shotEn: string;
  /** Author approval of `shotEn` (I13). */
  shotApproved: boolean;
};

/** One entity's reference-element registration (§1.3 `anchor`). */
export type AnchorRegistryEntry = { elementId: string | null; approved: boolean };

/**
 * Anchor registry, keyed by DETERMINISTIC ENTITY ID (spec's global id rule):
 * `char:{ordinal}-{slug}` / `set:{ordinal}-{slug}`, e.g. `char:2-shengtian`.
 * Use `characterEntityId` / `setEntityId` to compute a key.
 */
export type AnchorRegistry = Readonly<Record<string, AnchorRegistryEntry>>;

/**
 * The style lock the caller asks to compile with. `superseded` is accepted
 * so a caller that carries the flag from a parsed StyleBlockEntry is refused
 * loudly instead of silently dropping it.
 */
export type StyleLockInput = { text: string; sha256: string; superseded?: boolean };

/** Panel identity: the asset id, or the page block index + panel ordinal. */
export type PanelSelector = { panelId: string } | { blockIndex: number; panelOrdinal: number };

export type ResolveArgs = {
  design: DesignDoc;
  /**
   * The design file's SourceText. Needed because the Color Rules region is
   * an opaque region in the parse (only its line span is known) and its
   * bytes are emitted verbatim in CONTINUITY (§3.2).
   */
  designSource: SourceText;
  script: ScriptDoc;
  /** Defaults to `{ panelId: index.panelId }`. */
  panel?: PanelSelector;
  index: PanelIndexEntry;
  registry: AnchorRegistry;
  styleLock: StyleLockInput;
};

export type ResolveResult =
  | { ok: true; input: CompileInput }
  | { ok: false; refusals: Refusal[] };

/* ------------------------------------------------------------------ */
/* Deterministic ids                                                   */
/* ------------------------------------------------------------------ */

/** lowercase, non-alphanumeric runs collapsed to `-` (`THE MASTER` → `the-master`). */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const characterEntityId = (entry: Pick<CharacterEntry, "ordinal" | "nameLiteral">): string =>
  `char:${entry.ordinal}-${slugify(entry.nameLiteral)}`;

export const setEntityId = (block: Pick<SetBlock, "ordinal" | "nameLiteral">): string =>
  `set:${block.ordinal}-${slugify(block.nameLiteral)}`;

/* ------------------------------------------------------------------ */
/* Panel identity                                                      */
/* ------------------------------------------------------------------ */

/** `ep0_p39_g1` — episode 0 is the only episode in the repo today. */
const PANEL_ID_RE = /^ep(\d+)_p(\d+)_g(\d+)$/;
const EPISODE_PREFIX = "ep0";

const panelOrdinalOf = (panel: Panel): number => panel.ordinal ?? 1;

/**
 * Every id that names this panel. A two-page spread carries one panel under
 * two physical page numbers (第46至47頁), so both spellings are accepted.
 */
const panelIdsFor = (page: PageBlock, panel: Panel): string[] =>
  page.physicalPages.map((p) => `${EPISODE_PREFIX}_p${p}_g${panelOrdinalOf(panel)}`);

const canonicalPanelId = (page: PageBlock, panel: Panel): string =>
  `${EPISODE_PREFIX}_p${page.pageStart}_g${panelOrdinalOf(panel)}`;

const findPanel = (
  script: ScriptDoc,
  selector: PanelSelector,
): { page: PageBlock; panel: Panel } | null => {
  if ("panelId" in selector) {
    const m = PANEL_ID_RE.exec(selector.panelId);
    if (!m) return null;
    const pageNo = Number(m[2]);
    const ordinal = Number(m[3]);
    const page =
      script.pages.find((p) => p.pageStart === pageNo) ??
      script.pages.find((p) => p.physicalPages.includes(pageNo));
    if (page === undefined) return null;
    const panel =
      page.panels.find((p) => p.ordinal === ordinal) ??
      (ordinal === 1 && page.panels.length === 1 ? page.panels[0] : undefined);
    return panel === undefined ? null : { page, panel };
  }
  const page = script.pages[selector.blockIndex];
  if (page === undefined) return null;
  const panel =
    page.panels.find((p) => p.ordinal === selector.panelOrdinal) ??
    (selector.panelOrdinal === 1 && page.panels.length === 1 ? page.panels[0] : undefined);
  return panel === undefined ? null : { page, panel };
};

/* ------------------------------------------------------------------ */
/* Aspect + direction                                                  */
/* ------------------------------------------------------------------ */

/** production-pipeline-spec.txt aspect table (spec §3.1(3)). */
const ASPECT_BY_TOKEN: ReadonlyMap<string, string> = new Map([
  ["整頁一格", "2:3"],
  ["跨頁", "21:9"],
  ["跨頁一", "21:9"],
  ["跨頁二・終", "21:9"],
  ["橫長", "21:9"],
  ["特寫", "1:1"],
]);
/** `大格` has no tiebreak in the spec (3:2 or 16:9) — it demands an override. */
const OVERRIDE_TOKEN = "大格";
const OVERRIDE_CHOICES: ReadonlySet<string> = new Set(["3:2", "16:9"]);
const UNMARKED_ASPECT = "4:3";

/**
 * Panel/page attribute tokens. `attr_tokens[] split on ，and once 、`
 * (§1.7) — free-form, never an enum, so unknown tokens simply carry no rule.
 */
const attrTokens = (page: PageBlock, panel: Panel): string[] => {
  const raw: string[] = [];
  if (panel.attrRaw !== null) raw.push(panel.attrRaw);
  if (page.attrKind === "shape") raw.push(page.attrRaw);
  return raw.flatMap((text) => text.split(/[，、]/)).filter((token) => token !== "");
};

/** DIRECTION camera language — the only place Chinese tokens become English (§3.2). */
const CAMERA_BY_TOKEN: ReadonlyMap<string, string> = new Map([
  ["近", "Camera: closer framing on the subject."],
  ["更近", "Camera: closer still."],
  ["極近", "Camera: extreme close-up."],
  ["大格", "Panel size: large panel, dominant on the page."],
  ["橫長", "Panel shape: wide horizontal strip."],
  ["建立鏡", "Camera: establishing shot."],
  ["孩子視角", "Camera: a child's eye level, low angle."],
  ["頁底", "Page position: bottom of the page."],
  ["全黑", "The frame is entirely black."],
  ["整頁一格", "Panel shape: a single full-page panel."],
  ["跨頁", "Panel shape: a two-page spread."],
]);

/** Constant panel invariants (pipeline L140–146, L69–72; CLAUDE.md page rules). */
const PANEL_INVARIANTS =
  "Single panel, full color, left-to-right reading order. " +
  "No system visuals, no UI, no text, no speech balloons, no watermark.";

/** Byte-exact literal from production-pipeline-spec.txt L118–122 (em dash U+2014). */
const SHARP_FOCUS = "Sharp focus throughout — crisp shading edges, no soft focus";

/**
 * DIRECTION lines in spec order (§3.2): panel invariants → the byte-exact
 * crisp-edge literal → per-panel camera language. The ASPECT DIRECTIVE is
 * deliberately absent: the compiler appends it as the last DIRECTION line
 * from `input.aspectRatio`, so emitting one here would duplicate it.
 */
const buildDirection = (tokens: string[]): string[] => {
  const lines = [PANEL_INVARIANTS, SHARP_FOCUS];
  for (const token of tokens) {
    const camera = CAMERA_BY_TOKEN.get(token);
    if (camera !== undefined && !lines.includes(camera)) lines.push(camera);
  }
  return lines;
};

/* ------------------------------------------------------------------ */
/* Design-doc lookups                                                  */
/* ------------------------------------------------------------------ */

const subBlockOf = (
  entry: CharacterEntry,
  kind: DesignSubBlock["kind"],
  labelIncludes?: string,
): DesignSubBlock | undefined =>
  entry.subBlocks.find(
    (block) =>
      block.kind === kind &&
      (labelIncludes === undefined || block.label.includes(labelIncludes)),
  );

/**
 * The Color Rules region is claimed whole by the parser (its body is opaque),
 * so its verbatim bytes are sliced here: every line after the region heading,
 * with the structural blank lines around the body dropped. The result is a
 * contiguous whole-line slice of the file — an exact substring, not a rewrap.
 */
const colorRulesRaw = (design: DesignDoc, source: SourceText): string | null => {
  const region = design.regions.find((r) => r.kind === "color-rules");
  if (region === undefined) return null;
  // region.lines.from is the `━` separator; the heading is the line after it.
  let from = region.lines.from + 2;
  let to = region.lines.to;
  while (from <= to && (source.lines[from]?.text ?? "") === "") from += 1;
  while (to >= from && (source.lines[to]?.text ?? "") === "") to -= 1;
  if (from > to) return null;
  return source.lines
    .slice(from, to + 1)
    .map((line) => line.text)
    .join("\n");
};

/* ------------------------------------------------------------------ */
/* I11 — the one mode-switch panel                                     */
/* ------------------------------------------------------------------ */

/**
 * `ep0_p39_g1` + Xiaotian forces the replace-path (spec §3.1(5), I11). The
 * design file states it in the variant header itself: "this block REPLACES
 * the standard Xiaotian CORE and NEGATIVE on this one panel".
 */
const TRUE_FORM_PANEL_ID = "ep0_p39_g1";
const TRUE_FORM_CHARACTER = "XIAOTIAN";
const TRUE_FORM_LABEL = "TRUE FORM";
/** Both the PALETTE and the NEGATIVE of the replace-path are panel-scoped. */
const PANEL_SCOPED_LABEL = "this panel only";

/* ------------------------------------------------------------------ */
/* Anchors — I5 / I6                                                   */
/* ------------------------------------------------------------------ */

type AnchorResolution = { elementId: string | null; refusals: Refusal[] };

/**
 * Build the single attachment constructor of §3.3. It takes an ENTITY ID and
 * nothing else: there is no parameter for "an image" or "a purpose", so the
 * 2026-07-30 failure (one character's portrait bound as another character's
 * style reference) is not expressible. On top of that shape, two checks:
 *
 *  - anchor-unapproved: the entity's own registry row is not approved.
 *  - anchor-foreign:    the element id it would attach is registered to some
 *                       OTHER entity as well — the element allowlist rule of
 *                       §3b(b)3 ("an element id registered to any other
 *                       entity is rejected even if it is passed with the
 *                       correct owner label").
 */
const makeAttachOwnAnchor = (registry: AnchorRegistry): ((entityId: string) => AnchorResolution) => {
  const owners = new Map<string, string[]>();
  for (const [entityId, entry] of Object.entries(registry)) {
    const elementId = entry?.elementId;
    if (typeof elementId !== "string" || elementId === "") continue;
    const list = owners.get(elementId);
    if (list === undefined) owners.set(elementId, [entityId]);
    else list.push(entityId);
  }

  return (entityId: string): AnchorResolution => {
    const entry = registry[entityId];
    if (entry === undefined) {
      // Not registered at all: no element to attach. The compiler's
      // stage-anchor-missing gate (guardrail (c)) is what refuses the panel.
      return { elementId: null, refusals: [] };
    }
    if (entry.approved !== true) {
      return {
        elementId: null,
        refusals: [
          {
            invariant: "anchor-unapproved",
            message:
              `anchor for "${entityId}" is not approved; anchors are author-approved before ` +
              `they may be attached (I5/I6, guardrail (c): anchor sheets precede scene panels)`,
          },
        ],
      };
    }
    const elementId = typeof entry.elementId === "string" && entry.elementId !== "" ? entry.elementId : null;
    if (elementId === null) return { elementId: null, refusals: [] };
    const registeredTo = owners.get(elementId) ?? [];
    if (registeredTo.length > 1 || registeredTo[0] !== entityId) {
      return {
        elementId: null,
        refusals: [
          {
            invariant: "anchor-foreign",
            message:
              `element "${elementId}" is registered to ${JSON.stringify(registeredTo)} — it is not ` +
              `"${entityId}"'s own anchor. An image reference may ONLY be attached when it is that ` +
              `same entity's own approved anchor; style consistency comes from the STYLE LOCK text, ` +
              `never from a portrait of someone else`,
          },
        ],
      };
    }
    return { elementId, refusals: [] };
  };
};

/**
 * Ownership tripwire re-run over the ASSEMBLED input (§3b(b)2/4): every
 * attached element must still be exactly what that member's own registry row
 * says. Unreachable through the assembly above — which is the point: it fires
 * only if a future refactor introduces a foreign-attachment path.
 */
const assertOwnAnchors = (cast: CastMemberInput[], registry: AnchorRegistry): Refusal[] => {
  const refusals: Refusal[] = [];
  for (const member of cast) {
    const expected = registry[member.id]?.elementId ?? null;
    if (member.anchorElementId !== null && member.anchorElementId !== expected) {
      refusals.push({
        invariant: "anchor-foreign",
        message:
          `assembled attachment for "${member.id}" is ${JSON.stringify(member.anchorElementId)} but ` +
          `its own registry entry is ${JSON.stringify(expected)}; only an entity's own anchor may attach`,
      });
    }
  }
  return refusals;
};

/* ------------------------------------------------------------------ */
/* Style lock — §1.2                                                   */
/* ------------------------------------------------------------------ */

/** Compare ignoring an enclosing pair of `"` (payload slices keep the quotes). */
const unquoted = (text: string): string =>
  text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;

const supersededStyleRefusals = (design: DesignDoc, styleLock: StyleLockInput): Refusal[] => {
  const refusals: Refusal[] = [];
  if (styleLock.superseded === true) {
    refusals.push({
      invariant: "superseded-source",
      message:
        "the requested style lock is flagged superseded; the FINAL style block lives in " +
        "production-pipeline-spec.txt §8 and supersedes STYLE BLOCK A/B",
    });
  }
  const wanted = unquoted(styleLock.text);
  for (const block of design.styleBlocks) {
    if (unquoted(block.payloadRaw) === wanted) {
      refusals.push({
        invariant: "superseded-source",
        message:
          `the requested style lock is ${block.label} from ${DESIGN_DOC_PATH}, which is stale ` +
          `(spec §1.2: the author's FINAL style block lives in production-pipeline-spec.txt §8); ` +
          `superseded sources must never compile`,
      });
    }
  }
  return refusals;
};

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve a CompileInput for one panel, or refuse. Every server-seam
 * invariant is collected (not short-circuited), so a caller sees the whole
 * list at once — and a refusing resolution never produces an input.
 */
export const resolveCompileInput = (args: ResolveArgs): ResolveResult => {
  const { design, designSource, script, index, registry, styleLock } = args;
  const refusals: Refusal[] = [];
  const selector: PanelSelector = args.panel ?? { panelId: index.panelId };

  /* ---- panel identity ---- */
  const located = findPanel(script, selector);
  if (located === null) {
    return {
      ok: false,
      refusals: [
        {
          invariant: "panel-not-found",
          message: `no panel matches selector ${JSON.stringify(selector)} in the parsed script`,
        },
      ],
    };
  }
  const { page, panel } = located;
  const panelId = canonicalPanelId(page, panel);
  if (!panelIdsFor(page, panel).includes(index.panelId)) {
    refusals.push({
      invariant: "panel-id-mismatch",
      message:
        `panel index entry is keyed ${JSON.stringify(index.panelId)} but the selected panel is ` +
        `${JSON.stringify(panelId)}; the index row and the panel must be the same panel`,
    });
  }

  /* ---- I13: freshness of the index entry against the live 畫 bytes ---- */
  const hua = panel.fields.find((field) => field.kind === "畫");
  if (hua === undefined) {
    refusals.push({
      invariant: "hua-missing",
      message: `panel ${panelId} has no 畫 field; 畫 is mandatory on every panel (§1.7)`,
    });
  } else {
    const actual = sha256Hex(hua.raw);
    const declared = typeof index.huaSha256 === "string" ? index.huaSha256.toLowerCase() : "";
    if (actual !== declared) {
      refusals.push({
        invariant: "shot-stale",
        message:
          `panel index entry for ${panelId} was written against 畫 ${index.huaSha256} but the ` +
          `script's 畫 now hashes to ${actual}; the translation must be re-derived and re-approved ` +
          `before it can ship (I13)`,
      });
    }
  }
  if (index.shotApproved !== true) {
    refusals.push({
      invariant: "shot-unapproved",
      message: `shot_en for ${panelId} is not author-approved; the SHOT block requires approval (I13)`,
    });
  }

  /* ---- style lock (§1.2) ---- */
  refusals.push(...supersededStyleRefusals(design, styleLock));

  /* ---- aspect (§3.1(3), I12) ---- */
  const tokens = attrTokens(page, panel);
  if (tokens.includes(OVERRIDE_TOKEN)) {
    if (!OVERRIDE_CHOICES.has(index.aspectRatio)) {
      refusals.push({
        invariant: "aspect-override-required",
        message:
          `panel ${panelId} is 大格, for which the spec gives no tiebreak: the panel index must ` +
          `carry an explicit 3:2 or 16:9 override, not ${JSON.stringify(index.aspectRatio)} (I12)`,
      });
    }
  } else {
    const derived = tokens.reduce<string | null>(
      (found, token) => found ?? ASPECT_BY_TOKEN.get(token) ?? null,
      null,
    );
    const expected = derived ?? (page.attrKind === "shape" ? null : UNMARKED_ASPECT);
    if (expected !== null && index.aspectRatio !== expected) {
      refusals.push({
        invariant: "aspect-mismatch",
        message:
          `panel ${panelId} resolves to ${expected} from its shape tokens ${JSON.stringify(tokens)}, ` +
          `but the panel index declares ${JSON.stringify(index.aspectRatio)}`,
      });
    }
  }

  /* ---- cast (§3.1(2)) ---- */
  const attachOwnAnchor = makeAttachOwnAnchor(registry);
  const cast: CastMemberInput[] = [];
  const seen = new Set<string>();
  const trueForm = index.panelId === TRUE_FORM_PANEL_ID || panelId === TRUE_FORM_PANEL_ID;
  let paletteOverride: string | null = null;

  for (const name of index.cast) {
    if (seen.has(name)) {
      refusals.push({
        invariant: "cast-duplicate",
        message: `cast member ${JSON.stringify(name)} appears twice in the panel index entry`,
      });
      continue;
    }
    seen.add(name);
    const entry = design.characters.find((character) => character.nameLiteral === name);
    if (entry === undefined) {
      refusals.push({
        invariant: "cast-unknown",
        message:
          `cast member ${JSON.stringify(name)} is not a character in ${DESIGN_DOC_PATH}; ` +
          `cast is stored and human-confirmed, never inferred (§1.7)`,
      });
      continue;
    }
    const entityId = characterEntityId(entry);

    // I11 — the replace-path. Only ever taken for the one panel the author
    // ruled on, and only for Xiaotian.
    let coreRaw: string;
    let negativeRaw: string;
    /** Set when a VARIANT replaces the CORE, so the compiler pins the variant. */
    let variantLabel: string | undefined;
    if (trueForm && name === TRUE_FORM_CHARACTER) {
      const variant = subBlockOf(entry, "variant", TRUE_FORM_LABEL);
      const negative = subBlockOf(entry, "negative", PANEL_SCOPED_LABEL);
      const palette = subBlockOf(entry, "palette", PANEL_SCOPED_LABEL);
      const missing = [
        variant === undefined ? "VARIANT — TRUE FORM" : null,
        negative === undefined ? "NEGATIVE (this panel only)" : null,
        palette === undefined ? "PALETTE (this panel only)" : null,
      ].filter((label): label is string => label !== null);
      if (missing.length > 0 || variant === undefined || negative === undefined || palette === undefined) {
        refusals.push({
          invariant: "true-form-missing",
          message:
            `${TRUE_FORM_PANEL_ID} requires ${TRUE_FORM_CHARACTER}'s TRUE FORM replace-path, but ` +
            `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} absent from ` +
            `${DESIGN_DOC_PATH}; this panel cannot compile from the ordinary CORE (I11)`,
        });
        continue;
      }
      coreRaw = variant.payloadRaw;
      negativeRaw = negative.payloadRaw;
      // The variant is canon in its own right and carries its own reviewed
      // pin; without this the climax panel refuses pin-mismatch against the
      // ordinary CORE hash.
      variantLabel = variant.label;
      // The panel-scoped PALETTE overrides the global Color Rules (L75).
      paletteOverride = palette.payloadRaw;
    } else {
      coreRaw = subBlockOf(entry, "core")?.payloadRaw ?? "";
      // Never the panel-scoped one: the ordinary NEGATIVE is the first
      // negative sub-block that is not panel-scoped.
      negativeRaw =
        entry.subBlocks.find(
          (block) => block.kind === "negative" && !block.label.includes(PANEL_SCOPED_LABEL),
        )?.payloadRaw ?? "";
    }

    const anchor = attachOwnAnchor(entityId);
    refusals.push(...anchor.refusals);
    cast.push({
      id: entityId,
      name: entry.nameLiteral,
      coreRaw,
      negativeRaw,
      anchorElementId: anchor.elementId,
      // The bytes as parsed at this commit. The compiler's own reviewed pin
      // table (DEFAULT_PINS) is the independent authority that makes the
      // no-softening guard non-tautological — a caller cannot bless its own
      // bytes by hashing them.
      corePinnedSha256: sha256Hex(coreRaw),
      ...(variantLabel === undefined ? {} : { variantLabel }),
    });
  }

  /* ---- set (§1.4, I6) ---- */
  let set: CompileInput["set"] = null;
  if (index.set !== null && index.set !== "") {
    const block = design.sets.find((candidate) => candidate.nameLiteral === index.set);
    if (block === undefined) {
      refusals.push({
        invariant: "set-unknown",
        message: `set ${JSON.stringify(index.set)} is not a SET block in ${DESIGN_DOC_PATH}`,
      });
    } else {
      let raw = block.payloadRaw;
      if (block.subVersions.length > 0) {
        const subKey = args.index.setSubKey;
        if (subKey === undefined || subKey === "") {
          refusals.push({
            invariant: "set-subkey-required",
            message:
              `set ${JSON.stringify(block.nameLiteral)} has sub-versions ` +
              `${JSON.stringify(block.subVersions.map((v) => v.label))}; the panel index must select one`,
          });
        } else {
          const sub = block.subVersions.find((candidate) => candidate.label === subKey);
          if (sub === undefined) {
            refusals.push({
              invariant: "set-subkey-unknown",
              message:
                `set ${JSON.stringify(block.nameLiteral)} has no sub-version ${JSON.stringify(subKey)}; ` +
                `known: ${JSON.stringify(block.subVersions.map((v) => v.label))}`,
            });
          } else {
            raw = sub.payloadRaw;
          }
        }
      }
      set = { name: block.nameLiteral, raw };

      // I6: the set anchor is gated exactly like a character's. The compiler
      // has no slot for a set attachment, so this seam is the only gate.
      const setId = setEntityId(block);
      const anchor = attachOwnAnchor(setId);
      refusals.push(...anchor.refusals);
      if (anchor.refusals.length === 0 && anchor.elementId === null) {
        refusals.push({
          invariant: "set-anchor-missing",
          message:
            `set "${setId}" has no approved, element-registered anchor; a panel is blocked until ` +
            `every cast anchor and the set anchor are approved (I6, guardrail (c))`,
        });
      }
    }
  }

  /* ---- assemble ---- */
  const input: CompileInput = {
    styleLock: { text: styleLock.text, sha256: styleLock.sha256 },
    cast,
    set,
    // A panel-scoped PALETTE replaces the global Color Rules (§3.2).
    colorRules: paletteOverride ?? colorRulesRaw(design, designSource),
    direction: buildDirection(tokens),
    shot: index.shotEn,
    aspectRatio: index.aspectRatio,
  };

  refusals.push(...assertOwnAnchors(input.cast, registry));

  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, input };
};

/**
 * Resolve, then compile. The compiler runs with its own DEFAULT_PINS — the
 * reviewed constant table — never a caller-supplied one.
 *
 * Refusal merge is fail-closed: a refusing resolution has no input to compile,
 * so its refusals are the whole answer. Either way the result carries a prompt
 * or refusals, never both.
 */
export const compileResolvedPanel = (args: ResolveArgs): CompileResult => {
  const resolved = resolveCompileInput(args);
  if (!resolved.ok) return { ok: false, refusals: resolved.refusals };
  return compilePanelPrompt(resolved.input);
};

/* ------------------------------------------------------------------ */
/* HTTP request shape                                                  */
/* ------------------------------------------------------------------ */

export type CompileRequest = {
  panelIndexEntry: PanelIndexEntry;
  registry: AnchorRegistry;
  styleLock: StyleLockInput;
};

export type ParsedRequest =
  | { ok: true; value: CompileRequest }
  | { ok: false; message: string };

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validate the POST /compile body. Strict by construction: unknown shapes are
 * a 400, never a best-effort coercion — a malformed panel index row must not
 * become a silently different compile.
 */
export const parseCompileRequest = (body: unknown): ParsedRequest => {
  if (!isRecord(body)) return { ok: false, message: "request body must be a JSON object" };

  const entryRaw = body["panelIndexEntry"];
  if (!isRecord(entryRaw)) {
    return { ok: false, message: "body.panelIndexEntry must be an object" };
  }
  const panelId = entryRaw["panelId"];
  if (typeof panelId !== "string" || panelId === "") {
    return { ok: false, message: "body.panelIndexEntry.panelId must be a non-empty string" };
  }
  const huaSha256 = entryRaw["huaSha256"];
  if (typeof huaSha256 !== "string" || !SHA256_HEX_RE.test(huaSha256)) {
    return { ok: false, message: "body.panelIndexEntry.huaSha256 must be a 64-char hex sha256" };
  }
  const castRaw = entryRaw["cast"];
  if (!Array.isArray(castRaw) || castRaw.some((name) => typeof name !== "string" || name === "")) {
    return { ok: false, message: "body.panelIndexEntry.cast must be an array of non-empty strings" };
  }
  const setRaw = entryRaw["set"];
  if (setRaw !== null && typeof setRaw !== "string") {
    return { ok: false, message: "body.panelIndexEntry.set must be a string or null" };
  }
  const setSubKey = entryRaw["setSubKey"];
  if (setSubKey !== undefined && typeof setSubKey !== "string") {
    return { ok: false, message: "body.panelIndexEntry.setSubKey must be a string when present" };
  }
  const aspectRatio = entryRaw["aspectRatio"];
  if (typeof aspectRatio !== "string" || aspectRatio === "") {
    return { ok: false, message: "body.panelIndexEntry.aspectRatio must be a non-empty string" };
  }
  const shotEn = entryRaw["shotEn"];
  if (typeof shotEn !== "string") {
    return { ok: false, message: "body.panelIndexEntry.shotEn must be a string" };
  }
  const shotApproved = entryRaw["shotApproved"];
  if (typeof shotApproved !== "boolean") {
    return { ok: false, message: "body.panelIndexEntry.shotApproved must be a boolean" };
  }

  const registryRaw = body["registry"];
  if (!isRecord(registryRaw)) return { ok: false, message: "body.registry must be an object" };
  const registry: Record<string, AnchorRegistryEntry> = {};
  for (const [entityId, value] of Object.entries(registryRaw)) {
    if (!isRecord(value)) {
      return { ok: false, message: `body.registry[${JSON.stringify(entityId)}] must be an object` };
    }
    const elementId = value["elementId"];
    const approved = value["approved"];
    if (elementId !== null && typeof elementId !== "string") {
      return {
        ok: false,
        message: `body.registry[${JSON.stringify(entityId)}].elementId must be a string or null`,
      };
    }
    if (typeof approved !== "boolean") {
      return {
        ok: false,
        message: `body.registry[${JSON.stringify(entityId)}].approved must be a boolean`,
      };
    }
    registry[entityId] = { elementId, approved };
  }

  const styleLockRaw = body["styleLock"];
  if (!isRecord(styleLockRaw)) return { ok: false, message: "body.styleLock must be an object" };
  const text = styleLockRaw["text"];
  if (typeof text !== "string" || text === "") {
    return { ok: false, message: "body.styleLock.text must be a non-empty string" };
  }
  const sha256 = styleLockRaw["sha256"];
  if (typeof sha256 !== "string" || !SHA256_HEX_RE.test(sha256)) {
    return { ok: false, message: "body.styleLock.sha256 must be a 64-char hex sha256" };
  }
  const superseded = styleLockRaw["superseded"];
  if (superseded !== undefined && typeof superseded !== "boolean") {
    return { ok: false, message: "body.styleLock.superseded must be a boolean when present" };
  }

  const panelIndexEntry: PanelIndexEntry = {
    panelId,
    huaSha256,
    cast: castRaw as string[],
    set: setRaw ?? null,
    ...(setSubKey === undefined ? {} : { setSubKey }),
    aspectRatio,
    shotEn,
    shotApproved,
  };
  const styleLock: StyleLockInput = {
    text,
    sha256,
    ...(superseded === undefined ? {} : { superseded }),
  };
  return { ok: true, value: { panelIndexEntry, registry, styleLock } };
};

/**
 * Parse the two source documents and compile the requested panel. Parser
 * errors propagate (the route maps any throw to 422, as /view does); a
 * refusing compile is a value, not a throw.
 */
export const compilePanelFromDocs = (args: {
  designBytes: Buffer;
  scriptBytes: Buffer;
  request: CompileRequest;
}): CompileResult => {
  const designSource = readSource(args.designBytes);
  const design = parseDesignDoc(designSource);
  const script = parseScript(readSource(args.scriptBytes));
  return compileResolvedPanel({
    design,
    designSource,
    script,
    index: args.request.panelIndexEntry,
    registry: args.request.registry,
    styleLock: args.request.styleLock,
  });
};
