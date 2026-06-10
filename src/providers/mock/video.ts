import { aspectRatioToDimensions } from "@/domain/constants";
import { createRng } from "@/lib/random";
import { appError, err, ok } from "@/lib/result";

import type { Result } from "@/lib/result";
import type { VideoProvider, VideoResult } from "../types";

/**
 * Offline preview animatic. Records a Ken Burns style move over the shot's
 * start frame in real time with canvas.captureStream and MediaRecorder. The
 * requested camera movement maps to a zoom and drift path; cover-fit math
 * keeps the frame filled with no letterboxing. Without a start frame it
 * animates a seeded gradient field instead, so the pipeline always produces
 * a playable clip.
 */

const previewVideoCopy = {
  recorderUnsupported:
    "This browser does not support MediaRecorder, so the preview animatic cannot record",
  captureUnsupported:
    "This browser cannot capture a canvas stream, so the preview animatic cannot record",
  canvasUnavailable: "A 2d drawing context could not be created for the preview animatic",
  startFrameFailed: "The start frame image could not be loaded for the preview animatic",
  recordingFailed: "Canvas recording stopped before the clip could be finished",
} as const;

type CameraFrame = { zoom: number; dx: number; dy: number };
type CameraPath = (t: number) => CameraFrame;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const toEven = (value: number): number => {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
};

const clampDuration = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.min(10, Math.max(1, value));
};

/* ------------------------------------------------------------------ */
/* Camera movement mapping                                             */
/* ------------------------------------------------------------------ */

const buildCameraPath = (
  movement: string,
  width: number,
  height: number,
  rng: () => number,
): CameraPath => {
  const panX = width * 0.025;
  const tiltY = height * 0.025;
  switch (movement) {
    case "push-in":
      return (t) => ({ zoom: lerp(1, 1.15, t), dx: 0, dy: 0 });
    case "pull-out":
      return (t) => ({ zoom: lerp(1.15, 1, t), dx: 0, dy: 0 });
    case "pan-left":
      return (t) => ({ zoom: 1.08, dx: lerp(-panX, panX, t), dy: 0 });
    case "pan-right":
      return (t) => ({ zoom: 1.08, dx: lerp(panX, -panX, t), dy: 0 });
    case "tilt-up":
      return (t) => ({ zoom: 1.08, dx: 0, dy: lerp(-tiltY, tiltY, t) });
    case "tilt-down":
      return (t) => ({ zoom: 1.08, dx: 0, dy: lerp(tiltY, -tiltY, t) });
    case "tracking": {
      const direction = rng() < 0.5 ? 1 : -1;
      return (t) => ({ zoom: 1.12, dx: lerp(-1, 1, t) * width * 0.045 * direction, dy: 0 });
    }
    case "orbit":
      return (t) => ({
        zoom: 1.06,
        dx: Math.sin(t * Math.PI * 2) * width * 0.02,
        dy: Math.sin(t * Math.PI) * height * 0.012,
      });
    case "handheld": {
      const frequencyX = 5 + rng() * 4;
      const frequencyY = 6 + rng() * 4;
      const phaseX = rng() * Math.PI * 2;
      const phaseY = rng() * Math.PI * 2;
      return (t) => ({
        zoom: 1.05,
        dx: Math.sin(t * frequencyX * Math.PI * 2 + phaseX) * 2,
        dy: Math.cos(t * frequencyY * Math.PI * 2 + phaseY) * 1.5,
      });
    }
    case "crane-up":
      return (t) => ({ zoom: lerp(1.04, 1.12, t), dx: 0, dy: lerp(-tiltY, tiltY * 1.4, t) });
    case "static":
    default:
      return (t) => ({ zoom: lerp(1, 1.01, t), dx: 0, dy: 0 });
  }
};

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

/** Cover-fit draw: the source always fills the canvas, drift is clamped. */
const drawCoverFrame = (input: {
  ctx: CanvasRenderingContext2D;
  source: HTMLImageElement | HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  frame: CameraFrame;
}): void => {
  const { ctx, source, sourceWidth, sourceHeight, width, height, frame } = input;
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * frame.zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const maxDx = Math.max(0, (drawWidth - width) / 2);
  const maxDy = Math.max(0, (drawHeight - height) / 2);
  const dx = Math.min(maxDx, Math.max(-maxDx, frame.dx));
  const dy = Math.min(maxDy, Math.max(-maxDy, frame.dy));
  ctx.drawImage(
    source,
    (width - drawWidth) / 2 + dx,
    (height - drawHeight) / 2 + dy,
    drawWidth,
    drawHeight,
  );
};

