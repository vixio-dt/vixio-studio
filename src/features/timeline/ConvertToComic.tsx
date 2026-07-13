import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, Dialog, Skeleton } from "@/components/ui";
import type { Project } from "@/domain/types";
import {
  applyFilmToComicPlan,
  planFilmToComic,
  readProjectGraph,
  type FilmToComicPlan,
} from "@/lib/convert";
import { useProjectsStore } from "@/stores/projects";

import { timelineCopy } from "./copy";

type ConvertStatus =
  | { state: "idle" }
  | { state: "planning" }
  | { state: "ready"; plan: FilmToComicPlan }
  | { state: "applying"; plan: FilmToComicPlan }
  | { state: "failed"; message: string };

const newPanelCount = (plan: FilmToComicPlan): number =>
  plan.pageCreates.reduce((total, page) => total + page.panels.length, 0) +
  plan.panelCreates.length;

/**
 * The film-to-comic gate: a preview dialog lists the pages, panels, and
 * balloons each scene will get before anything is written. Accepting applies
 * the plan, flips the project to comic mode, and lands on the page planner.
 */
export const ConvertToComic = ({ project }: { project: Project }) => {
  const navigate = useNavigate();
  const updateProject = useProjectsStore((state) => state.updateProject);
  const shotCount = useProjectsStore(
    (state) =>
      Object.values(state.shots).filter(
        (shot) => shot.projectId === project.id,
      ).length,
  );
  const [status, setStatus] = useState<ConvertStatus>({ state: "idle" });

  const copy = timelineCopy.convert;
  const disabledReason = shotCount === 0 ? copy.disabledNoShots : null;

  const openPreview = () => {
    setStatus({ state: "planning" });
    // Yield one frame so the planning skeleton paints before the sync plan.
    window.setTimeout(() => {
      const graph = readProjectGraph(project.id);
      if (!graph.ok) {
        setStatus({ state: "failed", message: graph.error.message });
        return;
      }
      setStatus({ state: "ready", plan: planFilmToComic(graph.value) });
    }, 0);
  };

  const close = () => setStatus({ state: "idle" });

  const accept = (plan: FilmToComicPlan) => {
    setStatus({ state: "applying", plan });
    const applied = applyFilmToComicPlan(plan);
    if (!applied.ok) {
      setStatus({ state: "failed", message: applied.error.message });
      return;
    }
    updateProject(project.id, { mode: "comic" });
    navigate("../pages");
  };

  const plan =
    status.state === "ready" || status.state === "applying"
      ? status.plan
      : null;

  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-line bg-ink-panel px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-sm font-bold tracking-[-0.02em]">
          {copy.title}
        </h2>
        <p className="text-xs text-fg-muted">{disabledReason ?? copy.hint}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        data-testid="convert-to-comic"
        disabled={disabledReason !== null}
        onClick={openPreview}
      >
        {copy.action}
      </Button>

      <Dialog
        open={status.state !== "idle"}
        onClose={close}
        title={copy.dialogTitle}
        width="lg"
      >
        <div data-testid="convert-preview" className="flex flex-col gap-4">
          {status.state === "planning" ? (
            <div aria-label={copy.planningLabel} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : null}

          {status.state === "failed" ? (
            <div className="flex items-center justify-between gap-3">
              <p role="alert" className="text-sm text-danger">
                {copy.applyFailed} {status.message}
              </p>
              <Button variant="outline" size="sm" onClick={openPreview}>
                {copy.retry}
              </Button>
            </div>
          ) : null}

          {plan ? (
            plan.sceneBreakdown.length === 0 ? (
              <p className="text-sm text-fg-secondary">
                {copy.nothingToConvert}
              </p>
            ) : (
              <>
                <p className="font-mono text-xs text-fg-secondary">
                  {copy.totals(
                    plan.pageCreates.length,
                    newPanelCount(plan),
                    plan.panelUpdates.length,
                    plan.unchangedCount,
                  )}
                  {", "}
                  {copy.balloonTotal(plan.balloonCount)}
                </p>
                <ul className="flex flex-col divide-y divide-line border border-line">
                  {plan.sceneBreakdown.map((row) => (
                    <li
                      key={row.sceneId}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="truncate text-[13px] text-fg-secondary">
                        {copy.sceneLabel(row.sceneNumber, row.location)}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-fg">
                        {copy.sceneCounts(
                          row.newPages,
                          row.newPanels,
                          row.updatedPanels,
                          row.balloons,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-fg-muted">{copy.invariant}</p>
              </>
            )
          ) : null}

          {status.state !== "planning" ? (
            <footer className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="outline" size="sm" onClick={close}>
                {copy.cancel}
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="convert-to-comic-confirm"
                disabled={plan === null || plan.sceneBreakdown.length === 0}
                busy={status.state === "applying"}
                onClick={() => (plan ? accept(plan) : undefined)}
              >
                {copy.accept}
              </Button>
            </footer>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
};
