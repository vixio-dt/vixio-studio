import { Export } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { Button, EmptyState } from "@/components/ui";
import { composeWebtoonStrip, canvasToPngBlob } from "@/lib/comic/compositor";
import {
  buildCbz,
  buildProjectJson,
  downloadBlob,
  fileStem,
  pageFileName,
} from "@/lib/comic/export";
import {
  selectPagesForProject,
  selectPanelsForPage,
  useProjectsStore,
} from "@/stores/projects";

import { useActiveProject } from "../shared/useActiveProject";
import { ConvertToFilm } from "./ConvertToFilm";
import { comicExportCopy } from "./copy";
import {
  renderPageBlobs,
  renderPageCanvases,
  type ExportStatus,
  type PageBundle,
} from "./exportLogic";
import { PagePreview } from "./PagePreview";

/**
 * Lettered page export: four packaged outputs off the same compositor (PNG
 * per page, CBZ archive, webtoon strip, project JSON) over a grid of lazily
 * rendered page previews.
 */
export const ComicExportPage = () => {
  const project = useActiveProject();
  const pagesById = useProjectsStore((state) => state.pages);
  const panelsById = useProjectsStore((state) => state.panels);
  const [status, setStatus] = useState<ExportStatus>({ state: "idle" });

  const pages = useMemo(
    () => (project ? selectPagesForProject(pagesById, project.id) : []),
    [pagesById, project],
  );
  const bundles = useMemo(
    (): PageBundle[] =>
      pages.map((page) => ({
        page,
        panels: selectPanelsForPage(panelsById, page.id),
      })),
    [pages, panelsById],
  );

  // The shell guards missing projects; this covers deletion races only.
  if (!project) return null;

  const running = status.state === "running";
  const disabled = running || pages.length === 0;
  const stem = fileStem(project.title);

  const progress = (label: string) => (done: number, total: number) =>
    setStatus({ state: "running", label, done, total });

  const runPagesPng = async () => {
    const label = comicExportCopy.status.renderingPages;
    setStatus({ state: "running", label, done: 0, total: pages.length });
    const rendered = await renderPageBlobs(bundles, progress(label));
    if (!rendered.ok) {
      setStatus({ state: "failed", message: rendered.error.message });
      return;
    }
    rendered.value.forEach((blob, position) => {
      downloadBlob(blob, `${stem}-${pageFileName(position)}`);
    });
    setStatus({ state: "succeeded", label: comicExportCopy.actions.pagesPng });
  };

  const runCbz = async () => {
    const label = comicExportCopy.status.renderingPages;
    setStatus({ state: "running", label, done: 0, total: pages.length });
    const rendered = await renderPageBlobs(bundles, progress(label));
    if (!rendered.ok) {
      setStatus({ state: "failed", message: rendered.error.message });
      return;
    }
    setStatus({
      state: "running",
      label: comicExportCopy.status.packagingCbz,
      done: pages.length,
      total: pages.length,
    });
    const archive = await buildCbz(rendered.value);
    if (!archive.ok) {
      setStatus({ state: "failed", message: archive.error.message });
      return;
    }
    downloadBlob(archive.value, `${stem}.cbz`);
    setStatus({ state: "succeeded", label: comicExportCopy.actions.cbz });
  };

  const runWebtoon = async () => {
    const label = comicExportCopy.status.renderingPages;
    setStatus({ state: "running", label, done: 0, total: pages.length });
    const rendered = await renderPageCanvases(bundles, progress(label));
    if (!rendered.ok) {
      setStatus({ state: "failed", message: rendered.error.message });
      return;
    }
    setStatus({
      state: "running",
      label: comicExportCopy.status.buildingStrip,
      done: pages.length,
      total: pages.length,
    });
    const strip = composeWebtoonStrip(rendered.value);
    if (!strip.ok) {
      setStatus({ state: "failed", message: strip.error.message });
      return;
    }
    const encoded = await canvasToPngBlob(strip.value);
    if (!encoded.ok) {
      setStatus({ state: "failed", message: encoded.error.message });
      return;
    }
    downloadBlob(encoded.value, `${stem}-webtoon.png`);
    setStatus({ state: "succeeded", label: comicExportCopy.actions.webtoon });
  };

  const runJson = () => {
    setStatus({
      state: "running",
      label: comicExportCopy.status.writingJson,
      done: 0,
      total: 1,
    });
    const blob = buildProjectJson({
      project,
      pages,
      panelsForPage: (page) => selectPanelsForPage(panelsById, page.id),
    });
    downloadBlob(blob, `${stem}.json`);
    setStatus({ state: "succeeded", label: comicExportCopy.actions.json });
  };

  return (
    <div data-testid="page-comicexport" className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-ink-panel p-4">
        <Button
          variant="primary"
          size="sm"
          data-testid="export-cbz"
          disabled={disabled}
          busy={running}
          onClick={() => void runCbz()}
        >
          {comicExportCopy.actions.cbz}
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="export-pages-png"
          disabled={disabled}
          onClick={() => void runPagesPng()}
        >
          {comicExportCopy.actions.pagesPng}
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="export-webtoon"
          disabled={disabled}
          onClick={() => void runWebtoon()}
        >
          {comicExportCopy.actions.webtoon}
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="export-json"
          disabled={disabled}
          onClick={runJson}
        >
          {comicExportCopy.actions.json}
        </Button>

        <p
          data-testid="export-status"
          aria-live="polite"
          className={`ml-auto text-xs ${
            status.state === "failed" ? "text-danger" : "text-fg-secondary"
          }`}
        >
          {status.state === "idle" ? comicExportCopy.status.idle : null}
          {status.state === "running" ? (
            <>
              {status.label},{" "}
              <span className="font-mono">
                {status.done} / {status.total}
              </span>
            </>
          ) : null}
          {status.state === "succeeded"
            ? comicExportCopy.status.done(status.label)
            : null}
          {status.state === "failed" ? status.message : null}
        </p>
      </header>

      <ConvertToFilm project={project} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={Export}
              title={comicExportCopy.empty.title}
              hint={comicExportCopy.empty.hint}
            />
          </div>
        ) : (
          <div
            role="list"
            aria-label={comicExportCopy.previews.label}
            className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            {bundles.map((bundle, position) => (
              <div role="listitem" key={bundle.page.id}>
                <PagePreview
                  page={bundle.page}
                  panels={bundle.panels}
                  pageNumber={position + 1}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
