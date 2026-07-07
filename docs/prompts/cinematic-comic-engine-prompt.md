# Build prompt: Vixio cinematic engine + AI comic engine

This is the working prompt for the `claude/cinematic-comic-engine-*` effort. Feed it
to the build agent verbatim. It was researched and written 2026-07-07 against
commit `ade3602` (main). Quality bar: best available model per job, budget is not
a constraint, end-to-end production output (a finished film file, a finished
comic file), not demos.

---

## Mission

Evolve Vixio Studio from a storyboard-and-clips tool into two production
engines that share one project graph:

1. **Cinematic engine.** A director-grade film pipeline: script to cast to
   storyboard to previz (3D blocking + camera authoring) to identity-locked
   frames to cinematic video to voiced, scored, mixed, rendered MP4. Reference
   product: **TapNow** (tapnow.ai) — adopt its best patterns, beat its known
   gaps (see "TapNow findings" below).
2. **AI comic engine.** A comic/manga production line: script to cast to page
   planning to panel generation to lettering to export (CBZ, PDF, webtoon
   strip). It is a sibling mode of the same app, not a fork.
3. **Bidirectional conversion.** A comic project can be promoted into the
   cinematic engine (panels become shots, reading order becomes cut order,
   balloons become dialogue). A film project's storyboard can be rendered out
   as a comic (shots become panels, dialogue becomes balloons, scene breaks
   become page breaks). Conversion is a first-class, lossless, previewable
   operation, not an export hack.

## Before writing any code

1. **Reanalyze the whole codebase.** Read `docs/BUILD-CHARTER.md` first; it is
   binding for every file. Then map: `src/domain/types.ts` (project graph),
   `src/domain/prompt.ts` + `src/domain/constants.ts` (prompt composition and
   vocabulary), `src/providers/types.ts` + `src/providers/registry.ts` +
   `src/providers/{mock,gemini,fal}/` (provider seam), `src/stores/*`
   (projects, assets, tasks queue, settings, session), `src/features/*` (the
   six existing stages), `src/cloud/*` (Drive sync), `deploy/` (the planned
   PocketBase VPS service and `pb_schema.json`).
2. Read `docs/study/critic.md` end to end. It contains verified external API
   contracts you must reuse instead of inventing: the ffmpeg final-cut spec
   (concat/xfade/atrim/drawtext parameters), the artcraft `OmniGen`
   capability-schema shape for model registries, Toonflow's per-model video
   prompt templates and reference-role contract, and its track-assembly
   ordering rules.
3. Read the research appendix at the bottom of this prompt. Every model slug,
   API endpoint, and preset list there was web-verified on 2026-07-07.
4. If a product decision is genuinely ambiguous after reading, ask the user
   before building. Do not ask about anything this prompt already decides.

## Architecture (decided: hybrid, local-first)

- The browser stays the authoring surface and keeps the local-first, BYOK
  model: keys in `useSettingsStore` (localStorage), media in IndexedDB,
  provider calls that are CORS-viable (Gemini, fal) stay browser-direct.
- Build out the already-planned VPS service (`deploy/`) into a **render and
  orchestration worker** behind Traefik, alongside PocketBase: a small typed
  HTTP API + job queue that handles (a) provider APIs that require server-side
  secrets or lack CORS (Higgsfield, Runway, Moonvalley, ElevenLabs, Meshy),
  (b) ffmpeg final renders, (c) previz-pass encoding, (d) webhook receipt from
  queue-based providers. Jobs are polled/pushed back to the SPA; artifacts are
  stored and served from the VPS with signed URLs.
- BYOK extends to the worker: the browser sends the user's provider key with
  each job over TLS; the worker holds keys in memory per job and never
  persists them. Persisted server-side key storage is out of scope.
- Everything must degrade: no worker configured means browser-only mode still
  works (preview renderer, Gemini, fal, ffmpeg.wasm fallback render with its
  limits stated in the UI).

## Workstream A: provider platform + BYOK settings

Extend the existing BYOK settings (fal and Gemini keys already exist in
`src/stores/settings.ts` — do not rebuild them, extend the pattern):

- Add per-provider keys: Higgsfield (key id + secret), Meshy, ElevenLabs,
  Runway, Moonvalley (via fal), plus the worker URL + worker access token as a
  "render service" settings section.
