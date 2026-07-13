# Vixio Studio

A local-first AI production workspace for Vixio Creatives with two engines
that share one project: a cinematic engine that takes a logline to a
rendered, voiced, scored film, and a comic engine that takes the same
script to lettered, exported pages. Everything runs in the browser.

## The film pipeline

1. **Script** - write a logline, generate or hand-write scenes in screenplay form.
2. **Cast** - characters with appearance, wardrobe, and voice anchors; generate portraits.
3. **Board** - break scenes into shots: size, angle, lens, lighting, movement,
   duration, plus a camera preset (18 named moves) and camera body per shot.
4. **Previz** - block each shot in 3D: mannequins and props on a stage,
   preset-seeded camera keyframes honoring the shot's lens and size, scrubbing,
   and a two-pass clay and depth capture that attaches to the shot as its
   motion reference.
5. **Frames** - the frame lab: an editable composed prompt, character
   reference ingredients, seed lock, batch takes, and a take history rail.
6. **Motion** - image-to-video per shot: motion presets, duration, start frame.
7. **Cut** - timeline playback with a moving playhead, dialogue TTS with
   per-speaker voices, music and ambience lanes with live mixing, and a real
   final render (WebCodecs, vp9 or avc detected at runtime) with burned
   captions and a full audio mixdown, saved to assets automatically.

## The comic pipeline

1. **Script and Cast** - shared with the film engine.
2. **Pages** - plan pages from the script: layout tiers from splash to
   webtoon, reading direction (ltr or rtl), real composed thumbnails.
3. **Panels** - a panel lab with style-locked prompts, seed lock, takes, and
   a lettering mode: six balloon kinds, drag placement, font scale, and
   dialogue import from the script.
4. **Export** - page PNGs, CBZ, a panel-reflowed vertical webtoon strip, and
   versioned project JSON.

Projects convert both ways with a previewed, idempotent plan: panels become
shots with camera suggestions and balloon dialogue; shots become pages,
panels, and sourced speech balloons. A header switch flips a project between
engines once it holds both.

## Providers

Everything works offline out of the box through the built-in preview
providers (a deterministic script writer, a seeded frame renderer, an
animatic recorder, and an offline speech and music synth). Bring your own
keys in Settings to generate with real providers: Google Gemini (text,
image, Veo video), fal.ai (Flux, Kling, and the wider catalog via editable
model ids), ElevenLabs (dialogue, music, sound effects), and Meshy (3D).
Every key has a verify action, keys never leave the browser, and provider
routing per generation kind is explicit.

## Running it

```bash
npm install
npm run dev       # http://localhost:5180
npm run build
npm run typecheck
npm run test:e2e  # full Playwright suite against the offline providers
```

## Stack and lineage

Vite, React 19, TypeScript (strict), Tailwind v4, Zustand, react-router,
three.js for previz, mediabunny for encoding, feedback-only motion, Phosphor
icons. Persistence: localStorage for project data, IndexedDB for generated
media.

Studied and reinterpreted from three references: 869413421/ai-moive-studio
(novel-to-movie pipeline), HBAI-Ltd/Toonflow-app (staged short-drama factory
and prompt system), and storytold/artcraft (control-first generation UX).
Study reports live in `docs/study/`, the build prompt in `docs/prompts/`,
persona reviews of the built product in `docs/reviews/`, and design and code
rules in `docs/BUILD-CHARTER.md`.
