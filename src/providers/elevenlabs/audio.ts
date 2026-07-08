import { err, ok } from "@/lib/result";
import { probeAudioDuration } from "@/stores/assets";

import type { AudioProvider } from "../types";
import {
  elevenLabsPostForAudio,
  missingKeyError,
  readElevenLabsSettings,
} from "./shared";

/**
 * Speech, music, and ambience over the ElevenLabs REST API. Every endpoint
 * streams encoded audio bytes (mp3) which land here as a Blob; the duration
 * is probed from HTMLAudio metadata after the fact, with a graceful fallback
 * when the browser cannot read it (zero for speech, the requested length for
 * tracks; callers treat zero as unknown and re-probe).
 */

const MIN_MUSIC_MS = 10_000;
const MAX_MUSIC_MS = 300_000;
const MIN_SFX_SECONDS = 0.5;
const MAX_SFX_SECONDS = 30;

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const durationOrFallback = async (
  blob: Blob,
  fallbackSeconds: number,
): Promise<number> => {
  const probed = await probeAudioDuration(blob);
  return probed ?? fallbackSeconds;
};

export const elevenLabsAudioProvider: AudioProvider = {
  id: "elevenlabs",
  name: "ElevenLabs",

  generateSpeech: async (request, onProgress) => {
    const settings = readElevenLabsSettings();
    if (settings.apiKey.length === 0) return err(missingKeyError());

    const voiceId =
      request.voiceId !== undefined && request.voiceId.trim().length > 0
        ? request.voiceId.trim()
        : settings.defaultVoiceId;

    onProgress(0.15);
    const audio = await elevenLabsPostForAudio(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      settings.apiKey,
      { text: request.text, model_id: settings.ttsModel },
    );
    if (!audio.ok) return audio;

    onProgress(0.9);
    return ok({
      blob: audio.value,
      durationSeconds: await durationOrFallback(audio.value, 0),
    });
  },

  generateTrack: async (request, onProgress) => {
    const settings = readElevenLabsSettings();
    if (settings.apiKey.length === 0) return err(missingKeyError());

    onProgress(0.1);
    const audio =
      request.lane === "music"
        ? await elevenLabsPostForAudio("/v1/music", settings.apiKey, {
            prompt: request.prompt,
            music_length_ms: Math.round(
              clamp(request.durationSeconds * 1000, MIN_MUSIC_MS, MAX_MUSIC_MS),
            ),
          })
        : await elevenLabsPostForAudio("/v1/sound-generation", settings.apiKey, {
            text: request.prompt,
            duration_seconds: clamp(
              request.durationSeconds,
              MIN_SFX_SECONDS,
              MAX_SFX_SECONDS,
            ),
            loop: true,
          });
    if (!audio.ok) return audio;

    onProgress(0.9);
    return ok({
      blob: audio.value,
      durationSeconds: await durationOrFallback(
        audio.value,
        request.durationSeconds,
      ),
    });
  },
};