- Every key row gets a **Verify** action that performs the cheapest real
  authenticated call and reports state inline (unverified / valid / invalid,
  with the provider's error string). Keys render as password fields.
- Replace free-text model IDs with a **capability-driven model registry**
  modeled on the artcraft `OmniGenVideoModelInfo` shape documented in
  `docs/study/critic.md` §9: per model — aspect ratios, resolutions, max/min
  duration, keyframe support (first/last), reference image/video/audio counts,
  audio generation, prompt length limits. The registry drives what the UI
  offers per shot; a manual "custom model id" escape hatch remains for fal.
- **Transparent metering** (TapNow's top trust complaint): show an estimated
  cost/credit figure before generation where the provider publishes pricing,
  the actual cost after, and a per-project spend ledger view.
- Task queue: generalize `src/stores/tasks.ts` from `enqueueImage`/
  `enqueueVideo` to a typed job system that also covers audio, 3D, previz
  encode, panel, page render, and final render jobs; allow limited
  concurrency per provider instead of one global serial lane; jobs that run on
  the worker report progress via polling. Keep the store-attaches-results
  discipline (features never call providers directly).

## Workstream B: cinematic engine

Adopt from TapNow (verified findings below), then exceed it:

1. **Director mode with human gates.** A single logline/script brief expands
   into the full graph (scenes, cast, shots with camera/lens/duration,
   per-shot prompts) via the text provider, but every agent decision lands as
   editable data with accept/reject/rewrite affordances, pausing at two gates:
   storyboard approval and picks approval. Add a cut-density control
   (TapNow's segmentation is criticized as too conservative) and split/merge
   beat gestures. Manual mode (today's flow) remains.
2. **Named cinematography, not adjectives.** Extend `src/domain/constants.ts`
   with camera bodies/looks (e.g. ARRI ALEXA 35, Sony VENICE), focal lengths
   (8-50mm vocabulary), and a motion-preset set aligned with Higgsfield's DoP
   preset names (dolly in/out, crash zoom, dolly zoom, whip pan, crane over
   the head, 360 orbit, arc, snorricam, FPV drone, handheld, bullet time,
   dutch, through-object, head tracking, static...). Presets are stored on the
   shot and compile per-provider: to Higgsfield `motions[{id, strength}]`, to
   Kling `camera_control`, to Veo/Runway prompt fragments, to a previz camera
   path. Cinematography survives switching models.
3. **Previz stage (the differentiator).** A new pipeline stage between board
   and frames: a Three.js blockout editor per shot — GLB mannequins
   (Meshy/Mixamo rigs, retargeted clips via `AnimationMixer` +
   `SkeletonUtils.retarget`), primitive props and set pieces (Meshy-generated
   or primitives), a keyframeable camera (position/lookAt/FOV timeline; FOV
   maps to focal-length vocabulary). Deterministic multi-pass capture with
   WebCodecs `VideoEncoder` (not `captureStream`): clay/beauty pass, depth
   pass (`MeshDepthMaterial`, normalized 8-bit), optional OpenPose-style
   skeleton pass. Passes upload to the worker, are encoded to MP4, and become
   **driving video** for generation. This is the only exactly-repeatable
   camera-control method (see appendix); it is also re-editable: change the
   camera keyframes, regenerate the shot.
4. **Model routing per shot.** Route through the registry by shot need:
   - Previz-driven (quality): Moonvalley Marey motion-transfer, or Seedance
     2.0 reference-to-video with the previz clip as `@Video1` and character
     refs as `@Image1..n`.
   - Previz-driven (open/cheap): Wan VACE / LTX-2 vid2vid with the depth pass.
   - Restyle/polish: Runway Gen-4 Aleph, Luma Ray-2 Modify (`adhere` modes).
   - Performance close-ups: Runway Act-Two or Kling motion-control with a
     driving performance video.
   - Preset-driven (no previz): Higgsfield DoP, Kling, Veo 3.1 via prompt.
   - **A/B model race:** fan one shot out to N models side by side; picking a
     winner records model+params as the project's preference for similar
     shots.
5. **Character consistency as a product feature** (TapNow leaves this to
   community workarounds): each Character carries a canonical reference set
   (3-5 stills, generated or uploaded, plus optional Meshy 3D turnaround).
   Per-shot start frames are produced by an identity-locked edit model (Flux
   Kontext / Nano Banana Pro) posing the character into the shot composition;
   reference conditioning (Kling Elements, Veo ingredients, Seedance images)
   is wired automatically for every shot the character appears in.
6. **Audio as an independent layer** (TapNow cannot do this): per-shot and
   per-scene audio lanes — dialogue TTS with per-character voice casting
   (ElevenLabs voice design; store a voice id per character), ambience/SFX,
   and score (generated music) — mixed independently of whichever video model
   produced the picture. Waveforms and mute/solo/gain per lane in the cut.
7. **Real final render + NLE handoff** (TapNow's most-cited exit reason):
   worker-side ffmpeg render implementing the spec in `docs/study/critic.md`
   §1/§4 — xfade transitions with atrim'd audio, drawtext subtitles with the
   documented two-line split, `libx264 -crf 18 -pix_fmt yuv420p` + aac,
   `+faststart` — at 1080p and 4K, plus burned or sidecar SRT. Also export
   OTIO or EDL/FCPXML + media folder for NLE finish. Browser ffmpeg.wasm
   remains the no-worker fallback with its limits stated inline.

## Workstream C: AI comic engine

One app, two engines: `Project` gains a `mode: "film" | "comic"` (extend the
existing `format` thinking, keep discriminated unions). Script and Cast stages
are shared verbatim. Comic mode replaces board/frames/motion/cut with:

1. **Page planner.** Scenes map to pages and panel grids: page count target,
   panels per page, layout templates (grid, splash, inset, widescreen rows,
   vertical webtoon flow), reading direction (LTR/RTL), aspect (print page,
   webtoon strip). Beat-to-panel assignment is agent-proposed, human-edited,
   same gate discipline as director mode.
2. **Panel lab.** The framelab analog for panels: per-panel composed prompt
   (visible and editable), style locked by a project-level comic style
   (line-art, screentone/manga, western color, noir...) compiled into every
   prompt plus the character reference set; seed lock, takes/history,
   identity-locked generation via the same character library and edit models
   as the cinematic engine. Panel continuity: neighboring-panel context and
   the same edit-model repose technique keep characters and settings stable
   across a page.
3. **Lettering.** Balloons (speech, thought, whisper, burst), captions, and
   SFX text as vector overlays on panels (not baked into generated pixels):
   draggable tails, per-character balloon styles, automatic reading-order
   numbering, font controls. Balloons store structured dialogue so
   conversion to/from film dialogue is lossless.
4. **Export.** Page compositor renders pages (panels + gutters + bleed +
   lettering) to PNG; package as CBZ, print-ready PDF, and a single vertical
   webtoon strip image set. Include a project JSON export mirroring
   `exportCutData`.
5. **Conversion, both directions.**
   - Comic → film: panels become shots (panel prompt seeds the frame prompt,
     panel art becomes the reference/start frame, balloons become dialogue
     lines, reading order becomes cut order); the agent proposes camera moves
     and durations per shot from panel composition; user reviews at a gate.
   - Film → comic: shots become panels (chosen frame/take becomes panel art
     or its reference), scene breaks propose page breaks, dialogue becomes
     balloons placed by a layout pass; the storyboard's existing contact-sheet
     exporter (`src/features/timeline/exporters.ts`) is superseded by true
     comic pages.
   - Both run as a previewable "conversion draft" the user accepts, and both
     preserve ids (a converted shot remembers its source panel and vice
     versa) so re-conversion updates rather than duplicates.

## Workstream D: Meshy 3D asset system

- Settings + provider module + worker routes for Meshy: text/image-to-3D for
  props and set pieces, character image-to-3D from the reference set,
  auto-rigging, and its preset animation clips.
- Generated GLBs land in the asset store (new asset kind `model3d`) and feed
  the previz stage as mannequins, props, and sets. The same rigged character
  is both the motion-reference mannequin and, via controlled-angle renders,
  a source of identity reference stills for the character library.

## MCP servers and dev tooling

The user can supply the Higgsfield MCP server, the Meshy MCP server, and any
other tool needed — ask for them at the start of the build session and use
them to live-verify request/response contracts before hardcoding them into
provider modules. Where an MCP contract and public docs disagree, trust the
MCP's live responses.

## Delivery discipline

- Work in vertical slices, in this order: A (platform) → B previz+routing →
  B audio+render → C comic engine → conversions → D polish. Each slice ends
  green (`npm run typecheck && npm run lint && npm run build`) and committed
  with a descriptive message; push to the designated branch.
- Charter compliance is not optional: four states on every surface,
  `Result<T>` at async seams, branded ids (add `PageId`, `PanelId`,
  `BalloonId`, `VoiceId`, `JobId` as needed), discriminated unions, no
  rounded corners, copy in `copy.ts`, mono numerals, one accent.
- New deps must be justified in the commit body. Expected additions: `three`
  (+ examples/jsm), `@ffmpeg/ffmpeg` (wasm fallback), a worker package
  (Node + TS + ffmpeg in Docker, added under `deploy/` or a `worker/` dir
  with its own compose service).
- No secrets in the repo. The worker image takes configuration by env; the
  SPA takes only the worker URL from settings.

---

## Research appendix (web-verified 2026-07-07)

### TapNow findings (reference product)

TapNow (tapnow.ai, Tamar Edge Ltd) is an agentic node-canvas creative studio
orchestrating 35+ frontier models. What to adopt: director-agent that expands
a brief into an editable shot graph with human gates; named camera bodies and
lenses (Cinema Lab: ALEXA 35, VENICE, custom lens looks) and on-canvas
lighting rigs; 3D spatial re-render of a still (rotate/tilt/scale/FOV);
draw-to-video storyboarding; A/B/n model races per shot; recipe/group sharing
with fork semantics; live per-generation cost telemetry. Verified gaps to
beat: no timeline or post (users exit to an NLE; no NLE project export), no
native character-consistency feature (community workaround workflows only),
audio character is inherited from the chosen video model with no independent
control, opaque credit deductions, conservative scene segmentation, no comic
tooling at all.

### Camera control and previz (why Workstream B.3 is shaped that way)

Preset/prompt camera systems are qualitative and non-repeatable: Higgsfield
DoP has 50+ named presets via `POST /v1/image2video/dop` with
`motions: [{id, strength 0-1}]` (server-side only, `Key KEY_ID:KEY_SECRET`
auth, official JS SDK `higgsfield-ai/higgsfield-js`; Cinema Studio adds focal
length 8-50mm, aperture, camera+lens rigs). Kling exposes `camera_control`
(`simple` config: horizontal/vertical/pan/tilt/roll/zoom each in [-10,10], one
axis at a time). Veo 3.1 and Runway Gen-4.5 are prompt-directed. Luma Ray-2
has ~15 composable camera-motion concepts (list endpoint:
`GET /dream-machine/v1/generations/camera_motion/list`).

Exactly repeatable cinematography comes only from **driving-video
conditioning** — render the camera move yourself and feed it to:

- `moonvalley/marey/motion-transfer` (fal) — mirrors motion, composition, and
  camera of the conditioning video; commercially-safe training; ~$2/gen.
  `moonvalley/marey/pose-transfer` for performance-only.
- `bytedance/seedance-2.0/reference-to-video` (fal) — up to 9 images + 3
  videos + 3 audio refs addressed as `@Image1`/`@Video1` in the prompt; 4-15s,
  up to 1080p.
- `fal-ai/wan-vace-14b` — control video (depth/pose/canny) + reference image;
  $0.04-0.08 per video-second. Open weights.
- `fal-ai/ltx-2-19b/video-to-video/lora` — control LoRAs for depth/pose/canny
  plus a camera LoRA; cheap and fast; matches input length.
- `fal-ai/luma-dream-machine/ray-2/modify` — 9 modes; `adhere_1..3` keep
  motion/performance/camera and change surfaces (max 10s, 100MB input).
- Runway Gen-4 Aleph (`POST /v1/video_to_video`, model `gen4_aleph`, direct
  Runway API) — vid2vid restyle/relight/replace with one style reference;
  Aleph 2.0 accepts 2-30s input and up to 5 timestamped keyframe images.
- Runway Act-Two (`POST /v1/character_performance`) — character image/video +
  driving video 3-30s, `bodyControl`, `expressionIntensity` 1-5.
- Kling 2.6 motion-control (`fal-ai/kling-video/v2.6/standard/motion-control`)
  — character image + motion reference video; `character_orientation: video`
  (complex body motion, ≤30s) or `image` (camera moves, ≤10s).

Previz capture spec: Three.js scene, multi-pass render of the same timeline —
clay/beauty, depth (`MeshDepthMaterial` normalized), optional skeleton pass —
captured deterministically frame-by-frame with WebCodecs `VideoEncoder` at
1280x720 @ 16-24fps, 5-10s, then worker-encoded to MP4 with per-model
constraint enforcement (Seedance video refs 2-15s ≤720p; Luma ≤10s/100MB;
Kling motion ref ≤30s). Autodesk's PrevizWhiz (CHI 2026) validates the
three-tier motion-fidelity approach (blocking → stylized → control video).

### Character consistency (mid-2026 best practice)

Character library of 3-5 canonical stills (+ optional Meshy turnaround).
Per-shot identity-locked start frames via Flux Kontext or Nano Banana Pro
(~97% facial retention reported across multi-turn edits). Reference
conditioning wired automatically: Kling Elements (1-4 imgs/subject,
front/side/back), Veo 3.1 ingredients (up to 3, role-assigned in prompt),
Seedance 2.0 image refs (up to 9), Runway references. Character LoRAs (Wan,
LTX-2 on fal) remain the strongest lock for a recurring hero character.
Meshy: image-to-3D from turnarounds, auto-rig in under 30s, 600+ preset
animation clips, controlled-angle renders back out as reference stills.

### Rigging/motion-reference tools

Mixamo (free auto-rig + largest clip library, standard skeleton), Cascadeur
(quick rig, AutoPosing, video mocap alpha, FBX/USD export), Meshy auto-rig,
Blender Rigify. In-browser: `AnimationMixer` plays Mixamo/Meshy GLB clips;
`SkeletonUtils.retarget` handles cross-skeleton retargeting.

### Provider stack quick reference

<!-- PROVIDER-STACK: filled from the provider research report -->

