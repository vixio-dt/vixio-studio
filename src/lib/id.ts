import type { Brand } from "./brand";

export type ProjectId = Brand<string, "ProjectId">;
export type SceneId = Brand<string, "SceneId">;
export type ShotId = Brand<string, "ShotId">;
export type CharacterId = Brand<string, "CharacterId">;
export type AssetId = Brand<string, "AssetId">;
export type TaskId = Brand<string, "TaskId">;

type IdPrefix = "prj" | "scn" | "sht" | "chr" | "ast" | "tsk";

const entropy = (): string =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 16);

/** Stripe-style prefixed ids: `prj_4f9d...`. The prefix makes logs readable. */
const createId = (prefix: IdPrefix): string => `${prefix}_${entropy()}`;

export const createProjectId = (): ProjectId =>
  createId("prj") as ProjectId;
export const createSceneId = (): SceneId => createId("scn") as SceneId;
export const createShotId = (): ShotId => createId("sht") as ShotId;
export const createCharacterId = (): CharacterId =>
  createId("chr") as CharacterId;
export const createAssetId = (): AssetId => createId("ast") as AssetId;
export const createTaskId = (): TaskId => createId("tsk") as TaskId;
