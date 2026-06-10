# Vixio Studio

A local-first AI filmmaking workspace for Vixio Creatives. Develop a script,
cast characters, storyboard shots, direct AI image and video generation, and
assemble the cut, all in the browser.

## The pipeline

1. **Script** - write a logline, generate or hand-write scenes in screenplay form.
2. **Cast** - characters with appearance and wardrobe anchors; generate portraits.
3. **Board** - break scenes into shots: size, angle, lens, lighting, movement, duration.
4. **Frames** - the frame lab: an artcraft-style control surface per shot with an
   editable composed prompt, camera controls, character reference ingredients,
   seed lock, batch takes, and a take history rail.
5. **Motion** - image-to-video per shot: motion presets, duration, start frame.
6. **Cut** - timeline playback with dialogue captions, contact-sheet export,
   and cut-data export.

## Providers

Everything works offline out of the box through the built-in preview
providers (a deterministic script writer, a seeded cinematic frame renderer,
and a Ken Burns animatic recorder). Add a Google AI Studio key in Settings to
generate with Gemini (text), Gemini image, and Veo (video). Keys never leave
the browser.

## Running it

```bash
npm install
npm run dev      # http://localhost:5180
npm run build
npm run typecheck
```

## Stack and lineage

Vite, React 19, TypeScript (strict), Tailwind v4, Zustand, react-router,
feedback-only motion, Phosphor icons. Persistence: localStorage for project
data, IndexedDB for generated media.

Studied and reinterpreted from three references: 869413421/ai-moive-studio
(novel-to-movie pipeline), HBAI-Ltd/Toonflow-app (staged short-drama factory
and prompt system), and storytold/artcraft (control-first generation UX).
Study reports live in `docs/study/`. Design and code rules live in
`docs/BUILD-CHARTER.md`.
