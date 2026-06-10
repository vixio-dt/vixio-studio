import { aspectRatioToDimensions } from "@/domain/constants";
import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";
import { sleep } from "@/lib/time";
import type { AspectRatio } from "@/domain/types";

import type { VideoProvider, VideoResult } from "../types";
import { geminiCopy } from "./copy";
import {
  asString,
  geminiRequest,
  isRecord,
  missingKeyError,
  readGeminiSettings,
  urlToInlineData,
} from "./shared";

/**
 * Veo image-to-video over predictLongRunning plus operation polling.
 * Progress is the artcraft trick: elapsed time over an expected duration,
 * capped below done, so the bar moves honestly with zero backend support.
 */

const POLL_INTERVAL_MS = 8_000;
const POLL_TIMEOUT_MS = 8 * 60_000;
const EXPECTED_DURATION_MS = 120_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

/** Durations Veo 3.1 accepts; requests snap to the nearest. */
const VEO_DURATIONS = [4, 6, 8] as const;

type VeoAspect = "16:9" | "9:16";

const snapDuration = (requested: number): number => {
  const safe = Number.isFinite(requested) ? requested : 6;
  let best: number = VEO_DURATIONS[0];
  for (const candidate of VEO_DURATIONS) {
    if (Math.abs(candidate - safe) < Math.abs(best - safe)) best = candidate;
  }
  return best;
};

/** Veo only renders 16:9 and 9:16; other ratios map to the nearest. */
const mapAspect = (ratio: AspectRatio): { aspect: VeoAspect; exact: boolean } => {
  switch (ratio) {
    case "16:9":
      return { aspect: "16:9", exact: true };
    case "9:16":
      return { aspect: "9:16", exact: true };
    case "21:9":
      return { aspect: "16:9", exact: false };
    case "4:3":
      return { aspect: "16:9", exact: false };
    case "1:1":
      return { aspect: "9:16", exact: false };
  }
};

/* ------------------------------------------------------------------ */
/* Operation response readers                                          */
/* ------------------------------------------------------------------ */

const readUriCandidate = (entry: unknown): string | null => {
  if (!isRecord(entry)) return null;
  if (typeof entry["uri"] === "string" && entry["uri"].length > 0) {
    return entry["uri"];
  }
  const video = entry["video"];
  if (isRecord(video) && typeof video["uri"] === "string" && video["uri"].length > 0) {
    return video["uri"];
  }
  return null;
};

/** Documented shape plus observed variants, all behind optional checks. */
const extractVideoUri = (response: unknown): string | null => {
  if (!isRecord(response)) return null;

  const generated = response["generateVideoResponse"];
  if (isRecord(generated)) {
    const samples = generated["generatedSamples"];
    if (Array.isArray(samples)) {
      const fromSamples = readUriCandidate(samples[0]);
      if (fromSamples !== null) return fromSamples;
    }
    const generatedVideos = generated["videos"];
    if (Array.isArray(generatedVideos)) {
      const fromGenerated = readUriCandidate(generatedVideos[0]);
      if (fromGenerated !== null) return fromGenerated;
    }
  }

  const videos = response["videos"];
  if (Array.isArray(videos)) {
    const fromVideos = readUriCandidate(videos[0]);
    if (fromVideos !== null) return fromVideos;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

const downloadVideo = async (input: {
  uri: string;
  apiKey: string;
  width: number;
  height: number;
  durationSeconds: number;
}): Promise<Result<VideoResult>> => {
  const separator = input.uri.includes("?") ? "&" : "?";
  const downloadUrl = `${input.uri}${separator}key=${encodeURIComponent(input.apiKey)}`;
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      return err(
        appError(
          "provider-request-failed",
          geminiCopy.videoDownloadFailed(response.status),
        ),
      );
    }
    const blob = await response.blob();
    return ok({
      url: URL.createObjectURL(blob),
      width: input.width,
      height: input.height,
      durationSeconds: input.durationSeconds,
    });
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        geminiCopy.networkFailed(messageFromUnknown(cause)),
        cause,
      ),
    );
  }
};

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const geminiVideoProvider: VideoProvider = {
  id: "gemini",
  name: "Veo",

  generateVideo: async (request, onProgress) => {
    try {
      const settings = readGeminiSettings();
      if (settings.apiKey.length === 0) return err(missingKeyError());

      const mapped = mapAspect(request.aspectRatio);
      const durationSeconds = snapDuration(request.durationSeconds);
      const prompt = mapped.exact
        ? request.prompt
        : `${request.prompt} Compose the action for a ${request.aspectRatio} center crop.`;

      const instance: Record<string, unknown> = { prompt };
      if (request.startFrameUrl !== null) {
        const frame = await urlToInlineData(request.startFrameUrl);
        if (!frame.ok) return frame;
        instance["image"] = {
          bytesBase64Encoded: frame.value.data,
          mimeType: frame.value.mimeType,
        };
      }

      const submitted = await geminiRequest(
        `/models/${settings.videoModel}:predictLongRunning`,
        settings.apiKey,
        {
          instances: [instance],
          parameters: { aspectRatio: mapped.aspect, durationSeconds },
        },
      );
      if (!submitted.ok) return submitted;

      const operationName = isRecord(submitted.value)
        ? asString(submitted.value["name"], "").trim()
        : "";
      if (operationName.length === 0) {
        return err(
          appError("provider-response-invalid", geminiCopy.videoNoOperation),
        );
      }

      onProgress(0.05);
      const { width, height } = aspectRatioToDimensions(mapped.aspect);
      const startedAt = Date.now();
      let pollFailures = 0;

      while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        await sleep(POLL_INTERVAL_MS);
        onProgress(
          Math.min(0.95, (Date.now() - startedAt) / EXPECTED_DURATION_MS),
        );

        const poll = await geminiRequest(`/${operationName}`, settings.apiKey);
        if (!poll.ok) {
          pollFailures += 1;
          if (pollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) return poll;
          continue;
        }
        pollFailures = 0;

        if (!isRecord(poll.value) || poll.value["done"] !== true) continue;

        const failure = poll.value["error"];
        if (isRecord(failure)) {
          return err(
            appError(
              "provider-request-failed",
              geminiCopy.videoFailed(
                asString(failure["message"], geminiCopy.videoUnknownError),
              ),
            ),
          );
        }

        const uri = extractVideoUri(poll.value["response"]);
        if (uri === null) {
          return err(
            appError("provider-response-invalid", geminiCopy.videoMissingFile),
          );
        }
        return await downloadVideo({
          uri,
          apiKey: settings.apiKey,
          width,
          height,
          durationSeconds,
        });
      }

      return err(
        appError("provider-request-failed", geminiCopy.videoTimedOut),
      );
    } catch (cause) {
      return err(
        appError("provider-request-failed", messageFromUnknown(cause), cause),
      );
    }
  },
};
