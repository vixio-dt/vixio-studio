import { aspectRatioToDimensions } from "@/domain/constants";
import { findModel } from "@/domain/modelRegistry";
import { transcodeToMp4 } from "@/lib/media/toMp4";
import { appError, err, ok, type Result } from "@/lib/result";
import { sleep } from "@/lib/time";

import type { AspectRatio } from "@/domain/types";
import type { ProgressReporter, VideoProvider, VideoResult } from "../types";
import {
  asString,
  falCopy,
  FAL_QUEUE_BASE,
  falGet,
  falPost,
  isRecord,
  mediaUrlForFal,
  missingKeyError,
  readFalErrorDetail,
  readFalSettings,
  toFalVideoDuration,
  uploadToFalStorage,
  urlToBlob,
} from "./shared";

/**
 * Video over fal's async queue. Two routes share the transport: image-to-video
 * (Kling and similar, from the shot's start frame) and driving video (Seedance
 * and similar, following the camera of a previz clip). Submit returns a
 * status_url and response_url which we follow as given; the model sub-path
 * collapses in those URLs, so they must not be reconstructed by hand. A fake
 * progress bar tracks elapsed time against the model's expected duration, the
 * honest-enough trick that avoids a second polling channel.
 */

const POLL_INTERVAL_MS = 4000;
// Seedance driving jobs can legitimately run past ten minutes; the live
// smoke harness budgets the same twelve.
const MAX_WAIT_MS = 12 * 60 * 1000;
const EXPECTED_MS = 120 * 1000;

/* ------------------------------------------------------------------ */
/* Per-family submit bodies                                            */
/* ------------------------------------------------------------------ */

export type VideoSubmitArgs = {
  prompt: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  /** Public URL (or data URI) of the start frame, when the shot has one. */
  startImageUrl: string | null;
  /** Public URL of the previz driving clip, already uploaded as mp4. */
  drivingVideoUrl: string | null;
};

const clampInt = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
};

/** Veo on fal accepts only these clip lengths; snap to the nearest. */
const snapVeoSeconds = (requested: number): number => {
  const safe = Number.isFinite(requested) ? requested : 6;
  let best = 4;
  for (const candidate of [4, 6, 8]) {
    if (Math.abs(candidate - safe) < Math.abs(best - safe)) best = candidate;
  }
  return best;
};

/**
 * The exact JSON body a fal video model family expects, keyed off the model
 * id. Pure so the wire contract is testable without a network. Field names
 * follow the live-verified contracts in scripts/live-smoke.mjs: kling v3
 * takes start_image_url and a string duration, seedance reference-to-video
 * takes video_urls/image_urls with an integer duration.
 */
export type VideoSubmitPlan = {
  body: Record<string, unknown>;
  /**
   * The clip length the wire body actually requests after the family's
   * snapping or clamping, so asset metadata never lies about duration.
   */
  effectiveDurationSeconds: number;
};

export const buildVideoSubmitBody = (
  modelId: string,
  args: VideoSubmitArgs,
): VideoSubmitPlan => {
  if (modelId.includes("kling-video/v3")) {
    const seconds = clampInt(args.durationSeconds, 3, 15);
    return {
      body: {
        prompt: args.prompt,
        ...(args.startImageUrl !== null
          ? { start_image_url: args.startImageUrl }
          : {}),
        duration: String(seconds),
        generate_audio: false,
      },
      effectiveDurationSeconds: seconds,
    };
  }
  if (modelId.includes("veo3")) {
    const seconds = snapVeoSeconds(args.durationSeconds);
    return {
      body: {
        prompt: args.prompt,
        ...(args.startImageUrl !== null
          ? { image_url: args.startImageUrl }
          : {}),
        duration: `${seconds}s`,
        // fal's veo endpoints default audio on; the app runs its own audio
        // lanes, so picture stays silent unless the user routes audio here.
        generate_audio: false,
      },
      effectiveDurationSeconds: seconds,
    };
  }
  if (modelId.includes("seedance") && modelId.includes("reference-to-video")) {
    const seconds = clampInt(args.durationSeconds, 4, 12);
    return {
      body: {
        prompt: args.prompt,
        ...(args.drivingVideoUrl !== null
          ? { video_urls: [args.drivingVideoUrl] }
          : {}),
        ...(args.startImageUrl !== null
          ? { image_urls: [args.startImageUrl] }
          : {}),
        duration: seconds,
        resolution: "720p",
        aspect_ratio: args.aspectRatio,
        generate_audio: false,
      },
      effectiveDurationSeconds: seconds,
    };
  }
  if (modelId.includes("motion-transfer")) {
    return {
      body: {
        prompt: args.prompt,
        ...(args.drivingVideoUrl !== null
          ? { video_url: args.drivingVideoUrl }
          : {}),
        ...(args.startImageUrl !== null
          ? { first_frame_image_url: args.startImageUrl }
          : {}),
      },
      effectiveDurationSeconds: args.durationSeconds,
    };
  }
  if (modelId.includes("video-to-video")) {
    return {
      body: {
        prompt: args.prompt,
        ...(args.drivingVideoUrl !== null
          ? { video_url: args.drivingVideoUrl }
          : {}),
        loras: [],
      },
      effectiveDurationSeconds: args.durationSeconds,
    };
  }
  // Kling v1 tiers, legacy ids, and unknown models keep the classic shape.
  return {
    body: {
      prompt: args.prompt,
      ...(args.startImageUrl !== null ? { image_url: args.startImageUrl } : {}),
      duration: toFalVideoDuration(args.durationSeconds),
    },
    effectiveDurationSeconds: toFalVideoDuration(args.durationSeconds) === "10" ? 10 : 5,
  };
};

