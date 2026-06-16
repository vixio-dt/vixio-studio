import type { Asset } from "@/domain/types";
import type { AssetId } from "@/lib/id";
import { type Result, err, ok } from "@/lib/result";
import { setAssetsCloudHooks, useAssetsStore } from "@/stores/assets";
import { useProjectsStore } from "@/stores/projects";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

import { driveClient } from "./driveClient";
import {
  clearCachedToken,
  fetchIdentity,
  getCachedToken,
  loadGis,
  requestAccessToken,
} from "./googleAuth";
import type { ManifestAsset, WorkspaceManifest } from "./types";

/**
 * The cloud orchestrator. It is the only module that knows how auth, the Drive
 * transport, and the stores fit together. Feature code never imports it for
 * data, only the small action surface below (signIn, signOut). The asset store
 * reaches it through injected hooks (no import cycle), and the projects store is
 * observed via a subscription set up at init.
 *
 * Everything is best effort and local-first: a signed-out app behaves exactly
 * as it always has. Drive becomes the durable mirror only while signed in with
 * storage mode "drive".
 */

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/**
 * The sync layer's own visible strings. Sentence case, no em or en dashes,
 * plain functional language, per the build charter. AppError messages from the
 * auth and Drive layers are surfaced verbatim where they already read well.
 */
const syncCopy = {
  noClientId: "Add your Google client id in settings before signing in.",
  signInFailed: "Could not sign in to Google. Try again.",
  tokenExpired: "Your Google session expired. Sign in again to keep syncing.",
  pushFailed: "Could not save the workspace to Drive.",
  pullFailed: "Could not load the workspace from Drive.",
} as const;

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const MANIFEST_VERSION = 1 as const;
const PUSH_DEBOUNCE_MS = 3000;

/* ------------------------------------------------------------------ */
/* Store accessors                                                     */
/* ------------------------------------------------------------------ */

const session = () => useSessionStore.getState();
const settings = () => useSettingsStore.getState();
const projects = () => useProjectsStore.getState();
const assets = () => useAssetsStore.getState();

const isDriveActive = (): boolean => {
  const state = session();
  return state.session.state === "signed-in" && state.storageMode === "drive";
};

/* ------------------------------------------------------------------ */
/* Token accessor with silent refresh                                  */
/* ------------------------------------------------------------------ */

/**
 * The freshest usable access token. Returns the cached token while valid; once
 * it lapses, tries a silent refresh (prompt:'') so background sync survives an
 * hour-long session without a popup. Returns an error Result when no token can
 * be obtained, which the caller maps to a sync error rather than throwing.
 */
const getToken = async (): Promise<Result<string>> => {
  const cached = getCachedToken();
  if (cached) return ok(cached);

  const clientId = settings().googleClientId.trim();
  if (clientId.length === 0) {
    return err({ code: "provider-not-configured", message: syncCopy.noClientId });
  }

  const loaded = await loadGis();
  if (!loaded.ok) return loaded;

  const refreshed = await requestAccessToken(clientId, { silent: true });
  if (!refreshed.ok) {
    return err({ code: refreshed.error.code, message: syncCopy.tokenExpired });
  }
  return refreshed;
};

/* ------------------------------------------------------------------ */
/* Manifest serialization                                              */
/* ------------------------------------------------------------------ */

/** assetId -> Drive file id, the durable backbone of lazy rehydration. */
const driveFileIds = new Map<AssetId, string>();

/** Build a manifest asset entry from a domain asset plus its Drive file id. */
const toManifestAsset = (asset: Asset, driveFileId: string): ManifestAsset => ({
  id: asset.id,
  projectId: asset.projectId,
  kind: asset.kind,
  width: asset.width,
  height: asset.height,
  duration: asset.duration,
  prompt: asset.prompt,
  model: asset.model,
  seed: asset.seed,
  createdAt: asset.createdAt,
  driveFileId,
});

/**
 * Serialize the current stores into a manifest. Only assets that have made it
 * to Drive (recorded driveFileId) are listed, so a half-uploaded asset is not
 * promised to other devices before its blob exists.
 */
const buildManifest = (): WorkspaceManifest => {
  const projectsState = projects();
  const assetIndex: Record<string, ManifestAsset> = {};
  for (const asset of Object.values(assets().assets)) {
    const driveFileId = driveFileIds.get(asset.id);
    if (!driveFileId) continue;
    assetIndex[asset.id] = toManifestAsset(asset, driveFileId);
  }

  return {
    version: MANIFEST_VERSION,
    updatedAt: new Date().toISOString(),
    projects: {
      projects: projectsState.projects,
      scenes: projectsState.scenes,
      shots: projectsState.shots,
      characters: projectsState.characters,
    },
    assets: assetIndex,
  };
};

