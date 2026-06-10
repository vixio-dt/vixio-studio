import { useState } from "react";

import { Button, Dialog, Field, Select, TextArea } from "@/components/ui";
import type { Project } from "@/domain/types";
import { useProjectsStore } from "@/stores/projects";
import { useSettingsStore } from "@/stores/settings";

import { scriptCopy } from "./copy";
import { SCENE_COUNT_CHOICES, willUseGemini } from "./scriptLogic";
import type { GenerationPhase } from "./useGenerateScript";

type DevelopmentPanelProps = {
  project: Project;
  /** Target scene count for the next generation, owned by the page. */
  sceneCount: number;
  onSceneCountChange: (count: number) => void;
  /** How many scenes the project currently has; gates the replace dialog. */
  sceneTotal: number;
  phase: GenerationPhase;
  onGenerate: (input: { logline: string; synopsis: string }) => void;
};

const copy = scriptCopy.development;

/**
 * The left "Development" column: logline and synopsis drafts that commit on
 * blur, a scene count target, and the one primary action of the script room.
 */
export const DevelopmentPanel = ({
  project,
  sceneCount,
  onSceneCountChange,
  sceneTotal,
  phase,
  onGenerate,
}: DevelopmentPanelProps) => {
  const updateProject = useProjectsStore((state) => state.updateProject);
  const textProvider = useSettingsStore((state) => state.textProvider);
  const geminiApiKey = useSettingsStore((state) => state.geminiApiKey);

  const [logline, setLogline] = useState(project.logline);
  const [synopsis, setSynopsis] = useState(project.synopsis);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Generation writes the synopsis back to the store; reset drafts when the
  // store value moves under us (render-time state adjustment, no effect).
  const [seenLogline, setSeenLogline] = useState(project.logline);
  if (project.logline !== seenLogline) {
    setSeenLogline(project.logline);
    setLogline(project.logline);
  }
  const [seenSynopsis, setSeenSynopsis] = useState(project.synopsis);
  if (project.synopsis !== seenSynopsis) {
    setSeenSynopsis(project.synopsis);
    setSynopsis(project.synopsis);
  }

  const commitLogline = () => {
    if (logline !== project.logline) updateProject(project.id, { logline });
  };
  const commitSynopsis = () => {
    if (synopsis !== project.synopsis) updateProject(project.id, { synopsis });
  };

  const startGeneration = () => {
    setConfirmOpen(false);
    onGenerate({ logline, synopsis });
  };

  const handleGenerateClick = () => {
    commitLogline();
    commitSynopsis();
    if (sceneTotal > 0) {
      setConfirmOpen(true);
      return;
    }
    startGeneration();
  };

  const running = phase.state === "running";
  const providerNote = willUseGemini(textProvider, geminiApiKey)
    ? copy.providerGemini
    : copy.providerPreview;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="font-display text-sm font-bold tracking-[-0.02em]">
        {copy.heading}
      </h2>

      <Field label={copy.loglineLabel} helper={copy.loglineHelper}>
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            value={logline}
            placeholder={copy.loglinePlaceholder}
            onChange={(event) => setLogline(event.target.value)}
            onBlur={commitLogline}
          />
        )}
      </Field>

      <Field label={copy.synopsisLabel} helper={copy.synopsisHelper}>
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            className="min-h-32"
            value={synopsis}
            placeholder={copy.synopsisPlaceholder}
            onChange={(event) => setSynopsis(event.target.value)}
            onBlur={commitSynopsis}
          />
        )}
      </Field>

      <Field label={copy.sceneCountLabel} helper={copy.sceneCountHelper}>
        {({ inputId, describedBy }) => (
          <Select
            id={inputId}
            aria-describedby={describedBy}
            className="font-mono"
            value={String(sceneCount)}
            onChange={(event) => onSceneCountChange(Number(event.target.value))}
          >
            {SCENE_COUNT_CHOICES.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Button
        variant="primary"
        busy={running}
        onClick={handleGenerateClick}
        className="w-full"
      >
        {copy.generate}
      </Button>

      {phase.state === "failed" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-xs leading-relaxed text-danger">
            {phase.message}
          </p>
          <Button variant="ghost" size="sm" onClick={startGeneration}>
            {copy.tryAgain}
          </Button>
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-fg-muted">{providerNote}</p>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={copy.regenerateTitle}
      >
        <p className="text-sm text-fg-secondary">{copy.regenerateBody}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setConfirmOpen(false)}>
            {copy.cancel}
          </Button>
          <Button size="sm" variant="danger" onClick={startGeneration}>
            {copy.regenerateConfirm}
          </Button>
        </div>
      </Dialog>
    </div>
  );
};
