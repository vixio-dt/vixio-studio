import type {
  AspectRatio,
  CameraAngle,
  CameraMovement,
  LensChoice,
  LightingChoice,
  ProjectFormat,
  SceneTimeOfDay,
  ShotSize,
  VisualStyle,
} from "./types";

/* ------------------------------------------------------------------ */
/* Aspect ratios                                                       */
/* ------------------------------------------------------------------ */

export const ASPECT_RATIOS: readonly AspectRatio[] = [
  "16:9",
  "9:16",
  "21:9",
  "1:1",
  "4:3",
];

export const aspectRatioToDimensions = (
  ratio: AspectRatio,
): { width: number; height: number } => {
  switch (ratio) {
    case "16:9":
      return { width: 1280, height: 720 };
    case "9:16":
      return { width: 720, height: 1280 };
    case "21:9":
      return { width: 1344, height: 576 };
    case "1:1":
      return { width: 1024, height: 1024 };
    case "4:3":
      return { width: 1152, height: 864 };
  }
};

/* ------------------------------------------------------------------ */
/* Project formats                                                     */
/* ------------------------------------------------------------------ */

export const PROJECT_FORMATS: readonly {
  value: ProjectFormat;
  label: string;
  hint: string;
}[] = [
  {
    value: "short-film",
    label: "Short film",
    hint: "A self-contained story, usually 3 to 12 scenes",
  },
  {
    value: "series-episode",
    label: "Series episode",
    hint: "One episode of a longer arc, ends on a hook",
  },
  {
    value: "trailer",
    label: "Trailer",
    hint: "High-impact pitch piece, built shot by shot",
  },
];

/* ------------------------------------------------------------------ */
/* Camera vocabulary                                                   */
/* ------------------------------------------------------------------ */

export const SHOT_SIZES: readonly { value: ShotSize; label: string }[] = [
  { value: "extreme-wide", label: "Extreme wide" },
  { value: "wide", label: "Wide" },
  { value: "medium", label: "Medium" },
  { value: "close-up", label: "Close-up" },
  { value: "extreme-close-up", label: "Extreme close-up" },
  { value: "over-the-shoulder", label: "Over the shoulder" },
  { value: "insert", label: "Insert" },
];

export const CAMERA_ANGLES: readonly { value: CameraAngle; label: string }[] = [
  { value: "eye-level", label: "Eye level" },
  { value: "low", label: "Low angle" },
  { value: "high", label: "High angle" },
  { value: "overhead", label: "Overhead" },
  { value: "dutch", label: "Dutch tilt" },
];

export const CAMERA_MOVEMENTS: readonly {
  value: CameraMovement;
  label: string;
}[] = [
  { value: "static", label: "Static" },
  { value: "push-in", label: "Push in" },
  { value: "pull-out", label: "Pull out" },
  { value: "pan-left", label: "Pan left" },
  { value: "pan-right", label: "Pan right" },
  { value: "tilt-up", label: "Tilt up" },
  { value: "tilt-down", label: "Tilt down" },
  { value: "tracking", label: "Tracking" },
  { value: "orbit", label: "Orbit" },
  { value: "handheld", label: "Handheld" },
  { value: "crane-up", label: "Crane up" },
];

export const LENSES: readonly { value: LensChoice; label: string }[] = [
  { value: "16mm", label: "16mm ultra wide" },
  { value: "24mm", label: "24mm wide" },
  { value: "35mm", label: "35mm" },
  { value: "50mm", label: "50mm" },
  { value: "85mm", label: "85mm portrait" },
  { value: "135mm", label: "135mm tele" },
];

export const LIGHTING_CHOICES: readonly {
  value: LightingChoice;
  label: string;
}[] = [
  { value: "natural", label: "Natural" },
  { value: "golden-hour", label: "Golden hour" },
  { value: "blue-hour", label: "Blue hour" },
  { value: "high-key", label: "High key" },
  { value: "low-key", label: "Low key" },
  { value: "neon", label: "Neon" },
  { value: "firelight", label: "Firelight" },
  { value: "overcast", label: "Overcast" },
];

