import type { CameraPresetId, Shot } from "@/domain/types";
import type { CharacterId, ShotId } from "@/lib/id";
import { err, ok, type Result } from "@/lib/result";

import { seedCameraTrack } from "./cameraMath";

/**
 * Per-shot blockout data: mannequin and prop placements on the stage floor
 * plus the two camera keyframes. Blockouts are working documents, not
 * generated media, so they live in localStorage under a versioned key
 * (the domain stores stay untouched).
 */

export type Vec3 = { x: number; y: number; z: number };

export type CameraKeyframe = {
  position: Vec3;
  lookAt: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
};

export type CameraPathMode = "linear" | "arc";

export type CameraTrack = {
  a: CameraKeyframe;
  b: CameraKeyframe;
  mode: CameraPathMode;
  /** Extra full revolutions on arc paths; the 360 orbit uses 1. */
  arcTurns: number;
};

export type MannequinPlacement = {
  characterId: CharacterId;
  x: number;
  z: number;
  /** Radians around the vertical axis. */
  rotationY: number;
};

export type PropKind = "box" | "cylinder" | "plane";

export type PropPlacement = {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  rotationY: number;
};

export type ShotBlockout = {
  mannequins: MannequinPlacement[];
  props: PropPlacement[];
  camera: CameraTrack;
  /** Preset the camera track was seeded from; a preset change reseeds it. */
  seededPresetId: CameraPresetId;
};

export type BlockoutError = {
  code: "storage-failed";
  message: string;
};

/* ------------------------------------------------------------------ */
/* Block keys: one string id space for mannequins and props            */
/* ------------------------------------------------------------------ */

export type BlockRef =
  | { kind: "mannequin"; characterId: CharacterId }
  | { kind: "prop"; propId: string };

export const mannequinBlockKey = (characterId: CharacterId): string =>
  `char:${characterId}`;

export const propBlockKey = (propId: string): string => `prop:${propId}`;

export const parseBlockKey = (key: string): BlockRef | null => {
  if (key.startsWith("char:")) {
    return { kind: "mannequin", characterId: key.slice(5) as CharacterId };
  }
  if (key.startsWith("prop:")) {
    return { kind: "prop", propId: key.slice(5) };
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Blockout operations (pure)                                          */
/* ------------------------------------------------------------------ */

export const moveBlock = (
  blockout: ShotBlockout,
  key: string,
  x: number,
  z: number,
): ShotBlockout => {
  const ref = parseBlockKey(key);
  if (!ref) return blockout;
  if (ref.kind === "mannequin") {
    return {
      ...blockout,
      mannequins: blockout.mannequins.map((mannequin) =>
        mannequin.characterId === ref.characterId
          ? { ...mannequin, x, z }
          : mannequin,
      ),
    };
  }
  return {
    ...blockout,
    props: blockout.props.map((prop) =>
      prop.id === ref.propId ? { ...prop, x, z } : prop,
    ),
  };
};

export const rotateBlock = (
  blockout: ShotBlockout,
  key: string,
  rotationY: number,
): ShotBlockout => {
  const ref = parseBlockKey(key);
  if (!ref) return blockout;
  if (ref.kind === "mannequin") {
    return {
      ...blockout,
      mannequins: blockout.mannequins.map((mannequin) =>
        mannequin.characterId === ref.characterId
          ? { ...mannequin, rotationY }
          : mannequin,
      ),
    };
  }
  return {
    ...blockout,
    props: blockout.props.map((prop) =>
      prop.id === ref.propId ? { ...prop, rotationY } : prop,
    ),
  };
};

export const blockRotation = (
  blockout: ShotBlockout,
  key: string,
): number | null => {
  const ref = parseBlockKey(key);
  if (!ref) return null;
  if (ref.kind === "mannequin") {
    return (
      blockout.mannequins.find(
        (mannequin) => mannequin.characterId === ref.characterId,
      )?.rotationY ?? null
    );
  }
  return blockout.props.find((prop) => prop.id === ref.propId)?.rotationY ?? null;
};

export const addProp = (
  blockout: ShotBlockout,
  kind: PropKind,
): { blockout: ShotBlockout; propId: string } => {
  const propId = crypto.randomUUID().slice(0, 8);
  const placement: PropPlacement = {
    id: propId,
    kind,
    x: ((blockout.props.length % 5) - 2) * 0.9,
    z: 1.8,
    rotationY: 0,
  };
  return {
    blockout: { ...blockout, props: [...blockout.props, placement] },
    propId,
  };
};

export const removeProp = (
  blockout: ShotBlockout,
  propId: string,
): ShotBlockout => ({
  ...blockout,
  props: blockout.props.filter((prop) => prop.id !== propId),
});

/**
 * Copies set dressing from another shot's saved blockout: mannequin
 * transforms carry over by matching character id (a character absent from
 * the source keeps its current placement), and props are copied wholesale.
 * The camera track is left untouched; it stays seeded from this shot's own
 * preset.
 */
export const copyBlockingFromSource = (
  current: ShotBlockout,
  source: ShotBlockout,
): ShotBlockout => {
  const sourceByCharacter = new Map(
    source.mannequins.map((mannequin) => [mannequin.characterId, mannequin]),
  );
  const mannequins = current.mannequins.map((mannequin) => {
    const match = sourceByCharacter.get(mannequin.characterId);
    return match
      ? { ...mannequin, x: match.x, z: match.z, rotationY: match.rotationY }
      : mannequin;
  });
  const props = source.props.map((prop) => ({ ...prop }));
  return { ...current, mannequins, props };
};

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "vixio-previz-blockouts";
const STORAGE_VERSION = 1;

type StoredBlockouts = {
  version: number;
  blockouts: Record<string, ShotBlockout>;
};

const emptyStore = (): StoredBlockouts => ({
  version: STORAGE_VERSION,
  blockouts: {},
});

const readStore = (): StoredBlockouts => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<StoredBlockouts> | null;
    if (
      !parsed ||
      parsed.version !== STORAGE_VERSION ||
      typeof parsed.blockouts !== "object" ||
      parsed.blockouts === null
    ) {
      return emptyStore();
    }
    return { version: STORAGE_VERSION, blockouts: parsed.blockouts };
  } catch {
    return emptyStore();
  }
};

