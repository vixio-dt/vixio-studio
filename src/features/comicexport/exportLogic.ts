import { findComicLayout } from "@/domain/constants";
import type { ComicPage, Panel } from "@/domain/types";
import { ok, type Result } from "@/lib/result";
import {
  renderPageToCanvas,
  canvasToPngBlob,
  type PageComposition,
} from "@/lib/comic/compositor";
import { useAssetsStore } from "@/stores/assets";

/**
 * Export orchestration for the comic export view: sequential page rendering
 * with progress callbacks, plus the four-state status union the view renders.
 */

export type ExportStatus =
  | { state: "idle" }
  | { state: "running"; label: string; done: number; total: number }
  | { state: "succeeded"; label: string; skippedPanels: number }
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

/** The layout, panels, and asset index the compositor needs for one page. */
export const pageCompositionsFor = (
  bundles: readonly PageBundle[],
): PageComposition[] => {
  const assets = useAssetsStore.getState().assets;
  return bundles.map((bundle) => ({
    layout: findComicLayout(bundle.page.layoutId),
    panels: bundle.panels,
    assets,
  }));
};

/**
 * Panels whose index sits past their page's current layout: the compositor
 * skips them, so exports report how many were left out instead of silently
 * shipping fewer panels than the book has.
 */
export const countUnplacedPanels = (bundles: readonly PageBundle[]): number =>
  bundles.reduce((total, bundle) => {
    const frameCount = findComicLayout(bundle.page.layoutId).frames.length;
    return (
      total + bundle.panels.filter((panel) => panel.index >= frameCount).length
    );
  }, 0);
