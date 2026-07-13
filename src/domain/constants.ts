import type {
  AspectRatio,
  CameraAngle,
  CameraBody,
  CameraMovement,
  CameraPreset,
  ComicLayout,
  ComicStyle,
  ComicStyleId,
  LensChoice,
  LightingChoice,
  ProjectFormat,
  ReadingDirection,
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
/* Camera bodies: look descriptors appended to video prompts           */
/* ------------------------------------------------------------------ */

export const CAMERA_BODIES = [
  {
    id: "alexa-35",
    label: "Alexa 35",
    promptFragment:
      "shot on an Arri Alexa 35, wide dynamic range, gentle highlight rolloff, filmic color science",
  },
  {
    id: "venice",
    label: "Venice",
    promptFragment:
      "shot on a Sony Venice, clean full frame image, deep color depth, refined low light rendering",
  },
  {
    id: "komodo",
    label: "Komodo",
    promptFragment:
      "shot on a Red Komodo, crisp 6k texture, punchy contrast, modern digital cinema look",
  },
  {
    id: "super-16",
    label: "Super 16",
    promptFragment:
      "shot on Super 16 film, coarse organic grain, soft halation, vintage documentary texture",
  },
  {
    id: "imax-70",
    label: "IMAX 70mm",
    promptFragment:
      "shot on 70mm IMAX film, immense resolution, monumental large format depth, pristine fine grain",
  },
  {
    id: "dv-cam",
    label: "DV cam",
    promptFragment:
      "shot on a 90s DV camcorder, interlaced video texture, blown highlights, lo-fi handheld home footage look",
  },
] as const satisfies readonly CameraBody[];

export const findCameraBody = (id: string): CameraBody | null =>
  CAMERA_BODIES.find((body) => body.id === id) ?? null;

/* ------------------------------------------------------------------ */
/* Camera presets: named cinematic moves (DoP vocabulary)              */
/* ------------------------------------------------------------------ */

export const CAMERA_PRESETS = [
  {
    id: "dolly-in",
    label: "Dolly in",
    promptFragment: "smooth dolly push toward the subject, deliberate and controlled",
  },
  {
    id: "dolly-out",
    label: "Dolly out",
    promptFragment: "smooth dolly pull away from the subject, gradually revealing the surroundings",
  },
  {
    id: "crash-zoom-in",
    label: "Crash zoom in",
    promptFragment: "aggressive crash zoom punching in on the subject, abrupt and kinetic",
  },
  {
    id: "dolly-zoom-in",
    label: "Dolly zoom in",
    promptFragment:
      "dolly zoom, camera pushes in while the lens zooms out, background stretching with a vertigo effect",
  },
  {
    id: "whip-pan",
    label: "Whip pan",
    promptFragment: "fast whip pan, motion blur streaking across the frame between subjects",
  },
  {
    id: "crane-up",
    label: "Crane up",
    promptFragment: "crane rising vertically above the scene, the view expanding below",
  },
  {
    id: "crane-over-head",
    label: "Crane over head",
    promptFragment: "crane sweeping up and over the subject into a top down overhead view",
  },
  {
    id: "orbit-360",
    label: "Orbit 360",
    promptFragment: "full 360 degree orbit around the subject at constant distance",
  },
  {
    id: "arc-left",
    label: "Arc left",
    promptFragment: "camera arcs left around the subject in a smooth curved track",
  },
  {
    id: "arc-right",
    label: "Arc right",
    promptFragment: "camera arcs right around the subject in a smooth curved track",
  },
  {
    id: "snorricam",
    label: "Snorricam",
    promptFragment:
      "snorricam rig locked to the subject's body, face fixed in frame while the world swings around them",
  },
  {
    id: "fpv-drone",
    label: "FPV drone",
    promptFragment: "fpv drone flight, agile swooping path threading through the space at speed",
  },
  {
    id: "handheld",
    label: "Handheld",
    promptFragment: "handheld camera with organic shake and human sway, documentary energy",
  },
  {
    id: "bullet-time",
    label: "Bullet time",
    promptFragment: "bullet time, the instant frozen while the camera sweeps around the subject",
  },
  {
    id: "dutch-angle",
    label: "Dutch angle",
    promptFragment: "camera holds a tilted dutch angle, the horizon slanted with unease",
  },
  {
    id: "through-object",
    label: "Through object",
    promptFragment:
      "camera passes impossibly through a foreground object and continues beyond it in one move",
  },
  {
    id: "head-tracking",
    label: "Head tracking",
    promptFragment: "camera tracks the subject's head, keeping the face locked center frame as they move",
  },
  {
    id: "static",
    label: "Static",
    promptFragment: "locked off static camera, the composition holds while the scene moves within it",
  },
] as const satisfies readonly CameraPreset[];

export const findCameraPreset = (id: string): CameraPreset | null =>
  CAMERA_PRESETS.find((preset) => preset.id === id) ?? null;

/* ------------------------------------------------------------------ */
/* Comic layouts: panel rectangles in 0..1 page fractions              */
/* ------------------------------------------------------------------ */

const COMIC_PAGE = { width: 1024, height: 1536 };
const WEBTOON_PAGE = { width: 800, height: 2400 };

export const COMIC_LAYOUTS = [
  {
    id: "splash",
    label: "Splash",
    promptFragment: "single full page splash panel, maximum impact composition",
    pageSize: COMIC_PAGE,
    frames: [{ x: 0.04, y: 0.04, w: 0.92, h: 0.92 }],
  },
  {
    id: "grid-2x2",
    label: "Grid 2x2",
    promptFragment: "regular four panel grid, two rows of two, even pacing",
    pageSize: COMIC_PAGE,
    frames: [
      { x: 0.04, y: 0.04, w: 0.44, h: 0.44 },
      { x: 0.52, y: 0.04, w: 0.44, h: 0.44 },
      { x: 0.04, y: 0.52, w: 0.44, h: 0.44 },
      { x: 0.52, y: 0.52, w: 0.44, h: 0.44 },
    ],
  },
  {
    id: "grid-3x3",
    label: "Grid 3x3",
    promptFragment: "nine panel grid, three rows of three, metronomic beat pacing",
    pageSize: COMIC_PAGE,
    frames: [
      { x: 0.04, y: 0.04, w: 0.28, h: 0.28 },
      { x: 0.36, y: 0.04, w: 0.28, h: 0.28 },
      { x: 0.68, y: 0.04, w: 0.28, h: 0.28 },
      { x: 0.04, y: 0.36, w: 0.28, h: 0.28 },
      { x: 0.36, y: 0.36, w: 0.28, h: 0.28 },
      { x: 0.68, y: 0.36, w: 0.28, h: 0.28 },
      { x: 0.04, y: 0.68, w: 0.28, h: 0.28 },
      { x: 0.36, y: 0.68, w: 0.28, h: 0.28 },
      { x: 0.68, y: 0.68, w: 0.28, h: 0.28 },
    ],
  },
  {
    id: "rows-3",
    label: "Rows of 3",
    promptFragment: "three full width panel rows stacked vertically, widescreen pacing",
    pageSize: COMIC_PAGE,
    frames: [
      { x: 0.04, y: 0.04, w: 0.92, h: 0.28 },
      { x: 0.04, y: 0.36, w: 0.92, h: 0.28 },
      { x: 0.04, y: 0.68, w: 0.92, h: 0.28 },
    ],
  },
  {
    id: "mixed-5",
    label: "Mixed 5",
    promptFragment: "five panel page, two large panels on top and three beats below",
    pageSize: COMIC_PAGE,
    frames: [
      { x: 0.04, y: 0.04, w: 0.44, h: 0.44 },
      { x: 0.52, y: 0.04, w: 0.44, h: 0.44 },
      { x: 0.04, y: 0.52, w: 0.28, h: 0.44 },
      { x: 0.36, y: 0.52, w: 0.28, h: 0.44 },
      { x: 0.68, y: 0.52, w: 0.28, h: 0.44 },
    ],
  },
  {
    id: "webtoon-4",
    label: "Webtoon strip",
    promptFragment: "vertical webtoon strip, four stacked panels read by scrolling",
    pageSize: WEBTOON_PAGE,
    frames: [
      { x: 0.05, y: 0.02, w: 0.9, h: 0.2125 },
      { x: 0.05, y: 0.2575, w: 0.9, h: 0.2125 },
      { x: 0.05, y: 0.495, w: 0.9, h: 0.2125 },
      { x: 0.05, y: 0.7325, w: 0.9, h: 0.2125 },
    ],
  },
] as const satisfies readonly ComicLayout[];

export const findComicLayout = (layoutId: string): ComicLayout => {
  const found = COMIC_LAYOUTS.find((layout) => layout.id === layoutId);
  return found ?? COMIC_LAYOUTS[0];
};

/* ------------------------------------------------------------------ */
/* Comic styles                                                        */
/* ------------------------------------------------------------------ */

export const COMIC_STYLES = [
  {
    id: "manga-bw",
    label: "Manga",
    blurb: "Black and white, screentones, kinetic linework",
    promptFragment:
      "black and white manga style, precise inked linework, screentone shading, dramatic speed lines, high contrast composition",
    gradeFrom: "#16181c",
    gradeTo: "#d8dade",
  },
  {
    id: "western-color",
    label: "Western color",
    blurb: "Bold inks, flat saturated color, halftone dots",
    promptFragment:
      "western comic book style, bold black ink outlines, flat saturated colors, halftone dot shading, heroic staging",
    gradeFrom: "#1d2a4a",
    gradeTo: "#d9573b",
  },
  {
    id: "noir-ink",
    label: "Noir ink",
    blurb: "Heavy blacks, stark chiaroscuro, rough brushwork",
    promptFragment:
      "noir ink illustration, heavy black shadows, stark chiaroscuro, rough expressive brush inking, rain soaked atmosphere",
    gradeFrom: "#0d0f14",
    gradeTo: "#8a93a5",
  },
  {
    id: "ligne-claire",
    label: "Ligne claire",
    blurb: "Uniform clean line, flat color, no hatching",
    promptFragment:
      "ligne claire style, uniform clean line weight, flat unmodulated colors, no hatching, precise architectural detail",
    gradeFrom: "#2b4a6f",
    gradeTo: "#e8d9b0",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    blurb: "Soft washes, paper texture, loose edges",
    promptFragment:
      "watercolor comic illustration, soft pigment washes, visible paper texture, loose expressive edges, muted harmonious palette",
    gradeFrom: "#3a4a5a",
    gradeTo: "#d9c9a8",
  },
] as const satisfies readonly ComicStyle[];

export const DEFAULT_COMIC_STYLE_ID: ComicStyleId = "manga-bw";

export const findComicStyle = (styleId: string): ComicStyle => {
  const found = COMIC_STYLES.find((style) => style.id === styleId);
  return found ?? COMIC_STYLES[0];
};

/**
 * Adapter for the image provider seam, which grades previews with a
 * VisualStyle. The prompt fragment rides along so providers that read it see
 * the comic treatment.
 */
export const comicStyleToVisualStyle = (style: ComicStyle): VisualStyle => ({
  id: style.id,
  name: style.label,
  blurb: style.blurb,
  promptFragment: style.promptFragment,
  gradeFrom: style.gradeFrom,
  gradeTo: style.gradeTo,
});

/* ------------------------------------------------------------------ */
/* Reading directions                                                  */
/* ------------------------------------------------------------------ */

export const READING_DIRECTIONS: readonly {
  value: ReadingDirection;
  label: string;
}[] = [
  { value: "ltr", label: "Left to right" },
  { value: "rtl", label: "Right to left" },
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