/** True when the built body actually carries the driving clip. */
const bodyCarriesDrivingVideo = (body: Record<string, unknown>): boolean =>
  "video_url" in body || "video_urls" in body;

/* ------------------------------------------------------------------ */
/* Driving clip preparation                                            */
/* ------------------------------------------------------------------ */

/**
 * Wire-level seedance mentions. Seedance addresses its inputs by position
 * (@Video1 is video_urls[0], @Image1 is image_urls[0]); the suffix is
 * appended here, after prompt composition, so the visible prompt stays free
 * of transport syntax.
 */
const SEEDANCE_DRIVING_MENTION = "Follow the camera and motion of @Video1.";
const SEEDANCE_FRAME_MENTION = "Keep the look of @Image1.";

const withSeedanceMentions = (prompt: string, hasStartFrame: boolean): string => {
  const parts = [prompt.trim(), SEEDANCE_DRIVING_MENTION];
  if (hasStartFrame) parts.push(SEEDANCE_FRAME_MENTION);
  return parts.filter((part) => part.length > 0).join(" ");
};

/** Fetch the local driving clip, re-encode to mp4 if needed, upload to fal. */
const prepareDrivingVideo = async (url: string): Promise<Result<string>> => {
  const blob = await urlToBlob(url);
  if (!blob.ok) {
    return err(
      appError("provider-request-failed", falCopy.drivingVideoUnreadable),
    );
  }
  // transcodeToMp4 passes mp4 blobs through untouched.
  const mp4 = await transcodeToMp4(blob.value);
  if (!mp4.ok) return mp4;
  return uploadToFalStorage({ blob: mp4.value, fileName: "driving.mp4" });
};

/* ------------------------------------------------------------------ */
/* Queue plumbing                                                      */
/* ------------------------------------------------------------------ */

type QueueHandles = { statusUrl: string; responseUrl: string };

const readQueueHandles = (payload: unknown): QueueHandles | null => {
  if (!isRecord(payload)) return null;
  const statusUrl = asString(payload["status_url"], "");
  const responseUrl = asString(payload["response_url"], "");
  if (statusUrl.length === 0 || responseUrl.length === 0) return null;
  return { statusUrl, responseUrl };
};

const readStatus = (payload: unknown): string =>
  isRecord(payload) ? asString(payload["status"], "") : "";

