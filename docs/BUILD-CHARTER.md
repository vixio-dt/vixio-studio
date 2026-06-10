# Vixio Studio build charter

Binding rules for every file in this repo. Derived from the Vixio house design
system, Matt Pocock's TypeScript taste, and the taste-skill design doctrine.

## Product in one paragraph

Vixio Studio is a local-first AI filmmaking workspace. A project moves through:
script development (logline to scenes), cast (characters with portraits),
storyboard (scenes broken into shots), frame lab (artcraft-style image control
per shot), motion (image-to-video per shot), and the cut (timeline + export).
Generation runs through a provider registry: an offline preview renderer that
always works, and Gemini (text, image, Veo video) when a key is configured.
The media is the hero; chrome recedes.

## TypeScript rules

- Strict mode with `noUncheckedIndexedAccess`; never `as any`; fix types at the source.
- Discriminated unions for state, never boolean flags. Switch on the
  discriminant; let TypeScript prove exhaustiveness.
- No enums. String-literal unions for closed sets; `as const` arrays when
  runtime values are needed.
- Branded ids from `@/lib/id` (`ProjectId`, `SceneId`, `ShotId`, `CharacterId`,
  `AssetId`, `TaskId`). Never pass raw strings as ids.
- Async seams return `Result<T>` from `@/lib/result`; throwing is for
  programmer errors only. UI maps error variants to inline states.
- Named exports only. Small modules that hide complexity behind small
  interfaces.
- Imports use the `@/` alias. Two-space indent, double quotes (match existing files).

## Design tokens (Tailwind v4 classes, defined in src/index.css)

- Surfaces: `bg-ink-canvas` (page), `bg-ink-panel` (panels), `bg-ink-raised`
  (raised/hover blocks), `bg-ink-hover` (hover). Never pure black/white.
- Text: `text-fg`, `text-fg-secondary`, `text-fg-muted`.
- Accent (ONE accent, two values): `text-accent` / `border-accent` for
  interactive emphasis, `bg-accent-media` / `ring-accent-media` for live
  states, selection, progress, and the primary button. Nothing else is cyan.
  No purple, no gradients in chrome, no glows outside media frames.
- Danger: `text-danger`, `border-danger`.
- Hairlines: `border-line`, `border-line-strong`. Panels separate with
  hairlines and spacing, not shadows or card boxes.
- Fonts: `font-display` (Space Grotesk 700, `tracking-[-0.02em]`) for panel
  and view titles; default body is Manrope; `font-mono` for ALL numbers:
  timecodes, durations, seeds, dimensions, counts.
- Radius 0 everywhere. No `rounded-*` anywhere (the lone exception:
  `rounded-full` on tiny live-status dots).
- Z-index scale: base 0, sticky chrome 10, dropdowns 20, modals 30, toasts 40.

## UI kit (import from `@/components/ui`)

- `Button` ({ variant: "primary" | "ghost" | "outline" | "danger", size:
  "sm" | "md", busy }) — primary is the cyan filled action; ONE primary per
  view tier. Same verb for the same intent app-wide (Generate, Save, Delete,
  Export).
- `Field` (label above, helper, error; render-prop gives `inputId` and
  `describedBy`), `TextInput`, `TextArea`, `Select`.
- `Segmented` for closed sets. `Dialog` for modals. `Badge`, `EmptyState`
  (icon + title + populate hint + optional action), `Skeleton` (shape-matched,
  never a spinner), `MediaFrame` (the ONE bezel: media sits in it, `live` prop
  shows the cyan generating edge), `BusyDots`.

## State and data (import from `@/stores/*`, `@/domain/*`, `@/providers/*`)

- `useProjectsStore` — projects/scenes/shots/characters CRUD + selectors
  (`selectScenesForProject`, `selectShotsForScene`, `selectShotsForProject`,
  `selectCharactersForProject`).
- `useAssetsStore` + `useAsset(id)` — generated media (IndexedDB-backed).
- `useTasksStore` — `enqueueImage` / `enqueueVideo`; the queue runs serially
  and attaches results to targets itself. Never call providers directly from
  features; always enqueue.
- `useSettingsStore` — provider choices and the Gemini key.
- Prompt composition: `composeFramePrompt`, `composePortraitPrompt`,
  `composeVideoPrompt` from `@/domain/prompt`. The composed prompt is always
  visible and editable before generation (artcraft doctrine: control over
  prompting).
- Vocabulary constants from `@/domain/constants` (shot sizes, angles,
  movements, lenses, lighting, styles, motion presets, aspect helpers).

## Interactive state discipline (the number-one LLM omission)

Every data surface ships all four states:
- Loading: `Skeleton` matching the final shape at true aspect ratio.
- Empty: `EmptyState` that says how to populate it.
- Error: inline, next to the thing that failed, with a retry affordance.
- Success: the content, untinted, at true aspect ratio.
Generating media shows the `MediaFrame` `live` edge plus a shape-matched
skeleton, never a centered spinner.

## Copy rules (mechanically checked before ship)

- Sentence case everywhere. ZERO uppercase-tracked eyebrow labels.
- ZERO em dashes and en dashes in any visible string. Use commas, periods, or
  parentheses.
- Functional verbs; one label per intent app-wide. Banned vocabulary:
  innovate, disrupt, transform, cutting-edge, elevate, seamless, unleash,
  next-gen, revolutionize.
- Each feature keeps its visible strings in a `copy.ts` module next to the
  page; components do not define prose inline.
- No emojis. Icons come from `@phosphor-icons/react` only, default weight,
  sizes 14 to 28.

## Motion rules

- MOTION_INTENSITY 3: feedback only. Hover/active transitions
  (`transition-colors duration-150`, `active:scale-[0.98]`) and at most a
  pulse on genuine live state (generating indicator).
- No scroll listeners, no decorative loops, no entrance choreography.
- Anything animated respects `prefers-reduced-motion` (global CSS handles it).

## Layout rules

- Workspace pages render inside the shell's `<main>` (already sized; use
  `h-full` + internal `overflow-y-auto` panes, CSS Grid columns with `fr`
  units, hairline dividers).
- Dense cockpit (VISUAL_DENSITY 7): tight paddings (`p-3`/`p-4`), 13px/sm
  control text, mono numerals.
- Declare the below-1024px collapse explicitly in every multi-column layout.
