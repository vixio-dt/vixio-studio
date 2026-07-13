import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, Dialog, Skeleton } from "@/components/ui";
import { CAMERA_PRESETS, SHOT_SIZES } from "@/domain/constants";
import type { Project } from "@/domain/types";
import {
  applyComicToFilmPlan,
  planComicToFilm,
  readProjectGraph,
  type ComicToFilmPlan,
} from "@/lib/convert";
import { useProjectsStore } from "@/stores/projects";

import { comicExportCopy } from "./copy";

type ConvertStatus =
  | { state: "idle" }
  | { state: "planning" }
  | { state: "ready"; plan: ComicToFilmPlan }
  | { state: "applying"; plan: ComicToFilmPlan }
  | { state: "failed"; message: string };

const sizeLabel = (value: string): string =>
  SHOT_SIZES.find((size) => size.value === value)?.label ?? value;

const presetLabel = (value: string): string =>
  CAMERA_PRESETS.find((preset) => preset.id === value)?.label ?? value;

/**
 * The comic-to-film gate: a preview dialog shows exactly what the plan will
 * create or patch per scene before anything is written. Accepting applies
 * the plan, flips the project to film mode, and lands on the storyboard.
 */
export const ConvertToFilm = ({ project }: { project: Project }) => {
  const navigate = useNavigate();
  const updateProject = useProjectsStore((state) => state.updateProject);
  const panelCount = useProjectsStore(
    (state) =>
      Object.values(state.panels).filter(
        (panel) => panel.projectId === project.id,
      ).length,
  );
  const sceneCount = useProjectsStore(
    (state) =>
      Object.values(state.scenes).filter(
        (scene) => scene.projectId === project.id,
      ).length,
  );
  const [status, setStatus] = useState<ConvertStatus>({ state: "idle" });

  const copy = comicExportCopy.convert;
  const disabledReason =
    panelCount === 0
      ? copy.disabledNoPanels
      : sceneCount === 0
        ? copy.disabledNoScenes
        : null;

  const openPreview = () => {
    setStatus({ state: "planning" });
    // Yield one frame so the planning skeleton paints before the sync plan.
    window.setTimeout(() => {
      const graph = readProjectGraph(project.id);
      if (!graph.ok) {
        setStatus({ state: "failed", message: graph.error.message });
        return;
      }
      setStatus({ state: "ready", plan: planComicToFilm(graph.value) });
    }, 0);
  };

  const close = () => setStatus({ state: "idle" });

  const accept = (plan: ComicToFilmPlan) => {
    setStatus({ state: "applying", plan });
    const applied = applyComicToFilmPlan(plan);
    if (!applied.ok) {
      setStatus({ state: "failed", message: applied.error.message });
      return;
    }
    updateProject(project.id, { mode: "film" });
    navigate("../storyboard");
  };

  const plan =
    status.state === "ready" || status.state === "applying"
      ? status.plan
      : null;

  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-ink-panel px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-sm font-bold tracking-[-0.02em]">
          {copy.title}
        </h2>
        <p className="text-xs text-fg-muted">{disabledReason ?? copy.hint}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        data-testid="convert-to-film"
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
                    plan.creates.length,
                    plan.updates.length,
                    plan.unchangedCount,
                  )}
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
                        {copy.sceneCounts(row.creates, row.updates, row.unchanged)}
                      </span>
                    </li>
                  ))}
                </ul>
                {plan.cameraCounts.length > 0 ? (
                  <div>
                    <h3 className="text-[13px] font-medium text-fg-secondary">
                      {copy.cameraTitle}
                    </h3>
                    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {plan.cameraCounts.map((camera) => (
                        <li
                          key={`${camera.size}-${camera.cameraPresetId}`}
                          className="text-xs text-fg-muted"
                        >
                          {copy.cameraItem(
                            sizeLabel(camera.size),
                            presetLabel(camera.cameraPresetId),
                          )}{" "}
                          <span className="font-mono text-fg-secondary">
                            {camera.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {plan.captionLineCount > 0 ? (
                  <p className="font-mono text-xs text-fg-secondary">
                    {copy.captionsCarried(plan.captionLineCount)}
                  </p>
                ) : null}
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
                data-testid="convert-to-film-confirm"
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