export const TIMES_OF_DAY: readonly {
  value: SceneTimeOfDay;
  label: string;
}[] = [
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
  { value: "dawn", label: "Dawn" },
  { value: "dusk", label: "Dusk" },
];

/* ------------------------------------------------------------------ */
/* Visual styles                                                       */
/* ------------------------------------------------------------------ */

export const VISUAL_STYLES: readonly VisualStyle[] = [
  {
    id: "cinematic-realism",
    name: "Cinematic realism",
    blurb: "Anamorphic grain, naturalistic grade, festival drama",
    promptFragment:
      "cinematic film still, anamorphic lens, shallow depth of field, fine film grain, naturalistic color grade",
    gradeFrom: "#1c2733",
    gradeTo: "#8c9aa8",
  },
  {
    id: "neo-noir",
    name: "Neo-noir",
    blurb: "Hard shadows, wet streets, sodium and cyan",
    promptFragment:
      "neo-noir film still, hard chiaroscuro lighting, wet reflective streets, sodium vapor and cyan highlights, deep blacks",
    gradeFrom: "#0e1420",
    gradeTo: "#c98e3f",
  },
  {
    id: "painted-animation",
    name: "Painted animation",
    blurb: "Hand-painted backgrounds, soft volumetric light",
    promptFragment:
      "hand-painted animation still, painterly brushwork, soft volumetric light, rich color harmony, detailed background art",
    gradeFrom: "#2a3550",
    gradeTo: "#e8b86a",
  },
  {
    id: "ink-wash",
    name: "Ink wash",
    blurb: "East Asian brush painting, mist and negative space",
    promptFragment:
      "ink wash painting style, sumi-e brushwork, atmospheric mist, generous negative space, muted earth tones with one accent",
    gradeFrom: "#202326",
    gradeTo: "#b8bcb0",
  },
  {
    id: "docu-handheld",
    name: "Documentary",
    blurb: "Available light, honest texture, vérité framing",
    promptFragment:
      "documentary film still, available light, honest natural texture, vérité handheld framing, true-to-life color",
    gradeFrom: "#23282b",
    gradeTo: "#9aa39b",
  },
  {
    id: "retro-anime",
    name: "Retro anime",
    blurb: "90s cel animation, halation glow, painted skies",
    promptFragment:
      "1990s cel animation still, hand-drawn linework, halation glow, painted cloud backgrounds, nostalgic color palette",
    gradeFrom: "#1f2a44",
    gradeTo: "#d77a90",
  },
];

export const DEFAULT_STYLE_ID = "cinematic-realism";

export const findVisualStyle = (styleId: string): VisualStyle => {
  const found = VISUAL_STYLES.find((style) => style.id === styleId);
  return found ?? VISUAL_STYLES[0]!;
};

/* ------------------------------------------------------------------ */
/* Motion presets for image-to-video                                   */
/* ------------------------------------------------------------------ */

export type MotionPreset = {
  movement: CameraMovement;
  label: string;
  /** Sent to video models as the motion direction. */
  promptFragment: string;
};

export const MOTION_PRESETS: readonly MotionPreset[] = [
  { movement: "static", label: "Static", promptFragment: "locked-off camera, subtle ambient motion only" },
  { movement: "push-in", label: "Push in", promptFragment: "slow push in toward the subject" },
  { movement: "pull-out", label: "Pull out", promptFragment: "slow pull back revealing the space" },
  { movement: "pan-left", label: "Pan left", promptFragment: "smooth pan from right to left" },
  { movement: "pan-right", label: "Pan right", promptFragment: "smooth pan from left to right" },
  { movement: "tilt-up", label: "Tilt up", promptFragment: "slow tilt upward" },
  { movement: "tilt-down", label: "Tilt down", promptFragment: "slow tilt downward" },
  { movement: "tracking", label: "Tracking", promptFragment: "lateral tracking shot following the subject" },
  { movement: "orbit", label: "Orbit", promptFragment: "slow orbital move around the subject" },
  { movement: "handheld", label: "Handheld", promptFragment: "handheld camera with organic sway" },
  { movement: "crane-up", label: "Crane up", promptFragment: "crane move rising above the scene" },
];

export const VIDEO_DURATIONS: readonly number[] = [3, 5, 8, 10];
