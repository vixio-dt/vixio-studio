import JSZip from "jszip";

import type { ComicPage, Panel, Project } from "@/domain/types";
import { appError, err, ok, type Result } from "@/lib/result";

/**
 * Comic export packaging: CBZ archives, the versioned project JSON, and the
 * shared download plumbing. Compositing lives in compositor.ts; this module
 * only wraps finished blobs.
 */

/** "001.png" style page file names, 1-based. */
export const pageFileName = (position: number): string =>
  `${String(position + 1).padStart(3, "0")}.png`;

/** Project title as a safe file stem: "The Long Night" -> "the-long-night". */
export const fileStem = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "comic";
};

/** A CBZ is a plain zip of page images named in reading order. */
export const buildCbz = async (
  pageBlobs: readonly Blob[],
): Promise<Result<Blob>> => {
  if (pageBlobs.length === 0) {
    return err(appError("not-found", "No pages to archive"));
  }
  try {
    const zip = new JSZip();
    pageBlobs.forEach((blob, position) => {
      zip.file(pageFileName(position), blob);
    });
    const archive = await zip.generateAsync({ type: "blob" });
    return ok(archive);
  } catch (cause) {
    return err(appError("storage-failed", "Could not build the CBZ archive", cause));
  }
};

/** Versioned, self-contained snapshot of the book's structure and lettering. */
export const buildProjectJson = (input: {
  project: Project;
  pages: readonly ComicPage[];
  panelsForPage: (page: ComicPage) => readonly Panel[];
}): Blob => {
  const { project, pages, panelsForPage } = input;
  const payload = {
    version: "1",
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      logline: project.logline,
      comicStyleId: project.comicStyleId ?? null,
      readingDirection: project.readingDirection ?? "ltr",
    },
    pages: pages.map((page) => ({
      id: page.id,
      index: page.index,
      layoutId: page.layoutId,
      panels: panelsForPage(page).map((panel) => ({
        id: panel.id,
        index: panel.index,
        description: panel.description,
        promptNotes: panel.promptNotes,
        characterIds: panel.characterIds,
        seed: panel.seed,
        imageAssetId: panel.imageAssetId ?? null,
        balloons: panel.balloons,
      })),
    })),
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
};

/** Anchor-click download; the object URL is revoked after the click settles. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
