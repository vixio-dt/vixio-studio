import type { Asset, Scene, Shot } from "@/domain/types";
import type { AssetId, SceneId } from "@/lib/id";

/* ------------------------------------------------------------------ */
/* Timeline assembly: global shot order, hard cuts at scene bounds     */
/* ------------------------------------------------------------------ */

/** A shot with nothing rendered plays as a short slate. */
export const SLATE_SECONDS = 1.5;

export type CutEntryKind = "video" | "image" | "slate";

export type CutEntry = {
  shot: Shot;
  scene: Scene | null;
  videoAsset: Asset | null;
  frameAsset: Asset | null;
  kind: CutEntryKind;
  /** Timeline length: clip duration when rendered, else the planned shot duration. */
  seconds: number;
  /** Stage length: same as `seconds`, except slates always run 1.5s. */
  playbackSeconds: number;
  /** First shot of its scene; the filmstrip marks these with a spacer. */
  sceneStart: boolean;
  /** The shot references assets that are not in the store yet. */
  pendingAssets: boolean;
};

/** Timeline duration of one shot: the rendered clip wins over the plan. */
export const displaySeconds = (
  shot: Shot,
  assets: Record<AssetId, Asset>,
): number => {
  const video = shot.videoAssetId ? assets[shot.videoAssetId] : undefined;
  return video?.duration ?? shot.durationSeconds;
};

export const buildCutEntries = (
  shots: readonly Shot[],
  scenesById: Record<SceneId, Scene>,
  assets: Record<AssetId, Asset>,
): CutEntry[] => {
  let previousSceneId: SceneId | null = null;
  return shots.map((shot) => {
    const videoAsset = shot.videoAssetId
      ? (assets[shot.videoAssetId] ?? null)
      : null;
    const frameAsset = shot.frameAssetId
      ? (assets[shot.frameAssetId] ?? null)
      : null;
    const kind: CutEntryKind = videoAsset
      ? "video"
      : frameAsset
        ? "image"
        : "slate";
    const seconds = videoAsset?.duration ?? shot.durationSeconds;
    const sceneStart = shot.sceneId !== previousSceneId;
    previousSceneId = shot.sceneId;
    return {
      shot,
      scene: scenesById[shot.sceneId] ?? null,
      videoAsset,
      frameAsset,
      kind,
      seconds,
      playbackSeconds: kind === "slate" ? SLATE_SECONDS : seconds,
      sceneStart,
      pendingAssets:
        (shot.videoAssetId !== null && !videoAsset) ||
        (shot.frameAssetId !== null && !frameAsset),
    };
  });
};

export const totalSeconds = (entries: readonly CutEntry[]): number =>
  entries.reduce((sum, entry) => sum + entry.seconds, 0);

/**
 * Stage start offset of each entry in seconds, using playback lengths (slates
 * run their fixed stage time). Drives the audio mix schedule.
 */
export const playbackOffsets = (entries: readonly CutEntry[]): number[] => {
  const offsets: number[] = [];
  let cursor = 0;
  for (const entry of entries) {
    offsets.push(cursor);
    cursor += entry.playbackSeconds;
  }
  return offsets;
};

/** Total stage time of the cut in seconds; the audio mix loops up to here. */
export const playbackTotalSeconds = (entries: readonly CutEntry[]): number =>
  entries.reduce((sum, entry) => sum + entry.playbackSeconds, 0);

export const elapsedSeconds = (
  entries: readonly CutEntry[],
  currentIndex: number,
): number =>
  entries
    .slice(0, Math.max(0, currentIndex))
    .reduce((sum, entry) => sum + entry.seconds, 0);

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Screenplay slug for slates and spacers: "INT. LIGHTHOUSE KITCHEN, NIGHT". */
export const slugLine = (scene: Scene): string => {
  const prefix = scene.setting === "interior" ? "INT." : "EXT.";
  return `${prefix} ${scene.location.toUpperCase()}, ${scene.timeOfDay.toUpperCase()}`;
};

/** "5" -> "5s", "5.04" -> "5s", "4.5" -> "4.5s" for tile labels. */
export const formatShortSeconds = (seconds: number): string => {
  const rounded = Math.round(seconds * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
};
