import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";
import { useSettingsStore } from "@/stores/settings";

import { geminiCopy } from "./copy";

/**
 * Plumbing shared by the three Gemini providers: settings access, the REST
 * transport, and defensive readers for the loosely typed response payloads.
 * Everything returns Result; nothing in this module throws.
 */

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_VIDEO_MODEL = "veo-3.1-fast-generate-001";

export type GeminiSettings = {
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
export const readGeminiSettings = (): GeminiSettings => {
  const state = useSettingsStore.getState();
  return {
    apiKey: state.geminiApiKey.trim(),
    textModel: orDefault(state.geminiTextModel, DEFAULT_TEXT_MODEL),
    imageModel: orDefault(state.geminiImageModel, DEFAULT_IMAGE_MODEL),
    videoModel: orDefault(state.geminiVideoModel, DEFAULT_VIDEO_MODEL),
  };
};

export const missingKeyError = () =>
  appError("provider-not-configured", geminiCopy.missingKey);

/* ------------------------------------------------------------------ */
/* Loose JSON readers                                                  */
/* ------------------------------------------------------------------ */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const readApiErrorDetail = (payload: unknown): string => {
  if (!isRecord(payload)) return "";
  const error = payload["error"];
  if (!isRecord(error)) return "";
  return asString(error["message"], "");
};

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/**
 * One call against the Gemini REST surface. GET when no body is given,
 * POST otherwise. HTTP failures become readable AppErrors that include the
 * status code and any error.message the API put in the body.
 */
export const geminiRequest = async (
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<Result<unknown>> => {
  let response: Response;
  try {
    response = await fetch(`${GEMINI_BASE_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-goog-api-key": apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
        geminiCopy.requestFailed(response.status, detail),
      ),
    );
  }

  try {
    return ok((await response.json()) as unknown);
  } catch (cause) {
    return err(
      appError("provider-response-invalid", geminiCopy.unreadableResponse, cause),
    );
  }
};

/* ------------------------------------------------------------------ */
/* generateContent response readers                                    */
/* ------------------------------------------------------------------ */

/** Concatenated text of candidates[0].content.parts[*].text, or null. */
export const extractTextFromCandidates = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const candidates = payload["candidates"];
  if (!Array.isArray(candidates)) return null;
  const first = candidates[0];
  if (!isRecord(first)) return null;
  const content = first["content"];
  if (!isRecord(content)) return null;
  const parts = content["parts"];
  if (!Array.isArray(parts)) return null;
  const texts: string[] = [];
  for (const part of parts) {
    if (isRecord(part) && typeof part["text"] === "string") {
      texts.push(part["text"]);
    }
  }
  return texts.length > 0 ? texts.join("") : null;
};

export type InlineImage = { mimeType: string; data: string };

/** First inlineData part across all candidates, camel or snake case. */
export const extractInlineImage = (payload: unknown): InlineImage | null => {
  if (!isRecord(payload)) return null;
  const candidates = payload["candidates"];
  if (!Array.isArray(candidates)) return null;
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const content = candidate["content"];
    if (!isRecord(content)) continue;
    const parts = content["parts"];
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!isRecord(part)) continue;
      const inline = part["inlineData"] ?? part["inline_data"];
      if (!isRecord(inline)) continue;
      const data = inline["data"];
      if (typeof data !== "string" || data.length === 0) continue;
      const mimeType =
        asString(inline["mimeType"], "").trim() ||
        asString(inline["mime_type"], "").trim() ||
        "image/png";
      return { mimeType, data };
    }
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Local media to base64                                               */
/* ------------------------------------------------------------------ */

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
        return;
      }
      reject(new Error(geminiCopy.referenceUnreadable));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error(geminiCopy.referenceUnreadable));
    reader.readAsDataURL(blob);
  });

/**
 * Fetch a local object or data URL and return base64 bytes plus mime type,
 * ready for an inlineData part or a Veo start frame.
 */
export const urlToInlineData = async (
  url: string,
): Promise<Result<InlineImage>> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return err(
        appError("provider-request-failed", geminiCopy.referenceUnreadable),
      );
    }
    const blob = await response.blob();
    const data = await blobToBase64(blob);
    const mimeType = blob.type.trim().length > 0 ? blob.type : "image/png";
    return ok({ mimeType, data });
  } catch (cause) {
    return err(
      appError("provider-request-failed", geminiCopy.referenceUnreadable, cause),
    );
  }
};
