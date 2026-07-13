#!/usr/bin/env node
/**
 * Live provider contract smoke checks.
 *
 * Verifies the exact request bodies and response shapes the src providers
 * rely on, against the real APIs. Plain Node 20+ with global fetch, zero
 * dependencies, and no imports from src/ so it runs before the app builds.
 *
 * Usage:
 *   node scripts/live-smoke.mjs                       run all cheap checks
 *   node scripts/live-smoke.mjs --list                list check ids
 *   node scripts/live-smoke.mjs --only id1,id2        run a subset
 *   node scripts/live-smoke.mjs --include-expensive   also run paid video checks
 *
 * Keys come from the environment and are never printed:
 *   FAL_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY, MESHY_API_KEY
 *   (MESHY_API_KEY falls back to Meshy's documented test key).
 *
 * The driving-video check needs an ffmpeg that can encode a tiny mp4
 * (lavfi + libx264). Set FFMPEG_PATH when the default candidates cannot.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const FAL_KEY = (process.env.FAL_KEY ?? "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? "").trim();
const ELEVENLABS_API_KEY = (process.env.ELEVENLABS_API_KEY ?? "").trim();
const MESHY_API_KEY =
  (process.env.MESHY_API_KEY ?? "").trim() ||
  "msy_dummy_api_key_for_test_mode_12345678";

const SECRETS = [FAL_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY].filter(
  (value) => value.length > 0,
);

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const FAL_SYNC_BASE = "https://fal.run";
const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_REST_BASE = "https://rest.alpha.fal.ai";
const ELEVENLABS_BASE = "https://api.elevenlabs.io";
const MESHY_BASE = "https://api.meshy.ai";

const QUEUE_POLL_MS = 5_000;
const QUEUE_MAX_MS = 12 * 60_000;

/**
 * 640x360 gray png (16:9), used for storage upload and as a start frame.
 * Live finding 2026-07-13: kling v3 rejects start images smaller than
 * 300x300 (error code image_too_small), so the seed exceeds that.
 */
const SEED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAoAAAAFoCAIAAABIUN0GAAAACXBIWXMAAAABAAAAAQBPJcTWAAAGxUlEQVR4nO3OQQEAMBACIKMv+lqcDyEBeQDAubQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIvSDgDAorQDALAo7QAALEo7AACL0g4AwKK0AwCwKO0AACxKOwAAi9IOAMCitAMAsCjtAAAsSjsAAIs+vgNPG4NL114AAAAASUVORK5CYII=";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** A check failed against the live API; carries printable evidence. */
class CheckFailure extends Error {
  constructor(message, detail = "") {
    super(message);
    this.detail = detail;
  }
}

const scrub = (text) => {
  let out = String(text);
  for (const secret of SECRETS) out = out.split(secret).join("<redacted>");
  return out;
};

const truncate = (text, max = 700) =>
  text.length > max ? `${text.slice(0, max)}... (${text.length} chars)` : text;

/** Sorted top-level keys of a JSON payload: the response shape fingerprint. */
const fingerprint = (payload) => {
  if (payload === null || typeof payload !== "object") return typeof payload;
  if (Array.isArray(payload)) return `array(${payload.length})`;
  return Object.keys(payload).sort().join(",");
};

const request = async (url, { method = "POST", headers = {}, body } = {}) => {
  const response = await fetch(url, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof Uint8Array
          ? body
          : JSON.stringify(body),
  });
  const raw = await response.arrayBuffer();
  const text = new TextDecoder().decode(raw);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type") ?? "",
    bytes: raw.byteLength,
    json,
    text,
  };
};

