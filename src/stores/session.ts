import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CloudSession, StorageMode } from "@/cloud/types";

/**
 * The cloud session and sync status. This is a clean state container: it holds
 * the sign-in lifecycle, the chosen storage mode, the Drive folder id, and the
 * live sync status. The auth and Drive orchestration is wired elsewhere; this
 * store only reflects state, it does not call Google.
 *
 * Only storageMode is persisted (the user's durable preference). The live
 * session, the resolved folder id, and the sync status are in-memory: a fresh
 * tab must re-acquire a token rather than trust a stale identity.
 */

/** Live sync progress as a discriminated union; never a tangle of booleans. */
export type SyncStatus =
  | { state: "idle" }
  | { state: "syncing"; pending: number }
  | { state: "error"; message: string };

type SessionState = {
  session: CloudSession;
  storageMode: StorageMode;
  syncStatus: SyncStatus;
  folderId: string | null;
  setSession: (session: CloudSession) => void;
  setStorageMode: (mode: StorageMode) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setFolderId: (folderId: string | null) => void;
};

/** Only storageMode survives a reload; the live session does not. */
type PersistedSessionState = Pick<SessionState, "storageMode">;

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: { state: "signed-out" },
      storageMode: "local",
      syncStatus: { state: "idle" },
      folderId: null,
      setSession: (session) => set({ session }),
      setStorageMode: (storageMode) => set({ storageMode }),
      setSyncStatus: (syncStatus) => set({ syncStatus }),
      setFolderId: (folderId) => set({ folderId }),
    }),
    {
      name: "vixio-session",
      partialize: (state): PersistedSessionState => ({
        storageMode: state.storageMode,
      }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export const selectIsSignedIn = (state: SessionState): boolean =>
  state.session.state === "signed-in";
