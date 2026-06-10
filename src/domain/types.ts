import type {
  AssetId,
  CharacterId,
  ProjectId,
  SceneId,
  ShotId,
  TaskId,
} from "@/lib/id";

/* ------------------------------------------------------------------ */
/* Project                                                            */
/* ------------------------------------------------------------------ */

export type ProjectFormat = "short-film" | "series-episode" | "trailer";

export type Project = {
  id: ProjectId;
  title: string;
  logline: string;
  synopsis: string;
  format: ProjectFormat;
  genre: string;
  styleId: VisualStyleId;
  aspectRatio: AspectRatio;
  coverAssetId: AssetId | null;
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

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

export type AssetKind = "image" | "video";

export type Asset = {
  id: AssetId;
  projectId: ProjectId;
  kind: AssetKind;
  /** Object URL or data URL ready for <img>/<video> src. */
  url: string;
  width: number;
  height: number;
  /** Seconds; null for images. */
  duration: number | null;
  prompt: string;
  model: string;
  seed: number;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

export type GenerationTarget =
  | { kind: "shot-frame"; shotId: ShotId }
  | { kind: "shot-video"; shotId: ShotId }
  | { kind: "character-portrait"; characterId: CharacterId };

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