export const loadBlockout = (shotId: ShotId): ShotBlockout | null =>
  readStore().blockouts[shotId] ?? null;

/**
 * Drops the stored blockouts for the given shots. Used by project deletion
 * cleanup so a removed project does not leave its blockouts orphaned in
 * localStorage; a no-op for shots that never had one.
 */
export const removeBlockouts = (
  shotIds: readonly ShotId[],
): Result<void, BlockoutError> => {
  if (shotIds.length === 0) return ok(undefined);
  try {
    const store = readStore();
    let changed = false;
    for (const id of shotIds) {
      if (id in store.blockouts) {
        delete store.blockouts[id];
        changed = true;
      }
    }
    if (!changed) return ok(undefined);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return ok(undefined);
  } catch {
    return err({
      code: "storage-failed",
      message: "The blockout could not be removed locally.",
    });
  }
};

export const saveBlockout = (
  shotId: ShotId,
  blockout: ShotBlockout,
): Result<void, BlockoutError> => {
  try {
    const store = readStore();
    store.blockouts[shotId] = blockout;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return ok(undefined);
  } catch {
    return err({
      code: "storage-failed",
      message: "The blockout could not be saved locally.",
    });
  }
};

/* ------------------------------------------------------------------ */
/* Defaults and reconciliation                                         */
/* ------------------------------------------------------------------ */

/** Centroid of the mannequins at chest height; origin when the stage is bare. */
export const subjectPoint = (
  mannequins: readonly MannequinPlacement[],
): Vec3 => {
  if (mannequins.length === 0) return { x: 0, y: 1.4, z: 0 };
  const sum = mannequins.reduce(
    (acc, mannequin) => ({ x: acc.x + mannequin.x, z: acc.z + mannequin.z }),
    { x: 0, z: 0 },
  );
  return {
    x: sum.x / mannequins.length,
    y: 1.4,
    z: sum.z / mannequins.length,
  };
};

const defaultMannequin = (
  characterId: CharacterId,
  index: number,
  count: number,
): MannequinPlacement => ({
  characterId,
  x: (index - (count - 1) / 2) * 1.3,
  z: 0,
  rotationY: 0,
});

export const presetIdForShot = (shot: Shot): CameraPresetId =>
  shot.cameraPresetId ?? "static";

/**
 * Reconciles a stored blockout with the shot it belongs to: mannequins track
 * the shot's cast (placements survive cast edits), and the camera track is
 * reseeded whenever the shot's camera preset changed since it was seeded.
 * Returns the stored object untouched when nothing needs to change.
 */
export const resolveBlockout = (
  shot: Shot,
  stored: ShotBlockout | null,
): ShotBlockout => {
  const presetId = presetIdForShot(shot);
  const byCharacter = new Map(
    (stored?.mannequins ?? []).map((mannequin) => [
      mannequin.characterId,
      mannequin,
    ]),
  );
  const mannequins = shot.characterIds.map(
    (characterId, index) =>
      byCharacter.get(characterId) ??
      defaultMannequin(characterId, index, shot.characterIds.length),
  );
  const castUnchanged =
    stored !== null &&
    mannequins.length === stored.mannequins.length &&
    mannequins.every((mannequin, index) => mannequin === stored.mannequins[index]);
  const camera =
    stored === null || stored.seededPresetId !== presetId
      ? seedCameraTrack(presetId, subjectPoint(mannequins), shot.lens, shot.size)
      : stored.camera;

  if (stored && castUnchanged && camera === stored.camera) return stored;

  return {
    mannequins,
    props: stored?.props ?? [],
    camera,
    seededPresetId: presetId,
  };
};
