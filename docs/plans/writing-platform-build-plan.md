# BUILD PLAN — writing-first platform, orchestrated execution

Status: executing · 2026-08-01 · governs the subagent build of `docs/specs/vixio-studio-architecture.md`

## Status ledger (live)

- **Wave A** (canon/design/manifest parsers): ✅ landed, 111→114 content-model tests incl. canon oracles. **Gate verdict: PROCEED** — reviewer's astral-guard major fixed (surrogate-aware tokenizer boundary), manifest writer hardened (quote rejection, malformed-link runtime guard).
- **Wave B** (server skeleton): ✅ landed. **Gate verdict: PROCEED** — reviewer's two majors (commitEdit TOCTOU race, no-op 500) fixed with per-project write lock + `unchanged` status, re-verified by reviewer against original failing probes. 50 server tests.
- **Wave C1** (parsed-view endpoints, never-ship redaction): ✅ landed, 12 new tests, redaction asserted at response-text level. Reviewer gate: queued with C2/D1.
- **Wave C2** (library UI + editor) / **Wave D1** (compiler): 🔄 building.
- **Wave E live workflow**: ✅ **executed 2026-08-01** — style lock v3 extracted verbatim (sha-pinned) → five-block probe → seedream_v5_pro 2k 2:3 → completed 1664×2496, platform seed 577914 read back from job params → write-ahead manifest row (our codec) reconciled pending→completed, byte-exact round-trip. 3 credits. Scratch manifest only; no canon anchors involved.
- **M0 VPS spike**: runbook + canUseTool verification script shipped (`docs/runbooks/vps-bootstrap.md`, `scripts/m0-canusetool.mjs`); execution awaits the VPS.
Cadence: every wave = builders (parallel where files are disjoint) → **reviewer gate** (runs tests, hunts spec violations, verdict) → orchestrator fixes → commit → next wave. No wave proceeds over an unreviewed predecessor.

## Definition of Done

1. All four content parsers green against the canon oracle (`HTH_REPO_PATH` sweep): byte-exact round-trip on every parsed file, censuses pinned.
2. Server package with project registry, read API, and byte-exact `commitEdit` (git commit per approved edit), tested against a scratch clone — never mutating the real checkout in tests.
3. Wiki + editor UI over howl-to-heaven: doc list, script browser (pages/panels), canon sections (never-ship sections gated), design-block sheets, manifest table; CodeMirror editor saving through `commitEdit`; Playwright e2e green.
4. Five-block compiler emitting from parsed entities with invariants I1–I13 enforced fail-closed; guardrail (a) regression fixtures (softening attempts must refuse).
5. CI runs unit + e2e; branch green.
6. Real-workflow test via Higgsfield MCP (asset-generation dry run driven by compiled prompts) — **gated on the connector being reconnected**; if unavailable, executed the moment it returns.

## Waves

### Wave A — remaining parsers (3 parallel builders, disjoint files)
- **A1 `canon.ts`**: 00_canon docs. Sections by `━`×23 + `第N章`+U+3000 headings; `world-rules.txt` 第十章（私人燃料，永不入作品）→ `neverShip: true`; `open-questions.txt` has NO separators — bare category headings, items `一、…十七、`/`n之m、` with `（已定）`/`（已定・改）` state, file order preserved (七之四 precedes 七之二), indented continuations. Lossless tiling; oracle round-trip ×3 files.
- **A2 `design.ts`**: character-design-prompts v4. Region-scoped: numbered entry headings `^[1-8]\. NAME( (…))?$` only inside the character region, so `PAPER LOTUS LANTERN:` in props never reads as an entry. `CORE BLOCK:` payload on following lines; `NEGATIVE:` same line; wrapped VARIANT headers terminate at colon; STYLE BLOCK A/B parsed with `superseded: true` (must never compile). Oracle: 8 characters (all with CORE+NEGATIVE), ≥6 sets, ≥4 props, XIAOTIAN TRUE FORM present, round-trip byte-exact.
- **A3 `manifest.ts`**: strict CSV, header pinned to `page,panel,version,seed,status,image_link,prompt_summary`; reader tolerates the documented overloads (page ∈ int|TURN|STYLE-PROBE|KEY; version breakers; `job:` links); **writer rejects** commas/CR/LF in fields instead of quoting; `ep0_p{page}_g{panel}_v{version}` naming helper. Oracle: 42 rows, status census 28/11/2/1, round-trip byte-exact.
- **Gate A**: reviewer verifies verbatim safety (no trim/normalize on raw fields), tiling coverage, oracle strength, type cleanliness.

### Wave B — server package (`packages/server`)
Hono + Node, TS strict. Project registry (path-configured git checkouts). Read API: list docs, raw bytes, parsed views (script/canon/design/manifest), search. `POST /edit`: full-file byte replacement w/ SHA-256 precondition of the base version → write → re-parse → `git commit`. Never-ship sections stripped from all parsed responses unless `?drawer=author`. Tests against a temp clone fixture.
- **Gate B**: reviewer attacks the write path (precondition races, encoding, partial writes) + API shape.

### Wave C — wiki + editor UI (extend existing SPA, salvaged UI kit)
Routes under `/library`: project home, canon doc view (sections, drawer toggle), script browser (page grid → panel detail with 畫/白/音/註), design sheets, manifest table. Editor route: CodeMirror 6, byte-faithful (no format-on-save), save → `/edit` with base-hash precondition, conflict surfaced. Vite dev proxy to server.
- **Gate C**: reviewer + Playwright e2e (offline fixture repo).

### Wave D — compiler package (`packages/compiler`)
Five blocks, fixed order, joined `\n\n`: STYLE LOCK (pipeline-spec §8 lines, pinned hash) → CONTINUITY (verbatim CORE blocks of confirmed cast, set block, color rules) → DIRECTION → SHOT (the only variable) → NEGATIVE (per-character union). Invariants I1–I13 fail-closed; required-substring assertions per attached character; refuse on style-block-A/B source, on text-only panel (stage machine input), on missing manifest row (write-ahead check hook shape). Guardrail-(a) fixtures: a softened CORE must refuse, never reword.
- **Gate D**: reviewer runs adversarial fixtures.

### Wave E — integration + live workflow
CI: add unit tests job step. Full-stack run against a scratch clone of the real repo; e2e sweep. **Higgsfield live test** (once connector returns): compile one style-probe prompt → generate via MCP → job status → record in a scratch manifest — proving the compile→generate→record loop end to end. No canon anchors are approved in this test; it is a pipeline proof, not production art.

## Conventions binding every agent

- Branch `claude/cinematic-comic-engine-2wjfxq`; do not commit/push (orchestrator commits at gates).
- `packages/content-model` idiom: `.ts`-extension relative imports, strict TS (`npx tsc --noEmit` clean), vitest, synthetic hazard fixtures for CI + `describe.skipIf(!HTH_REPO_PATH)` oracle suites.
- Verbatim doctrine everywhere: raw fields are exact substrings; no trimming, no Unicode normalization, no re-wrapping; lossless line tiling asserted on every parsed file.
- Wave A builders must not touch shared files (`index.ts`, `package.json`, `tsconfig.json`, existing modules) — the orchestrator wires exports at the gate.
- The real checkout `/workspace/howl-to-heaven` is read-only for tests; write tests use temp clones.
