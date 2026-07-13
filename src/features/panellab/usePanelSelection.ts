import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import type { PanelId } from "@/lib/id";

/**
 * Panel selection lives in the `?panel=` search param so the panel lab is
 * deep-linkable from the page planner and survives reloads.
 */
export const usePanelSelection = (): {
  selectedPanelId: PanelId | null;
  selectPanel: (id: PanelId) => void;
} => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("panel");
  const selectedPanelId = raw ? (raw as PanelId) : null;

  const selectPanel = useCallback(
    (id: PanelId) => {
      setSearchParams({ panel: id }, { replace: true });
    },
    [setSearchParams],
  );

  return { selectedPanelId, selectPanel };
};