/** Seeded gradient field used when the shot has no start frame yet. */
const buildGradientField = (
  width: number,
  height: number,
  seed: number,
): HTMLCanvasElement | null => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;

  const rng = createRng(seed);
  const hueA = Math.floor(rng() * 360);
  const hueB = (hueA + 140 + Math.floor(rng() * 80)) % 360;
  const flip = rng() < 0.5;

  const grade = ctx.createLinearGradient(flip ? width : 0, 0, flip ? 0 : width, height);
  grade.addColorStop(0, `hsl(${hueA}, 45%, 14%)`);
  grade.addColorStop(0.55, `hsl(${hueA}, 38%, 26%)`);
  grade.addColorStop(1, `hsl(${hueB}, 42%, 38%)`);
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, width, height);

  const glowX = (rng() < 0.5 ? 1 : 2) * (width / 3);
  const glowY = height * (0.3 + rng() * 0.2);
  const radius = Math.max(width, height) * (0.5 + rng() * 0.2);
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, radius);
  glow.addColorStop(0, `hsla(${hueB}, 60%, 62%, 0.45)`);
  glow.addColorStop(1, `hsla(${hueB}, 60%, 62%, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  return canvas;
};

const loadImage = (url: string): Promise<Result<HTMLImageElement>> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(ok(image));
    image.onerror = () =>
      resolve(err(appError("provider-request-failed", previewVideoCopy.startFrameFailed)));
    image.src = url;
  });

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const previewVideoProvider: VideoProvider = {
  id: "vixio-preview",
  name: "Vixio preview animatic",

  generateVideo: async (request, onProgress) => {
    if (typeof MediaRecorder === "undefined") {
      return err(appError("provider-request-failed", previewVideoCopy.recorderUnsupported));
    }

    const base = aspectRatioToDimensions(request.aspectRatio);
    const longest = Math.max(base.width, base.height);
    const scale = longest > 960 ? 960 / longest : 1;
    const width = toEven(base.width * scale);
    const height = toEven(base.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    if (typeof canvas.captureStream !== "function") {
      return err(appError("provider-request-failed", previewVideoCopy.captureUnsupported));
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return err(appError("provider-request-failed", previewVideoCopy.canvasUnavailable));
    }
    ctx.imageSmoothingQuality = "high";

    let source: HTMLImageElement | HTMLCanvasElement;
    let sourceWidth: number;
    let sourceHeight: number;
    if (request.startFrameUrl !== null) {
      const loaded = await loadImage(request.startFrameUrl);
      if (!loaded.ok) return loaded;
      source = loaded.value;
      sourceWidth = loaded.value.naturalWidth > 0 ? loaded.value.naturalWidth : width;
      sourceHeight = loaded.value.naturalHeight > 0 ? loaded.value.naturalHeight : height;
    } else {
      const field = buildGradientField(width, height, request.seed);
      if (field === null) {
        return err(appError("provider-request-failed", previewVideoCopy.canvasUnavailable));
      }
      source = field;
      sourceWidth = field.width;
      sourceHeight = field.height;
    }

    const rng = createRng(request.seed);
    const camera = buildCameraPath(request.movement, width, height, rng);
    const durationSeconds = clampDuration(request.durationSeconds);
    const durationMs = durationSeconds * 1000;

    const mimeType =
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

    // captureStream(0) + explicit requestFrame pushes every drawn frame even
    // when the canvas is off-DOM or the tab is throttled; auto-capture at a
    // fixed fps silently records nothing in those cases.
    const supportsRequestFrame = "CanvasCaptureMediaStreamTrack" in window;
    const stream = supportsRequestFrame
      ? canvas.captureStream(0)
      : canvas.captureStream(30);
    const videoTrack = stream.getVideoTracks()[0];
    const pushFrame =
      videoTrack && "requestFrame" in videoTrack
        ? () => (videoTrack as CanvasCaptureMediaStreamTrack).requestFrame()
        : null;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    } catch (cause) {
      for (const track of stream.getTracks()) track.stop();
      return err(appError("provider-request-failed", previewVideoCopy.recordingFailed, cause));
    }

    return await new Promise<Result<VideoResult>>((resolve) => {
      const chunks: BlobPart[] = [];
      let intervalId = 0;
      let settled = false;
      let stopping = false;

      const renderFrame = (t: number): void => {
        ctx.fillStyle = "#101418";
        ctx.fillRect(0, 0, width, height);
        drawCoverFrame({ ctx, source, sourceWidth, sourceHeight, width, height, frame: camera(t) });
        if (pushFrame !== null) pushFrame();
      };

      // Watchdog: if frame callbacks stall (hidden tab), finish with what we have.
      const watchdog = setTimeout(() => {
        if (!stopping && recorder.state !== "inactive") {
          stopping = true;
          recorder.stop();
        }
      }, durationMs + 4000);

      const cleanup = (): void => {
        clearTimeout(watchdog);
        clearInterval(intervalId);
        for (const track of stream.getTracks()) track.stop();
      };

      const fail = (message: string, cause?: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // Recorder already torn down; nothing left to stop.
          }
        }
        resolve(err(appError("provider-request-failed", message, cause)));
      };

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => fail(previewVideoCopy.recordingFailed);
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const blob = new Blob(chunks, { type: mimeType });
        onProgress(1);
        resolve(ok({ url: URL.createObjectURL(blob), width, height, durationSeconds }));
      };

      const startedAt = performance.now();
      // setInterval instead of requestAnimationFrame: rAF stops entirely in
      // hidden or occluded tabs, which froze recordings at frame zero.
      const tick = (): void => {
        if (settled || stopping) return;
        const elapsed = performance.now() - startedAt;
        const t = Math.min(1, elapsed / durationMs);
        onProgress(Math.min(0.99, t));
        renderFrame(t);
        if (elapsed >= durationMs) {
          stopping = true;
          clearInterval(intervalId);
          if (recorder.state !== "inactive") recorder.stop();
        }
      };

      try {
        recorder.start(250);
      } catch (cause) {
        fail(previewVideoCopy.recordingFailed, cause);
        return;
      }
      renderFrame(0);
      intervalId = window.setInterval(tick, 1000 / 30);
    });
  },
};
