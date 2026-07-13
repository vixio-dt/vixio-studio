import { Button, MediaFrame, Skeleton } from "@/components/ui";
import { findComicLayout } from "@/domain/constants";
import type { ComicPage, Panel } from "@/domain/types";
import { usePageThumbnail } from "@/lib/comic/pageThumbnail";

import { comicExportCopy } from "./copy";

/**
 * One rendered page thumbnail. Pages compose lazily and cache by content
 * signature (usePageThumbnail), so scrolling the grid or re-exporting never
 * re-renders a page that has not changed, and the pages view's cards share
 * the same cached art.
 */

type PagePreviewProps = {
  page: ComicPage;
  panels: readonly Panel[];
  /** 1-based position in the book. */
  pageNumber: number;
};

export const PagePreview = ({ page, panels, pageNumber }: PagePreviewProps) => {
  const layout = findComicLayout(page.layoutId);
  const { url, failed, retry } = usePageThumbnail(page, panels);

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
            <Button variant="outline" size="sm" onClick={retry}>
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
