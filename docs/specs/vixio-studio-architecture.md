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
│  ├ chat: co-writer w/ diff     ├ agent runtime: Claude Agent │
│  │  approval UI                │  SDK → claude CLI (sub-     │
│  └ production: compile,        │  scription auth); Poe/Kimi  │
│     manifest, job status       │  OpenAI-compatible fallback │
│                                ├ compiler: five-block +      │
│                                │  invariants + guardrails    │
│                                └ higgsfield: reached by the  │
│                                   agent's own MCP client     │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Backend

- **Runtime**: Node + TypeScript (strict config salvaged from the current repo), Fastify or Hono, single process, SQLite for app state that is *not* content (job queue, chat threads, OAuth tokens, approvals log). All content lives in git.
- **Project store**: each project = a git repo cloned on the VPS with a remote (GitHub). Reads are byte-oriented; writes go through a single `commitEdit` path that (1) applies the change, (2) re-parses affected entities, (3) runs the verbatim-integrity checks, (4) commits with a descriptive message, (5) pushes. Deterministic path-derived IDs (`canon:{slug}`, `script:ep0:p{page}:g{panel}` …), never random.
- **Parser service**: implements `hth-content-model.md` §2 exactly — page-header regex, panel fields 畫/白/音/註, CORE/NEGATIVE/VARIANT block markers, section splitting on 23×U+2501, the documented hazards (no-blank-line block merges, `PAPER LOTUS LANTERN:` vs `CORE BLOCK:` ambiguity, unsorted 待決 ordinals preserved in file order).

### 3.2 Agent runtime (the co-writer) — Claude Code as the engine

The backend does not implement an agent loop. It **drives Claude Code itself** through the Agent SDK (`@anthropic-ai/claude-agent-sdk`, verified v0.3.220 against `claude` CLI v2.1.220), pointed at the project's git worktree. Claude Code is the co-writer; the app is its UI and its warden.

Why this beats a hand-rolled OpenAI-compatible client:

