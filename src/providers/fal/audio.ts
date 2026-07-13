import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";
import { probeAudioDuration } from "@/stores/assets";
import { useSettingsStore } from "@/stores/settings";

import type { AudioProvider } from "../types";
import {
  asString,
  FAL_SYNC_BASE,
  falPost,
  isRecord,
  missingKeyError,
  readFalSettings,
} from "./shared";

/**
 * Speech, music, and ambience over fal's synchronous endpoint. Speech routes
 * to the configurable audio model (ElevenLabs TTS by default); tracks go to
 * the fixed ElevenLabs music and sound-effects models. fal responds with a
 * CDN URL which is fetched into a Blob here so the result matches the audio
 * contract; duration comes from HTMLAudio metadata with a graceful fallback.
 */

const DEFAULT_AUDIO_MODEL = "fal-ai/elevenlabs/tts/eleven-v3";
const MUSIC_MODEL = "fal-ai/elevenlabs/music";
const SOUND_EFFECTS_MODEL = "fal-ai/elevenlabs/sound-effects";

const MIN_MUSIC_MS = 10_000;
const MAX_MUSIC_MS = 300_000;
const MIN_SFX_SECONDS = 0.5;
const MAX_SFX_SECONDS = 30;

const falAudioCopy = {
  noAudio: "fal.ai did not return any audio.",
  audioUnfetchable: (detail: string) =>
    detail.length > 0
      ? `The generated audio could not be downloaded. ${detail}`
      : "The generated audio could not be downloaded.",
} as const;

/** The audio model id lives outside readFalSettings; read it the same way. */
const readAudioModel = (): string => {
  const configured = useSettingsStore.getState().falAudioModel.trim();
  return configured.length > 0 ? configured : DEFAULT_AUDIO_MODEL;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

/** Audio URL across fal model families: audio.url, audio_url, audio_file.url. */
const readAudioUrl = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  for (const key of ["audio", "audio_file"]) {
    const nested = payload[key];
    if (isRecord(nested)) {
      const url = asString(nested["url"], "");
      if (url.length > 0) return url;
    }
  }
  const flat = asString(payload["audio_url"], "");
  return flat.length > 0 ? flat : null;
};

/** fal CDN URLs are public; fetch the bytes into a Blob for local storage. */
const fetchAudioBlob = async (url: string): Promise<Result<Blob>> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return err(
        appError(
          "provider-request-failed",
          falAudioCopy.audioUnfetchable(`Status ${response.status}.`),
        ),
      );
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      return err(appError("provider-response-invalid", falAudioCopy.noAudio));
    }
    return ok(blob);
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        falAudioCopy.audioUnfetchable(messageFromUnknown(cause)),
        cause,
      ),
    );
  }
};

const blobFromResponse = async (payload: unknown): Promise<Result<Blob>> => {
  const url = readAudioUrl(payload);
  if (url === null) {
    return err(appError("provider-response-invalid", falAudioCopy.noAudio));
  }
  return fetchAudioBlob(url);
};

const durationOrFallback = async (
  blob: Blob,
  fallbackSeconds: number,
): Promise<number> => {
  const probed = await probeAudioDuration(blob);
  return probed ?? fallbackSeconds;
};

export const falAudioProvider: AudioProvider = {
  id: "fal",
  name: "fal.ai",

  generateSpeech: async (request, onProgress) => {
    const settings = readFalSettings();
    if (settings.apiKey.length === 0) return err(missingKeyError());

    onProgress(0.15);
    const response = await falPost(
      `${FAL_SYNC_BASE}/${readAudioModel()}`,
      settings.apiKey,
      { text: request.text },
    );
    if (!response.ok) return response;

    onProgress(0.7);
    const blob = await blobFromResponse(response.value);
    if (!blob.ok) return blob;

    onProgress(0.9);
    return ok({
      blob: blob.value,
      durationSeconds: await durationOrFallback(blob.value, 0),
    });
  },

  generateTrack: async (request, onProgress) => {
    const settings = readFalSettings();
    if (settings.apiKey.length === 0) return err(missingKeyError());

    onProgress(0.1);
    const response =
      request.lane === "music"
        ? await falPost(`${FAL_SYNC_BASE}/${MUSIC_MODEL}`, settings.apiKey, {
            prompt: request.prompt,
            music_length_ms: Math.round(
              clamp(request.durationSeconds * 1000, MIN_MUSIC_MS, MAX_MUSIC_MS),
            ),
          })
        : await falPost(
            `${FAL_SYNC_BASE}/${SOUND_EFFECTS_MODEL}`,
            settings.apiKey,
            {
              text: request.prompt,
              duration_seconds: clamp(
                request.durationSeconds,
                MIN_SFX_SECONDS,
                MAX_SFX_SECONDS,
              ),
            },
          );
    if (!response.ok) return response;

    onProgress(0.7);
    const blob = await blobFromResponse(response.value);
    if (!blob.ok) return blob;

    onProgress(0.9);
    return ok({
      blob: blob.value,
      durationSeconds: await durationOrFallback(
        blob.value,
        request.durationSeconds,
      ),
    });
  },
};
