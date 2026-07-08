import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";

import { aspectRatioToDimensions } from "@/domain/constants";
import type {
  Asset,
  AudioTrack,
  Project,
  Scene,
  Shot,
} from "@/domain/types";
import type { AssetId } from "@/lib/id";
import {
  appError,
  err,
  messageFromUnknown,
  ok,
  type Result,
} from "@/lib/result";

import { MIX_SAMPLE_RATE, mixCutAudio, type RenderCue, type RenderLoop } from "./audioMix";

/**
 * In-browser final render. Draws every shot in cut order onto an offscreen
 * canvas at 24fps (video frames seeked and drawn, stills with a slow Ken
 * Burns push, bare shots as a slate card), burns dialogue as a lower-third
 * caption, fades to black across scene boundaries, mixes the full audio bed
 * offline at 48kHz, and muxes with mediabunny. mp4 with avc is preferred
 * when the runtime encoder supports it; otherwise webm with vp9 or vp8.
 */

export const RENDER_FPS = 24;

/** Scene boundary transition: 0.25s out plus 0.25s in, fade to black. */
const FADE_SECONDS = 0.25;

/** A shot with nothing rendered plays as a short slate, matching the cut. */
const SLATE_SECONDS = 1.5;

const VIDEO_BITRATE = 5_000_000;
const AUDIO_BITRATE = 128_000;

const MONO_FONT = "'Geist Mono Variable', ui-monospace, monospace";
const BODY_FONT = "'Manrope Variable', ui-sans-serif, system-ui, sans-serif";
const CANVAS_BG = "#0c0d10";
const SLATE_TITLE_COLOR = "#e8eaed";
const SLATE_BODY_COLOR = "#9ba1a6";
const CAPTION_COLOR = "#f2f4f6";
const CAPTION_BOX = "rgba(10, 11, 14, 0.72)";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type RenderProgress = {
  /** 1-based frame counter. */
  frame: number;
  totalFrames: number;
};

export type RenderInput = {
  project: Project;
  scenes: readonly Scene[];
  /** Shots in cut order (global script order). */
  shots: readonly Shot[];
  assets: Record<AssetId, Asset>;
  tracks: readonly AudioTrack[];
};

export type RenderOptions = {
  onProgress?: (progress: RenderProgress) => void;
  /** Abort to cancel; the render resolves with a generation-cancelled error. */
  signal?: AbortSignal;
};

export type RenderOutput = {
  blob: Blob;
  container: "webm" | "mp4";
  videoCodec: VideoCodec;
  width: number;
  height: number;
  durationSeconds: number;
};

/* ------------------------------------------------------------------ */
/* Codec detection                                                     */
/* ------------------------------------------------------------------ */

type EncodeTarget = {
  container: "webm" | "mp4";
  videoCodec: VideoCodec;
  audioCodec: AudioCodec | null;
};

/**
 * Runtime probe through WebCodecs (VideoEncoder.isConfigSupported under the
 * hood): avc unlocks mp4, otherwise vp9 or vp8 in webm.
 */
const detectEncodeTarget = async (
  width: number,
  height: number,
): Promise<EncodeTarget | null> => {
  const audioOptions = { numberOfChannels: 2, sampleRate: MIX_SAMPLE_RATE };
  const avc = await getFirstEncodableVideoCodec(["avc"], { width, height });
  if (avc) {
    return {
      container: "mp4",
      videoCodec: avc,
      audioCodec: await getFirstEncodableAudioCodec(["aac", "opus"], audioOptions),
    };
  }
  const vp = await getFirstEncodableVideoCodec(["vp9", "vp8"], { width, height });
  if (!vp) return null;
  return {
    container: "webm",
    videoCodec: vp,
    audioCodec: await getFirstEncodableAudioCodec(["opus"], audioOptions),
  };
};

/* ------------------------------------------------------------------ */
/* Cut plan                                                            */
/* ------------------------------------------------------------------ */

type PlannedShot = {
  shot: Shot;
  kind: "video" | "image" | "slate";
  mediaUrl: string | null;
  dialogueUrl: string | null;
  /** Absolute start offset in seconds. */
  start: number;
  seconds: number;
  /** 1-based position across the whole cut, for slates. */
  number: number;
  fadeIn: boolean;
  fadeOut: boolean;
};

