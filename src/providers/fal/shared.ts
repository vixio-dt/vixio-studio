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
export const FAL_REST_BASE = "https://rest.alpha.fal.ai";

const DEFAULT_TEXT_MODEL = "google/gemini-flash-1.5";
const DEFAULT_IMAGE_MODEL = "fal-ai/flux-2";
const DEFAULT_VIDEO_MODEL = "fal-ai/kling-video/v3/standard/image-to-video";
const DEFAULT_DRIVING_VIDEO_MODEL =
  "bytedance/seedance-2.0/fast/reference-to-video";

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
  referenceUnreadable: "A reference image could not be prepared for fal.ai.",
  drivingVideoUnreadable: "The driving clip could not be prepared for fal.ai.",
  uploadFailed: (detail: string) =>
    detail.length > 0
      ? `Uploading media to fal.ai storage failed. ${detail}`
      : "Uploading media to fal.ai storage failed.",
  jobFailed: (detail: string) =>
    detail.length > 0
      ? `fal.ai reported the job failed. ${detail}`
      : "fal.ai reported the job failed.",
  cancelled: "Generation was cancelled.",
  timedOut: "fal.ai did not finish the job in time.",
} as const;

export type FalSettings = {
  apiKey: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
  drivingVideoModel: string;
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
    drivingVideoModel: orDefault(
      state.falDrivingVideoModel,
      DEFAULT_DRIVING_VIDEO_MODEL,
    ),
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

/** fal's own error text from an error payload, however it is nested. */
export const readFalErrorDetail = (payload: unknown): string => {
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
      detail = readFalErrorDetail(await response.json());
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

const blobToDataUri = async (blob: Blob): Promise<Result<string>> => {
  try {
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

/** fal image inputs accept a data URI; convert a local blob URL to one. */
export const urlToDataUri = async (url: string): Promise<Result<string>> => {
  const blob = await urlToBlob(url);
  if (!blob.ok) return blob;
  return blobToDataUri(blob.value);
};

const urlToBlob = async (url: string): Promise<Result<Blob>> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return err(appError("provider-request-failed", falCopy.startFrameUnreadable));
    }
    return ok(await response.blob());
  } catch (cause) {
    return err(appError("provider-request-failed", falCopy.startFrameUnreadable, cause));
  }
};

/* ------------------------------------------------------------------ */
/* fal storage                                                         */
/* ------------------------------------------------------------------ */

/**
 * Upload a blob to fal's CDN storage and return its public access URL.
 * Two steps, both verified against the live API: a short-lived upload token
 * from rest.alpha.fal.ai (key auth), then a raw-bytes POST to the token's
 * base_url (bearer auth) which answers { access_url }.
 */
export const uploadToFalStorage = async (input: {
  blob: Blob;
  fileName: string;
}): Promise<Result<string>> => {
  const apiKey = readFalSettings().apiKey;
  if (apiKey.length === 0) return err(missingKeyError());

  const grant = await falPost(
    `${FAL_REST_BASE}/storage/auth/token?storage_type=fal-cdn-v3`,
    apiKey,
    {},
  );
  if (!grant.ok) return grant;
  const token = isRecord(grant.value) ? asString(grant.value["token"], "") : "";
  const baseUrl = isRecord(grant.value)
    ? asString(grant.value["base_url"], "")
    : "";
  if (token.length === 0 || baseUrl.length === 0) {
    return err(appError("provider-response-invalid", falCopy.uploadFailed("")));
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type":
          input.blob.type.length > 0 ? input.blob.type : "application/octet-stream",
        "X-Fal-File-Name": input.fileName,
      },
      body: input.blob,
    });
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        falCopy.uploadFailed(messageFromUnknown(cause)),
        cause,
      ),
    );
  }
  if (!response.ok) {
    return err(
      appError(
        "provider-request-failed",
        falCopy.uploadFailed(`Status ${response.status}.`),
      ),
    );
  }

  try {
    const payload = (await response.json()) as unknown;
    const accessUrl = isRecord(payload)
      ? asString(payload["access_url"], "")
      : "";
    if (accessUrl.length === 0) {
      return err(appError("provider-response-invalid", falCopy.uploadFailed("")));
    }
    return ok(accessUrl);
  } catch (cause) {
    return err(
      appError("provider-response-invalid", falCopy.uploadFailed(""), cause),
    );
  }
};

/**
 * Turn a local object or data URL into something fal model inputs accept:
 * a CDN access URL when the storage upload succeeds. Images fall back to the
 * data-URI path on upload failure (fal image inputs accept those); videos
 * propagate the error because queue submits reject inline video payloads.
 */
export const mediaUrlForFal = async (
  url: string,
  fileName: string,
): Promise<Result<string>> => {
  const blob = await urlToBlob(url);
  if (!blob.ok) return blob;
  const uploaded = await uploadToFalStorage({ blob: blob.value, fileName });
  if (uploaded.ok) return uploaded;
  if (blob.value.type.startsWith("image/")) return blobToDataUri(blob.value);
  return uploaded;
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
