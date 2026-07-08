import { BookOpen, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, EmptyState, Segmented, Select } from "@/components/ui";
import {
  COMIC_LAYOUTS,
  COMIC_STYLES,
  DEFAULT_COMIC_STYLE_ID,
  findComicLayout,
  READING_DIRECTIONS,
} from "@/domain/constants";
import type { ComicLayoutId, ComicStyleId, Scene } from "@/domain/types";
import type { PageId, PanelId } from "@/lib/id";
import { planPageForScene } from "@/lib/comic/planner";
import {
  selectPagesForProject,
  selectPanelsForPage,
  selectScenesForProject,
  useProjectsStore,
} from "@/stores/projects";

import { useActiveProject } from "../shared/useActiveProject";
import { pagesCopy } from "./copy";
import { PageCard } from "./PageCard";

/**
 * The page planner: comic style and reading direction up top, one card per
 * page below. Plan pages from script maps scenes to pages deterministically;
 * every card links straight into the panel lab.
 */
export const PagesPage = () => {
  const navigate = useNavigate();
  const project = useActiveProject();
  const scenesById = useProjectsStore((state) => state.scenes);
  const pagesById = useProjectsStore((state) => state.pages);
  const panelsById = useProjectsStore((state) => state.panels);
  const updateProject = useProjectsStore((state) => state.updateProject);
  const addPage = useProjectsStore((state) => state.addPage);
  const addPanel = useProjectsStore((state) => state.addPanel);
  const updatePage = useProjectsStore((state) => state.updatePage);
  const removePage = useProjectsStore((state) => state.removePage);
  const reorderPages = useProjectsStore((state) => state.reorderPages);

  const [addLayoutId, setAddLayoutId] = useState<ComicLayoutId>("grid-2x2");

  const scenes = useMemo(
    () => (project ? selectScenesForProject(scenesById, project.id) : []),
    [scenesById, project],
  );
  const pages = useMemo(
    () => (project ? selectPagesForProject(pagesById, project.id) : []),
    [pagesById, project],
  );
  const panelsByPage = useMemo(
    () =>
      new Map(
        pages.map((page) => [page.id, selectPanelsForPage(panelsById, page.id)]),
      ),
    [pages, panelsById],
  );
  const totalPanels = useMemo(
    () =>
      pages.reduce(
        (total, page) => total + (panelsByPage.get(page.id)?.length ?? 0),
        0,
      ),
    [pages, panelsByPage],
  );

  // The shell guards missing projects; this covers deletion races only.
  if (!project) return null;

  const direction = project.readingDirection ?? "ltr";
  const styleId = project.comicStyleId ?? DEFAULT_COMIC_STYLE_ID;

  const seedPanelsForPage = (
    pageId: PageId,
    layoutId: ComicLayoutId,
    beats: readonly string[],
    scene: Scene | null,
    startIndex: number,
  ) => {
    const frameCount = findComicLayout(layoutId).frames.length;
    const count = beats.length > 0 ? beats.length : frameCount;
    for (let index = startIndex; index < count; index++) {
      addPanel({
        pageId,
        projectId: project.id,
        index,
        description: beats[index] ?? "",
        characterIds: scene ? [...scene.characterIds] : [],
      });
    }
  };

  /**
   * One page per scene, in order. The planner never duplicates: it only adds
   * pages for scenes past the current page count, so rerunning is safe.
   */
  const handlePlan = () => {
    const remaining = scenes.slice(pages.length);
    remaining.forEach((scene, offset) => {
      const plan = planPageForScene(scene);
      const page = addPage({
        projectId: project.id,
        index: pages.length + offset,
        layoutId: plan.layoutId,
      });
      seedPanelsForPage(page.id, plan.layoutId, plan.beats, scene, 0);
    });
  };

  const handleAddPage = () => {
    const page = addPage({
      projectId: project.id,
      index: pages.length,
      layoutId: addLayoutId,
    });
    seedPanelsForPage(page.id, addLayoutId, [], null, 0);
  };

  const handleLayoutChange = (pageId: PageId, layoutId: ComicLayoutId) => {
    updatePage(pageId, { layoutId });
    // Grow into the new layout; existing panels and their work are kept.
    const existing = panelsByPage.get(pageId) ?? [];
    seedPanelsForPage(pageId, layoutId, [], null, existing.length);
  };

  const handleMove = (position: number, delta: -1 | 1) => {
    const target = position + delta;
    if (target < 0 || target >= pages.length) return;
    const ordered = pages.map((page) => page.id);
    const current = ordered[position];
    const swapped = ordered[target];
    if (!current || !swapped) return;
    ordered[position] = swapped;
    ordered[target] = current;
    reorderPages(project.id, ordered);
  };

  const handleOpenPanel = (panelId: PanelId | null) => {
    navigate(panelId ? `../panels?panel=${panelId}` : "../panels");
  };

  const planDisabled = scenes.length === 0 || scenes.length <= pages.length;
  const planDisabledReason =
    scenes.length === 0
      ? pagesCopy.header.planDisabledNoScenes
      : scenes.length <= pages.length && pages.length > 0
        ? pagesCopy.header.planDisabledCaughtUp
        : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-line bg-ink-panel p-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="comic-style-picker"
            className="text-[13px] font-medium text-fg-secondary"
          >
            {pagesCopy.header.styleLabel}
          </label>
          <Select
            id="comic-style-picker"
            value={styleId}
            onChange={(event) =>
              updateProject(project.id, {
                comicStyleId: event.target.value as ComicStyleId,
              })
            }
            className="h-9 w-44 text-[13px]"
          >
            {COMIC_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg-secondary">
            {pagesCopy.header.directionLabel}
          </span>
          <Segmented
            ariaLabel={pagesCopy.header.directionLabel}
            options={READING_DIRECTIONS}
            value={direction}
            onChange={(value) =>
              updateProject(project.id, { readingDirection: value })
            }
          />
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-3">
          <span className="pb-2 font-mono text-[11px] text-fg-muted">
            {pagesCopy.header.counts(pages.length, totalPanels)}
          </span>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="add-page-layout"
              className="text-[13px] font-medium text-fg-secondary"
            >
              {pagesCopy.header.addLayoutLabel}
            </label>
            <div className="flex items-center gap-2">
              <Select
                id="add-page-layout"
                value={addLayoutId}
                onChange={(event) =>
                  setAddLayoutId(event.target.value as ComicLayoutId)
                }
                className="h-9 w-36 text-[13px]"
              >
                {COMIC_LAYOUTS.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.label}
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                data-testid="pages-add"
                onClick={handleAddPage}
                className="h-9"
              >
                <Plus size={14} aria-hidden />
                {pagesCopy.header.add}
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="pages-plan"
                disabled={planDisabled}
                onClick={handlePlan}
                className="h-9"
              >
                {pagesCopy.header.plan}
              </Button>
            </div>
          </div>
        </div>
        <p className="w-full text-xs text-fg-muted">
          {planDisabledReason ?? pagesCopy.header.planHelper}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={BookOpen}
              title={pagesCopy.empty.title}
              hint={pagesCopy.empty.hint}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {pages.map((page, position) => (
              <PageCard
                key={page.id}
                page={page}
                panels={panelsByPage.get(page.id) ?? []}
                direction={direction}
                position={position}
                pageCount={pages.length}
                onOpenPanel={handleOpenPanel}
                onLayoutChange={(layoutId) => handleLayoutChange(page.id, layoutId)}
                onMove={(delta) => handleMove(position, delta)}
                onRemove={() => removePage(page.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