const buildPlan = (input: RenderInput): PlannedShot[] => {
  const plan: PlannedShot[] = [];
  let cursor = 0;
  input.shots.forEach((shot, position) => {
    const video = shot.videoAssetId ? input.assets[shot.videoAssetId] : undefined;
    const frame = shot.frameAssetId ? input.assets[shot.frameAssetId] : undefined;
    const dialogue = shot.dialogueAssetId
      ? input.assets[shot.dialogueAssetId]
      : undefined;
    const kind = video ? "video" : frame ? "image" : "slate";
    const seconds =
      kind === "video"
        ? (video?.duration ?? shot.durationSeconds)
        : kind === "image"
          ? shot.durationSeconds
          : SLATE_SECONDS;
    plan.push({
      shot,
      kind,
      mediaUrl: video?.url ?? frame?.url ?? null,
      dialogueUrl: dialogue?.url ?? null,
      start: cursor,
      seconds: Math.max(0.25, seconds),
      number: position + 1,
      fadeIn: false,
      fadeOut: false,
    });
    cursor += Math.max(0.25, seconds);
  });
  for (let position = 1; position < plan.length; position++) {
    const previous = plan[position - 1];
    const current = plan[position];
    if (!previous || !current) continue;
    if (previous.shot.sceneId !== current.shot.sceneId) {
      previous.fadeOut = true;
      current.fadeIn = true;
    }
  }
  return plan;
};

const planTotalSeconds = (plan: readonly PlannedShot[]): number => {
  const last = plan[plan.length - 1];
  return last ? last.start + last.seconds : 0;
};

/** 0..1 black overlay strength at local time `t` within a planned shot. */
const fadeAmount = (planned: PlannedShot, local: number): number => {
  let amount = 0;
  if (planned.fadeIn && local < FADE_SECONDS) {
    amount = Math.max(amount, 1 - local / FADE_SECONDS);
  }
  const untilEnd = planned.seconds - local;
  if (planned.fadeOut && untilEnd < FADE_SECONDS) {
    amount = Math.max(amount, 1 - untilEnd / FADE_SECONDS);
  }
  return Math.min(1, Math.max(0, amount));
};

/* ------------------------------------------------------------------ */
/* Media element helpers                                               */
/* ------------------------------------------------------------------ */

const once = (
  target: EventTarget,
  event: string,
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      target.removeEventListener(event, onEvent);
      resolve();
    }, timeoutMs);
    const onEvent = () => {
      window.clearTimeout(timer);
      resolve();
    };
    target.addEventListener(event, onEvent, { once: true });
  });

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });

const loadVideo = async (url: string): Promise<HTMLVideoElement | null> => {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  const failed = new Promise<null>((resolve) => {
    video.onerror = () => resolve(null);
  });
  const ready = once(video, "loadedmetadata", 5_000).then(() => video);
  const result = await Promise.race([ready, failed]);
  if (!result) return null;
  // MediaRecorder webms report an Infinite duration until forced to the end;
  // the far seek materializes the index so per-frame seeking works.
  if (!Number.isFinite(video.duration)) {
    video.currentTime = Number.MAX_SAFE_INTEGER;
    await once(video, "seeked", 3_000);
    video.currentTime = 0;
    await once(video, "seeked", 3_000);
  }
  return video;
};

const seekVideo = async (
  video: HTMLVideoElement,
  seconds: number,
): Promise<void> => {
  const duration = Number.isFinite(video.duration) ? video.duration : seconds;
  const target = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.001));
  if (Math.abs(video.currentTime - target) < 0.001) return;
  video.currentTime = target;
  await once(video, "seeked", 1_000);
};

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

type Drawable = HTMLVideoElement | HTMLImageElement;

const sourceSize = (source: Drawable): { width: number; height: number } =>
  source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.naturalWidth, height: source.naturalHeight };

/** Letterboxed fit; rendered clips keep their full frame like the stage. */
const drawContain = (
  context: CanvasRenderingContext2D,
  source: Drawable,
  width: number,
  height: number,
): void => {
  const size = sourceSize(source);
  if (size.width === 0 || size.height === 0) return;
  const scale = Math.min(width / size.width, height / size.height);
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  context.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
};