const expectOk = (label, res) => {
  if (res.ok) return;
  throw new CheckFailure(
    `${label} returned status ${res.status}`,
    `status=${res.status} body=${truncate(scrub(res.text))}`,
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Dotted path of the first mp4-looking url in a payload, for the report. */
const findVideoUrlPath = (payload, path = "", depth = 0) => {
  if (depth > 4 || payload === null || typeof payload !== "object") return null;
  for (const [key, value] of Object.entries(payload)) {
    const here = path.length > 0 ? `${path}.${key}` : key;
    if (
      typeof value === "string" &&
      value.startsWith("http") &&
      (value.includes(".mp4") || key === "video_url" || path.endsWith("video"))
    ) {
      return here;
    }
    const nested = findVideoUrlPath(value, here, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* fal storage (mirrors uploadToFalStorage in src/providers/fal/shared.ts) */
/* ------------------------------------------------------------------ */

let tokenRouteNote = null;

const falStorageToken = async () => {
  // Primary route: v3 CDN token.
  const primary = await request(
    `${FAL_REST_BASE}/storage/auth/token?storage_type=fal-cdn-v3`,
    {
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: {},
    },
  );
  if (primary.ok && primary.json !== null) {
    tokenRouteNote = "token route: ?storage_type=fal-cdn-v3";
    return primary.json;
  }
  if (primary.status !== 404) expectOk("storage token", primary);
  // Alternative route: no storage_type query.
  const alt = await request(`${FAL_REST_BASE}/storage/auth/token`, {
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: {},
  });
  expectOk("storage token (alternative route)", alt);
  tokenRouteNote = "token route: no query (v3 route 404ed)";
  return alt.json;
};

const uploadToFalStorage = async (bytes, contentType, fileName) => {
  const grant = await falStorageToken();
  const token = grant?.token;
  const baseUrl = grant?.base_url;
  if (typeof token !== "string" || typeof baseUrl !== "string") {
    throw new CheckFailure(
      "storage token response missing token/base_url",
      `keys=${fingerprint(grant)}`,
    );
  }
  const uploaded = await request(`${baseUrl}/files/upload`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "X-Fal-File-Name": fileName,
    },
    body: bytes,
  });
  expectOk("storage upload", uploaded);
  const accessUrl = uploaded.json?.access_url;
  if (typeof accessUrl !== "string") {
    throw new CheckFailure(
      "storage upload response missing access_url",
      `keys=${fingerprint(uploaded.json)}`,
    );
  }
  return { accessUrl, grantKeys: fingerprint(grant), uploadKeys: fingerprint(uploaded.json) };
};

let cachedSeedImageUrl = null;
const ensureSeedImageUrl = async () => {
  if (cachedSeedImageUrl === null) {
    const bytes = Uint8Array.from(Buffer.from(SEED_PNG_BASE64, "base64"));
    const { accessUrl } = await uploadToFalStorage(bytes, "image/png", "smoke-seed.png");
    cachedSeedImageUrl = accessUrl;
  }
  return cachedSeedImageUrl;
};

/* ------------------------------------------------------------------ */
/* ffmpeg mp4 generation for the driving-video check                   */
/* ------------------------------------------------------------------ */

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH ?? "",
  "ffmpeg",
  "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux",
].filter((candidate) => candidate.length > 0);

const generateDrivingMp4 = () => {
  const dir = mkdtempSync(join(tmpdir(), "vixio-smoke-"));
  const outPath = join(dir, "drive.mp4");
  const failures = [];
  for (const candidate of FFMPEG_CANDIDATES) {
    const run = spawnSync(
      candidate,
      [
        "-y",
        "-loglevel", "error",
        "-f", "lavfi",
        "-i", "color=c=gray:s=320x180:d=2:r=24",
        "-pix_fmt", "yuv420p",
        outPath,
      ],
      { encoding: "utf8" },
    );
    if (run.status === 0 && existsSync(outPath)) return readFileSync(outPath);
    failures.push(`${candidate}: ${scrub(run.stderr ?? run.error?.message ?? "not runnable").trim().slice(0, 120)}`);
  }
  throw new CheckFailure(
    "no ffmpeg candidate could encode the driving mp4 (set FFMPEG_PATH)",
    failures.join(" | "),
  );
};

/* ------------------------------------------------------------------ */
/* fal queue polling (mirrors pollForVideo in src/providers/fal/video.ts) */
/* ------------------------------------------------------------------ */

const pollFalQueue = async (submitJson) => {
  const statusUrl = submitJson?.status_url;
  const responseUrl = submitJson?.response_url;
  if (typeof statusUrl !== "string" || typeof responseUrl !== "string") {
    throw new CheckFailure(
      "queue submit response missing status_url/response_url",
      `keys=${fingerprint(submitJson)}`,
    );
  }
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > QUEUE_MAX_MS) {
      throw new CheckFailure("queue job did not finish in time");
    }
    const status = await request(statusUrl, {
      method: "GET",
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    expectOk("queue status", status);
    const state = status.json?.status;
    if (state === "COMPLETED") {
      const result = await request(responseUrl, {
        method: "GET",
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      expectOk("queue result", result);
      return result.json;
    }
    if (state === "FAILED" || state === "ERROR") {
      // The response endpoint carries fal's own error detail; surface it.
      const result = await request(responseUrl, {
        method: "GET",
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      throw new CheckFailure(
        `queue job ended ${state}`,
        `status=${result.status} body=${truncate(scrub(result.text))}`,
      );
    }
    await sleep(QUEUE_POLL_MS);
  }
};

/* ------------------------------------------------------------------ */
/* Check implementations                                               */
/* ------------------------------------------------------------------ */

const geminiHeaders = {
  "x-goog-api-key": GEMINI_API_KEY,
  "Content-Type": "application/json",
};

const CHECKS = [
  {
    id: "gemini-text",
    expensive: false,
    skip: () => (GEMINI_API_KEY.length === 0 ? "GEMINI_API_KEY not set" : null),
    // Mirrors src/providers/gemini/text.ts (generateContent with JSON output).
    run: async () => {
      const res = await request(
        `${GEMINI_BASE}/models/gemini-2.5-flash:generateContent`,
        {
          headers: geminiHeaders,
          body: {
            contents: [
              { role: "user", parts: [{ text: "Reply with the single word check." }] },
            ],
          },
        },
      );
      expectOk("gemini text", res);
      return { keys: fingerprint(res.json) };
    },
  },
  {
    id: "gemini-image",
    expensive: false,
    skip: () => (GEMINI_API_KEY.length === 0 ? "GEMINI_API_KEY not set" : null),
    // Mirrors src/providers/gemini/image.ts (responseModalities IMAGE).
    run: async () => {
      const res = await request(
        `${GEMINI_BASE}/models/gemini-2.5-flash-image:generateContent`,
        {
          headers: geminiHeaders,
          body: {
            contents: [
              {
                role: "user",
                parts: [{ text: "A gray room, composition framed for 16:9" }],
              },
            ],
            generationConfig: { responseModalities: ["IMAGE"] },
          },
        },
      );
      expectOk("gemini image", res);
      return { keys: fingerprint(res.json) };
    },
  },
  {
    id: "gemini-veo",
    expensive: true,
    skip: () => (GEMINI_API_KEY.length === 0 ? "GEMINI_API_KEY not set" : null),
    // Mirrors src/providers/gemini/video.ts (predictLongRunning + operation poll).
    run: async () => {
      const submit = await request(
        `${GEMINI_BASE}/models/veo-3.1-fast-generate-001:predictLongRunning`,
        {
          headers: geminiHeaders,
          body: {
            instances: [{ prompt: "Slow push in on a gray room." }],
            parameters: { aspectRatio: "16:9", durationSeconds: 4 },
          },
        },
      );
      expectOk("veo submit", submit);
      const operationName = submit.json?.name;
      if (typeof operationName !== "string") {
        throw new CheckFailure("veo submit returned no operation name", `keys=${fingerprint(submit.json)}`);
      }
      const startedAt = Date.now();
      for (;;) {
        if (Date.now() - startedAt > QUEUE_MAX_MS) {
          throw new CheckFailure("veo operation did not finish in time");
        }
        await sleep(8_000);
        const poll = await request(`${GEMINI_BASE}/${operationName}`, {
          method: "GET",
          headers: { "x-goog-api-key": GEMINI_API_KEY },
        });
        expectOk("veo poll", poll);
        if (poll.json?.done === true) {
          if (poll.json.error !== undefined) {
            throw new CheckFailure("veo operation failed", truncate(scrub(JSON.stringify(poll.json.error))));
          }
          const path = findVideoUrlPath(poll.json.response) ?? "not found";
          return { keys: fingerprint(poll.json), note: `video uri at response.${path}` };
        }
      }
    },
  },
  {
    id: "fal-storage",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors uploadToFalStorage in src/providers/fal/shared.ts.
    run: async () => {
      const bytes = Uint8Array.from(Buffer.from(SEED_PNG_BASE64, "base64"));
      const { accessUrl, grantKeys, uploadKeys } = await uploadToFalStorage(
        bytes,
        "image/png",
        "smoke-seed.png",
      );
      cachedSeedImageUrl = accessUrl;
      return {
        keys: uploadKeys,
        note: `${tokenRouteNote}; token keys=${grantKeys}`,
      };
    },
  },
  {
    id: "fal-image-default",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors buildImageBody (flux family) in src/providers/fal/image.ts.
    run: async () => {
      const res = await request(`${FAL_SYNC_BASE}/fal-ai/flux-2`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: {
          prompt: "A gray room, cinematic still",
          image_size: "landscape_16_9",
          num_images: 1,
          seed: 7,
          enable_safety_checker: false,
        },
      });
      expectOk("flux-2", res);
      const first = res.json?.images?.[0];
      return {
        keys: fingerprint(res.json),
        note: `images[0] keys=${fingerprint(first)}`,
      };
    },
  },
  {
    id: "fal-image-refs",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors the reference routing in src/providers/fal/image.ts (flux-2/edit).
    run: async () => {
      const referenceUrl = await ensureSeedImageUrl();
      const res = await request(`${FAL_SYNC_BASE}/fal-ai/flux-2/edit`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: {
          prompt: "The same gray room, brighter light",
          image_urls: [referenceUrl],
          image_size: "landscape_16_9",
          seed: 7,
        },
      });
      expectOk("flux-2/edit", res);
      return { keys: fingerprint(res.json) };
    },
  },
  {
    id: "fal-image-nano",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors buildImageBody (nano-banana family) in src/providers/fal/image.ts.
    run: async () => {
      const res = await request(`${FAL_SYNC_BASE}/fal-ai/nano-banana-pro`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: { prompt: "A gray room, cinematic still", aspect_ratio: "16:9" },
      });
      expectOk("nano-banana-pro", res);
      const first = res.json?.images?.[0];
      return {
        keys: fingerprint(res.json),
        note: `images[0] keys=${fingerprint(first)}`,
      };
    },
  },
  {
    id: "fal-speech",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors generateSpeech in src/providers/fal/audio.ts.
    run: async () => {
      const res = await request(`${FAL_SYNC_BASE}/fal-ai/elevenlabs/tts/eleven-v3`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: { text: "Check." },
      });
      expectOk("fal tts", res);
      return { keys: fingerprint(res.json) };
    },
  },
  {
    id: "fal-speech-voice",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors the voice field generateSpeech sends in src/providers/fal/audio.ts.
    run: async () => {
      const res = await request(`${FAL_SYNC_BASE}/fal-ai/elevenlabs/tts/eleven-v3`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: { text: "Check.", voice: "Rachel" },
      });
      expectOk("fal tts voice", res);
      return { keys: fingerprint(res.json), note: "voice field accepted" };
    },
  },
  {
    id: "fal-sfx",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors generateTrack (ambience lane) in src/providers/fal/audio.ts.
    // Live finding 2026-07-13: the unversioned fal-ai/elevenlabs/sound-effects
    // endpoint 400s (it pins the retired upstream model eleven_text_to_sound_v0
    // and ignores model_id overrides); the /v2 route works with the same body.
    run: async () => {
      const res = await request(`${FAL_SYNC_BASE}/fal-ai/elevenlabs/sound-effects/v2`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: { text: "door creak", duration_seconds: 0.5 },
      });
      expectOk("fal sfx", res);
      return { keys: fingerprint(res.json) };
    },
  },
  {
    id: "fal-music",
    expensive: false,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors generateTrack (music lane) in src/providers/fal/audio.ts.
    run: async () => {
      const res = await request(`${FAL_SYNC_BASE}/fal-ai/elevenlabs/music`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: { prompt: "calm piano", music_length_ms: 10000 },
      });
      expectOk("fal music", res);
      return { keys: fingerprint(res.json) };
    },
  },
  {
    id: "fal-video-default",
    expensive: true,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors buildVideoSubmitBody (kling-video/v3 family) in src/providers/fal/video.ts.
    run: async () => {
      const startImageUrl = await ensureSeedImageUrl();
      const submit = await request(
        `${FAL_QUEUE_BASE}/fal-ai/kling-video/v3/standard/image-to-video`,
        {
          headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
          body: {
            prompt: "Slow push in. A gray room.",
            start_image_url: startImageUrl,
            duration: "5",
            generate_audio: false,
          },
        },
      );
      expectOk("kling submit", submit);
      const result = await pollFalQueue(submit.json);
      const path = findVideoUrlPath(result) ?? "not found";
      return {
        keys: fingerprint(result),
        note: `submit keys=${fingerprint(submit.json)}; video url at ${path}`,
      };
    },
  },
  {
    id: "fal-video-driving",
    expensive: true,
    skip: () => (FAL_KEY.length === 0 ? "FAL_KEY not set" : null),
    // Mirrors the driving path (seedance family) in src/providers/fal/video.ts.
    run: async () => {
      const mp4 = generateDrivingMp4();
      const { accessUrl } = await uploadToFalStorage(
        Uint8Array.from(mp4),
        "video/mp4",
        "smoke-drive.mp4",
      );
      const body = {
        prompt: "Follow the camera of @Video1. A gray room.",
        video_urls: [accessUrl],
        duration: 4,
        resolution: "480p",
        aspect_ratio: "16:9",
        generate_audio: false,
      };
      let endpoint = "bytedance/seedance-2.0/fast/reference-to-video";
      let submit = await request(`${FAL_QUEUE_BASE}/${endpoint}`, {
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body,
      });
      if (submit.status === 404) {
        endpoint = "bytedance/seedance-2.0/reference-to-video";
        submit = await request(`${FAL_QUEUE_BASE}/${endpoint}`, {
          headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
          body,
        });
      }
      expectOk("seedance submit", submit);
      const result = await pollFalQueue(submit.json);
      const path = findVideoUrlPath(result) ?? "not found";
      return {
        keys: fingerprint(result),
        note: `endpoint=${endpoint}; submit keys=${fingerprint(submit.json)}; video url at ${path}`,
      };
    },
  },
  {
    id: "el-speech",
    expensive: false,
    skip: () =>
      ELEVENLABS_API_KEY.length === 0 ? "ELEVENLABS_API_KEY not set" : null,
    // Mirrors generateSpeech in src/providers/elevenlabs/audio.ts (binary mp3 response).
    run: async () => {
      const res = await request(
        `${ELEVENLABS_BASE}/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
        {
          headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
          body: { text: "Check.", model_id: "eleven_multilingual_v2" },
        },
      );
      expectOk("elevenlabs tts", res);
      return { keys: `binary ${res.contentType}`, note: `${res.bytes} bytes` };
    },
  },
  {
    id: "el-sfx",
    expensive: false,
    skip: () =>
      ELEVENLABS_API_KEY.length === 0 ? "ELEVENLABS_API_KEY not set" : null,
    // Mirrors generateTrack (ambience lane) in src/providers/elevenlabs/audio.ts.
    run: async () => {
      const res = await request(`${ELEVENLABS_BASE}/v1/sound-generation`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: { text: "door creak", duration_seconds: 0.5, loop: true },
      });
      expectOk("elevenlabs sfx", res);
      return { keys: `binary ${res.contentType}`, note: `${res.bytes} bytes` };
    },
  },
  {
    id: "el-music",
    expensive: false,
    skip: () =>
      ELEVENLABS_API_KEY.length === 0 ? "ELEVENLABS_API_KEY not set" : null,
    // Mirrors generateTrack (music lane) in src/providers/elevenlabs/audio.ts.
    run: async () => {
      const res = await request(`${ELEVENLABS_BASE}/v1/music`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: { prompt: "calm piano", music_length_ms: 10000 },
      });
      expectOk("elevenlabs music", res);
      return { keys: `binary ${res.contentType}`, note: `${res.bytes} bytes` };
    },
  },
  {
    id: "meshy-canned",
    expensive: false,
    skip: () => null,
    // Mirrors createTextTo3dPreview/getTask/getBalance in src/providers/meshy/client.ts.
    run: async () => {
      const headers = {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      };
      const created = await request(`${MESHY_BASE}/openapi/v2/text-to-3d`, {
        headers,
        body: { mode: "preview", prompt: "a small cube" },
      });
      expectOk("meshy create", created);
      const taskId = created.json?.result;
      if (typeof taskId !== "string") {
        throw new CheckFailure("meshy create returned no task id", `keys=${fingerprint(created.json)}`);
      }
      const startedAt = Date.now();
      let task = null;
      for (;;) {
        if (Date.now() - startedAt > 120_000) {
          throw new CheckFailure("meshy task did not settle in time", `last status=${task?.json?.status}`);
        }
        task = await request(
          `${MESHY_BASE}/openapi/v2/text-to-3d/${encodeURIComponent(taskId)}`,
          { method: "GET", headers: { Authorization: `Bearer ${MESHY_API_KEY}` } },
        );
        expectOk("meshy task", task);
        const status = task.json?.status;
        if (status === "SUCCEEDED") break;
        if (status === "FAILED" || status === "CANCELED") {
          throw new CheckFailure(`meshy task ended ${status}`, truncate(scrub(task.text)));
        }
        await sleep(2_000);
      }
      const balance = await request(`${MESHY_BASE}/openapi/v1/balance`, {
        method: "GET",
        headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
      });
      expectOk("meshy balance", balance);
      return {
        keys: fingerprint(task.json),
        note: `balance keys=${fingerprint(balance.json)}; model_urls keys=${fingerprint(task.json?.model_urls)}`,
      };
    },
  },
];

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

const parseArgs = (argv) => {
  const args = { list: false, includeExpensive: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") args.list = true;
    else if (arg === "--include-expensive") args.includeExpensive = true;
    else if (arg === "--only") {
      args.only = (argv[i + 1] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      i += 1;
    } else if (arg.startsWith("--only=")) {
      args.only = arg.slice("--only=".length).split(",").map((id) => id.trim()).filter(Boolean);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    for (const check of CHECKS) {
      console.log(`${check.id}${check.expensive ? "  (expensive)" : ""}`);
    }
    return;
  }

  if (args.only !== null) {
    const known = new Set(CHECKS.map((check) => check.id));
    const unknown = args.only.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      console.error(`Unknown check ids: ${unknown.join(", ")}`);
      process.exit(2);
    }
  }

  const selected = CHECKS.filter(
    (check) => args.only === null || args.only.includes(check.id),
  );

  let failed = 0;
  for (const check of selected) {
    if (check.expensive && !args.includeExpensive) {
      console.log(`SKIP  ${check.id.padEnd(20)} expensive, pass --include-expensive`);
      continue;
    }
    const skipReason = check.skip();
    if (skipReason !== null) {
      console.log(`SKIP  ${check.id.padEnd(20)} ${skipReason}`);
      continue;
    }
    const startedAt = Date.now();
    try {
      const outcome = await check.run();
      const elapsed = Date.now() - startedAt;
      const note = outcome.note ? `  ${scrub(outcome.note)}` : "";
      console.log(
        `PASS  ${check.id.padEnd(20)} ${String(elapsed).padStart(6)}ms  keys=${scrub(outcome.keys ?? "")}${note}`,
      );
    } catch (cause) {
      failed += 1;
      const elapsed = Date.now() - startedAt;
      const message = cause instanceof Error ? cause.message : String(cause);
      const detail = cause instanceof CheckFailure && cause.detail ? `  ${cause.detail}` : "";
      console.log(
        `FAIL  ${check.id.padEnd(20)} ${String(elapsed).padStart(6)}ms  ${scrub(message)}${scrub(detail)}`,
      );
    }
  }

  if (failed > 0) process.exit(1);
};

await main();
