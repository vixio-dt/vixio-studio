# CONTENT MODEL SPEC — HOWL TO HEAVEN writing platform

Repo under spec: `/workspace/howl-to-heaven` (git, single source of truth). App repo being salvaged: `/home/user/vixio-studio`.

**Notation.** `V` column = verbatim-critical: the field must be transported as a byte slice of the source file and emitted unmodified. No re-wrapping, no Unicode normalization, no `—`→`--`, no quote substitution, no trimming, no paraphrase. `V=NEVER` = the field exists in the repo but must never reach a prompt or a rendered page.

**Global ID rule.** Every id is deterministic and path-derived. No `crypto.randomUUID()`. The old app's branded random ids (`src/lib/id.ts:18`) are the single worst fit for a git-backed store — two containers editing the same entity must produce the same id.

**Pinned versions.** Files on disk are `character-design-prompts.txt` **v4** and `production-pipeline-spec.txt` **v2**, not the v5/v3 named in the handoff. The style block inside the pipeline spec is separately versioned **v3** (`production-pipeline-spec.txt:91`). The compiler pins to **content hashes + git commit SHA**, never to the claimed version string.

---

## 1. ENTITIES

### 1.1 CanonDoc

Source: `/workspace/howl-to-heaven/00_canon/{world-rules,story-bible,open-questions}.txt` — UTF-8, LF, no BOM.

| field | type | source | V |
|---|---|---|---|
| `id` | `canon:{slug}` | filename slug | — |
| `path` | string | — | — |
| `studio_line` | string | L1 `VIXIO CREATIVES｜《哮天》HOWL TO HEAVEN` | YES |
| `doc_title_zh` | string | L2 after `文件：` | YES |
| `version` | string | L3 before `｜` (`版本 2.0`) | YES |
| `version_dialect` | enum `canon-decimal｜script-v｜art-v` | derived from directory | — |
| `status` | string | L3 after `狀態：` (`現行`) | YES |
| `scope_note` | string? | `world-rules.txt:5`, `open-questions.txt:4` | YES |
| `sections[]` | `{heading_literal, ordinal_cjk, line_start, line_end, body}` | `━`×23 (U+2501) + `第N章` + U+3000 + title | YES (body) |
| `pasteable_into_prompts` | bool = **false** | `production-pipeline-spec.txt:15-16` — "for understanding only, not pasted directly into prompts" | — |
| `never_ship` | bool | true for `world-rules.txt:142` `第十章　宇宙底層（私人燃料，永不入作品）` | V=NEVER |

`story-bible.txt` adds a character-roster substructure: bare unmarked name lines at L18/28/35/44/52/61/74/80/85/89/97 are sub-headings. These are the **Chinese-language** character records and are a different entity from the English design blocks in §1.3 — link them by explicit mapping, never by name matching (`效天／楊戩` vs `XIAOTIAN`).

`open-questions.txt` adds: `items[] {ordinal: 一、…十七、 or n之m、, category, text, state: null|（已定）|（已定・改）}`. Numbering is continuous across categories, never restarts, and is **not sorted** (`七之四` at L17 precedes `七之二` at L18). Do not sort on read; preserve file order.

### 1.2 StyleBlock

| field | type | source | V |
|---|---|---|---|
| `id` | `style:lock@v3` | — | — |
| `text` | bytes | `/workspace/howl-to-heaven/02_art/production-pipeline-spec.txt` **L97–103**, interior of the opening `"` (first char L97) and closing `"` (last char L103) | **YES — the single most byte-critical field in the system** |
| `block_version` | `v3` | L91 `style block v3, frozen verbatim` | YES |
| `frame_text` | bytes | L91–96 (provenance paragraph) | V=NEVER (context only) |
| `touchstones[]` | `["咒術回戰","死神 Bleach"]` | L94 | **V=NEVER** — L94 `franchise names never go into prompts` |
| `emission_position` | `0` (always first block) | L95–96, L105–107 | — |
| `per_character_adjectives_allowed` | **false** | L104–105 | — |
| `superseded_blocks[]` | `character-design-prompts.txt:263-274` STYLE BLOCK A / B | pipeline §8 supersedes | must never compile |

`character-design-prompts.txt` L263–274 (`STYLE BLOCK A (painterly)`, `STYLE BLOCK B (modern late-night seinen)`) are **stale**. The author's FINAL pick is a third style present in neither. The character file was never updated. Any compiler that reads "Style Blocks" from the character file is wrong.

### 1.3 Character (8)

Source: `/workspace/howl-to-heaven/02_art/character-design-prompts.txt`.

| field | type | source | V |
|---|---|---|---|
| `id` | `char:{ordinal}-{slug}` (`char:2-shengtian`) | heading | — |
| `ordinal` | 1–8 | heading `^([1-8])\. ` | — |
| `name_literal` | string | heading, e.g. `SHENGTIAN` | YES |
| `qualifier` | string? | heading parens, `(stage costume)` | YES |
| `core_block` | bytes | `CORE BLOCK:` marker alone on a line; payload = **next line → blank line**. L42/85/119/134/153/164/182/194 | **YES** |
| `core_sha256` | hex | computed, pinned in compiler config | — |
| `negative` | bytes | `NEGATIVE: ` marker **inline**; payload = same line → blank line. L57/109/128/147/158/176/188/201 | **YES** |
| `variants[]` | `{label, scope, payload, replaces_core: bool, palette_override?, scoped_negative?}` | `VARIANT — <LABEL>[ (<scope>)]:`, payload is `"`-quoted. 5 instances across 4 characters | **YES** |
| `rendering_note` | `{prose, appendix_string, assembly_directive}` | L98–103 header (wraps 6 lines) + quoted appendix. **SHENGTIAN only** | YES (appendix) |
| `anchor` | `{drive_filename, cdn_url, element_id, approved: bool, approved_at, source_manifest_row}` | **does not exist in any file today** — see §2.5 | — |
| `script_aliases[]` | string[] | manual mapping table; `孩子`/`勝天`/`勝仔`/`沉香` → `char:2-shengtian` | — |
| `age_build_clause` | bytes (substring of `core_block`) | required-substring assertion target | **YES** |
| `archive_only_assets[]` | string[] | Style A sheets of 2026-07-29, pipeline L130–131 — never selectable as anchors | — |

**Mandatory sub-blocks:** exactly `CORE BLOCK:` and `NEGATIVE:`, 8/8, once each. Everything else optional.