/** Drift directions picked deterministically from the shot seed. */
const KEN_BURNS_DRIFTS: readonly [number, number][] = [
  [-0.014, -0.01],
  [0.014, -0.01],
  [-0.014, 0.01],
  [0.014, 0.01],
];

/** Cover fit with a slow push: scale 1 to 1.06 plus a seeded drift. */
const drawKenBurns = (
  context: CanvasRenderingContext2D,
  source: Drawable,
  width: number,
  height: number,
  progress: number,
  seed: number,
): void => {
  const size = sourceSize(source);
  if (size.width === 0 || size.height === 0) return;
  const drift = KEN_BURNS_DRIFTS[Math.abs(seed) % 4] ?? [0, 0];
  const zoom = 1 + 0.06 * Math.min(1, Math.max(0, progress));
  const scale = Math.max(width / size.width, height / size.height) * zoom;
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  const offsetX = drift[0] * width * progress;
  const offsetY = drift[1] * height * progress;
  context.drawImage(
    source,
    (width - drawWidth) / 2 + offsetX,
    (height - drawHeight) / 2 + offsetY,
    drawWidth,
    drawHeight,
  );
};

/** Greedy word wrap; text past the line budget ends in an ellipsis. */
const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length > 0 ? `${current} ${word}` : word;
    if (current.length === 0 || context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      lines.push(`${current}…`);
      return lines;
    }
    lines.push(current);
    current = word;
  }
  lines.push(current);
  return lines;
};

const drawSlate = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  shotNumber: number,
  description: string,
): void => {
  const titleSize = Math.round(height * 0.05);
  const bodySize = Math.round(height * 0.032);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = SLATE_TITLE_COLOR;
  context.font = `700 ${titleSize}px ${MONO_FONT}`;
  const hasBody = description.trim().length > 0;
  const titleY = hasBody ? height * 0.44 : height * 0.5;
  context.fillText(`Shot ${shotNumber}`, width / 2, titleY);
  if (!hasBody) return;
  context.fillStyle = SLATE_BODY_COLOR;
  context.font = `400 ${bodySize}px ${BODY_FONT}`;
  const lines = wrapText(context, description, width * 0.68, 3);
  lines.forEach((line, lineIndex) => {
    context.fillText(
      line,
      width / 2,
      titleY + titleSize + lineIndex * bodySize * 1.5,
    );
  });
};

