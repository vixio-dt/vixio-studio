import { Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button, Dialog, MediaFrame, Skeleton } from "@/components/ui";
import { findVisualStyle, PROJECT_FORMATS } from "@/domain/constants";
import type { Project } from "@/domain/types";
import { formatRelativeTime } from "@/lib/time";
import { useAsset, useAssetsStore } from "@/stores/assets";
import { selectShotsForProject, useProjectsStore } from "@/stores/projects";

import { projectsCopy } from "./copy";

type ProjectCardProps = {
  project: Project;
};

/**
 * One project on the home grid. The cover shows the latest shot frame in the
 * film's running order; until the asset store hydrates it holds a
 * shape-matched skeleton, and with no frames it falls back to a quiet grade
 * swatch derived from the project's visual style.
 */
export const ProjectCard = ({ project }: ProjectCardProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hydrated = useAssetsStore((state) => state.hydrated);
  const deleteProject = useProjectsStore((state) => state.deleteProject);

  // Last shot in scene/shot order that has a frame; primitive return keeps
  // the zustand equality check cheap.
  const latestFrameAssetId = useProjectsStore((state) => {
    const ordered = selectShotsForProject(state.shots, state.scenes, project.id);
    for (let position = ordered.length - 1; position >= 0; position -= 1) {
      const shot = ordered[position];
      if (shot && shot.frameAssetId) return shot.frameAssetId;
    }
    return null;
  });
  const cover = useAsset(latestFrameAssetId);

  const style = findVisualStyle(project.styleId);
  const formatLabel =
    PROJECT_FORMATS.find((entry) => entry.value === project.format)?.label ??
    project.format;
  const meta = [
    formatLabel,
    project.genre.trim(),
    formatRelativeTime(project.updatedAt),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");

  const confirmDelete = () => {
    setConfirmOpen(false);
    deleteProject(project.id);
  };

  return (
    <article className="border border-line bg-ink-panel transition-colors duration-150 hover:border-line-strong">
      <Link
        to={`/p/${project.id}/script`}
        aria-label={projectsCopy.card.openLabel(project.title)}
        className="block p-3"
      >
        <MediaFrame aspectRatio={project.aspectRatio}>
          {latestFrameAssetId && !hydrated ? (
            <Skeleton className="absolute inset-0" />
          ) : cover ? (
            <img
              src={cover.url}
              alt={projectsCopy.card.coverAlt(project.title)}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-end p-3"
              style={{
                background: `linear-gradient(135deg, ${style.gradeFrom}59, ${style.gradeTo}33)`,
              }}
            >
              <span className="text-xs text-fg-muted">{style.name}</span>
            </div>
          )}
        </MediaFrame>
        <h2 className="mt-3 truncate font-display text-base font-bold tracking-[-0.02em]">
          {project.title}
        </h2>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-fg-secondary">
          {project.logline}
        </p>
      </Link>

      <div className="flex items-center justify-between gap-2 border-t border-line py-1 pl-3 pr-1">
        <span className="truncate font-mono text-xs text-fg-muted">{meta}</span>
        <button
          type="button"
          aria-label={projectsCopy.card.deleteLabel(project.title)}
          onClick={() => setConfirmOpen(true)}
          className="flex size-8 shrink-0 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-danger"
        >
          <Trash size={16} aria-hidden />
        </button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={projectsCopy.deleteDialog.title}
      >
        <p className="text-sm text-fg-secondary">
          {projectsCopy.deleteDialog.body(project.title)}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            {projectsCopy.deleteDialog.cancel}
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            {projectsCopy.deleteDialog.confirm}
          </Button>
        </div>
      </Dialog>
    </article>
  );
};
