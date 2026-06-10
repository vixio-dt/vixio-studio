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

type AssetsState = {
  assets: Record<AssetId, Asset>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  saveAsset: (asset: Omit<Asset, "url">, blob: Blob) => Promise<Asset>;
  removeAsset: (id: AssetId) => Promise<void>;
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
      set({ assets, hydrated: true });
    } catch {
      // A blocked IndexedDB (private mode) should not brick the app.
      set({ hydrated: true });
    }
  },

  saveAsset: async (meta, blob) => {
    await putAsset({ ...meta, blob });
    const asset: Asset = { ...meta, url: URL.createObjectURL(blob) };
    set((state) => ({ assets: { ...state.assets, [asset.id]: asset } }));
    return asset;
  },

  removeAsset: async (id) => {
    const existing = get().assets[id];
    if (existing) URL.revokeObjectURL(existing.url);
    await deleteStoredAsset(id);
    set((state) => {
      const next = { ...state.assets };
      delete next[id];
      return { assets: next };
    });
  },
}));

export const useAsset = (id: AssetId | null): Asset | null =>
  useAssetsStore((state) => (id ? (state.assets[id] ?? null) : null));