/** Lower-third caption: two-line wrap over a quiet box. */
const drawCaption = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
): void => {
  const fontSize = Math.round(height * 0.042);
  context.font = `500 ${fontSize}px ${BODY_FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = wrapText(context, text, width * 0.72, 2);
  if (lines.length === 0) return;
  const lineHeight = fontSize * 1.35;
  const padX = fontSize * 0.6;
  const padY = fontSize * 0.4;
  const boxWidth =
    Math.max(...lines.map((line) => context.measureText(line).width)) +
    padX * 2;
  const boxHeight = lines.length * lineHeight + padY * 2;
  const boxX = (width - boxWidth) / 2;
  const boxY = height - height * 0.06 - boxHeight;
  context.fillStyle = CAPTION_BOX;
  context.fillRect(boxX, boxY, boxWidth, boxHeight);
  context.fillStyle = CAPTION_COLOR;
  lines.forEach((line, lineIndex) => {
    context.fillText(
      line,
      width / 2,
      boxY + padY + lineHeight * (lineIndex + 0.5),
    );
  });
};

/* ------------------------------------------------------------------ */
/* Render pipeline                                                     */
/* ------------------------------------------------------------------ */

const cancelledError = () =>
  appError("generation-cancelled", "Render cancelled.");

export const renderFinalCut = async (
  input: RenderInput,
  options: RenderOptions = {},
): Promise<Result<RenderOutput>> => {
  const plan = buildPlan(input);
  if (plan.length === 0) {
    return err(appError("not-found", "There are no shots to render yet."));
  }
  const { width, height } = aspectRatioToDimensions(input.project.aspectRatio);
  const totalSeconds = planTotalSeconds(plan);
  const totalFrames = Math.max(1, Math.round(totalSeconds * RENDER_FPS));

  const target = await detectEncodeTarget(width, height);
  if (!target) {
    return err(
      appError(
        "provider-not-configured",
        "This browser has no supported video encoder for the final render.",
      ),
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return err(appError("storage-failed", "Canvas is not available."));
  }

  const output = new Output({
    format:
      target.container === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec: target.videoCodec,
    bitrate: VIDEO_BITRATE,
  });
  output.addVideoTrack(videoSource, { frameRate: RENDER_FPS });
  const audioSource = target.audioCodec
    ? new AudioBufferSource({ codec: target.audioCodec, bitrate: AUDIO_BITRATE })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  const images = new Map<string, HTMLImageElement | null>();
  const activeVideo: { url: string | null; element: HTMLVideoElement | null } =
    { url: null, element: null };

  const cleanupVideo = () => {
    if (activeVideo.element) {
      activeVideo.element.removeAttribute("src");
      activeVideo.element.load();
    }
    activeVideo.url = null;
    activeVideo.element = null;
  };

  try {
    await output.start();

    if (audioSource) {
      const cues: RenderCue[] = [];
      for (const planned of plan) {
        if (planned.dialogueUrl) {
          cues.push({ url: planned.dialogueUrl, at: planned.start });
        }
      }
      const loops: RenderLoop[] = [];
      for (const track of input.tracks) {
        const asset = track.assetId ? input.assets[track.assetId] : undefined;
        if (asset && asset.url.length > 0) {
          loops.push({ url: asset.url, gain: track.gain, muted: track.muted });
        }
      }
      const mixed = await mixCutAudio({ cues, loops, totalSeconds });
      await audioSource.add(mixed);
      audioSource.close();
    }

    let pointer = 0;
    for (let frame = 0; frame < totalFrames; frame++) {
      if (options.signal?.aborted) {
        cleanupVideo();
        await output.cancel();
        return err(cancelledError());
      }

      const t = (frame + 0.5) / RENDER_FPS;
      while (pointer < plan.length - 1) {
        const planned = plan[pointer];
        if (!planned || t < planned.start + planned.seconds) break;
        pointer += 1;
      }
      const planned = plan[pointer];
      if (!planned) break;
      const local = t - planned.start;

      context.fillStyle = CANVAS_BG;
      context.fillRect(0, 0, width, height);

      if (planned.kind === "video" && planned.mediaUrl) {
        if (activeVideo.url !== planned.mediaUrl) {
          cleanupVideo();
          activeVideo.element = await loadVideo(planned.mediaUrl);
          activeVideo.url = planned.mediaUrl;
        }
        const element = activeVideo.element;
        if (element) {
          await seekVideo(element, local);
          drawContain(context, element, width, height);
        }
      } else if (planned.kind === "image" && planned.mediaUrl) {
        let image = images.get(planned.mediaUrl);
        if (image === undefined) {
          image = await loadImage(planned.mediaUrl);
          images.set(planned.mediaUrl, image);
        }
        if (image) {
          drawKenBurns(
            context,
            image,
            width,
            height,
            local / planned.seconds,
            planned.shot.seed,
          );
        }
      } else {
        drawSlate(context, width, height, planned.number, planned.shot.description);
      }

      const dialogue = planned.shot.dialogue?.trim();
      if (dialogue) drawCaption(context, width, height, dialogue);

      const fade = fadeAmount(planned, local);
      if (fade > 0) {
        context.fillStyle = `rgba(0, 0, 0, ${fade.toFixed(3)})`;
        context.fillRect(0, 0, width, height);
      }

      await videoSource.add(frame / RENDER_FPS, 1 / RENDER_FPS);
      options.onProgress?.({ frame: frame + 1, totalFrames });
    }
    videoSource.close();
    cleanupVideo();

    if (options.signal?.aborted) {
      await output.cancel();
      return err(cancelledError());
    }

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) {
      return err(appError("storage-failed", "The muxer produced no data."));
    }
    return ok({
      blob: new Blob([buffer], {
        type: target.container === "mp4" ? "video/mp4" : "video/webm",
      }),
      container: target.container,
      videoCodec: target.videoCodec,
      width,
      height,
      durationSeconds: totalSeconds,
    });
  } catch (cause) {
    cleanupVideo();
    await output.cancel().catch(() => undefined);
    return err(appError("provider-request-failed", messageFromUnknown(cause), cause));
  }
};
