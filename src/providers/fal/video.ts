import { aspectRatioToDimensions } from "@/domain/constants";
import { appError, err, ok } from "@/lib/result";
import { sleep } from "@/lib/time";

import type { ProgressReporter, VideoProvider, VideoResult } from "../types";
import {
  asString,
  falCopy,
  FAL_QUEUE_BASE,
  falGet,
  falPost,
  isRecord,
  missingKeyError,
  readFalSettings,
  toFalVideoDuration,
  urlToDataUri,
} from "./shared";

/**
 * Image-to-video over fal's async queue (Kling and similar). Submit returns a
 * status_url and response_url which we follow as given; the model sub-path
 * collapses in those URLs, so they must not be reconstructed by hand. A fake
 * progress bar tracks elapsed time against the model's expected duration, the
 * honest-enough trick that avoids a second polling channel.
 */

const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 6 * 60 * 1000;
const EXPECTED_MS = 120 * 1000;

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

export const falVideoProvider: VideoProvider = {
  id: "fal",
  name: "fal.ai",

  generateVideo: async (request, onProgress) => {
    const settings = readFalSettings();
    if (settings.apiKey.length === 0) return err(missingKeyError());
    if (request.startFrameUrl === null) {
      return err(appError("provider-request-failed", falCopy.startFrameRequired));
    }

    const startFrame = await urlToDataUri(request.startFrameUrl);
    if (!startFrame.ok) return startFrame;

    onProgress(0.04);
    const submitted = await falPost(
      `${FAL_QUEUE_BASE}/${settings.videoModel}`,
      settings.apiKey,
      {
        prompt: request.prompt,
        image_url: startFrame.value,
        duration: toFalVideoDuration(request.durationSeconds),
      },
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
      durationSeconds: request.durationSeconds,
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
      return err(appError("provider-request-failed", falCopy.noVideo));
    }

    await sleep(POLL_INTERVAL_MS);
  }
};