const readVideoUrl = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const video = payload["video"];
  if (isRecord(video)) {
    const url = asString(video["url"], "");
    if (url.length > 0) return url;
  }
  const flat = asString(payload["video_url"], "");
  return flat.length > 0 ? flat : null;
};

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const falVideoProvider: VideoProvider = {
  id: "fal",
  name: "fal.ai",

  generateVideo: async (request, onProgress) => {
    const settings = readFalSettings();
    if (settings.apiKey.length === 0) return err(missingKeyError());

    const driving = request.drivingVideoUrl !== null;
    const modelId = driving ? settings.drivingVideoModel : settings.videoModel;
    if (!driving && request.startFrameUrl === null) {
      return err(appError("provider-request-failed", falCopy.startFrameRequired));
    }
    // Driving-only endpoints (motion transfer, vid2vid) hard-require a clip;
    // refuse the plain image-to-video path up front instead of letting fal
    // answer 422 after a paid upload.
    if (!driving && findModel(modelId)?.drivingOnly) {
      return err(
        appError("provider-request-failed", falCopy.modelNeedsDrivingClip),
      );
    }

    onProgress(0.01);
    // The clip and frame preps are independent network pipelines; run them
    // together so a driving generation pays the slower of the two, not both.
    const [preparedClip, preparedFrame] = await Promise.all([
      request.drivingVideoUrl !== null
        ? prepareDrivingVideo(request.drivingVideoUrl)
        : Promise.resolve(null),
      request.startFrameUrl !== null
        ? mediaUrlForFal(request.startFrameUrl, "start-frame.png")
        : Promise.resolve(null),
    ]);
    if (preparedClip !== null && !preparedClip.ok) return preparedClip;
    if (preparedFrame !== null && !preparedFrame.ok) return preparedFrame;
    const drivingVideoUrl = preparedClip?.value ?? null;
    const startImageUrl = preparedFrame?.value ?? null;

    const seedanceDriving =
      driving &&
      modelId.includes("seedance") &&
      modelId.includes("reference-to-video");
    const prompt = seedanceDriving
      ? withSeedanceMentions(request.prompt, startImageUrl !== null)
      : request.prompt;

    const plan = buildVideoSubmitBody(modelId, {
      prompt,
      durationSeconds: request.durationSeconds,
      aspectRatio: request.aspectRatio,
      startImageUrl,
      drivingVideoUrl,
    });
    // A driving request whose body cannot carry the clip means the chosen
    // model id matched no driving-capable family; fail loudly rather than
    // render an expensive clip that silently ignores the previz camera.
    if (driving && !bodyCarriesDrivingVideo(plan.body)) {
      return err(
        appError("provider-request-failed", falCopy.drivingModelUnsupported),
      );
    }

    onProgress(0.04);
    const submitted = await falPost(
      `${FAL_QUEUE_BASE}/${modelId}`,
      settings.apiKey,
      plan.body,
    );
    if (!submitted.ok) return submitted;

    const handles = readQueueHandles(submitted.value);
    if (handles === null) {
      return err(appError("provider-response-invalid", falCopy.noVideo));
    }

    const dimensions = aspectRatioToDimensions(request.aspectRatio);
    return pollForVideo({
      handles,
      apiKey: settings.apiKey,
      durationSeconds: plan.effectiveDurationSeconds,
      dimensions,
      onProgress,
    });
  },
};

const pollForVideo = async (input: {
  handles: QueueHandles;
  apiKey: string;
  durationSeconds: number;
  dimensions: { width: number; height: number };
  onProgress: ProgressReporter;
}) => {
  const { handles, apiKey, durationSeconds, dimensions, onProgress } = input;
  const startedAt = performance.now();

  for (;;) {
    const elapsed = performance.now() - startedAt;
    if (elapsed > MAX_WAIT_MS) {
      return err(appError("provider-request-failed", falCopy.timedOut));
    }
    onProgress(Math.min(0.95, 0.05 + (elapsed / EXPECTED_MS) * 0.9));

    const status = await falGet(handles.statusUrl, apiKey);
    if (!status.ok) return status;
    const state = readStatus(status.value);

    if (state === "COMPLETED") {
      // Jobs that failed validation still complete; the response endpoint
      // then answers non-2xx with fal's error detail, which falGet surfaces.
      const result = await falGet(handles.responseUrl, apiKey);
      if (!result.ok) return result;
      const url = readVideoUrl(result.value);
      if (url === null) {
        return err(appError("provider-response-invalid", falCopy.noVideo));
      }
      onProgress(0.99);
      const value: VideoResult = {
        url,
        width: dimensions.width,
        height: dimensions.height,
        durationSeconds,
      };
      return ok(value);
    }

    if (state === "FAILED" || state === "ERROR") {
      // Surface fal's own failure detail from the response payload rather
      // than a generic message; falGet already carries it for non-2xx.
      const result = await falGet(handles.responseUrl, apiKey);
      if (!result.ok) return result;
      const detail = readFalErrorDetail(result.value);
      return err(
        appError("provider-request-failed", falCopy.jobFailed(detail)),
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }
};