/** The persisted projects-store shape: the four record maps, nothing else. */
type PersistedProjects = {
  projects: unknown;
  scenes: unknown;
  shots: unknown;
  characters: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readPersistedProjects = (value: unknown): PersistedProjects | null => {
  if (!isRecord(value)) return null;
  return {
    projects: isRecord(value["projects"]) ? value["projects"] : {},
    scenes: isRecord(value["scenes"]) ? value["scenes"] : {},
    shots: isRecord(value["shots"]) ? value["shots"] : {},
    characters: isRecord(value["characters"]) ? value["characters"] : {},
  };
};

/* ------------------------------------------------------------------ */
/* Pull and push                                                       */
/* ------------------------------------------------------------------ */

/**
 * Load the workspace from Drive. Rehydrates the projects store from the
 * manifest and registers each manifest asset so its blob can lazy-download into
 * the cache on demand. Safe to call when signed out (no folder): it no-ops.
 */
export const pullWorkspace = async (): Promise<Result<void>> => {
  const folderId = session().folderId;
  if (folderId === null) return ok(undefined);

  const token = await getToken();
  if (!token.ok) {
    session().setSyncStatus({ state: "error", message: token.error.message });
    return token;
  }

  const read = await driveClient.readManifest(token.value, folderId);
  if (!read.ok) {
    session().setSyncStatus({ state: "error", message: syncCopy.pullFailed });
    return read;
  }

  const manifest = read.value;
  if (manifest === null) {
    // First sign-in on a fresh Drive: nothing to pull, push the local state up.
    session().setSyncStatus({ state: "idle" });
    schedulePush();
    return ok(undefined);
  }

  const persisted = readPersistedProjects(manifest.projects);
  if (persisted) {
    // The manifest's projects payload is untrusted external JSON; driveClient
    // validated its outer shape and readPersistedProjects narrowed each field
    // to a record. This single cast is the defensive-narrowing seam that feeds
    // it back into the store. Replaying it must not trigger a push to Drive.
    suppressPush = true;
    useProjectsStore.setState(persisted as Partial<ReturnType<typeof projects>>);
    suppressPush = false;
  }

  driveFileIds.clear();
  const store = assets();
  for (const entry of Object.values(manifest.assets)) {
    driveFileIds.set(entry.id, entry.driveFileId);
    const { driveFileId: _driveFileId, ...meta } = entry;
    void _driveFileId;
    store.registerRemoteAsset(meta);
  }

  session().setSyncStatus({ state: "idle" });
  return ok(undefined);
};

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let suppressPush = false;

/** Serialize the stores and write the manifest to Drive. */
const flushPush = async (): Promise<void> => {
  pushTimer = null;
  if (!isDriveActive()) return;

  const folderId = session().folderId;
  if (folderId === null) return;

  const token = await getToken();
  if (!token.ok) {
    session().setSyncStatus({ state: "error", message: token.error.message });
    return;
  }

  session().setSyncStatus({ state: "syncing", pending: 1 });
  const written = await driveClient.writeManifest({
    token: token.value,
    folderId,
    manifest: buildManifest(),
  });
  if (!written.ok) {
    session().setSyncStatus({ state: "error", message: syncCopy.pushFailed });
    return;
  }
  session().setSyncStatus({ state: "idle" });
};

/**
 * Debounced manifest push. Coalesces a burst of edits into one Drive write
 * about three seconds after the last change. A no-op when signed out or while
 * a pull is replaying the manifest.
 */
export const schedulePush = (): void => {
  if (suppressPush) return;
  if (!isDriveActive()) return;
  if (pushTimer !== null) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushPush();
  }, PUSH_DEBOUNCE_MS);
};

/** Force any pending manifest write out now (kept for explicit save points). */
export const pushWorkspace = async (): Promise<void> => {
  if (pushTimer !== null) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  await flushPush();
};

/* ------------------------------------------------------------------ */
/* Asset upload and download                                           */
/* ------------------------------------------------------------------ */

/**
 * Upload one freshly saved asset's blob to Drive and record its file id. The
 * assets store calls this in the background after a local save; it never blocks
 * the UI. On success it schedules a manifest push so the new file id is durably
 * referenced.
 */
export const uploadAssetToDrive = async (
  asset: Omit<Asset, "url">,
  blob: Blob,
): Promise<Result<void>> => {
  const folderId = session().folderId;
  if (folderId === null) return ok(undefined);

  const token = await getToken();
  if (!token.ok) {
    session().setSyncStatus({ state: "error", message: token.error.message });
    return token;
  }

  session().setSyncStatus({ state: "syncing", pending: 1 });
  const uploaded = await driveClient.uploadAsset({
    token: token.value,
    folderId,
    blob,
    name: `${asset.id}`,
    meta: {
      vixioAssetId: asset.id,
      projectId: asset.projectId,
      kind: asset.kind,
    },
  });
  if (!uploaded.ok) {
    session().setSyncStatus({ state: "error", message: syncCopy.pushFailed });
    return uploaded;
  }

  driveFileIds.set(asset.id, uploaded.value.fileId);
  session().setSyncStatus({ state: "idle" });
  schedulePush();
  return ok(undefined);
};

