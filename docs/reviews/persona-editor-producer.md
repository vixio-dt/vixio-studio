# Vixio Studio — Editor / Line Producer Review (Marcus Del Rio)

Reviewed 2026-07-08 by driving the product end to end in preview mode: BYOK settings pass, a 2-scene /
11-shot neo-noir film ("Night Ferry"), 6 generated frames (+2 extra takes), 4 motion clips, 3 dialogue
lines, 1 music + 1 ambience track, a full final render, delivery QC with ffmpeg/ffprobe-equivalent,
all exports, and a deliberate break-it pass. All evidence screenshots in this folder; render artifacts
in `../render/`.

## Verdict

I would put this in an internal pipeline for animatics today, and I would not yet hand its output to a
client unsupervised — for one reason above all: **the app tells me two different durations for the same
cut.** The transport reads `0:00 / 0:54` (planned board durations) while the delivered file is
**34.02 seconds** (unrendered shots silently compress to 1.5s slates in both preview and render;
ffprobe: `Duration: 00:00:34.02 ... vp9, 1280x720 ... 24 fps ... opus, 48000 Hz, stereo`). Everything
else about the render is honest — the label says exactly "Final cut (webm, 720p) 12.7 MB" and that is
exactly what lands on disk — but a timeline whose clock doesn't match its own export fails the first
QC check every post house runs. The single change that would most raise output trust: **one
authoritative clock** — a transport that shows real elapsed playback time, and an explicit
"planned 0:54 / renders as 0:34 (7 shots are slates)" callout before render. The bones are
unusually good: provenance on every asset (seed, model, take history), genuinely zero network egress
in preview mode, and clean cancel/guard behavior. Fix the clock, persist the queue, and stop orphaning
media on project delete, and I'd trust it with client work.

Would I trust it with my API keys? Mostly yes. I watched the network for the entire session: with
preview providers, **zero external requests of any kind** (no fonts, no analytics, no telemetry — only
local `blob:` URLs). The only external calls ever made were the ones I explicitly triggered with
Verify buttons, and each went **directly to its provider** (`generativelanguage.googleapis.com`,
`queue.fal.run`, `api.elevenlabs.io`, `api.meshy.ai`) — no middleman. "Stored only in this browser" is
accurate. Caveats: keys sit in plaintext localStorage, are saved even when garbage, and the Google
Drive section ships with a pre-filled OAuth client id in a password-masked field, which reads like a
leaked secret to a nervous customer.

## Findings

