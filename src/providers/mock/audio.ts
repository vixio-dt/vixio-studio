import { createRng, hashStringToSeed } from "@/lib/random";
import { ok } from "@/lib/result";
import { sleep } from "@/lib/time";

import type { AudioProvider } from "../types";

/**
 * Offline preview synth. Renders PCM directly into a Float32Array (no
 * AudioContext, so it works in headless Chromium) and encodes a mono 16-bit
 * WAV blob. Speech becomes syllable-like tone bursts paced by the text,
 * music a slow triad arpeggio loop, ambience filtered noise with a slow
 * swell. The same text or prompt always renders the same audio.
 */

const SAMPLE_RATE = 24_000;

const SECONDS_PER_WORD = 0.35;
const MAX_SPEECH_SECONDS = 45;
const MIN_TRACK_SECONDS = 1;
const MAX_TRACK_SECONDS = 120;

type Rng = () => number;

/* ------------------------------------------------------------------ */
/* WAV encoding                                                        */
/* ------------------------------------------------------------------ */

/** Mono 16-bit PCM RIFF/WAVE encoder; 44-byte header plus samples. */
const encodeWav = (samples: Float32Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index++) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index++) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(
      44 + index * 2,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
};

/** 40ms linear fade at both ends so clips never click. */
const fadeEdges = (samples: Float32Array): Float32Array => {
  const edge = Math.min(Math.floor(SAMPLE_RATE * 0.04), Math.floor(samples.length / 2));
  for (let index = 0; index < edge; index++) {
    const gain = index / edge;
    samples[index] = (samples[index] ?? 0) * gain;
    const tail = samples.length - 1 - index;
    samples[tail] = (samples[tail] ?? 0) * gain;
  }
  return samples;
};

/* ------------------------------------------------------------------ */
/* Speech: syllable-like tone bursts paced by the text                 */
/* ------------------------------------------------------------------ */

const synthesizeSpeech = (text: string, voiceKey: string): Float32Array => {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const seconds = Math.min(
    MAX_SPEECH_SECONDS,
    Math.max(0.6, Math.max(1, words.length) * SECONDS_PER_WORD),
  );
  const total = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Float32Array(total);

  const rng: Rng = createRng(hashStringToSeed(`${voiceKey}::${text}`));
  // A per-voice register between 150 and 210Hz; syllables wander around it.
  const register = 150 + createRng(hashStringToSeed(voiceKey))() * 60;

  const wordSamples = Math.floor(SECONDS_PER_WORD * SAMPLE_RATE);
  let cursor = 0;
  for (const word of words) {
    if (cursor >= total) break;
    const syllables = Math.max(1, Math.round(word.length / 3));
    // Voice about three quarters of the word slot; the rest is a beat of air.
    const voiced = Math.floor(wordSamples * 0.75);
    const perSyllable = Math.max(1, Math.floor(voiced / syllables));

    for (let syllable = 0; syllable < syllables; syllable++) {
      const pitch = Math.min(260, Math.max(150, register + (rng() - 0.5) * 70));
      const start = cursor + syllable * perSyllable;
      for (let index = 0; index < perSyllable; index++) {
        const at = start + index;
        if (at >= total) break;
        const t = index / SAMPLE_RATE;
        const envelope = Math.sin(Math.PI * (index / perSyllable)) ** 0.8;
        const fundamental = Math.sin(2 * Math.PI * pitch * t);
        const overtone = 0.35 * Math.sin(2 * Math.PI * pitch * 2 * t + 0.6);
        const formant = 0.12 * Math.sin(2 * Math.PI * pitch * 3.1 * t + 1.4);
        samples[at] = 0.3 * envelope * (fundamental + overtone + formant);
      }
    }
    cursor += wordSamples;
  }
  return fadeEdges(samples);
};

/* ------------------------------------------------------------------ */
/* Music: slow triad arpeggio loop                                     */
/* ------------------------------------------------------------------ */

const MAJOR_TRIAD = [1, 5 / 4, 3 / 2, 2] as const;
const MINOR_TRIAD = [1, 6 / 5, 3 / 2, 2] as const;
const ARPEGGIO_PATTERN = [0, 1, 2, 3, 2, 1] as const;

const synthesizeMusic = (prompt: string, seconds: number): Float32Array => {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const rng: Rng = createRng(hashStringToSeed(`music::${prompt}`));

  const root = 196 + rng() * 66; // G3 up to around C4
  const triad = rng() < 0.5 ? MINOR_TRIAD : MAJOR_TRIAD;
  const noteSamples = Math.floor(0.5 * SAMPLE_RATE);

  for (let index = 0; index < total; index++) {
    const note = Math.floor(index / noteSamples);
    const step = ARPEGGIO_PATTERN[note % ARPEGGIO_PATTERN.length] ?? 0;
    const frequency = root * (triad[step] ?? 1);
    const within = (index % noteSamples) / noteSamples;
    const envelope = Math.min(1, within * 14) * Math.exp(-2.4 * within);
    const t = index / SAMPLE_RATE;
    const tone =
      Math.sin(2 * Math.PI * frequency * t) +
      0.3 * Math.sin(2 * Math.PI * frequency * 2 * t);
    const swell = 0.85 + 0.15 * Math.sin((2 * Math.PI * index) / (SAMPLE_RATE * 8));
    samples[index] = 0.22 * envelope * tone * swell;
  }
  return fadeEdges(samples);
};

/* ------------------------------------------------------------------ */
/* Ambience: filtered noise with a slow swell                          */
/* ------------------------------------------------------------------ */

const synthesizeAmbience = (prompt: string, seconds: number): Float32Array => {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const rng: Rng = createRng(hashStringToSeed(`ambience::${prompt}`));

  const cutoff = 0.03 + rng() * 0.07; // one-pole lowpass coefficient
  const swellSeconds = 5 + rng() * 6;
  const makeup = 2.4 / Math.sqrt(cutoff); // level the filtered noise

  let filtered = 0;
  for (let index = 0; index < total; index++) {
    const white = rng() * 2 - 1;
    filtered += cutoff * (white - filtered);
    const swell =
      0.7 + 0.3 * Math.sin((2 * Math.PI * index) / (SAMPLE_RATE * swellSeconds));
    samples[index] = Math.max(
      -1,
      Math.min(1, 0.18 * makeup * filtered * swell),
    );
  }
  return fadeEdges(samples);
};

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

const clampTrackSeconds = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 8;
  return Math.min(MAX_TRACK_SECONDS, Math.max(MIN_TRACK_SECONDS, value));
};

export const previewAudioProvider: AudioProvider = {
  id: "vixio-preview",
  name: "Vixio preview synth",

  generateSpeech: async (request, onProgress) => {
    await sleep(160);
    onProgress(0.3);
    const voiceKey = request.voiceId ?? request.characterName ?? "narrator";
    const samples = synthesizeSpeech(request.text, voiceKey);
    onProgress(0.85);
    await sleep(120);
    return ok({
      blob: encodeWav(samples, SAMPLE_RATE),
      durationSeconds: samples.length / SAMPLE_RATE,
    });
  },

  generateTrack: async (request, onProgress) => {
    await sleep(160);
    onProgress(0.3);
    const seconds = clampTrackSeconds(request.durationSeconds);
    const samples =
      request.lane === "music"
        ? synthesizeMusic(request.prompt, seconds)
        : synthesizeAmbience(request.prompt, seconds);
    onProgress(0.85);
    await sleep(120);
    return ok({
      blob: encodeWav(samples, SAMPLE_RATE),
      durationSeconds: samples.length / SAMPLE_RATE,
    });
  },
};
