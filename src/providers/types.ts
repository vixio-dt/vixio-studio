import type { Result } from "@/lib/result";
import type { AspectRatio, VisualStyle } from "@/domain/types";

/* ------------------------------------------------------------------ */
/* Script generation                                                   */
/* ------------------------------------------------------------------ */

export type ScriptRequest = {
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  sceneCount: number;
};

/** Provider-neutral structured screenplay, ready to import into a project. */
export type GeneratedScript = {
  synopsis: string;
  characters: {
    name: string;
    role: "lead" | "supporting" | "minor";
    bio: string;
    appearance: string;
    wardrobe: string;
  }[];
  scenes: {
    setting: "interior" | "exterior";
    location: string;
    timeOfDay: "day" | "night" | "dawn" | "dusk";
    summary: string;
    body: string;
    characterNames: string[];
  }[];
};

export type GeneratedShotList = {
  shots: {
    description: string;
    dialogue: string | null;
    size:
      | "extreme-wide"
      | "wide"
      | "medium"
      | "close-up"
      | "extreme-close-up"
      | "over-the-shoulder"
      | "insert";
    angle: "eye-level" | "low" | "high" | "overhead" | "dutch";
    movement:
      | "static"
      | "push-in"
      | "pull-out"
      | "pan-left"
      | "pan-right"
      | "tilt-up"
      | "tilt-down"
      | "tracking"
      | "orbit"
      | "handheld"
      | "crane-up";
    durationSeconds: number;
    characterNames: string[];
  }[];
};

/* ------------------------------------------------------------------ */
/* Image and video generation                                          */
/* ------------------------------------------------------------------ */

export type ImageRequest = {
  prompt: string;
  aspectRatio: AspectRatio;
  seed: number;
  style: VisualStyle;
  /** Data/object URLs of reference images (character identity, location). */
  referenceImageUrls: string[];
};

export type ImageResult = {
  url: string;
  width: number;
  height: number;
};

export type VideoRequest = {
  prompt: string;
  aspectRatio: AspectRatio;
  seed: number;
  durationSeconds: number;
  /** Start frame; the mock provider animates this image. */
  startFrameUrl: string | null;
  /**
   * Previz clip that drives camera and motion. Only fal driving-capable
   * models consume it; other providers reject or ignore it.
   */
  drivingVideoUrl: string | null;
  movement: string;
};

export type VideoResult = {
  url: string;
  width: number;
  height: number;
  durationSeconds: number;
};

/* ------------------------------------------------------------------ */
/* Audio generation                                                    */
/* ------------------------------------------------------------------ */

export type SpeechRequest = {
  text: string;
  /** Provider voice id; when unset the provider picks a default voice. */
  voiceId?: string;
  /** Speaker name; the preview synth derives a stable voice from it. */
  characterName?: string;
};

export type SpeechResult = {
  blob: Blob;
  durationSeconds: number;
};

export type TrackRequest = {
  prompt: string;
  lane: "music" | "ambience";
  durationSeconds: number;
};

export type TrackResult = {
  blob: Blob;
  durationSeconds: number;
};

/* ------------------------------------------------------------------ */
/* Provider interfaces                                                 */
/* ------------------------------------------------------------------ */

export type ProgressReporter = (progress: number) => void;

export type TextProvider = {
  id: string;
  name: string;
  generateScript: (request: ScriptRequest) => Promise<Result<GeneratedScript>>;
  generateShotList: (input: {
    sceneSummary: string;
    sceneBody: string;
    characterNames: string[];
  }) => Promise<Result<GeneratedShotList>>;
};

export type ImageProvider = {
  id: string;
  name: string;
  generateImage: (
    request: ImageRequest,
    onProgress: ProgressReporter,
  ) => Promise<Result<ImageResult>>;
};

export type VideoProvider = {
  id: string;
  name: string;
  generateVideo: (
    request: VideoRequest,
    onProgress: ProgressReporter,
  ) => Promise<Result<VideoResult>>;
};

export type AudioProvider = {
  id: string;
  name: string;
  generateSpeech: (
    request: SpeechRequest,
    onProgress: ProgressReporter,
  ) => Promise<Result<SpeechResult>>;
  generateTrack: (
    request: TrackRequest,
    onProgress: ProgressReporter,
  ) => Promise<Result<TrackResult>>;
};