| # | Severity | Screen / action | Observed | Expected by a professional |
|---|----------|-----------------|----------|---------------------------|
| 1 | **Major** | Cut page transport + final render (`29-cut-initial.png`, `37-render-done.png`, ffprobe output) | Transport shows `0:54` total; playthrough completes in ~34s wall time (`36-playthrough-end.png` samples); rendered file is 34.02s. Slates quietly play/render at 1.5s instead of their planned 5–6s. No warning anywhere. | The stated cut duration matches the delivered file, or the UI explicitly shows planned vs. render duration before I commit a render. |
| 2 | **Major** | Frames — queue 2 jobs, reload immediately (`19-queue-open.png` → `20-queue-after-reload.png`) | After reload the queue says "Nothing rendering" — both queued and in-flight jobs vanish with no failure record, no resume, no unload warning. Same on tab close (S1#4 died at "Rendering 20%" and left nothing). | Queue persists across reload, or at minimum an "interrupted" entry with a Retry button and a beforeunload warning while jobs are live. |
| 3 | **Major** | Projects — delete "Night Ferry" (`53-nightferry-deleted.png`; IndexedDB audit) | IndexedDB `assets` store still holds all 16 media records after project delete (16 before → 16 after). Dialog only promises to remove "scenes, shots, and characters." ~23MB orphaned with no UI to see or reclaim it. | Project delete removes (or offers to remove) its generated media; a storage view shows what's occupying disk. This is the one real gap in the "complete asset control" claim. |
| 4 | **Major** | Cut page — press Play, watch readout (`33-playing.png`; playback samples) | Position readout stays frozen at the shot's start offset (`0:00` for 5s, then jumps to `0:05`). No playhead, no scrub bar; navigation is whole-shot only (prev/next/filmstrip click). mm:ss only, no frames, no fps shown (render is 24fps). | An animatic tool needs a moving playhead, sub-shot scrubbing, and frame-or-at-least-seconds-accurate timecode. This is the biggest day-to-day workflow gap vs. any NLE. |
| 5 | Minor | Render queue drawer (`19-queue-open.png`, `27-motion-queue.png`) | Dismiss (X) exists only on Done items. No cancel for a queued or running job — only the final-cut render has a Cancel. | Kill switch on every queued/running job; with paid providers a stuck job is real money. |
| 6 | Minor | Settings — all key fields (localStorage audit) | Keys stored plaintext in `localStorage["vixio-settings"]`, saved as typed, even unverified garbage persists silently. | Plaintext is defensible for local-first BYOK, but say so explicitly; don't silently persist keys that just failed verification, or mark them "unverified". |
| 7 | Minor | Settings — fal.ai Verify with `not-a-colon-key` (`04-fal-badformat.png`) | Helper text says "Format is key_id:key_secret" but a key with no colon still fires the network probe. | Cheap client-side format check before any network call. (Real rejection copy is good: "fal.ai rejected the key (401)." — verified in code; sandbox blocked live 401s.) |
| 8 | Minor | Settings — Google Drive section (`02-settings-top.png`, input dump) | Google client id field is pre-filled with a real OAuth client id (`157133855208-...apps.googleusercontent.com`) rendered as a masked password field. | Client ids aren't secrets — don't mask one, and don't pre-fill "your own" client id field with the vendor's; it muddies the whole "keys never leave the browser" story. |
| 9 | Minor | Frames / Motion / Cut — media egress | No way to download an individual frame, clip, or dialogue take from the UI. Egress = final render, contact sheet PNG, cut JSON, comic exports (CBZ/PNG/webtoon/JSON), previz depth pass. No "export all media" zip. | Per-asset download and a bulk media export. If I want to cut the animatic in Premiere, I currently can't get the clips out. |
| 10 | Minor | Cut — "Export cut data" (`night-ferry-cut.json`) | JSON has prompts, seeds, camera metadata, dialogue, hasFrame/hasClip — excellent creative record — but no media references, no audio track section, no timecode structure. No EDL/OTIO/FCXML. | Either name it "creative metadata" or make it an interchange: shots with in/out points, media paths, and audio events an NLE can conform. |
| 11 | Minor | Cut — Audio lanes (`32-audio-all-tracks.png`) | Music/ambience are fixed 30s loops over a 34s/54s cut; no per-track length, offset, or in/out. Dialogue has play/regenerate but no gain control (loops have gain; dialogue routes straight to master — confirmed in `usePlayback.ts`). | Track offset/length control and a dialogue level. Mix headroom is fine (max peak −1.5 dB at gain 1.0, no clipping — measured on the render). |
| 12 | Minor | Two tabs, both hit "Render final cut" (`44-double-render-tab1.png`) | Same-tab double render is correctly blocked (button disables). A second tab renders the same cut concurrently; both completed at 12.7 MB, but nothing warns you're double-encoding. Also no cross-tab sync: the deleted project stayed fully editable in its open tab (`54-tab1-after-nightferry-delete.png`). | Cross-tab awareness: a shared render lock or at least a "project changed/deleted elsewhere" banner. |
| 13 | Polish | Framelab rail vs. queue vs. Motion/Cut numbering (`19-queue-open.png`) | Framelab rail numbers shots per scene (#1–#6 twice); queue and Motion/Cut use global numbers ("Frame, shot 6" = rail scene 2 #1). | One numbering scheme everywhere, ideally scene/shot compound ("2-01"). |
| 14 | Polish | New project — Create with empty logline (`47-create-empty-logline.png`) | Button looks enabled; click silently does nothing, no validation message, modal stays open. | Disable the button or say what's missing. |
| 15 | Polish | Settings — Verify buttons on unreachable network (`03b-gemini-garbage-final.png`) | ~13s spinner ("Checking the key") before failing with honest copy ("Could not reach Gemini (Failed to fetch)"). | A tighter timeout or progress hint; 13 silent seconds feels broken. |
| 16 | Polish | Script/scene delete, project delete (`14a-delete-scene-confirm.png`, `51-project-delete-dialog.png`) | Every destructive dialog is specific and honest ("removes the scene at a pawnshop back room and every shot inside it. This cannot be undone.") — but there is no undo anywhere in the app. | An undo stack, even shallow. Editors lean on Cmd-Z reflexively; "no undo" plus finding #2's silent job loss compounds. |

Not reproducible as failures (positive checks): zero-media render is properly guarded with an empty
state ("Nothing on the timeline… Write scenes and break them into shots first", `48-empty-project-cut.png`);
render Cancel returns cleanly to idle (`45-after-cancel.png`); deleting a project mid-render did not
crash the render (it completed, `54-...png`); gain is hard-capped 0–1 in 0.05 steps so "giant gain"
is impossible; motion generation is correctly disabled for shots with no start frame
(`26-motion-shot4-noframe.png`); "Delete all local data" genuinely wipes localStorage (keys included)
and all IndexedDB assets, orphans included (`56-danger-confirm.png`, `57-after-wipe.png`).

## Delivery QC evidence

- `night-ferry-final.webm` — 13,354,228 bytes. ffmpeg probe:
  `Input #0, matroska,webm ... encoder: Mediabunny; Duration: 00:00:34.02; Stream #0:0 Video: vp9, 1280x720, SAR 1:1 DAR 16:9, 24 fps; Stream #0:1 Audio: opus, 48000 Hz, stereo`
  — container/resolution/codec all match the in-app label "Final cut (webm, 720p) 12.7 MB". Honest labeling.
- Audio: continuous bed across the full 34s, RMS ≈ −17 dB, peaks −1.5 to −6 dB, no clipping; dialogue
  bump measurable at 24–26s (measured via OfflineAudioContext decode of the delivered file).
- Burned captions verified on-frame: shot 2 line at t=6s (`38-render-t6.png`), shot 7 line at t=24.5s
  (`38-render-t24_5.png`) — cue placement correct against the slate-compressed timeline.
- Unrendered shots render as clean labeled slates ("Shot 5 — Hold on Frank as the moment settles.",
  `38-render-t15_2.png`) rather than black — good for review screenings.
- What an editor still can't do: no MP4 on this runtime (WebM/VP9 only — labeled honestly), no
  resolution/fps choice, no per-shot trims, no transitions (hard cuts only, by design), no NLE
  interchange (no EDL/OTIO/XML), no way to export the individual clips to conform elsewhere.

## Asset control audit

- Storage: project data in `localStorage` (`vixio-projects`, `vixio-settings`); media blobs in
  IndexedDB `vixio-studio/assets` (23.2 MB after this session). All media served as `blob:` URLs.
- Egress in preview mode: **zero external requests** across script/frames/motion/audio/render/export —
  network-logged in every session of this review. The only external calls all session were the six
  Verify probes I clicked, each direct to its provider.
- Everything out: final render (webm), contact sheet (`night-ferry-board.png`, 1696x712 — rendered
  thumbs + labeled placeholders), cut JSON, comic CBZ (page PNGs), comic project JSON, webtoon PNG.
  Missing: raw media export (finding #9).
- On project delete: records go, media blobs stay orphaned (finding #3). On "Delete all local data":
  everything goes, verified empty.

## Three things this product gets uniquely right

1. **Provenance is a first-class citizen.** Every frame carries `seed · provider · age` right under the
   viewer ("seed 358697 · Vixio preview renderer · just now", `24-framelab-fullpage.png`), takes land in
   a history rail instead of overwriting, the composed prompt is inspectable and editable *before* you
   spend money, and the cut JSON exports every seed, prompt, and camera decision. That's a real audit
   trail — most gen-AI tools hide all of it.
2. **Honest degradation everywhere.** The preview tier never pretends: "Preview writer drafts offline.
   Connect Gemini in settings for real model output", "4/11 clips rendered" in the cut header,
   unrendered shots as labeled slates in the render and the contact sheet, and the render badge reports
   the container the runtime actually produced instead of a marketing format name. When this app tells
   you what a thing is, it's telling the truth — finding #1 (the duration clock) is the sole exception,
   which is why it stings.
3. **The local-first claim survives adversarial inspection.** Zero network egress in preview mode
   (verified by request logging, not by reading the README), keys go browser-to-provider only, the
   danger zone genuinely wipes everything, and the film↔comic conversion shows an exact idempotent
   diff before touching anything ("2 new pages, 11 new panels, 0 updated, 0 unchanged, 5 dialogue
   balloons… never duplicates", `39-render-as-comic.png`). That conversion preview is the kind of
   workflow trust most professional tools never earn.
