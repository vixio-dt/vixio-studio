import type { Asset } from "@/domain/types";
import type { Result } from "@/lib/result";

/**
 * Cloud sync contracts. The Google Drive layer implements these; feature code
 * never imports Drive directly. Login is "Sign in with Google", and the same
 * grant carries the drive.file scope so the user's own Drive (the 5TB) holds
 * the workspace. IndexedDB stays as a local cache; Drive is the durable,
 * shareable, cross-device source of truth.
 */

export type GoogleIdentity = {
  email: string;
  name: string;
  picture: string;
};

/** Where generated media and the project graph are persisted. */
export type StorageMode = "local" | "drive";

/** Sign-in lifecycle as a discriminated union; never a tangle of booleans. */
export type CloudSession =
  | { state: "signed-out" }
  | { state: "signing-in" }
  | { state: "signed-in"; identity: GoogleIdentity }
  | { state: "error"; message: string };

/** Per-asset metadata mirrored onto the Drive file's appProperties. */
export type DriveAssetMeta = {
  vixioAssetId: string;
  projectId: string;
  kind: Asset["kind"];
};

/** The asset index entry kept in the manifest for lazy rehydration. */
export type ManifestAsset = Omit<Asset, "url"> & { driveFileId: string };

/**
 * One JSON file in the Drive folder that lets any device rebuild the whole
 * workspace: the serialized project graph plus the asset index. Blobs live in
 * their own Drive files referenced by driveFileId.
 */
export type WorkspaceManifest = {
  version: 1;
  updatedAt: string;
  /** The persisted useProjectsStore state (projects, scenes, shots, characters). */
  projects: unknown;
  /** assetId -> metadata + Drive file id for the blob. */
  assets: Record<string, ManifestAsset>;
};

/**
 * The Drive transport. All methods are Result-returning and never throw;
 * the access token is supplied per call so the auth layer owns refresh.
 */
export type DriveClient = {
  /** Find or create the "Vixio Studio" folder; returns its id. */
  ensureFolder: (token: string) => Promise<Result<string>>;
  uploadAsset: (input: {
    token: string;
    folderId: string;
    blob: Blob;
    name: string;
    meta: DriveAssetMeta;
  }) => Promise<Result<{ fileId: string }>>;
  downloadFile: (token: string, fileId: string) => Promise<Result<Blob>>;
  deleteFile: (token: string, fileId: string) => Promise<Result<void>>;
  readManifest: (
    token: string,
    folderId: string,
  ) => Promise<Result<WorkspaceManifest | null>>;
  writeManifest: (input: {
    token: string;
    folderId: string;
    manifest: WorkspaceManifest;
  }) => Promise<Result<void>>;
};

export const VIXIO_DRIVE_FOLDER = "Vixio Studio";
export const VIXIO_MANIFEST_NAME = "vixio-workspace.json";
