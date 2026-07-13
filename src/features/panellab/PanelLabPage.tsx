import { PaintBrush } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, MediaFrame, Skeleton } from "@/components/ui";
import { findComicLayout } from "@/domain/constants";
import type { Panel } from "@/domain/types";
import type { AssetId } from "@/lib/id";
import {
  closestAspectRatio,
  displayNumberForPanel,
  frameAspectString,
  framePixelSize,
  orderPanelsForReading,
} from "@/lib/comic/reading";
import { formatRelativeTime } from "@/lib/time";
import { useAsset, useAssetsStore } from "@/stores/assets";
import {
  selectCharactersForProject,
  selectPagesForProject,
  selectPanelsForPage,
  useProjectsStore,
} from "@/stores/projects";
import { useTasksStore } from "@/stores/tasks";

import { useActiveProject } from "../shared/useActiveProject";
import { panelLabCopy } from "./copy";
import { LetteringControls, LetteringOverlay } from "./LetteringEditor";
import { PanelConsole } from "./PanelConsole";
import { activePanelTasks, latestPanelFailure } from "./panelLogic";
import { PanelRail } from "./PanelRail";
import { usePanelSelection } from "./usePanelSelection";

/**
 * The panel lab: one panel at a time, full control over the panel prompt,
 * plus lettering mode for balloons. Panel rail on the left, stage and take
 * history in the middle, console on the right (under the stage below lg).
 */
