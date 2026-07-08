import { useEffect, useMemo, useState } from "react";

import { Button, MediaFrame, Skeleton } from "@/components/ui";
import { findComicLayout } from "@/domain/constants";
import type { ComicPage, Panel } from "@/domain/types";
import { composePageBlob } from "@/lib/comic/compositor";
import { useAssetsStore } from "@/stores/assets";

import { comicExportCopy } from "./copy";
import { pageSignature } from "./exportLogic";

/**
 * One rendered page thumbnail. Pages compose lazily and cache by content
 * signature, so scrolling the grid or re-exporting never re-renders a page
 * that has not changed. The cache is read during render; the effect only
 * fills misses.
 */

type CacheEntry = { signature: string; url: string };

/** Module-level cache: survives unmounts, one entry per page. */
const previewCache = new Map<string, CacheEntry>();

type PagePreviewProps = {
  page: ComicPage;
  panels: readonly Panel[];
  /** 1-based position in the book. */
  pageNumber: number;
};

export const PagePreview = ({ page, panels, pageNumber }: PagePreviewProps) => {
  const assets = useAssetsStore((state) => state.assets);
  const layout = findComicLayout(page.layoutId);
  /** Signature of the newest failed compose; clears on retry or content change. */
  const [failedSignature, setFailedSignature] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setVersion] = useState(0);

  const signature = useMemo(
    () =>
      pageSignature(page, panels, (panel) =>
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

  return (
    <figure className="flex flex-col gap-2">
      <MediaFrame
        aspectRatio={`${layout.pageSize.width}:${layout.pageSize.height}`}
      >
        {url ? (
          <img
            src={url}
            alt={comicExportCopy.previews.pageLabel(pageNumber)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-xs text-danger">
              {comicExportCopy.previews.renderFailed}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFailedSignature(null);
                setAttempt((current) => current + 1);
              }}
            >
              {comicExportCopy.previews.retry}
            </Button>
          </div>
        ) : (
          <Skeleton className="absolute inset-0" />
        )}
      </MediaFrame>
      <figcaption className="font-mono text-[11px] text-fg-muted">
        {comicExportCopy.previews.pageLabel(pageNumber)}
      </figcaption>
    </figure>
  );
};
