import { create } from "zustand";

import type { Asset } from "@/domain/types";
import type { AssetId } from "@/lib/id";

/**
 * Assets (generated frames and clips) are blobs, far too large for
 * localStorage. They live in IndexedDB; the store holds an in-memory index
 * with object URLs hydrated on boot.
 */

const DB_NAME = "vixio-studio";
const STORE_NAME = "assets";

type StoredAsset = Omit<Asset, "url"> & { blob: Blob };

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });

const putAsset = async (stored: StoredAsset): Promise<void> => {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
  db.close();
};

const deleteStoredAsset = async (id: AssetId): Promise<void> => {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
  });
  db.close();
};

const loadAllAssets = async (): Promise<StoredAsset[]> => {
  const db = await openDatabase();
  const stored = await new Promise<StoredAsset[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredAsset[]);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
  db.close();
  return stored;
};

/**
 * Cloud hooks the sync layer injects at boot. They stay null when signed out,
 * so the local-only path is exactly the synchronous behavior it has always
 * been: no Drive import lives in this file, and nothing here awaits the cloud.
 *
 * - onAssetSaved fires (fire and forget) after a successful local save, letting
 *   the sync layer upload the blob to Drive in the background.
 * - fetchAssetBlob lets ensureAssetCached lazily pull a blob from Drive when the
 *   local cache is missing it (a manifest rehydrate registered the asset id but
 *   the blob never came down on this device).
 */
type CloudHooks = {
  onAssetSaved: ((meta: Omit<Asset, "url">, blob: Blob) => void) | null;
  fetchAssetBlob: ((id: AssetId) => Promise<Blob | null>) | null;
};

const cloudHooks: CloudHooks = {
  onAssetSaved: null,
  fetchAssetBlob: null,
};

/** Called once by the sync layer to wire Drive upload and lazy download. */
export const setAssetsCloudHooks = (hooks: Partial<CloudHooks>): void => {
  if ("onAssetSaved" in hooks) cloudHooks.onAssetSaved = hooks.onAssetSaved ?? null;
  if ("fetchAssetBlob" in hooks) cloudHooks.fetchAssetBlob = hooks.fetchAssetBlob ?? null;
};

/** A remote placeholder shows an empty url until its blob is pulled from Drive. */
const isCached = (asset: Asset): boolean => asset.url.length > 0;

type AssetsState = {
  assets: Record<AssetId, Asset>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  saveAsset: (asset: Omit<Asset, "url">, blob: Blob) => Promise<Asset>;
  removeAsset: (id: AssetId) => Promise<void>;
  /**
   * Register an asset known only from the Drive manifest. It enters the index
   * with an empty url so references resolve, but no blob is fetched until
   * ensureAssetCached is called. A local copy (real url) is never clobbered.
   */
  registerRemoteAsset: (meta: Omit<Asset, "url">) => void;
  /**
   * Ensure the asset's blob is in the local cache. Returns the cached asset
   * when present; for a remote placeholder, pulls the blob from Drive via the
   * sync hook, writes it to IndexedDB, and fills in the object url. Returns null
   * when the blob is neither local nor available on Drive.
   */
  ensureAssetCached: (id: AssetId) => Promise<Asset | null>;
};

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await loadAllAssets();
      const assets: Record<AssetId, Asset> = {};
      for (const { blob, ...meta } of stored) {
        assets[meta.id] = { ...meta, url: URL.createObjectURL(blob) };
      }
      set((state) => ({
        // Keep any remote placeholders the sync layer registered before
        // hydration, but let real local blobs win.
        assets: { ...state.assets, ...assets },
        hydrated: true,
      }));
    } catch {
      // A blocked IndexedDB (private mode) should not brick the app.
      set({ hydrated: true });
    }
  },

  saveAsset: async (meta, blob) => {
    await putAsset({ ...meta, blob });
    const asset: Asset = { ...meta, url: URL.createObjectURL(blob) };
    set((state) => ({ assets: { ...state.assets, [asset.id]: asset } }));
    // Background Drive upload when signed in; never blocks the local save.
    cloudHooks.onAssetSaved?.(meta, blob);
    return asset;
  },

  removeAsset: async (id) => {
    const existing = get().assets[id];
    if (existing && isCached(existing)) URL.revokeObjectURL(existing.url);
    await deleteStoredAsset(id);
    set((state) => {
      const next = { ...state.assets };
      delete next[id];
      return { assets: next };
    });
  },

  registerRemoteAsset: (meta) => {
    set((state) => {
      const existing = state.assets[meta.id];
      // A locally cached asset always wins over a remote placeholder.
      if (existing && isCached(existing)) return state;
      return {
        assets: { ...state.assets, [meta.id]: { ...meta, url: "" } },
      };
    });
  },

  ensureAssetCached: async (id) => {
    const existing = get().assets[id];
    if (existing && isCached(existing)) return existing;
    if (!existing) return null;

    const fetchBlob = cloudHooks.fetchAssetBlob;
    if (!fetchBlob) return null;

    let blob: Blob | null;
    try {
      blob = await fetchBlob(id);
    } catch {
      return null;
    }
    if (!blob) return null;

    const { url: _placeholder, ...meta } = existing;
    void _placeholder;
    try {
      await putAsset({ ...meta, blob });
    } catch {
      // Caching to IndexedDB is best effort; the object url below still works.
    }
    const asset: Asset = { ...meta, url: URL.createObjectURL(blob) };
    set((state) => ({ assets: { ...state.assets, [id]: asset } }));
    return asset;
  },
}));

export const useAsset = (id: AssetId | null): Asset | null =>
  useAssetsStore((state) => (id ? (state.assets[id] ?? null) : null));