- **Authentication matches what the author owns.** `claude setup-token` mints a long-lived OAuth token for a Pro/Max subscription; the backend passes it as `CLAUDE_CODE_OAUTH_TOKEN`. No Anthropic API key, no per-token billing.
- **Higgsfield stops being a special case.** The agent has a real MCP client. Servers arrive either as claude.ai connectors (automatically available when Claude Code is logged into the author's account) or explicitly via `mcpServers: { higgsfield: { type: "http", url, headers } }` / `claude mcp add --transport http`, with OAuth completed once through `/mcp` and the credential persisted in the system keychain or credentials file. The earlier "MCP is session-bound to Claude, so generation can't live in the app" problem disappears — the app *is* a Claude session.
- **Approval is enforced by the harness, not by the model's cooperation.** The agent uses the real `Edit`/`Write` tools; every call lands in the backend's `canUseTool(request, { signal }) => { allow: true } | { allow: false, reason }` callback, which renders the proposed change as a diff in the UI and resolves only on the author's decision. Nothing is written by good behaviour — it is written because a human clicked approve. Run with `permissionMode: 'default'` and an `allowedTools` list covering read-only tools only.
- **The doctrine is already written and already loads.** The content repo's `CLAUDE.md` (division of labor, 〔提案〕 labeling, Cantonese written-form normalization only, ASCII filenames, version-header bumps, no new files without asking) is picked up automatically from `cwd`. One source of rules for the app agent and for terminal sessions. App-specific additions go through `systemPrompt: { type: 'preset', preset: 'claude_code', append: … }`. Do **not** pass `--bare`: it skips CLAUDE.md, MCP, hooks, and keychain reads — the opposite of what this needs.
- **Guardrails become deterministic.** `PreToolUse` hooks run before a tool executes: block writes touching never-ship sections, run the verbatim-integrity check on the affected byte ranges, refuse a generation call whose manifest row was not written first. A hook denial is code, not persuasion — which is exactly what guardrail families a–d demand.
- **Threads resume natively.** `sessionId` / `resume` (and `forkSession` to branch an exploration) give one durable conversation per document or entity; the app stores the session id next to the doc. Session lookup is scoped to the project directory, so each project's worktree is its own thread space.
- **Streaming for free** via the SDK's message stream (or `--output-format stream-json --include-partial-messages` at the CLI), including `parent_tool_use_id` so subagent work can be shown nested in the UI.

**Operational shape.** Process-per-session, supervised by the backend — there is no long-running Claude Code daemon with a stable local API today, so the app owns the lifecycle: spawn on first message, resume by id thereafter, SIGTERM to cancel (Claude Code aborts the turn, runs `SessionEnd` hooks, exits 143). Fine for a single-user host.

**Known costs, stated plainly.**

1. App usage draws on the same subscription quota as the author's interactive Claude Code work. Heavy automated passes can eat into the sessions they actually want.
2. `claude setup-token` needs a browser once and the token needs manual rotation; expiry is not documented, so the backend must surface `authentication_failed` from the `api_retry` event stream as a clear "re-auth needed" state rather than a silent stall.
3. Whether claude.ai connectors (the author's existing Higgsfield authorization) resolve in a token-authenticated headless run is the one thing to verify on the VPS first. Fallback if not: add Higgsfield as an explicit HTTP MCP server and authorize it once with `/mcp` on that host.

**Secondary provider, retained.** A thin OpenAI-compatible client (**Poe API** `https://api.poe.com/v1`, or **Kimi/Moonshot**) stays in the design for work that should not spend subscription quota: bulk mechanical passes (batch normalization checks, parse-diff summaries, embedding/search), parallel fan-out, and as a degraded mode if the OAuth token lapses mid-session. Per-project setting: base URL + key + model. It never gets write access — the `canUseTool` gate is Claude-Code-side, so any Poe/Kimi path is read-and-suggest only.

### 3.3 Production pipeline (stage 2)

- **Compiler**: pure function from `(entity ids, shot spec)` → five-block prompt (STYLE LOCK → CONTINUITY → DIRECTION → SHOT → NEGATIVE), assembled from byte slices, asserting invariants I1–I13 before returning. A prompt that fails an assertion is unbuildable, not warn-and-continue.
- **Higgsfield access**: through the agent's own MCP client (§3.2), not a separate backend integration. The compiler hands the agent an already-assembled, already-asserted prompt and the agent calls `generate_image` / `job_display`. Default model `seedream_v5_pro` @ 2k, `nano_banana_pro` fallback on filter refusals — the fallback switches *model*, never softens *text* (guardrail a), and a `PreToolUse` hook enforces that by comparing the outgoing prompt's verbatim spans against their pinned hashes and denying the call on any drift. Reference images only via `attach_own_anchor` (guardrail b). The same hook refuses a generation tool call whose manifest row was not written first (guardrail d). Statuses are polled and reconciled into `03_output/manifest.csv` in the content repo.
- **Stage state machine** (guardrail c): per-character `anchor-pending → anchor-approved → element-registered`; per-set similarly; panel generation refuses until its dependencies are green. First production milestone: the nine character anchors (Higgsfield account currently has 0 Elements, 0 characters).

### 3.4 Frontend

- **Editor**: CodeMirror 6 in byte-faithful mode — file loaded as-is, no normalization on load or save, save path verifies unchanged regions byte-identical (draft-flush pattern from the salvaged `SceneCard.tsx` generalized). Visible-whitespace rendering for U+3000.
- **Wiki**: parsed read views — character sheets (Chinese story-bible records linked to English design blocks by explicit mapping table, never name matching), page/panel browser for the script, canon sections, open-questions list in file order. Private/never-ship sections render only behind an explicit "author's drawer" toggle and are excluded from search indexes shipped to any model context.
- **Production console**: per-entity anchor status, compile preview (the exact prompt bytes that will ship), manifest view, job status.
- **Salvage**: UI kit (Button/Field/inputs/Dialog+focus trap), design tokens (extend for long-form reading measure + light mode), WorkspaceShell grid, `useActiveProject`. The old providers/previz/comic/timeline code does not carry over into stages 1–2.

### 3.5 Claude Code remains first-class

Because the repo is the interface, the author's existing Claude subscription keeps working exactly as today: Claude Code sessions clone/edit/push the same repos, run bulk maintenance, or drive Higgsfield via its session MCP when preferred. The app never assumes it is the only writer; every read re-parses from git HEAD.

## 4. Deployment

Single `docker compose` on the VPS: `app` (backend serving the built SPA, with the `claude` CLI installed in the image), `caddy` (TLS + basic auth or Tailscale-only binding). Secrets — `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, optional `POE_API_KEY` / `KIMI_API_KEY`, GitHub deploy key — live in an env file on the VPS, never in git. The MCP OAuth credential store (`~/.claude.json` plus the keychain/credentials file) must be on a mounted volume so a container rebuild doesn't force re-authorizing Higgsfield. Backups are just git remotes — the content is already on GitHub; SQLite state is disposable except the approvals log, which is also mirrored into commit messages.

## 5. Milestones

- **M0 — spike (half a day, before anything else)**: on the VPS, `claude setup-token` → headless `claude -p` run with `--output-format stream-json` → confirm (a) subscription auth works non-interactively, (b) Higgsfield tools are reachable in that run (connector inheritance, or explicit `claude mcp add` + one `/mcp` authorization), (c) a `canUseTool` callback intercepts an `Edit` and can deny it. If (b) fails both ways, the Higgsfield half of §3.3 falls back to Claude Code sessions and the rest of the design is unaffected.
- **M1 — read**: project registry, parser, wiki views over howl-to-heaven, byte-exact round-trip proven by golden-file tests (parse → serialize → byte-compare over every file in the repo).
- **M2 — write**: editor + `commitEdit` path + version-header tooling; co-writer chat driving Claude Code with the `canUseTool` diff-approval gate and `PreToolUse` guardrail hooks.
- **M3 — compile**: five-block compiler with invariant tests (including the four historical failure cases as regression fixtures); compile preview UI.
- **M4 — generate**: Higgsfield OAuth + anchor workflow + manifest reconciliation; nine character anchors produced and approved.

Each milestone ships behind the previous one; stage-3 integration is scoped only after M4 holds.
