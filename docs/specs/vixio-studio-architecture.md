# VIXIO STUDIO — writing-first platform architecture

Status: proposed v1 · 2026-07-30 · companion to `hth-content-model.md` (entities, parsing, compiler invariants)

## 1. What this is

A professional canon / script / wiki platform for narrative projects (Howl To Heaven first), self-hosted on the author's VPS, private, single user. The workflow the product serves, in the author's words:

> Documents first with AI chat agent for document manipulation and co-write with me → with the documents (prompt, character/scenes etc) generate visual assets with higgsfield mcp → proceed to our prior infrastructure.

Three stages, strictly ordered. No "generate a script from one line" anywhere — the author writes; the platform edits, curates, compiles, and only then produces media.

## 2. Ground rules (inherited, non-negotiable)

From the HTH handoff and the content-model spec:

- **Git is the single source of truth.** Each project is a git repository (`vixio-dt/howl-to-heaven` is project one). The app is a client of the repo, never a parallel store. Claude Code sessions and the app converge on the same git history.
- **Verbatim transport.** Verbatim-critical fields (CORE blocks, dialogue, style lock) move as byte slices `(file, offset, length)` pinned by SHA-256 — never as re-encoded strings. No Unicode normalization, no dash/quote substitution, no re-wrapping. The editor must round-trip U+3000 indentation and fullwidth punctuation byte-for-byte.
- **The author decides plot, characters, dialogue.** The agent proposes; proposals are labeled as proposals; nothing enters canon without explicit approval. Honest pushback over agreement.
- **No new files without asking.** Content-repo edits update existing files and bump the version header.
- **Never-ship sections** (private drawers like 作者物理, world-rules 第十章) are excluded from prompts and rendered pages structurally, not by convention.
- **Compiler invariants I1–I13 and guardrail families a–d** (see `hth-content-model.md` §3): required-substring assertions against canon softening, `attach_own_anchor(entity_id)` as the only reference-image constructor, the stage state machine (anchors → author approval → Elements → sets → panels; text-only panels blocked), write-ahead manifest logging before any generation call.

## 3. System shape

```
┌─ VPS (single host, private) ─────────────────────────────────┐
│                                                              │
│  frontend (React SPA)          backend (Node)                │
│  ├ editor: CodeMirror 6,       ├ project store: bare git     │
│  │  byte-exact, CJK-safe       │  repos + worktrees          │
│  ├ wiki: parsed canon/script   ├ parser: content-model       │
│  │  views (read), per-entity   │  entities from bytes        │
│  ├ chat: co-writer w/ diff     ├ agent runtime: OpenAI-      │
│  │  approval UI                │  compatible client          │
│  └ production: compile,        │  (Poe API default, Kimi     │
│     manifest, job status       │  alternate; BYO url+key)    │
│                                ├ compiler: five-block +      │
│                                │  invariants + guardrails    │
│                                └ higgsfield: MCP client →    │
│                                   mcp.higgsfield.ai (OAuth,  │
│                                   token stored server-side)  │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Backend

- **Runtime**: Node + TypeScript (strict config salvaged from the current repo), Fastify or Hono, single process, SQLite for app state that is *not* content (job queue, chat threads, OAuth tokens, approvals log). All content lives in git.
- **Project store**: each project = a git repo cloned on the VPS with a remote (GitHub). Reads are byte-oriented; writes go through a single `commitEdit` path that (1) applies the change, (2) re-parses affected entities, (3) runs the verbatim-integrity checks, (4) commits with a descriptive message, (5) pushes. Deterministic path-derived IDs (`canon:{slug}`, `script:ep0:p{page}:g{panel}` …), never random.
- **Parser service**: implements `hth-content-model.md` §2 exactly — page-header regex, panel fields 畫/白/音/註, CORE/NEGATIVE/VARIANT block markers, section splitting on 23×U+2501, the documented hazards (no-blank-line block merges, `PAPER LOTUS LANTERN:` vs `CORE BLOCK:` ambiguity, unsorted 待決 ordinals preserved in file order).

### 3.2 Agent runtime (the co-writer)

- **Protocol**: OpenAI-compatible chat completions with tool calling. Default provider **Poe API** (`https://api.poe.com/v1`) — the author's Poe subscription exposes Claude, GPT, Gemini and more through one key, with tool calling supported on the major models. Alternate provider **Kimi/Moonshot** (author has a Kimi plan; K2 tool calling is native). Provider is a per-project setting: base URL + key + model name; no Anthropic API key required anywhere.
- **Tools exposed to the model**: `read_doc(id, range?)`, `search(project, query)`, `list_entities(kind)`, `propose_edit(doc, diff, rationale)`, `propose_new_file(path, purpose)` (which *asks*, never writes). No direct write tool exists — `propose_edit` creates a pending diff the author reviews in the UI; approval triggers `commitEdit`.
- **Doctrine in the system prompt**: division of labor (author: plot/characters/dialogue; agent: paneling, layout, continuity, file maintenance), proposal labeling (〔提案〕 conventions), Cantonese written-form normalization only (甘→咁, 距→佢, D→啲, 左→咗 … never word-choice changes), version-header bumping, honest pushback.
- **Chat threads** are persisted per document/entity so a conversation about page 12 stays anchored to page 12.

