import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import type { ShotId } from "@/lib/id";

/**
 * Shot selection lives in the `?shot=` search param so frame lab and motion
 * views are deep-linkable and survive reloads.
 */
export const useShotSelection = (): {
  selectedShotId: ShotId | null;
  selectShot: (id: ShotId) => void;
} => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("shot");
  const selectedShotId = raw ? (raw as ShotId) : null;

  const selectShot = useCallback(
    (id: ShotId) => {
      setSearchParams({ shot: id }, { replace: true });
    },
    [setSearchParams],
  );

  return { selectedShotId, selectShot };
};