**Structural traps the model must absorb:** sub-block order is not fixed (#4 and #6 are CORE→VARIANT→NEGATIVE; #2 is CORE→RENDERING NOTE→NEGATIVE→VARIANT) — parse by marker, never position. Xiaotian's TRUE FORM variant header wraps L64–66 and its nested `PALETTE (…)` (L75) and `NEGATIVE (this panel only):` (L79) have **no blank line before them**, so blank-line splitting merges three nodes into one.

**Xiaotian TRUE FORM is a replace, not an append:** L64–66 — `this block REPLACES the standard Xiaotian CORE and NEGATIVE on this one panel`, scoped to Episode Zero page 39, and its PALETTE `overrides global Color Rules` (L75).

### 1.4 Set (6)

| field | type | source | V |
|---|---|---|---|
| `id` | `set:{ordinal}-{slug}` | `SET <N> — <NAME>[ (<gloss>)]`, no colon | — |
| `name_literal`, `gloss` | string | L209/217/225/230/235/240 | YES |
| `payload` | bytes (`"`-quoted) | following lines | **YES** |
| `sub_versions` | `Map<string, bytes>?` | **SET 2 only**: `Stage version:` / `Backstage version:`, L218–223, no blank line between | **YES** |
| `anchor` | same shape as Character.anchor | not in repo today | — |

A SET selector must accept an optional sub-key. No other set has one.

### 1.5 Prop (4)

| field | type | source | V |
|---|---|---|---|
| `id` | `prop:{slug}` | ALL-CAPS name + `:` on its own line, L248/251/254/256 | — |
| `name_literal` | string | — | YES |
| `payload` | bytes (`"`-quoted) | following lines, **no blank line between consecutive props** | **YES** |
| `anchor` | as above | not in repo today | — |

Parser hazard: `PAPER LOTUS LANTERN:` is lexically identical in shape to `CORE BLOCK:`. Scope prop parsing to the region after the `Prop Blocks` header (L246).

### 1.6 ScriptPage (page block)

Source: `/workspace/howl-to-heaven/01_script/episode-zero-script.txt`. **Key the model on the page block, not the page number** — 45 headers cover 47 physical pages.

| field | type | source | V |
|---|---|---|---|
| `id` | `page:{block_index}` (0-based header ordinal) | — | — |
| `page_start`, `page_end` | int, int? | `^第(\d+)(?:至(\d+))?頁（([^）]*)）(.*)$` at column 0 | — |
| `physical_pages[]` | int[] | derived | — |
| `attr_raw` | string | parens content | YES |
| `attr_kind` | enum `panel-count｜shape` | overloaded slot | — |
| `declared_panel_count` | int? | `3格`(13) `4格`(18) `5格`(5) `6格`(1) — all 37 match actual counts | — |
| `shape_token` | enum? `整頁一格｜跨頁一｜跨頁二・終｜題目頁` | 8 pages | — |
| `trailing_note` | string? | only `第39頁（整頁一格）——全話第一個真・定鏡` | YES |
| `act_ref` | `act:{n}` | **derived from the preceding act heading, never from declared page ranges** | — |
| `line_start`, `line_end` | int | blank-line-delimited, zero exceptions | — |

**Act tier** (not in the handoff): `━`×23 at L8/43/89/150/212/349/448, heading at L9/44/90/151/213/350, grammar `<name>（第N至M頁）`. Two defects: **there is no 第三幕 anywhere in the file**, and the declared ranges lie (`序幕（第1至4頁）` actually contains pages 1–5; `第二幕・入寨（第20至28頁）` actually contains 20–35). Derive act membership from page-header sequence; surface the declared range as a mismatch warning, do not auto-correct.

### 1.7 ScriptPanel (150)

| field | type | source | V |
|---|---|---|---|
| `id` | `panel:ep0_p{page}_g{n}` — matches the asset filename scheme, `production-pipeline-spec.txt:54` | — | — |
| `panel_ordinal` | int, 1..N, resets per page, no gaps | `^格(\d+)(?:（([^）]*)）)?(.*)$` at column 0 | — |
| `implicit` | bool | true for the 8 pages with **zero `格` markers** | — |
| `attr_tokens[]` | string[] split on `，` and once `、` | free-form, ≥5 orthogonal axes — **not an enum** | YES |
| `attr_axes` | `{size?, distance?, aspect?, beat?, page_position?, content?, camera_role?, page_fraction?, split?, pov?}` | classified from tokens, open vocabulary | — |
| `hua` (`畫`) | bytes, multi-line | **mandatory, always first, 150/150** | **YES** |
| `hua_sha256` | hex | invalidates downstream translation | — |
| `bai[]` (`白`) | `{speaker_raw, modifier?, text}` × 0–2 | `白（<speaker>[，<modifier>]）：` — paren group **always present**, never bare `白：` | **YES (text — Cantonese, CLAUDE.md: "Never change the author's word choice")** |
| `yam[]` (`音`) | `{qualifier?, payload}` × 0–2 | `音：` / `音（…）：` | **YES** |
| `zyu` (`註`) | bytes? × 0–1, **always last** | production note, not rendered | YES |
| `zyu_scope` | enum `panel｜page` | 7 values are semantically page-level but structurally attach to the last panel: L16, 28, 87, 102, 125, 164, 446 | — |
| `tizi` (`題字`), `yegok_siuzi` (`頁角小字`), `yegok_tizi` (`頁角題字`) | bytes? | **undocumented markers** absent from the line-6 legend; 1 each. Dropping them loses the episode title and `第零集・完` | **YES** |
| `cast[]` | `char:*` refs | **stored, human-confirmed. NOT inferred at generation time** — speaker strings are not stable entity ids | — |
| `set_ref`, `set_subkey` | `set:*`, string? | stored | — |
| `props[]` | `prop:*` refs | stored | — |
| `render_specs[]` | enum `freeze｜skip｜divine-weather` | script-specified only | — |
| `aspect_ratio` | string | derived from shape tokens; `大格` is **ambiguous** and requires an explicit override | — |
| `shot_en` | `{text, approved: bool, derived_from_hua_sha256}` | translation/expansion of `畫` — **the only generated text in the prompt** | — |

**Field-sequence census (all 150 panels):** `畫`×64, `畫+註`×28, `畫+白`×27, `畫+白+註`×10, `畫+音`×9, `畫+音+註`×4, `畫+白+白`×3, `畫+音+白`×2, `畫+音+音+註`×1, `畫+題字+頁角小字`×1, `畫+頁角題字+註`×1.

**`畫`, `白`, `註` have multi-line values** (56 / 8 / 15 continuation lines). A continuation is an indented line that does not start with a known field marker. **Indent depth carries no meaning** — 1×U+3000 in 76 of 79 cases, 2×U+3000 at L133/L136/L137, and both depths are used for `白`.

**One `格` has an internal split with no schema slot:** `格3（斜分一格為二）` (L160) contains two sub-frames (左上 / 右下) addressed separately inside the `畫` value. Model as `attr_axes.split` + a free-text `畫`; do not invent sub-panel ids.

### 1.8 GenerationRecord

Source: `/workspace/howl-to-heaven/03_output/manifest.csv` — header `page,panel,version,seed,status,image_link,prompt_summary`; 1 header + 42 data rows; 7 fields on every line; **no quoted fields, no embedded commas, no CRLF**.

| field | type | today | V |
|---|---|---|---|
| `page` | int \| enum `TURN｜STYLE-PROBE｜KEY` | overloaded. `TURN`×22, `STYLE-PROBE`×10, `KEY`×9, `7`×1 | — |
| `panel` | `g<n>` \| kebab slug | overloaded: `g3`, or `shengtian`, `styleA-nbp`, `probe-ab-xiaotian` | — |
| `version` | `v<n>[a-d]` | 3 rows break the scheme: `styleA-painterly`, `styleB-cel`, `note` | — |
| `seed` | int(4–6) \| empty | **platform-assigned, never pinnable** (L151–153). 5 rows empty, all Nano Banana Pro / note | YES (as reported) |
| `status` | enum `completed(28)｜refused-filter(11)｜pending(2)｜invalidated(1)` | — | — |
| `image_link` | url \| `job:<uuid>` \| empty | 28 CloudFront (`d8j0ntlcm91z4.cloudfront.net/user_3EtXkHfk2kX1iOR2Q8KbBcczOZ4/…`), 11 job handles, 3 empty | YES |
| `prompt_summary` | free text, ` - ` internal delimiter, **commas forbidden** | outcome tokens `PASSED`/`refused` inline | YES |
| **`kind`** *(add)* | enum `panel｜turnaround｜set-anchor｜prop-anchor｜style-probe｜key-frame｜note` | replaces the `page` overload | — |
| **`model`** *(add)* | `seedream_v5_pro｜nano_banana_pro` | today only inferable from `-nbp` slug and empty seed | — |
| **`job_id`** *(add)* | uuid | today buried in `image_link` as `job:` | YES |
| **`prompt_sha256`** *(add)* | hex | reproducibility anchor | — |
| **`repo_commit`** *(add)* | 40-hex | makes the prompt recomputable byte-for-byte | — |
| **`element_ids`** *(add)* | `;`-joined | which anchors were attached | — |
| **`aspect_ratio`** *(add)* | string | — | — |
| **`drive_filename`** *(add)* | `ep0_p{page}_g{panel}_v{version}` | CloudFront links are ephemeral; `.gitignore:1` says images live in Drive but no row records the Drive name | YES |
| **`approved`** *(add)* | `yes｜no｜""` | author gate; today only implied by prose | — |

---

## 2. PARSING — verdict per source file

Governing constraint, `/workspace/howl-to-heaven/CLAUDE.md`: *"**Do not create new files.** All updates go into existing files; bump the version number in the file header (v1, v2, v3…). Ask the author before creating a new file."* Canon is fixed at exactly four files. Every recommendation below is an in-place edit with a header version bump, or an explicit ask.

### 2.1 `01_script/episode-zero-script.txt` — **parseable as-is, with a non-line-oriented tokenizer**

Verdict: **keep the format. Do not migrate.** This is the author's writing surface; a structured migration would move the source of truth out of his hands and violate the four-canon-files rule.

The parser must be built to these rules, all of which are forced by the data:

1. **Scan for markers anywhere in the line, not at line start.** 9 fields would be lost otherwise: `畫`→`音` with no separator (L12, L13, L192), `畫`→`白` with no separator (L78, L81, L218), `音`→`白` separated by U+3000 (L68, L148), `音`→`音` by U+3000 (L237).
2. **Whitelist exactly 7 markers** and require the full token with its colon: `(畫|白|音|註|題字|頁角小字|頁角題字)(（[^）]*）)?：`. `白` must additionally require the paren group — a bare `白：` never occurs, but `白光`, `指節發白`, `畫面`, `畫風突變`, `聲音`, `跳格`, `定格` all do.
3. **Never use a generic `^　(.+?)：` splitter** — it manufactures ~20 phantom fields from prose (`前景：` L86, `角落：` L144, `渲染基調：` L426, `另：` L428, `畫面損壞：` L32, `台上二郎神：` L156, `城寨入口：` L234, `交界正中：` L235, `目標：` L409, `供出三層：` L413, `二者之間：` L443, `開向已定左開：` L240/L446).
4. **Anchor page and panel markers at column 0.** `第4頁` and `第46至47頁` occur mid-prose inside `註` values (L238, L332), always indented.
5. **Open a panel implicitly** when a page's attr is a shape keyword. 8 panels including both spreads, the two structural mirror pages (4, 33) and the climax (44) have no `格` marker.
6. **Capture trailing text after `）`** on page headers — 1 of 45 (`第39頁`).
7. **Never apply paren balancing to values.** `（…）` nests inside values (L253, L419, L427) and `：` appears freely.
8. **Do not validate `音` as non-empty prose.** Two payloads are a bare `——` (L35, L333) and two are parenthesized stage directions (L356, L383).
9. Cross-check: `畫：` count must equal 150, and every declared `N格` must equal the actual `格` count on that page (currently 37/37 clean). Fail the build on drift.

Recommended in-place edits, bumping `版本 v3` → `v4` on line 3 and appending to the `版本史：` line 4:
- Extend the **line-6 legend** to document `題字`, `頁角小字`, `頁角題字` — they are real fields the legend omits.
- Normalize the 3 double-indent continuations at **L133, L136, L137** to 1×U+3000.
- Leave the two-page-spread headers, the overloaded attr slot, and the act-range mismatches alone; teach the parser instead. Raise the **missing 第三幕** as an author question in `00_canon/open-questions.txt` (existing file, no new file needed) — do not invent one.

Encoding is non-negotiable: UTF-8 only. The file contains `㗎` U+35CE (CJK Ext-A, ordinary Cantonese), `━` U+2501, `・` U+30FB, and 294 U+3000 indents. Any Big5/GBK round-trip corrupts it. The CSV/JSON layer must never touch this file.

### 2.2 `02_art/character-design-prompts.txt` — **needs a stricter convention (5 edits, not a migration)**

Verdict: **90% parseable; keep the format, tighten it.** These are verbatim prompt payloads; a YAML migration would re-quote and re-wrap exactly the bytes that must not change.

Parser rules forced by the data: entries are found by `━`×23 **plus** heading pattern `^([1-8])\. ([A-Z][A-Z ]*[A-Z])(?: \((.+)\))?$` — the rule alone is insufficient (15 rules, only 8 characters, and the same rule separates Usage Rules / Global Render Specs / Set Blocks / Prop Blocks / Style Blocks / KEY FRAME / Color Rules). Headings have no trailing colon; sub-block markers do — that is the discriminator. `CORE BLOCK:` payload is on the **following** lines; `NEGATIVE: ` payload is on the **same** line. Variant headers may wrap (L64–66, L98–103) and terminate only at the colon.

Recommended in-place edits, bumping `Version v4` → `v5` on line 3 with the changelog inline:
- Insert a blank line before `PALETTE (…)` (L75) and `NEGATIVE (this panel only):` (L79) so blank-line splitting stops merging nested nodes.
- Mark `STYLE BLOCK A` / `STYLE BLOCK B` (L263–274) with a literal `[SUPERSEDED 2026-07-30 — the FINAL style block lives in production-pipeline-spec.txt §8]` line, so no future reader or parser compiles them.
- Add a one-line section fence before `Prop Blocks` payloads so `PAPER LOTUS LANTERN:` is not ambiguous with `CORE BLOCK:` outside its region (or leave it and enforce region-scoped parsing in code — cheaper, and my recommendation).
- Leave sub-block order alone; parse by marker.

### 2.3 `02_art/production-pipeline-spec.txt` — **prose; extract 3 machine-readable payloads only**

Verdict: **needs a stricter convention for exactly three regions.** The rest is human/LLM prose and should stay that way.

Machine-extracted: (a) the STYLE LOCK quoted block L97–103, (b) the aspect-ratio table L155–156, (c) model ids L123–126. Everything else the compiler consumes as pinned constants in code, not by parsing prose.

Recommended in-place edits, bumping `Version v2` → `v3` with the changelog inline. **Four documented contradictions must be resolved in the file itself**, because an ephemeral-container assistant reading it fresh will otherwise re-derive the wrong answer:

| contradiction | locations | resolution to write into the file |
|---|---|---|
| "four-block architecture" then five labels | L138–139 vs L140–149, L105–107 | **five blocks**; NEGATIVE is an appended appendix. The "four" is a stale count. |
| §3 emits `畫` first / style fifth; §8 mandates STYLE LOCK first | L38–49 vs L105–107 | **§8 wins for order** (later, hard rule, causal reason: Seedream is order-sensitive). §3 is the content manifest — what goes in, not in what order. |
| "Lock the seed when supported" vs "cannot be pinned in advance" | L49 and `character-design-prompts.txt:16-17` vs L151–153 | **seeds are not pinnable here.** Never send a seed; read it back from job params. |
| "Soul Character / reference element" vs ELEMENT-only | L27, L84–86 vs L178–182 | **always Element, never Soul** (`show_reference_elements`); Souls lock to Soul-only models and cannot do multiple characters per panel. |

Also add: a tiebreak rule for `大格` (`3:2` **or** `16:9`, no rule given) and the anchor/element registry (§2.5).

### 2.4 `00_canon/*.txt` — **prose; parse headers and the section index only**

Verdict: bodies stay opaque. `world-rules.txt` and `story-bible.txt` are never pasted into prompts (pipeline L15–16), so the software never needs to understand their content — only to index and display them.

Parseable now: the 3-line header, `━`×23 macro-separators, `第<CJK>章`+U+3000+title headings, `open-questions.txt` numbered items with `（已定）`/`（已定・改）` inline state tokens. Note `open-questions.txt` has **zero `━` separators** — its categories are bare heading lines (L6/13/24/30/46/50).

Recommended in-place edits to `story-bible.txt`, bumping `版本 2.0` → `2.1`:
- **L188** has a section heading concatenated onto the tail of a paragraph (`…銅錢拍刪。起源之夜・局之全解（修訂版）`); its body L190–212 then runs to EOF with no separator and no standalone heading. Split it into a `━`+heading.
- **L136 says `共28頁`; L150, the script header, README and CLAUDE.md all say 47.** The 28 is stale. Fix.
- Trailing three blank lines: normalize to one.

### 2.5 `03_output/manifest.csv` — **machine-parseable as-is; extend the schema**

Verdict: **keep CSV.** It is already clean: no quoting, no embedded commas, uniform 7 fields, trailing newline. That discipline is worth more than any format upgrade — preserve it by making the writer *reject* commas and newlines in any field rather than by adding quoting.

Recommended: one mechanical commit adding the columns in §1.8 and backfilling all 42 existing rows with empty trailing fields, so field count stays uniform at the new width. Record the schema change in `production-pipeline-spec.txt` §4 (which already owns the file-naming convention at L54–56) as part of the v2→v3 bump. This is the **only** place the app needs to write to the repo routinely, and it is an existing file — no new-file permission required.

The one thing that genuinely has no home: **per-panel `cast`, `set_ref`, `shot_en`, and the `大格` aspect override.** This data exists in no file today and cannot be reliably inferred (speaker strings are not entity ids; `畫` prose uses three different names for one character). This requires an author ask. Two options, in preference order:
1. **Ask for one new file**, `01_script/panel-index.tsv`, generated by the parser and hand-corrected, keyed `panel_id \t hua_sha256 \t cast \t set \t aspect \t shot_en \t shot_approved`. The `hua_sha256` column makes it self-invalidating when the script changes.
2. Encode it in the script's existing `註` field with a strict prefix (e.g. `註：〔cast=shengtian,the-master〕…`). No new file, but it pollutes the author's writing surface and makes the script harder to read aloud. Not recommended.

### 2.6 `.gitignore`

Excludes `png/jpg/jpeg/webp/psd/mp4`. Not excluded: `.gif`, `.tif/.tiff`, `.pdf`, `.ai`, `.clip`, `.mov`, `.zip`. Add them before the first Higgsfield download lands in the working tree.

---

## 3. THE PROMPT COMPILER

`compile(panel_id, overrides) -> {buffer: bytes, blocks: [5], attachments: [], model, aspect, prompt_sha256, repo_commit}`

Pure function of (git commit, panel id, override set). No network, no clock, no randomness. Purity is what makes `prompt_sha256 + repo_commit` a complete record of what was sent, which is how the "full prompt text" retention requirement (`production-pipeline-spec.txt:54-56`) is satisfied without new files.

### 3.1 Resolution phase

1. Parse script → `page:{block}` → `panel:ep0_p{page}_g{n}`.
2. Load `cast[]`, `set_ref`(+subkey), `props[]` from the panel index. **Never infer cast from `畫` prose or `白` speakers at generation time.**
3. Resolve aspect from `attr_tokens` via the table at `production-pipeline-spec.txt:155-156`: `整頁一格`→`2:3`, `跨頁`→`21:9`, `橫長`→`21:9`, `大格`→**refuse without explicit override** (`3:2` or `16:9`, spec gives no tiebreak), `特寫`→`1:1`, unmarked→`4:3`.
4. Resolve render specs: `[FREEZE-FRAME / ERUPTION FRAME]` (`character-design-prompts.txt:23`), `[SKIP-FRAME]` (:29), `[DIVINE WEATHER]` (:35) — only when the script specifies.
5. Resolve character mode: if `panel_id == ep0_p39_g1` and `char:1-xiaotian ∈ cast`, switch that character to **replace-path** (TRUE FORM variant substitutes CORE and NEGATIVE; its PALETTE substitutes global Color Rules).

### 3.2 Emission — five blocks, fixed order, joined by `\n\n`

**Block 0 — STYLE LOCK.** Byte slice of `production-pipeline-spec.txt` L97–103 interior. **Copied byte-for-byte.** Identical across every generation in the project. Nothing per-character, ever (L104–105). Always first (L105–107, Seedream is order-sensitive).

**Block 1 — CONTINUITY.** All copied byte-for-byte:
- For each character in `cast`, in deterministic order (order of first mention in `畫`, ties broken by `ordinal`): the character's `core_block` slice. Replace-path characters emit their variant payload instead.
- **SHENGTIAN exception.** `character-design-prompts.txt:101-103` demands the child-proportion cues be *appended to CORE* **and** that the FACE be described *before the costume*. Those two instructions cannot both be satisfied without mutating a verbatim block. Mechanic: emit the quoted appendix string (the `"A child's face: …"` block) **immediately before** Shengtian's CORE slice, then the CORE slice unmodified. Face precedes costume; zero bytes of CORE change. Flag this as an author ruling to confirm and record it in the v3 pipeline bump.
- Then the `set_ref` payload slice (with `sub_key` for SET 2 only).
- Then any `props[]` payload slices.
- Then the Color Rules slice, `character-design-prompts.txt:292-298` — **unless** a panel-scoped PALETTE override is active, which replaces it.

**Block 2 — DIRECTION.** Compiler-generated text plus verbatim inserts. Always contains, in this order:
- Panel invariants, constant: single panel, full color, left-to-right reading, no system visuals, no text/balloons/watermark (pipeline L140–146, L69–72; `CLAUDE.md` page-level rules).
- The literal string `Sharp focus throughout — crisp shading edges, no soft focus` (L118–122). Byte-exact, em-dash U+2014.
- Aspect-ratio directive.
- Per-panel camera language, generated from `attr_axes` (`近`/`更近`/`極近`, `大格`, `橫長`, `建立鏡`, `孩子視角`, `頁底`, `全黑`). This is the only place the compiler is licensed to write English from Chinese tokens other than the SHOT.
- Render-spec slices when triggered — **verbatim**, from the Global Render Specs section.

**Block 3 — SHOT.** The one variable: `panel.shot_en.text`, the English translation/expansion of `畫`. Requires `shot_approved == true` and `derived_from_hua_sha256 == current hua_sha256`; otherwise the compile fails as stale. The original `畫` bytes travel in the record but never in the buffer.

**Block 4 — NEGATIVE.** Appended last. Per-character `negative` slices **verbatim** (or the panel-scoped negative on the replace-path), plus the literal `no soft-focus blur` (L118–122), plus the global no-text/no-watermark negatives.

### 3.3 Attachments

- For each character in `cast`: exactly one attachment, `{kind: "element", element_id, owner_entity_id: char:*}`, resolved **only** from that character's own `anchor.element_id`.
- Set and prop anchors attach the same way.
- Registered via `show_reference_elements` as **reference Elements, never Souls** (L178–182).
- The compiler's public API exposes exactly one attachment constructor, `attach_own_anchor(entity_id)`. There is no function anywhere in the codebase that accepts an arbitrary image plus a purpose string. The failure mode of 2026-07-30 is unreachable because the call does not exist.

### 3.4 Model routing

`model = seedream_v5_pro`, `resolution = 2k`, **no seed parameter is ever sent.** On `refused-filter`, resubmit the **identical byte buffer** to `nano_banana_pro` (L170–172). Route, do not reword. On systematic refusal of the protagonist, stop and escalate to Higgsfield support (L175–176) — there is no third retry strategy.

### 3.5 Invariants the compiler enforces mechanically (fail closed, refuse to emit)

| # | invariant | prevents |
|---|---|---|
| I1 | Exactly 5 blocks, fixed order, STYLE LOCK at index 0 | order-sensitivity contamination (the `probe-ab-xiaotian` row was `invalidated` for exactly this) |
| I2 | Every verbatim field is a byte slice; `sha256(emitted region) == sha256(source slice)`. No re-wrap, no NFC pass, no dash/quote substitution | silent paraphrase |
| I3 | Block 0 equals the frozen style bytes exactly; no per-character adjective may appear in it | L104–105 violation |
| I4 | Franchise denylist scan over the whole buffer: `咒術回戰`, `死神`, `Bleach`, `Jujutsu Kaisen` | L94 |
| I5 | `count(character attachments) == count(cast)`, every `owner_entity_id ∈ cast`, every `approved == true` | cross-character reference |
| I6 | Panel compile blocked unless every cast anchor and the set anchor are approved and element-registered | text-only generation |
| I7 | No `seed` parameter in the outbound call | seed-pinning fiction |
| I8 | Manifest row written before the MCP call, not after | lost records |
| I9 | Per-character `core_sha256` matches a pinned constant; mismatch fails the **build**, not the generation | undetected canon edit |
| I10 | Retry diff: at most one changed block (§3 L49); on the refusal route, **zero** changed bytes | "change only one variable per retry" |
| I11 | `ep0_p39_g1` + xiaotian forces the replace-path and the PALETTE override | wrong composition on the one mode-switch panel |
| I12 | `大格` without an explicit aspect override → refuse | silent 3:2/16:9 coin-flip |
| I13 | `shot_approved` and `hua_sha256` freshness | shipping a translation of a script line the author has since rewritten |

---

## 3b. GUARDRAILS — the four documented failures

### (a) Softening a canon age or build to dodge a content filter

Origin: `production-pipeline-spec.txt:158-165` — the reversed policy. Softening `Chinese boy, age 14, small-for-his-age` to `a slight young performer` removed the only counterweight to the model's adult prior for "Cantonese-opera wusheng performer" and produced an adult protagonist. L168–169: *"Never reword a character's age or build to clear a filter. Canon outranks convenience."*

Checks:
1. **CORE blocks are never strings in a database.** They are `(file, offset, length)` triples read at compile time. There is no stored copy to edit.
2. **Pinned hash per CORE block.** A change to `character-design-prompts.txt` that alters a CORE fails CI until the hash constant is updated in the same commit — making canon edits deliberate and reviewable.
3. **Required-substring assertion per character.** For `char:2-shengtian`, the buffer must contain the literal `Chinese boy, age 14, small-for-his-age`. Compile fails if absent. Derive the required substring from the CORE's `age_build_clause` field, one per character.
4. **Softening denylist** scanned across the whole buffer: `young performer`, `slight young`, `youthful`, `petite`, `role-based descriptor`, `neutral descriptor`, `age-neutral`, `adult`, plus any phrase list the author adds. Hit = refuse.
5. **No reword branch exists in code.** The refusal handler is a two-armed match: `route_identical(nano_banana_pro)` or `escalate_to_support()`. There is no third arm, so there is nothing for a future assistant to "helpfully" take.
6. **Retry byte-identity assertion**: `sha256(retry_buffer) == sha256(original_buffer)` before the `nano_banana_pro` submit.

### (b) One character's portrait as another character's style reference

Origin: `production-pipeline-spec.txt:109-116` — binding Xiaotian's bust (job `449f9ae5`) as a style anchor for Shengtian bled the middle-aged face into the boy. *"An image reference may ONLY be attached when it is that same character's own approved anchor. Style consistency comes from the frozen STYLE LOCK text, never from a portrait of someone else."*

Checks:
1. **No style-reference parameter in the API surface.** The only attachment constructor is `attach_own_anchor(entity_id)`, which reads `entity.anchor.element_id` from that entity's own record. An arbitrary-image-plus-purpose call is not expressible.
2. **Ownership assertion** on every attachment: `attachment.owner_entity_id ∈ cast ∪ {set_ref} ∪ props`.
3. **Element allowlist:** `element_id ∈ registry[owner_entity_id].element_ids`. An element id registered to any other entity is rejected even if it is passed with the correct owner label.
4. **Zero-orphan rule:** `count(attachments where owner ∉ panel entities) == 0`.
5. **Job denylist:** `449f9ae5` and any job id recorded with `status=invalidated` can never be resolved into an attachment.
6. **Blur never routes to an image.** L121–122: the crisp-edge fix is text-only. The compiler's blur remedy is the DIRECTION string plus the NEGATIVE string — there is no code path from "output looks soft" to "attach a reference".

### (c) Generating a scene panel from text alone

Origin: `production-pipeline-spec.txt:133-136` — *"character anchor sheets first → author approval → register as reference Elements → set/prop anchors → only then scene panels, always with anchors attached. Scene panels are never generated from text alone."*

Checks:
1. **Stage state machine, enforced per record kind.** `kind=turnaround` may be submitted with zero attachments. `kind=panel` requires `attachments.length >= 1` and every cast/set anchor `approved == true`. The text-only submission path does not exist for `kind=panel`.
2. **Serial character-sheet gate** (L128–129): refuse to enqueue turnaround N+1 while turnaround N has no `approved=yes` row. No batching of the 8 anchors.
3. **Set/prop anchor gate**: refuse any panel whose `set_ref` has no approved anchor row.
4. **Pilot gate** (L30–33): refuse `kind=panel` outside pages 1–3, 33, 39 until each of those three categories has an approved row. Batch production stays locked until the pipeline "counts as proven".
5. **Archive lockout** (L130–131): rows from the 2026-07-29 Style A run are flagged `archive_only` and can never be selected as an anchor — they are style-test archives, not production anchors.
6. **Session bootstrap** (L83–86): pull the platform's workflow instructions at session start before any generation; refuse to compile if that step has not run this session.

### (d) Losing a seed or a generation record

Origin: L151–153 (*"Log the reported seed in manifest.csv for every attempt, including refused ones"*) and L173–174 (*"Log every refusal … with seed and job id"*). Today 5 rows have empty seeds and 3 have empty `image_link`.

Checks:
1. **Write-ahead logging.** The manifest row is appended with `status=pending`, `kind`, `model`, `aspect`, `element_ids`, `prompt_sha256`, `repo_commit` **before** the MCP call returns — before it is even issued. Process death leaves a recoverable row, never a silent generation.
2. **The MCP call site is a single function that requires a row handle as its first argument.** There is no way to call Higgsfield without having written a row.
3. **Close-out:** on return, read the seed from job params (never sent, only read), patch `seed`, `job_id`, `image_link`, `status`, commit. A `pending` row older than a threshold triggers reconciliation against `job_display` / `show_generations` by `job_id`.
4. **Empty-seed rule:** an empty `seed` is accepted only when `model == nano_banana_pro`; otherwise the row cannot be closed as `completed`.
5. **Refusals are records.** `status=refused-filter` rows are mandatory, with seed and job id — the same close-out path, not an error branch that returns early.
6. **Durability of the image.** CloudFront URLs on `d8j0ntlcm91z4.cloudfront.net` are ephemeral and `.gitignore` keeps binaries out of the repo. A `completed` row with a CDN link but no `drive_filename` is flagged at-risk and surfaced in the review view until the file is filed as `ep0_p{page}_g{panel}_v{version}`.
7. **CSV integrity on write:** reject any field containing `,`, `"`, `\n`, or `\r`; assert uniform field count across all lines after write; assert trailing newline. The file's quote-free invariant is a feature — enforce it rather than adding quoting.
8. **Reproducibility:** because `compile()` is pure, `repo_commit + panel_id + overrides_sha` reconstructs the exact bytes sent. `prompt_sha256` verifies the reconstruction. That is a stronger record than storing the prompt text, and it needs no new file.

---

## 4. SALVAGE VERDICT — `/home/user/vixio-studio`

| part | path | verdict | reason |
|---|---|---|---|
| TypeScript config | `tsconfig.app.json` | **keep** | strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`; the reason 27k lines typecheck clean |
| ESLint flat config | `eslint.config.js` | **keep, extend** | carries over unchanged, but add the custom rules that make the charter mechanical instead of honor-system |
| Vite config | `vite.config.ts` (alias, base, port) | **keep** | minus the dev-only `proofSaver` plugin at L12–45 |
| proofSaver plugin | `vite.config.ts:12-45` | **drop** | media-capture scaffolding |
| CI workflow | `.github/workflows/ci.yml` | **keep** | lint → typecheck → build → e2e is exactly right; add parser and hash-pin checks |
| Pages deploy | `.github/workflows/deploy.yml` | **keep** | static SPA deploy with SPA fallback; fits a generated review site |
| GHCR image | `.github/workflows/image.yml`, `Dockerfile`, `deploy/nginx.conf` | **adapt** | only if the review site needs a server; static Pages is likely enough |
| Playwright config | `playwright.config.ts` | **adapt** | keep; drop `workers: 2` (hardcoded for CPU-bound previz specs that no longer exist) |
| e2e store-seeding technique | `e2e/helpers.ts:9-16` | **adapt** | seeding via `page.evaluate(import("/src/stores/…"))` transfers to any zustand rebuild; `DOWNLOADS_DIR` at :19–20 is a hardcoded session path and must go |
| e2e specs | 7 of 8 in `e2e/` | **drop** | film/comic/previz/motion/audio/conversion/provider-key journeys, all dead |
| smoke spec | `e2e/smoke.spec.ts` | **keep** | 7 lines, survives literally |
| `Button`, `Field`/`TextInput`/`TextArea`/`Select`, `Segmented`, `states.tsx` | `src/components/ui/` | **keep** | correct primitives; `TextArea` needs an autosize variant for prose |
| `Dialog` | `src/components/ui/Dialog.tsx` | **adapt** | good portal/escape/focus-restore, but no focus trap — tab escapes the modal |
| `MediaFrame` | `src/components/ui/MediaFrame.tsx` | **adapt** | 36 lines, the right bezel if Higgsfield output is embedded in a panel review view |
| design tokens | `src/index.css` | **adapt** | structure (one accent, surface ladder, hairlines, mono numerals) is excellent; values are a dark media cockpit — `color-scheme: dark` is hardcoded at :43 and there is no reading measure |
| app shell grid | `src/components/layout/WorkspaceShell.tsx` | **adapt** | keep the grid + single scrolling `<main>` + inline "project does not exist"; replace the 64px icon rail and the compile-time `FILM_NAV_ITEMS`/`COMIC_NAV_ITEMS` arrays with a data-driven document tree |
| film/comic mode switch | `WorkspaceShell.tsx:60-63,100-110` | **drop** | dead concept |
| `TaskDrawer` | `src/components/layout/TaskDrawer.tsx` | **drop** | render queue; the progress-row pattern is reusable but the store under it is not |
| `AccountChip` | `src/components/layout/AccountChip.tsx` | **drop** | dies with the cloud layer |
| routing | `src/App.tsx` | **adapt** | 10 enumerated stage routes → `/panel/:panelId`, `/canon/:docId`, `/char/:charId` plus a 404 route |
| `useActiveProject` | `src/features/shared/useActiveProject.ts` | **keep** | 17-line param-to-entity hook, the right pattern |
| store selectors | `src/stores/projects.ts:~690-775` | **keep as pattern** | pure, sorted, Record-in/array-out derivation transfers to any backing store |
| persisted project graph | `src/stores/projects.ts:672` | **drop** | no `partialize`; every keystroke rewrites one blob containing every project — the exact opposite of what git diffing needs |
| settings store | `src/stores/settings.ts:128` | **drop** | plaintext provider API keys; Higgsfield MCP owns credentials now |
| session store | `src/stores/session.ts` | **drop** | Drive session |
| tasks store | `src/stores/tasks.ts` (573) | **drop** | in-browser serial generation queue; rewrite small if job visibility is wanted |
| assets store / IndexedDB | `src/stores/assets.ts` (239) | **drop** | blobs move to Drive + CDN; keep only if offline caching is required |
| previz blockouts key | `src/lib/previz/blockout.ts:212` | **drop** | raw localStorage key, dies with previz |
| cloud/Drive sync | `src/cloud/` (1429) | **drop** | last-write-wins whole-manifest push; git needs three-way merge, a concept absent from the codebase |
| providers | `src/providers/` (4540) | **drop** | all generation moves to Higgsfield MCP — the single biggest deletion |
| model registry, key verify | `src/domain/modelRegistry.ts` (251), `src/features/settings/verify.ts` (90) | **drop** | dies with providers |
| previz / three.js | `src/lib/previz/` + `src/features/previz/` (3073) | **drop** | removes `three`, `@types/three` |
| comic engine | `src/features/panellab/`, `src/lib/comic/`, `src/features/pages/`, `src/features/comicexport/` (3718) | **drop** | removes `jszip` |
| timeline / render | `src/features/timeline/`, `src/lib/render/`, `src/lib/media/` (3258) | **drop** | removes `mediabunny` |
| film↔comic conversion | `src/lib/convert/` + 2 panels (1232) | **drop** | concept does not exist here |
| frame lab | `src/features/framelab/` (1084) | **adapt one idea** | the composed-prompt + seed-lock + take-history console in `PromptConsole.tsx` is the right shape for a read-only prompt preview; the code is not |
| motion, storyboard | `src/features/motion/` (862), `src/features/storyboard/` (1044) | **drop** | film-production metadata with no analogue |
| cast feature | `src/features/cast/` (703) | **adapt** | `Character` (name/role/bio/appearance/wardrobe) is close to a design entry and the grid is the closest thing to an index; drop portrait/seed/voice wiring |
| script feature | `src/features/script/` (1004) | **adapt** | the only writing-shaped feature; keep the two-column `340px｜1fr` layout with the explicit `lg:` collapse and especially the draft-flush machinery in `SceneCard.tsx:70-90` |
| draft-flush fix | `SceneCard.tsx:70-90` | **keep verbatim** | `flushStateRef` on unmount + `beforeunload` because React unmounts a focused textarea without firing blur — a universal controlled-textarea bug, the most valuable 20 lines in the repo |
| `useGenerateScript` | `src/features/script/useGenerateScript.ts` | **drop** | LLM script generation is not this app's job |
| domain constants | `src/domain/constants.ts` (560) | **drop as logic** | camera/lens/lighting/comic vocabulary for a generator you no longer own; a slice may survive as canon reference content |
| `composeFramePrompt` etc. | `src/domain/prompt.ts` (169) | **drop, replace** | replaced wholesale by the five-block compiler in §3 |
| `copy.ts` per feature | all 13 feature dirs | **keep** | good convention, already universally followed |
| `motion` npm dep | `package.json` | **drop** | zero imports anywhere in `src/` |
| BUILD-CHARTER TypeScript rules | `docs/BUILD-CHARTER.md:18-29` | **keep, one amendment** | branded ids must become deterministic/path-derived under a git store |
| BUILD-CHARTER state discipline | `:80-88` | **keep** | loading/empty/error/success on every data surface |
| BUILD-CHARTER copy rules | `:92-101` | **keep and enforce** | matters more in a writing platform; L90 claims mechanical checking that does not exist — add the lint rules |
| BUILD-CHARTER motion rules | `:105-109` | **keep** | reduced-motion clause already implemented at `index.css:77-84` |
| BUILD-CHARTER "state and data" | `:65-78` | **rewrite** | every clause names a doomed module; carry over one principle: never call the MCP from a component, go through one seam |
| BUILD-CHARTER density rule | `:115-116` | **rewrite** | `VISUAL_DENSITY 7`, 13px control text is wrong for long-form reading; chrome can stay dense, the document body cannot |
| `docs/proof/`, `scripts/live-smoke.mjs`, `deploy/` PocketBase stack | — | **drop** | generation evidence and a sync tier that was never built |

Portable code total: roughly **850 of 27,486 lines** in `src/`, about 3 percent, plus the config files and CI.

---

## 5. THE THINNEST BUILD

**The measurable path today:** find the panel in a 451-line CJK text file → decide cast and set → assemble five blocks by hand without mistyping a verbatim byte → attach the right elements → call the MCP → read back the seed → append a CSV row → route on refusal → get the author's yes.

Steps 3, 4, 6 and 7 are pure mechanism, and **every documented failure lives in exactly those steps**. Steps 1, 2 and 8 need a human. So the minimum software is: **a parser, a pure compiler, the guardrail assertions, a manifest writer, and a review surface**. It needs no editing, no auth, no sync, no multi-user, no wiki tree — the author already edits `.txt` in his own editor, and git already versions it.

### Ranking

| | shape | git as SoT | verbatim safety | works in ephemeral container | enforces guardrails | build cost | shortens the path |
|---|---|---|---|---|---|---|---|
| **1** | **CLI/library + static generated review site** (parser + `compile()` + guardrails as a Node package the assistant invokes; CI builds a static HTML index of pages/panels/characters/manifest via the existing `deploy.yml`) | perfect — reads the repo, writes only `manifest.csv` | highest — byte slices, no round-trip through a store | yes, it *is* the container's toolchain | yes, in the same process that calls the MCP | lowest — maybe 1,500 lines plus the static renderer | **yes**: eliminates all four failure modes and the CSV bookkeeping |
| **2** | **Editable web app** (rebuild of `vixio-studio` with a git-backed store) | poor — reintroduces the id↔path mismatch, whole-state serialization, and last-write-wins that already sank `src/cloud/sync.ts` | medium — every edit round-trips verbatim bytes through a UI | no — a browser app cannot be the thing the assistant runs headlessly | only if the app is the sole generation path, which it will not be | highest — a second editing surface competing with the author's editor | marginally, and it adds a drift source |
| **3** | **Obsidian vault + tooling** | good for reading and linking | poor — Obsidian normalizes, and the content is U+3000-indented Traditional Chinese with fullwidth punctuation that markdown tooling will mangle | **no** — cannot run in the ephemeral container, so the assistant gains nothing | no | low | for the author's browsing only; zero effect on the generation path |

### Recommendation

**Shape 1: a CLI/library plus a CI-generated static review site.** Concretely:

- `panelc parse` — the tokenizer of §2.1, asserting 150 panels, 45 page blocks, 37/37 panel-count matches. Runs in CI on every commit to the content repo.
- `panelc compile <panel-id>` — the pure five-block compiler of §3, printing the buffer, the attachment list, the aspect, and `prompt_sha256`.
- `panelc generate <panel-id>` — write-ahead manifest row, MCP call, close-out, refusal routing. The only code path that talks to Higgsfield.
- `panelc check` — all of §3b as a CI job: pinned CORE hashes, required substrings, softening denylist, franchise denylist, CSV integrity, orphan pending rows, `completed` rows lacking a Drive filename.
- A static site generated from the same parser, deployed through the existing `.github/workflows/deploy.yml`, giving the author a panel-by-panel reading view with `畫`/`白`/`註` beside the generated image and the manifest state. Read-only by design.

The static site cannot write; the CLI is the write path. That split is the point — it means the reviewer surface can never become a second source of truth.

**Main risk:** the per-panel data that exists in no file today — `cast`, `set_ref`, the `shot_en` English translation, and the `大格` aspect choice — has to live somewhere, and `CLAUDE.md` forbids creating files casually. Whatever file it lands in becomes the one place that can silently drift out of sync with the script. Mitigation: generate it from the parser rather than hand-authoring it, key every row to `panel_id`, and carry `hua_sha256` in each row so that any edit to a `畫` field mechanically invalidates its translation and forces re-approval before the compiler will emit a SHOT block. Ask the author once, for one file, with that design already in hand.