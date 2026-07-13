import type {
  AssetId,
  CharacterId,
  PageId,
  PanelId,
  ProjectId,
  SceneId,
  ShotId,
  TaskId,
} from "@/lib/id";

/* ------------------------------------------------------------------ */
/* Project                                                            */
/* ------------------------------------------------------------------ */

export type ProjectFormat = "short-film" | "series-episode" | "trailer";

/** The two engines: a film moves through shots, a comic through panels. */
export type ProjectMode = "film" | "comic";

export type ReadingDirection = "ltr" | "rtl";

export type Project = {
  id: ProjectId;
  title: string;
  logline: string;
  synopsis: string;
  mode: ProjectMode;
  format: ProjectFormat;
  genre: string;
  styleId: VisualStyleId;
  /** Comic projects only; film projects leave it unset. */
  comicStyleId?: ComicStyleId;
  /** Comic projects only; film projects leave it unset. */
  readingDirection?: ReadingDirection;
  aspectRatio: AspectRatio;
  coverAssetId: AssetId | null;
  /** Master level for the dialogue lane in playback and render; 0..1, defaults to 1 when unset. */
  dialogueGain?: number;
  createdAt: string;
  updatedAt: string;
};

export type AspectRatio = "16:9" | "9:16" | "21:9" | "1:1" | "4:3";

/* ------------------------------------------------------------------ */
/* Script structure: Project -> Scene -> Shot                          */
/* ------------------------------------------------------------------ */

export type SceneTimeOfDay = "day" | "night" | "dawn" | "dusk";
export type SceneInteriorExterior = "interior" | "exterior";

export type Scene = {
  id: SceneId;
  projectId: ProjectId;
  index: number;
  /** Screenplay slug line pieces: "INT. LIGHTHOUSE KITCHEN - NIGHT". */
  setting: SceneInteriorExterior;
  location: string;
  timeOfDay: SceneTimeOfDay;
  summary: string;
  /** Full scene text in screenplay style: action lines and dialogue. */
  body: string;
  characterIds: CharacterId[];
};

export type ShotSize =
  | "extreme-wide"
  | "wide"
  | "medium"
  | "close-up"
  | "extreme-close-up"
  | "over-the-shoulder"
  | "insert";

export type CameraAngle = "eye-level" | "low" | "high" | "overhead" | "dutch";

export type CameraMovement =
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

/** Cinematic move presets for previz and video prompts (DoP vocabulary). */
export type CameraPresetId =
  | "dolly-in"
  | "dolly-out"
  | "crash-zoom-in"
  | "dolly-zoom-in"
  | "whip-pan"
  | "crane-up"
  | "crane-over-head"
  | "orbit-360"
  | "arc-left"
  | "arc-right"
  | "snorricam"
  | "fpv-drone"
  | "handheld"
  | "bullet-time"
  | "dutch-angle"
  | "through-object"
  | "head-tracking"
  | "static";

/** Camera body looks appended to video prompts. */
export type CameraBodyId =
  | "alexa-35"
  | "venice"
  | "komodo"
  | "super-16"
  | "imax-70"
  | "dv-cam";

export type Shot = {
  id: ShotId;
  sceneId: SceneId;
  projectId: ProjectId;
  index: number;
  /** What the audience sees, written as direction: "Mara turns from the window". */
  description: string;
  dialogue: string | null;
  size: ShotSize;
  angle: CameraAngle;
  movement: CameraMovement;
  lens: LensChoice;
  lighting: LightingChoice;
  durationSeconds: number;
  characterIds: CharacterId[];
  /** Free-text additions appended to the composed image prompt. */
  promptNotes: string;
  seed: number;
  seedLocked: boolean;
  frameAssetId: AssetId | null;
  videoAssetId: AssetId | null;
  /** Every frame ever generated for this shot, newest first. */
  frameHistory: AssetId[];
  /** Set when the shot was imported from a comic panel. */
  sourcePanelId?: PanelId;
  /** Cinematic move preset appended to the video prompt when set. */
  cameraPresetId?: CameraPresetId;
  /** Camera body look appended to the video prompt when set. */
  cameraBodyId?: CameraBodyId;
  /** Rendered previz clip or still for this shot. */
  previzAssetId?: AssetId;
  /** Generated dialogue audio for this shot. */
  dialogueAssetId?: AssetId;
};

export type LensChoice = "16mm" | "24mm" | "35mm" | "50mm" | "85mm" | "135mm";

export type LightingChoice =
  | "natural"
  | "golden-hour"
  | "blue-hour"
  | "high-key"
  | "low-key"
  | "neon"
  | "firelight"
  | "overcast";

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

export type CharacterRole = "lead" | "supporting" | "minor";

export type Character = {
  id: CharacterId;
  projectId: ProjectId;
  name: string;
  role: CharacterRole;
  /** Who they are in the story. */
  bio: string;
  /** What they look like; feeds image prompts verbatim. */
  appearance: string;
  /** Wardrobe and props that must stay consistent across shots. */
  wardrobe: string;
  portraitAssetId: AssetId | null;
  portraitHistory: AssetId[];
  seed: number;
  /** Provider voice id used for generated dialogue. */
  voiceId?: string;
  /** Display name of the chosen voice. */
  voiceName?: string;
};

