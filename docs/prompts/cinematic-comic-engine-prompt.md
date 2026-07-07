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
  provider calls that are CORS-viable stay browser-direct (verified: Gemini,
  fal, ElevenLabs, and the Meshy task API all accept browser calls with the
  user's key).
- Build out the already-planned VPS service (`deploy/`) into a **render and
  orchestration worker** behind Traefik, alongside PocketBase: a small typed
  HTTP API + job queue that handles (a) providers that are server-side
  intended or partially CORS-blocked (Higgsfield, Runway, Moonvalley via fal
  is fine; Meshy asset-CDN downloads must be proxied — `assets.meshy.ai` has
  no CORS), (b) ffmpeg final renders, (c) previz-pass encoding, (d) webhook
  receipt from queue-based providers (`?fal_webhook=`, `?hf_webhook=`),
  (e) rehosting Higgsfield outputs immediately (they expire in ~7 days). Jobs
  are polled/pushed back to the SPA; artifacts are stored and served from the
  VPS with signed URLs.
- BYOK extends to the worker: the browser sends the user's provider key with
  each job over TLS; the worker holds keys in memory per job and never
  persists them. Persisted server-side key storage is out of scope.
- Everything must degrade: no worker configured means browser-only mode still
  works (preview renderer, Gemini, fal, ffmpeg.wasm fallback render with its
  limits stated in the UI).

## Workstream A: provider platform + BYOK settings

**Provider strategy (decided): fal.ai is the tier-1, default provider for
every generation kind.** It covers images, video (including the whole
previz-driven set), audio, lipsync, and LoRA training under one queue API,
is already integrated, and accepts browser-direct BYOK calls, so the
pipeline works before the worker exists. Tier 1 also includes ElevenLabs
direct (audio: dialogue, timestamps, music plans; open CORS) and Meshy (3D).
Tier 2, added through the same registry once the worker is up, in order:
Runway direct (Aleph restyle + Act-Two performance, not on fal), then
Higgsfield (DoP camera presets as a fast path beside previz, Soul ID as a
consistency alternative). Build order follows the tiers.

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
   (ElevenLabs voice design; store a voice id per character; use
   `/with-timestamps` alignment to drive subtitles and lipsync timing;
   `/v1/text-to-dialogue` for multi-speaker scenes), ambience/SFX
   (`/v1/sound-generation`, or `fal-ai/mmaudio-v2` to sonify a silent video
   clip), and score (ElevenLabs Music `music_v2` with `/v1/music/plan`) —
   mixed independently of whichever video model produced the picture.
   Optional lipsync pass per dialogue shot: `fal-ai/sync-lipsync/v2` (v3 as
   the premium tier). Waveforms and mute/solo/gain per lane in the cut.
7. **Real final render + NLE handoff** (TapNow's most-cited exit reason):
   worker-side ffmpeg render implementing the spec in `docs/study/critic.md`
   §1/§4 combined with the assembly practice in the appendix: ffprobe and
   normalize every clip first (AI models emit mismatched codecs/fps), xfade
   transitions with offsets computed from probed durations, pairwise
   acrossfade, `amix` + sidechain ducking of music under dialogue, two-pass
   loudnorm to -16 LUFS, subtitles via libass, `libx264 -crf 18 -pix_fmt
   yuv420p` + aac, `+faststart` — at 1080p and 4K, plus burned or sidecar
   SRT. Also export OTIO or EDL/FCPXML + media folder for NLE finish. Browser
   ffmpeg.wasm remains the no-worker fallback with its limits stated inline
   (2GB memory ceiling, ~10x slower, previews and single clips only).

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

The user can supply MCP servers and keys for dev-time verification — ask for
them at the start of the build session and use them to live-verify
request/response contracts before hardcoding them into provider modules.
Official servers exist for all three: Higgsfield hosted MCP at
`https://mcp.higgsfield.ai/mcp` (OAuth, no API key), Meshy
`@meshy-ai/meshy-mcp-server` (npm; Meshy also has a test key,
`msy_dummy_api_key_for_test_mode_12345678`, that returns canned results free
of charge — use it in automated tests), and `elevenlabs-mcp` (Python/uvx).
Where an MCP contract and public docs disagree, trust the MCP's live
responses.

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

**fal.ai** — primary aggregator. Queue API: `POST https://queue.fal.run/
{model-id}` with `Authorization: Key ...` returns `{request_id, status_url,
response_url, cancel_url}`; poll or SSE `.../status/stream`; webhook via
`?fal_webhook=` (15s timeout, 10 retries over 2h); `https://fal.run/...` sync
for short jobs. Per-model machine-readable docs at
`fal.ai/models/{slug}/llms.txt`. Browser-direct calls work with a user key
(no CORS block); vendor guidance prefers a proxy — BYOK browser-direct is the
default here, worker proxy optional.

- Frames and keyframes: `fal-ai/nano-banana-pro[/edit]` (Gemini 3 Pro image;
  14 reference images, identity lock for up to 5 people, legible in-image
  text, $0.15) for quality; `fal-ai/flux-2-pro[/edit]` (10 refs) and
  `fal-ai/flux-pro/v1.1-ultra` for photoreal; `fal-ai/bytedance/seedream/
  v4.5/edit` ($0.04, 10 refs) budget; `fal-ai/flux-pro/kontext[/max]` for
  identity-locked edits.
- Video: `fal-ai/kling-video/v3/pro/image-to-video` default (native audio,
  3-15s, character elements); `fal-ai/veo3.1[/image-to-video]` premium (4K +
  audio, first-last-frame endpoint); `fal-ai/sora-2/image-to-video/pro`
  stylistic alternative; `fal-ai/veo3.1/lite` and `wan/v2.6/image-to-video`
  budget. Previz-driven and restyle endpoints are in the camera section
  above.
- Audio on fal: `fal-ai/elevenlabs/tts/eleven-v3`, `fal-ai/minimax/
  speech-02-hd`, `fal-ai/dia-tts` (multi-speaker); music `fal-ai/elevenlabs/
  music`, `fal-ai/minimax-music/v2`; SFX `fal-ai/elevenlabs/sound-effects`;
  `fal-ai/mmaudio-v2` sonifies an existing silent clip ($0.001/s).
- Lipsync: `fal-ai/sync-lipsync/v2` default, `/v3` premium;
  `fal-ai/bytedance/omnihuman/v1.5` for image+audio talking heads.
- LoRA: `fal-ai/flux-2-trainer` + `fal-ai/flux-2/lora` for book-wide style or
  hero-character locks.

**Higgsfield** — official self-serve API: keys at `cloud.higgsfield.ai`,
docs at `docs.higgsfield.ai` (llms.txt index), base
`https://platform.higgsfield.ai`, auth `Authorization: Key {id}:{secret}`,
queue `POST /{model_id}` (e.g. `higgsfield-ai/dop/standard`,
`higgsfield-ai/soul/standard`), `GET /requests/{id}/status`, webhook
`?hf_webhook=`. The camera-preset surface (`motions: [{id, strength}]`,
`getMotions()`) lives in the V1 SDK layer (`@higgsfield/client`). Soul ID
trains a persistent character identity from ~20 photos in minutes. Outputs
expire in ~7 days — the worker rehosts them on receipt. Server-side
intended; route through the worker.

**Meshy** — base `https://api.meshy.ai`, `Authorization: Bearer msy_...`,
async tasks with SSE streams. Endpoints: `/openapi/v2/text-to-3d`
(preview then refine), `/openapi/v1/image-to-3d`, `/openapi/v1/
multi-image-to-3d` (1-4 images — feed character turnarounds),
`/openapi/v1/retexture`, `/openapi/v1/rigging` (humanoid, ≤300k faces),
`/openapi/v1/animations` (~600 preset clips via `action_id`),
`/openapi/v1/remesh`. Outputs GLB/FBX/USDZ/OBJ with PBR maps; `ai_model`
default meshy-6. Task API is browser-callable, but `assets.meshy.ai` has no
CORS: GLB downloads for the Three.js viewer go through the worker proxy. API
requires their Pro tier.

**ElevenLabs** — models: `eleven_v3` flagship (inline audio tags like
[whispers], [laughs]), `eleven_multilingual_v2` default, `eleven_flash_v2_5`
low-latency. `POST /v1/text-to-speech/{voice_id}` (use `/with-timestamps`
for character-level alignment feeding subtitles and lipsync),
`POST /v1/text-to-dialogue` (multi-speaker, ≤10 voices, v3),
`POST /v1/text-to-voice/design` (voice design; store the chosen voice id on
the Character), `POST /v1/voices/add` (cloning), `POST /v1/sound-generation`
(0.5-30s SFX, loop support), `POST /v1/music` + free `POST /v1/music/plan`
(`music_v2`, section-level control, commercially cleared for film). CORS is
`*`, so this is the easiest true browser-direct BYOK integration.

**Final render worker** — ffprobe every clip, normalize per clip (scale/pad
to target, fps, `format=yuv420p`, `setsar=1`, `aresample=48000`, inject
`anullsrc` for silent clips), concat demuxer when uniform else concat
filter; `xfade` with offsets computed in code from probed durations;
pairwise `acrossfade`; `amix=normalize=0` plus `sidechaincompress` to duck
music under dialogue; two-pass `loudnorm` to -16 LUFS / TP -1.5; subtitles
via libass (ship fonts in the worker image); deliver `libx264 -crf 18-20
-preset medium -pix_fmt yuv420p -profile:v high -level 4.1` + aac 192k +
`-movflags +faststart`. Queue: pg-boss (Postgres SKIP LOCKED) is enough at
this volume; progress from `-progress pipe:1` streamed to the SPA.
ffmpeg.wasm fallback: 2GB memory ceiling, ~10x slower, single-clip scope.

**Comic panel engines** — default `fal-ai/nano-banana-2/edit` (Gemini 3.1
Flash Image, $0.08, 14 refs, validated typography); budget
`fal-ai/bytedance/seedream/v4.5/edit`; series style-lock via FLUX.2 LoRA.
Practice: generate a 3-5 angle character sheet first and feed it as
references on every panel; keep balloons and lettering as vector overlays
in-app (never baked into pixels; bake only diegetic signage/SFX text).
Authentic manga screentone: SDXL anime checkpoints (Animagine XL 4.0,
Illustrious XL, NoobAI) via `fal-ai/lora`. Research caveat: reference-based
editors can preserve identity too rigidly (stiff poses) — multi-pose
character sheets mitigate.

