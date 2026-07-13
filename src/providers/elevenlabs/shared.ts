import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";
import { useSettingsStore } from "@/stores/settings";

/**
 * Plumbing for the ElevenLabs audio provider: settings access and the REST
 * transport against api.elevenlabs.io. ElevenLabs serves permissive CORS
 * headers, so the browser calls it directly with the user's key in the
 * xi-api-key header. Nothing here throws; all paths return Result.
 */

export const ELEVENLABS_BASE = "https://api.elevenlabs.io";

const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export const elevenLabsCopy = {
  missingKey: "Add an ElevenLabs key in settings to generate audio.",
  networkFailed: (detail: string) => `Could not reach ElevenLabs. ${detail}`,
  requestFailed: (status: number, detail: string) =>
    detail.length > 0
      ? `ElevenLabs request failed (${status}). ${detail}`
      : `ElevenLabs request failed (${status}).`,
  unreadableResponse: "ElevenLabs returned a response that could not be read.",
  emptyAudio: "ElevenLabs returned no audio.",
} as const;

export type ElevenLabsSettings = {
  apiKey: string;
  ttsModel: string;
  defaultVoiceId: string;
};

const orDefault = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

/** Read at call time so settings changes apply to the next generation. */
export const readElevenLabsSettings = (): ElevenLabsSettings => {
  const state = useSettingsStore.getState();
  return {
    apiKey: state.elevenLabsApiKey.trim(),
    ttsModel: orDefault(state.elevenLabsTtsModel, DEFAULT_TTS_MODEL),
    defaultVoiceId: orDefault(state.elevenLabsDefaultVoiceId, DEFAULT_VOICE_ID),
  };
};

export const missingKeyError = () =>
  appError("provider-not-configured", elevenLabsCopy.missingKey);

/* ------------------------------------------------------------------ */
/* Loose JSON readers                                                  */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * ElevenLabs error bodies arrive as { detail: { status, message } }, a plain
 * { detail: string }, or a validation array of { msg }.
 */
const readApiErrorDetail = (payload: unknown): string => {
  if (!isRecord(payload)) return "";
  const detail = payload["detail"];
  if (typeof detail === "string") return detail;
  if (isRecord(detail) && typeof detail["message"] === "string") {
    return detail["message"];
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        isRecord(entry) && typeof entry["msg"] === "string" ? entry["msg"] : "",
      )
      .filter((message) => message.length > 0);
    if (messages.length > 0) return messages.join("; ");
  }
  return "";
};

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

const requestErrorFromResponse = async (response: Response) => {
  let detail: string;
  try {
    detail = readApiErrorDetail(await response.json());
  } catch {
    detail = "";
  }
  return appError(
    "provider-request-failed",
    elevenLabsCopy.requestFailed(response.status, detail),
  );
};

const elevenLabsFetch = async (
  path: string,
  apiKey: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Result<Response>> => {
  let response: Response;
  try {
    response = await fetch(`${ELEVENLABS_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "xi-api-key": apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        elevenLabsCopy.networkFailed(messageFromUnknown(cause)),
        cause,
      ),
    );
  }
  if (!response.ok) return err(await requestErrorFromResponse(response));
  return ok(response);
};

/** GET a JSON endpoint (voices, models); used by the settings key check. */
export const elevenLabsGet = async (
  path: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Result<unknown>> => {
  const response = await elevenLabsFetch(path, apiKey, undefined, signal);
  if (!response.ok) return response;
  try {
    return ok((await response.value.json()) as unknown);
  } catch (cause) {
    return err(
      appError("provider-response-invalid", elevenLabsCopy.unreadableResponse, cause),
    );
  }
};

/** POST a JSON body to an endpoint that streams audio bytes back. */
export const elevenLabsPostForAudio = async (
  path: string,
  apiKey: string,
  body: unknown,
): Promise<Result<Blob>> => {
  const response = await elevenLabsFetch(path, apiKey, body);
  if (!response.ok) return response;
  let blob: Blob;
  try {
    blob = await response.value.blob();
  } catch (cause) {
    return err(
      appError("provider-response-invalid", elevenLabsCopy.unreadableResponse, cause),
    );
  }
  if (blob.size === 0) {
    return err(appError("provider-response-invalid", elevenLabsCopy.emptyAudio));
  }
  return ok(blob);
};