/* ------------------------------------------------------------------ */
/* Comic structure: Project -> ComicPage -> Panel                      */
/* ------------------------------------------------------------------ */

export type ComicLayoutId =
  | "splash"
  | "grid-2x2"
  | "grid-3x3"
  | "rows-3"
  | "mixed-5"
  | "webtoon-4";

export type ComicStyleId =
  | "manga-bw"
  | "western-color"
  | "noir-ink"
  | "ligne-claire"
  | "watercolor";

export type ComicPage = {
  id: PageId;
  projectId: ProjectId;
  index: number;
  layoutId: ComicLayoutId;
  createdAt: string;
  updatedAt: string;
};

/** One generated take for a panel, newest first; mirrors Shot.frameHistory entries. */
export type PanelTake = AssetId;

export type BalloonKind =
  | "speech"
  | "thought"
  | "whisper"
  | "burst"
  | "caption"
  | "sfx";

/** A lettering element placed over a panel; x/y/width are 0..1 panel fractions. */
export type Balloon = {
  id: string;
  kind: BalloonKind;
  characterId?: CharacterId;
  text: string;
  x: number;
  y: number;
  width: number;
  /** Degrees; where the tail points, for speech and thought balloons. */
  tailAngle?: number;
  /** Multiplier on the base lettering size; 0.5..2, defaults to 1 when unset. */
  fontScale?: number;
};

export type Panel = {
  id: PanelId;
  pageId: PageId;
  projectId: ProjectId;
  index: number;
  /** What the reader sees, written as direction: "Mara turns from the window". */
  description: string;
  /** Free-text additions appended to the composed panel prompt. */
  promptNotes: string;
  characterIds: CharacterId[];
  seed: number;
  seedLocked: boolean;
  imageAssetId?: AssetId;
  /** Every take ever generated for this panel, newest first. */
  imageHistory: PanelTake[];
  balloons: Balloon[];
  /** Set when the panel was imported from a film shot. */
  sourceShotId?: ShotId;
};

/* ------------------------------------------------------------------ */
/* Visual styles                                                       */
/* ------------------------------------------------------------------ */

export type VisualStyleId = string & { readonly __tag?: "VisualStyleId" };

export type VisualStyle = {
  id: VisualStyleId;
  name: string;
  /** One-line description shown in pickers. */
  blurb: string;
  /** Fragment merged into every image prompt for the project. */
  promptFragment: string;
  /** Two stops used by the mock renderer's grade. */
  gradeFrom: string;
  gradeTo: string;
};

export type ComicStyle = {
  id: ComicStyleId;
  label: string;
  /** One-line description shown in pickers. */
  blurb: string;
  /** Fragment merged into every panel prompt for the project. */
  promptFragment: string;
  /** Two stops used by the mock renderer's grade. */
  gradeFrom: string;
  gradeTo: string;
};

/** One panel rectangle in 0..1 page fractions. */
export type ComicLayoutFrame = { x: number; y: number; w: number; h: number };

export type ComicLayout = {
  id: ComicLayoutId;
  label: string;
  /** Fragment for full-page compositions that reference the grid. */
  promptFragment: string;
  /** Pixel dimensions of the page this layout targets; webtoon pages are tall. */
  pageSize: { width: number; height: number };
  /** Panel rectangles in reading order, 0..1 page fractions. */
  frames: readonly ComicLayoutFrame[];
};

export type CameraPreset = {
  id: CameraPresetId;
  label: string;
  /** Cinematic description of the move, appended to video prompts. */
  promptFragment: string;
};

export type CameraBody = {
  id: CameraBodyId;
  label: string;
  /** Look descriptor appended to video prompts. */
  promptFragment: string;
};

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

export type AssetKind = "image" | "video" | "audio" | "model3d";

export type Asset = {
  id: AssetId;
  projectId: ProjectId;
  kind: AssetKind;
  /** Object URL or data URL ready for <img>/<video> src. */
  url: string;
  width: number;
  height: number;
  /** Seconds; null for images and 3d models. */
  duration: number | null;
  prompt: string;
  model: string;
  seed: number;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Audio tracks                                                        */
/* ------------------------------------------------------------------ */

export type AudioLane = "music" | "ambience";

export type AudioTrack = {
  id: string;
  projectId: ProjectId;
  lane: AudioLane;
  prompt: string;
  assetId?: AssetId;
  /** Playback gain, 0..1. */
  gain: number;
  muted: boolean;
};

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

export type GenerationTarget =
  | { kind: "shot-frame"; shotId: ShotId }
  | { kind: "shot-video"; shotId: ShotId }
  | { kind: "character-portrait"; characterId: CharacterId }
  | { kind: "panel-image"; panelId: PanelId }
  | { kind: "shot-dialogue"; shotId: ShotId }
  | { kind: "audio-track"; trackId: string };

export type TaskStatus =
  | { state: "queued" }
  | { state: "running"; progress: number }
  | { state: "succeeded"; assetId: AssetId }
  | { state: "failed"; message: string };

export type GenerationTask = {
  id: TaskId;
  projectId: ProjectId;
  target: GenerationTarget;
  label: string;
  prompt: string;
  model: string;
  status: TaskStatus;
  createdAt: string;
};