export const PanelLabPage = () => {
  const project = useActiveProject();
  const pagesById = useProjectsStore((state) => state.pages);
  const panelsById = useProjectsStore((state) => state.panels);
  const charactersById = useProjectsStore((state) => state.characters);
  const updatePanel = useProjectsStore((state) => state.updatePanel);
  const tasks = useTasksStore((state) => state.tasks);
  const assetsHydrated = useAssetsStore((state) => state.hydrated);
  const { selectedPanelId, selectPanel } = usePanelSelection();
  const [lettering, setLettering] = useState(false);

  const direction = project?.readingDirection ?? "ltr";

  const pages = useMemo(
    () => (project ? selectPagesForProject(pagesById, project.id) : []),
    [pagesById, project],
  );
  const panelsByPage = useMemo(
    () =>
      new Map(
        pages.map((page) => [
          page.id,
          selectPanelsForPage(panelsById, page.id) as readonly Panel[],
        ]),
      ),
    [pages, panelsById],
  );
  const projectCharacters = useMemo(
    () => (project ? selectCharactersForProject(charactersById, project.id) : []),
    [charactersById, project],
  );
  /** Every panel of the book flattened into display (reading) order. */
  const orderedPanels = useMemo(
    () =>
      pages.flatMap((page) =>
        orderPanelsForReading(
          panelsByPage.get(page.id) ?? [],
          findComicLayout(page.layoutId),
          direction,
        ),
      ),
    [pages, panelsByPage, direction],
  );

  const selectedPanel = useMemo(
    () => orderedPanels.find((panel) => panel.id === selectedPanelId) ?? null,
    [orderedPanels, selectedPanelId],
  );

  // Default-select the first panel when the param is empty or stale.
  useEffect(() => {
    if (selectedPanel) return;
    const first = orderedPanels[0];
    if (first) selectPanel(first.id);
  }, [selectedPanel, orderedPanels, selectPanel]);

  const pendingTaskIds = useMemo(
    () =>
      selectedPanel
        ? activePanelTasks(tasks, selectedPanel.id).map((task) => task.id)
        : [],
    [tasks, selectedPanel],
  );
  const failure = useMemo(
    () => (selectedPanel ? latestPanelFailure(tasks, selectedPanel.id) : null),
    [tasks, selectedPanel],
  );
  const imageAsset = useAsset(selectedPanel?.imageAssetId ?? null);

  if (!project) return null;

  if (orderedPanels.length === 0) {
    return (
      <div
        data-testid="page-panellab"
        className="flex h-full items-center justify-center overflow-y-auto"
      >
        <EmptyState
          icon={PaintBrush}
          title={panelLabCopy.empty.title}
          hint={panelLabCopy.empty.hint}
          action={
            <Link
              to="../pages"
              className="inline-flex h-8 items-center border border-line-strong px-3 text-[13px] text-fg transition-colors duration-150 hover:bg-ink-hover"
            >
              {panelLabCopy.empty.action}
            </Link>
          }
        />
      </div>
    );
  }

  const page = selectedPanel ? (pagesById[selectedPanel.pageId] ?? null) : null;
  const layout = page ? findComicLayout(page.layoutId) : null;
  const pageNumber = page
    ? pages.findIndex((candidate) => candidate.id === page.id) + 1
    : 0;
  const panelNumber =
    layout && selectedPanel
      ? displayNumberForPanel(layout, direction, selectedPanel.index)
      : 0;

  const generating = pendingTaskIds.length > 0;
  const waitingOnHydration =
    selectedPanel !== null &&
    selectedPanel.imageAssetId !== undefined &&
    !assetsHydrated &&
    !imageAsset;

  return (
    <div
      data-testid="page-panellab"
      className="grid h-full grid-cols-[240px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[240px_minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]"
    >
      <PanelRail
        pages={pages}
        panelsByPage={panelsByPage}
        direction={direction}
        selectedPanelId={selectedPanel?.id ?? null}
        onSelect={selectPanel}
        className="row-span-2 lg:row-span-1"
      />

      <section className="col-start-2 row-start-1 flex min-w-0 flex-col gap-4 overflow-y-auto p-4">
        {selectedPanel && page && layout ? (
          <>
            <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-3">
              <h2 className="font-display text-sm font-bold tracking-[-0.02em]">
                {panelLabCopy.stage.label(pageNumber, panelNumber)}
              </h2>
              <button
                type="button"
                data-testid="lettering-toggle"
                aria-pressed={lettering}
                onClick={() => setLettering((current) => !current)}
                className={`h-8 border px-3 text-[13px] transition-colors duration-150 ${
                  lettering
                    ? "border-accent-media/60 bg-ink-raised text-accent"
                    : "border-line-strong text-fg-secondary hover:bg-ink-hover"
                }`}
              >
                {panelLabCopy.lettering.toggle}
              </button>
            </div>

            <MediaFrame
              aspectRatio={frameAspectString(layout, selectedPanel.index)}
              live={generating}
              className="mx-auto w-full max-w-[640px]"
            >
              {imageAsset ? (
                <img
                  src={imageAsset.url}
                  alt={panelLabCopy.stage.panelAlt(pageNumber, panelNumber)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              {generating || waitingOnHydration ? (
                <Skeleton
                  className={`absolute inset-0 ${imageAsset ? "opacity-75" : ""}`}
                />
              ) : null}
              {!imageAsset && !generating && !waitingOnHydration ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <PaintBrush size={26} className="text-fg-muted" aria-hidden />
                  <p className="text-sm text-fg-secondary">
                    {panelLabCopy.stage.noImage}
                  </p>
                </div>
              ) : null}
              {lettering ? (
                <LetteringOverlay
                  panel={selectedPanel}
                  panelWidth={framePixelSize(layout, selectedPanel.index).width}
                  panelHeight={framePixelSize(layout, selectedPanel.index).height}
                />
              ) : null}
            </MediaFrame>

            {imageAsset ? (
              <p className="mx-auto flex w-full max-w-[640px] flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-muted">
                <span>{panelLabCopy.stage.seed(imageAsset.seed)}</span>
                <span>{imageAsset.model}</span>
                <span>{formatRelativeTime(imageAsset.createdAt)}</span>
              </p>
            ) : null}

            <TakeStrip
              panel={selectedPanel}
              aspect={frameAspectString(layout, selectedPanel.index)}
              pendingCount={pendingTaskIds.length}
              onUse={(assetId) =>
                updatePanel(selectedPanel.id, { imageAssetId: assetId })
              }
            />

            {lettering ? (
              <div className="mx-auto w-full max-w-[640px]">
                <LetteringControls
                  panel={selectedPanel}
                  characters={projectCharacters}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <aside className="col-start-2 row-start-2 max-h-[42vh] overflow-y-auto border-t border-line bg-ink-panel lg:col-start-3 lg:row-start-1 lg:max-h-none lg:border-l lg:border-t-0">
        {selectedPanel && page && layout ? (
          <PanelConsole
            key={selectedPanel.id}
            project={project}
            panel={selectedPanel}
            characters={projectCharacters}
            frameAspect={closestAspectRatio(
              framePixelSize(layout, selectedPanel.index).width,
              framePixelSize(layout, selectedPanel.index).height,
            )}
            pageNumber={pageNumber}
            panelNumber={panelNumber}
            busy={generating}
            failure={failure}
          />
        ) : null}
      </aside>
    </div>
  );
};

type TakeStripProps = {
  panel: Panel;
  aspect: string;
  /** Number of queued or running takes; one skeleton tile each. */
  pendingCount: number;
  onUse: (assetId: AssetId) => void;
};

/** Take history under the stage: newest first, one click restores any take. */
const TakeStrip = ({ panel, aspect, pendingCount, onUse }: TakeStripProps) => {
  const isEmpty = pendingCount === 0 && panel.imageHistory.length === 0;
  return (
    <div
      role="group"
      aria-label={panelLabCopy.history.label}
      className="mx-auto flex w-full max-w-[640px] gap-2 overflow-x-auto"
    >
      {isEmpty ? (
        <p className="py-1 text-[11px] text-fg-muted">
          {panelLabCopy.history.empty}
        </p>
      ) : (
        <>
          {Array.from({ length: pendingCount }, (_, index) => (
            <div key={`pending-${index}`} className="w-20 shrink-0">
              <MediaFrame aspectRatio={aspect} live>
                <Skeleton className="absolute inset-0" />
              </MediaFrame>
            </div>
          ))}
          {panel.imageHistory.map((assetId, position) => (
            <TakeTile
              key={assetId}
              assetId={assetId}
              aspect={aspect}
              active={assetId === panel.imageAssetId}
              position={position + 1}
              onUse={() => onUse(assetId)}
            />
          ))}
        </>
      )}
    </div>
  );
};

type TakeTileProps = {
  assetId: AssetId;
  aspect: string;
  active: boolean;
  /** 1-based, newest first. */
  position: number;
  onUse: () => void;
};

const TakeTile = ({ assetId, aspect, active, position, onUse }: TakeTileProps) => {
  const asset = useAsset(assetId);
  return (
    <button
      type="button"
      onClick={onUse}
      title={panelLabCopy.history.use}
      aria-label={panelLabCopy.history.takeLabel(position)}
      aria-pressed={active}
      className={`w-20 shrink-0 transition-colors duration-150 ${
        active ? "ring-1 ring-accent-media" : ""
      }`}
    >
      <MediaFrame aspectRatio={aspect}>
        {asset ? (
          <img
            src={asset.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Skeleton className="absolute inset-0" />
        )}
      </MediaFrame>
    </button>
  );
};