/** Pull a registered asset's blob down from Drive, or null when unavailable. */
const downloadAssetBlob = async (id: AssetId): Promise<Blob | null> => {
  const driveFileId = driveFileIds.get(id);
  if (!driveFileId) return null;

  const token = await getToken();
  if (!token.ok) return null;

  const downloaded = await driveClient.downloadFile(token.value, driveFileId);
  if (!downloaded.ok) return null;
  return downloaded.value;
};

/* ------------------------------------------------------------------ */
/* Sign-in lifecycle                                                   */
/* ------------------------------------------------------------------ */

type SignInOptions = { silent?: boolean };

/**
 * Sign in with Google and switch to Drive storage. Loads GIS, requests an
 * access token (interactive by default, silent on boot restore), reads the
 * identity, resolves the workspace folder, and pulls the manifest. Any failure
 * lands as a session error plus a sync error and leaves storage mode untouched.
 */
export const signIn = async (
  options?: SignInOptions,
): Promise<Result<void>> => {
  const clientId = settings().googleClientId.trim();
  if (clientId.length === 0) {
    session().setSession({ state: "error", message: syncCopy.noClientId });
    return err({ code: "provider-not-configured", message: syncCopy.noClientId });
  }

  session().setSession({ state: "signing-in" });

  const loaded = await loadGis();
  if (!loaded.ok) {
    session().setSession({ state: "error", message: loaded.error.message });
    session().setSyncStatus({ state: "error", message: loaded.error.message });
    return loaded;
  }

  const token = await requestAccessToken(clientId, {
    silent: options?.silent === true,
  });
  if (!token.ok) {
    session().setSession({ state: "error", message: token.error.message });
    session().setSyncStatus({ state: "error", message: token.error.message });
    return token;
  }

  const identity = await fetchIdentity(token.value);
  if (!identity.ok) {
    session().setSession({ state: "error", message: identity.error.message });
    session().setSyncStatus({ state: "error", message: identity.error.message });
    return identity;
  }

  session().setSession({ state: "signed-in", identity: identity.value });

  const folder = await driveClient.ensureFolder(token.value);
  if (!folder.ok) {
    session().setSyncStatus({ state: "error", message: folder.error.message });
    return folder;
  }
  session().setFolderId(folder.value);
  session().setStorageMode("drive");

  const pulled = await pullWorkspace();
  if (!pulled.ok) return pulled;
  return ok(undefined);
};

/**
 * Sign out: drop the in-memory token, clear the folder and asset file map, and
 * return to the local-first signed-out state. Storage mode falls back to local
 * so the app behaves exactly as it does for a first-time visitor.
 */
export const signOut = (): void => {
  if (pushTimer !== null) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  clearCachedToken();
  driveFileIds.clear();
  session().setFolderId(null);
  session().setStorageMode("local");
  session().setSession({ state: "signed-out" });
  session().setSyncStatus({ state: "idle" });
};

/* ------------------------------------------------------------------ */
/* Init: wire store hooks and subscriptions                            */
/* ------------------------------------------------------------------ */

let initialized = false;

/**
 * Wire the cloud layer into the stores. Idempotent. Called once at boot. This
 * is what lets the assets store upload and lazy-download without importing this
 * module, and what makes a project edit trigger a debounced push.
 */
export const initCloudSync = (): void => {
  if (initialized) return;
  initialized = true;

  setAssetsCloudHooks({
    onAssetSaved: (meta, blob) => {
      if (!isDriveActive()) return;
      void uploadAssetToDrive(meta, blob);
    },
    fetchAssetBlob: (id) => downloadAssetBlob(id),
  });

  useProjectsStore.subscribe(() => {
    schedulePush();
  });
};

/**
 * Best-effort session restore at boot. If the user previously chose Drive and a
 * client id is configured, try a silent sign-in. Never blocks first paint and
 * never surfaces a popup; a failure just leaves the app local-first.
 */
export const restoreSession = async (): Promise<void> => {
  const state = session();
  if (state.storageMode !== "drive") return;
  const clientId = settings().googleClientId.trim();
  if (clientId.length === 0) return;

  const result = await signIn({ silent: true });
  if (!result.ok) {
    // Silent restore failed (token needs consent): fall back to local quietly.
    session().setSession({ state: "signed-out" });
    session().setStorageMode("local");
    session().setSyncStatus({ state: "idle" });
  }
};
