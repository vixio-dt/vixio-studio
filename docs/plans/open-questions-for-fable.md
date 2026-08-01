# Open questions — parked for author / Fable-level judgment

Questions that need a ruling rather than an implementation. Each records what
the code does *today* (so nothing is blocked) and what the decision would
change. Raised during the Opus continuation of Fable's build plan.

---

## Q1. Does `死神` belong on the franchise denylist unqualified?

**Where:** `packages/compiler/src/compile.ts` FRANCHISE_DENYLIST.

**Today:** matches only adjacent to "Bleach" (`死神\s*bleach|bleach\s*死神`).

**Tension:** spec §3.5 I4 lists `死神` unqualified, but it is an ordinary
Chinese word ("death god") that plausibly appears in legitimate canon prose
for a supernatural project. An unqualified match would refuse compiles of
genuine story content; the narrow match risks letting a franchise reference
through when written alone.

**Decision needed from the author:** is `死神` ever legitimate vocabulary in
*this* project's prompts? If no → tighten to unqualified and update the spec.
If yes → keep narrow and record the ruling in the spec so it stops reading as
a deviation. Reviewer flagged this as a documented deviation either way.

---

## Q2. Which invariants belong at the server seam vs. the agent hook?

**Where:** plan ledger "Invariant ownership", `docs/plans/writing-platform-build-plan.md`.

**Today:** compiler owns I1–I4, I9, I12-residue and the stage gates. Parked as
Stage-2 server seams: I5/I6 (attachment ownership + approval), I11 (TRUE FORM
replace-path for ep0_p39_g1), I13 (shot_approved + hua_sha256 freshness).
Parked as PreToolUse hooks: I7 (no seed), I8 (write-ahead manifest), I10
(retry byte-identity).

**Tension:** the split is defensible (resolution-phase data lives server-side;
outbound-call facts live at the agent boundary) but it means *no single place*
enforces the full I1–I13 set. A future caller that bypasses the server and
calls the compiler directly gets only the compiler's subset.

**Decision needed:** either (a) accept the split and add a single
`assertReadyToGenerate()` gate the server MUST call before any Higgsfield
invocation, or (b) push resolution-phase invariants into the compiler by
giving `CompileInput` a panel identity. (a) is cheaper and matches the
architecture doc; (b) is more airtight. Recommend (a) — noting it here rather
than deciding unilaterally.

---

## Q3. Never-ship headings are visible in default views — intentional?

**Where:** `packages/server/src/views.ts` `redactNeverShip`.

**Today:** the body of a `neverShip` section is structurally replaced with
`{redacted: true}`; its `headingRaw`/`title` still ship, so the UI can render
a sealed placeholder naming what is sealed (e.g. 第十章's heading, which
itself contains 私人燃料，永不入作品).

**Decision needed:** confirm heading exposure is acceptable. If the heading
text itself is private, the placeholder must switch to a generic label and
the view must drop the heading too.

---

## Q4. Two surfaces sit outside the redaction gate

**Where:** `GET /api/projects/:id/doc` (raw bytes, no drawer param — the
editor's own load path) and 422 error details (mirror parser messages, which
can embed header-line text).

**Today:** both are author-only surfaces, so nothing crosses a trust boundary.

**Decision needed before Stage 2 wiring:** architecture §3.4 says never-ship
content is "excluded from search indexes shipped to any model context". The
moment the co-writer agent can read documents, `/doc` becomes a model-context
surface. Options: gate `/doc` behind the same drawer param, or give the agent
a distinct redaction-enforcing read path. Must be settled before the agent
gets file-read tools.

---

## Q5. Multi-process write locking

**Where:** `packages/server/src/store.ts` `commitEdit`.

**Today:** an in-process promise-chain mutex serializes writes per project id.
Documented in code.

**Decision needed at deploy time:** if the VPS ever runs more than one app
process (or a Claude Code session edits the same checkout concurrently with
the app), the mutex does not span them and the TOCTOU race returns. Options: a
repo-level lockfile (`.git/vixio.lock`), or accept single-process deployment
as a documented constraint. Not urgent — single-user, single-process today.
