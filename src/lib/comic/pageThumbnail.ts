import { useEffect, useMemo, useState } from "react";

import { findComicLayout } from "@/domain/constants";
import type { ComicPage, Panel } from "@/domain/types";
import { useAssetsStore } from "@/stores/assets";

import { composePageBlob } from "./compositor";

/**
 * Composed page thumbnail, shared by the page planner cards and the export
 * grid so both surfaces render the same art through one content-signature
 * cache: a page renders once, and every consumer reuses the object URL until
 * its art or lettering actually changes.
 */

type CacheEntry = { signature: string; url: string };

/** Module-level cache: survives unmounts, one entry per page. */
const previewCache = new Map<string, CacheEntry>();

/**
 * Content signature for cache invalidation. Panel edits do not touch the
 * page's updatedAt, so the signature also folds in each panel's art and
 * lettering, plus the resolved asset urls (hydration fills them in after
 * boot).
 */
export const pageThumbnailSignature = (
  page: ComicPage,
  panels: readonly Panel[],
  assetUrlFor: (panel: Panel) => string,
): string =>
  [
    page.updatedAt,
    page.layoutId,
    ...panels.map(
      (panel) =>
        `${panel.id}:${panel.index}:${panel.imageAssetId ?? ""}:${assetUrlFor(panel)}:${JSON.stringify(panel.balloons)}`,
    ),
  ].join("|");

export type PageThumbnail = {
  /** Object URL for the composed page, or null while composing or on failure. */
  url: string | null;
  failed: boolean;
  retry: () => void;
};

/** Composes a page lazily and caches the result by content signature. */
export const usePageThumbnail = (
  page: ComicPage,
  panels: readonly Panel[],
): PageThumbnail => {
  const assets = useAssetsStore((state) => state.assets);
  const layout = findComicLayout(page.layoutId);
  /** Signature of the newest failed compose; clears on retry or content change. */
  const [failedSignature, setFailedSignature] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setVersion] = useState(0);

  const signature = useMemo(
    () =>
      pageThumbnailSignature(page, panels, (panel) =>
        panel.imageAssetId ? (assets[panel.imageAssetId]?.url ?? "") : "",
      ),
    [page, panels, assets],
  );

  const cached = previewCache.get(page.id);
  const url = cached && cached.signature === signature ? cached.url : null;
  const failed = failedSignature === signature;

  useEffect(() => {
    const entry = previewCache.get(page.id);
    if (entry && entry.signature === signature) return;
    let cancelled = false;
    void (async () => {
      const result = await composePageBlob({
        layout,
        panels,
        assets: useAssetsStore.getState().assets,
      });
      if (cancelled) return;
      if (!result.ok) {
        setFailedSignature(signature);
        return;
      }
      const objectUrl = URL.createObjectURL(result.value);
      const previous = previewCache.get(page.id);
      if (previous) URL.revokeObjectURL(previous.url);
      previewCache.set(page.id, { signature, url: objectUrl });
      setFailedSignature(null);
      setVersion((current) => current + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [page.id, signature, layout, panels, attempt]);

  return {
    url,
    failed,
    retry: () => {
      setFailedSignature(null);
      setAttempt((current) => current + 1);
    },
  };
};
