import { findComicLayout } from "@/domain/constants";
import type { ComicPage, Panel } from "@/domain/types";
import { ok, type Result } from "@/lib/result";
import { renderPageToCanvas, canvasToPngBlob } from "@/lib/comic/compositor";
import { useAssetsStore } from "@/stores/assets";

/**
 * Export orchestration for the comic export view: sequential page rendering
 * with progress callbacks, plus the four-state status union the view renders.
 */

export type ExportStatus =
  | { state: "idle" }
  | { state: "running"; label: string; done: number; total: number }
  | { state: "succeeded"; label: string }
  | { state: "failed"; message: string };

export type PageBundle = {
  page: ComicPage;
  panels: readonly Panel[];
};

/** Render every page to a canvas in order, reporting progress as pages land. */
export const renderPageCanvases = async (
  bundles: readonly PageBundle[],
  onProgress: (done: number, total: number) => void,
): Promise<Result<HTMLCanvasElement[]>> => {
  const assets = useAssetsStore.getState().assets;
  const canvases: HTMLCanvasElement[] = [];
  for (const bundle of bundles) {
    const rendered = await renderPageToCanvas({
      layout: findComicLayout(bundle.page.layoutId),
      panels: bundle.panels,
      assets,
    });
    if (!rendered.ok) return rendered;
    canvases.push(rendered.value);
    onProgress(canvases.length, bundles.length);
  }
  return ok(canvases);
};

/** Render every page straight to a PNG blob in order. */
export const renderPageBlobs = async (
  bundles: readonly PageBundle[],
  onProgress: (done: number, total: number) => void,
): Promise<Result<Blob[]>> => {
  const rendered = await renderPageCanvases(bundles, onProgress);
  if (!rendered.ok) return rendered;
  const blobs: Blob[] = [];
  for (const canvas of rendered.value) {
    const encoded = await canvasToPngBlob(canvas);
    if (!encoded.ok) return encoded;
    blobs.push(encoded.value);
  }
  return ok(blobs);
};

/**
 * Content signature for preview caching. Panel edits do not touch the page's
 * updatedAt, so the signature also folds in each panel's art and lettering,
 * plus the resolved asset urls (hydration fills them in after boot).
 */
export const pageSignature = (
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