### 3.3 Production pipeline (stage 2)

- **Compiler**: pure function from `(entity ids, shot spec)` → five-block prompt (STYLE LOCK → CONTINUITY → DIRECTION → SHOT → NEGATIVE), assembled from byte slices, asserting invariants I1–I13 before returning. A prompt that fails an assertion is unbuildable, not warn-and-continue.
- **Higgsfield client**: backend MCP client speaking to `mcp.higgsfield.ai` (remote MCP, OAuth; one interactive authorization stores the token server-side). Default model `seedream_v5_pro` @ 2k, `nano_banana_pro` fallback on filter refusals — fallback switches *model*, never softens *text* (guardrail a). Reference images only via `attach_own_anchor` (guardrail b). Jobs recorded in the write-ahead manifest (guardrail d) before dispatch; statuses polled and reconciled into `03_output/manifest.csv` in the content repo.
- **Stage state machine** (guardrail c): per-character `anchor-pending → anchor-approved → element-registered`; per-set similarly; panel generation refuses until its dependencies are green. First production milestone: the nine character anchors (Higgsfield account currently has 0 Elements, 0 characters).

### 3.4 Frontend

- **Editor**: CodeMirror 6 in byte-faithful mode — file loaded as-is, no normalization on load or save, save path verifies unchanged regions byte-identical (draft-flush pattern from the salvaged `SceneCard.tsx` generalized). Visible-whitespace rendering for U+3000.
- **Wiki**: parsed read views — character sheets (Chinese story-bible records linked to English design blocks by explicit mapping table, never name matching), page/panel browser for the script, canon sections, open-questions list in file order. Private/never-ship sections render only behind an explicit "author's drawer" toggle and are excluded from search indexes shipped to any model context.
- **Production console**: per-entity anchor status, compile preview (the exact prompt bytes that will ship), manifest view, job status.
- **Salvage**: UI kit (Button/Field/inputs/Dialog+focus trap), design tokens (extend for long-form reading measure + light mode), WorkspaceShell grid, `useActiveProject`. The old providers/previz/comic/timeline code does not carry over into stages 1–2.

### 3.5 Claude Code remains first-class

Because the repo is the interface, the author's existing Claude subscription keeps working exactly as today: Claude Code sessions clone/edit/push the same repos, run bulk maintenance, or drive Higgsfield via its session MCP when preferred. The app never assumes it is the only writer; every read re-parses from git HEAD.

## 4. Deployment

Single `docker compose` on the VPS: `app` (backend serving the built SPA), `caddy` (TLS + basic auth or Tailscale-only binding). Secrets (`POE_API_KEY`, `KIMI_API_KEY`, Higgsfield OAuth token, GitHub deploy key) live in an env file on the VPS, never in git. Backups are just git remotes — the content is already on GitHub; SQLite state is disposable except the approvals log, which is also mirrored into commit messages.

## 5. Milestones

- **M1 — read**: project registry, parser, wiki views over howl-to-heaven, byte-exact round-trip proven by golden-file tests (parse → serialize → byte-compare over every file in the repo).
- **M2 — write**: editor + `commitEdit` path + version-header tooling; co-writer chat with `propose_edit` approval flow on Poe/Kimi.
- **M3 — compile**: five-block compiler with invariant tests (including the four historical failure cases as regression fixtures); compile preview UI.
- **M4 — generate**: Higgsfield OAuth + anchor workflow + manifest reconciliation; nine character anchors produced and approved.

Each milestone ships behind the previous one; stage-3 integration is scoped only after M4 holds.
