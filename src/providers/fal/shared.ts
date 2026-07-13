import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";
import { useSettingsStore } from "@/stores/settings";

import type { AspectRatio } from "@/domain/types";

/**
 * Plumbing shared by the three fal.ai providers: settings access, the REST
 * transport against fal.run (synchronous) and queue.fal.run (async jobs), and
 * loose JSON readers. fal returns permissive CORS headers, so the browser
 * calls it directly with the user's key. Nothing here throws; all paths
 * return Result.
 */

export const FAL_SYNC_BASE = "https://fal.run";
export const FAL_QUEUE_BASE = "https://queue.fal.run";

const DEFAULT_TEXT_MODEL = "google/gemini-flash-1.5";
const DEFAULT_IMAGE_MODEL = "fal-ai/flux/dev";
const DEFAULT_VIDEO_MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video";

export const falCopy = {
  missingKey: "Add a fal.ai key in settings to generate with fal.",
  networkFailed: (detail: string) => `Could not reach fal.ai. ${detail}`,
  requestFailed: (status: number, detail: string) =>
    detail.length > 0
      ? `fal.ai request failed (${status}). ${detail}`
      : `fal.ai request failed (${status}).`,
  unreadableResponse: "fal.ai returned a response that could not be read.",
  noImage: "fal.ai did not return an image.",
  noVideo: "fal.ai did not return a video.",
  noText: "fal.ai did not return any text.",
  unparseable: "fal.ai returned text that was not valid JSON.",
  startFrameRequired:
    "This video model needs a start frame. Generate the shot frame first.",
  startFrameUnreadable: "The start frame could not be prepared for fal.ai.",
  cancelled: "Generation was cancelled.",
  timedOut: "fal.ai did not finish the job in time.",
} as const;

export type FalSettings = {
  apiKey: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
};

const orDefault = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

/** Read at call time so settings changes apply to the next generation. */
export const readFalSettings = (): FalSettings => {
  const state = useSettingsStore.getState();
  return {
    apiKey: state.falApiKey.trim(),
    textModel: orDefault(state.falTextModel, DEFAULT_TEXT_MODEL),
    imageModel: orDefault(state.falImageModel, DEFAULT_IMAGE_MODEL),
    videoModel: orDefault(state.falVideoModel, DEFAULT_VIDEO_MODEL),
  };
};

export const missingKeyError = () =>
  appError("provider-not-configured", falCopy.missingKey);

/* ------------------------------------------------------------------ */
/* Loose JSON readers                                                  */
/* ------------------------------------------------------------------ */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const readApiErrorDetail = (payload: unknown): string => {
  if (!isRecord(payload)) return "";
  const detail = payload["detail"];
  if (typeof detail === "string") return detail;
  // fal validation errors arrive as { detail: [{ msg, loc }] }.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => (isRecord(entry) ? asString(entry["msg"], "") : ""))
      .filter((message) => message.length > 0);
    if (messages.length > 0) return messages.join("; ");
  }
  return asString(payload["message"], "");
};

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/** POST a JSON body to a fully qualified fal URL with key auth. */
export const falPost = async (
  url: string,
  apiKey: string,
  body: unknown,
): Promise<Result<unknown>> => falFetch(url, apiKey, "POST", body);

/** GET a fully qualified fal URL (queue status and result endpoints). */
export const falGet = async (
  url: string,
  apiKey: string,
): Promise<Result<unknown>> => falFetch(url, apiKey, "GET", undefined);

const falFetch = async (
  url: string,
  apiKey: string,
  method: "GET" | "POST",
  body: unknown,
): Promise<Result<unknown>> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Key ${apiKey}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        falCopy.networkFailed(messageFromUnknown(cause)),
        cause,
      ),
    );
  }

  if (!response.ok) {
    let detail: string;
    try {
      detail = readApiErrorDetail(await response.json());
    } catch {
      detail = "";
    }
    return err(
      appError(
        "provider-request-failed",
        falCopy.requestFailed(response.status, detail),
      ),
    );
  }

  try {
    return ok((await response.json()) as unknown);
  } catch (cause) {
    return err(appError("provider-response-invalid", falCopy.unreadableResponse, cause));
  }
};

/* ------------------------------------------------------------------ */
/* Media helpers                                                       */
/* ------------------------------------------------------------------ */

/** fal image inputs accept a data URI; convert a local blob URL to one. */
export const urlToDataUri = async (url: string): Promise<Result<string>> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return err(appError("provider-request-failed", falCopy.startFrameUnreadable));
    }
    const blob = await response.blob();
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error(falCopy.startFrameUnreadable));
      reader.onerror = () =>
        reject(reader.error ?? new Error(falCopy.startFrameUnreadable));
      reader.readAsDataURL(blob);
    });
    return ok(dataUri);
  } catch (cause) {
    return err(appError("provider-request-failed", falCopy.startFrameUnreadable, cause));
  }
};

/**
 * Map an aspect ratio to a fal image_size. Named presets where fal has one,
 * an explicit width/height for 21:9 (no named preset covers it).
 */
export type FalImageSize = string | { width: number; height: number };

export const aspectToFalImageSize = (ratio: AspectRatio): FalImageSize => {
  switch (ratio) {
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    case "1:1":
      return "square_hd";
    case "4:3":
      return "landscape_4_3";
    case "21:9":
      return { width: 1344, height: 576 };
  }
};

/** Kling and most fal video models accept "5" or "10" second durations. */
export const toFalVideoDuration = (seconds: number): "5" | "10" =>
  seconds > 7 ? "10" : "5";
