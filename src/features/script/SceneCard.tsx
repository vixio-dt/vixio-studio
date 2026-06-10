import { Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, Dialog, Segmented, Select, TextArea, TextInput } from "@/components/ui";
import { TIMES_OF_DAY } from "@/domain/constants";
import type {
  Character,
  Project,
  Scene,
  SceneInteriorExterior,
  SceneTimeOfDay,
} from "@/domain/types";
import type { CharacterId } from "@/lib/id";
import { messageFromUnknown } from "@/lib/result";
import { resolveTextProvider } from "@/providers/registry";
import { selectShotsForScene, useProjectsStore } from "@/stores/projects";

import { scriptCopy } from "./copy";
import {
  characterIdsByName,
  clampShotDuration,
  lightingForSceneTime,
  normalizeDialogue,
  resolveCharacterIds,
  slugLineForScene,
} from "./scriptLogic";

type SceneCardProps = {
  project: Project;
  scene: Scene;
  /** 1-based position in the script order. */
  sceneNumber: number;
  projectCharacters: readonly Character[];
};

type ShotsPhase =
  | { state: "idle" }
  | { state: "running" }
  | { state: "failed"; message: string };

const copy = scriptCopy.scene;

const SETTING_OPTIONS: readonly {
  value: SceneInteriorExterior;
  label: string;
}[] = [
  { value: "interior", label: copy.interior },
  { value: "exterior", label: copy.exterior },
];

/** One scene of the script: slug controls, body editor, cast, and breakdown. */
export const SceneCard = ({
  project,
  scene,
  sceneNumber,
  projectCharacters,
}: SceneCardProps) => {
  const navigate = useNavigate();
  const shotsById = useProjectsStore((state) => state.shots);
  const updateScene = useProjectsStore((state) => state.updateScene);
  const deleteScene = useProjectsStore((state) => state.deleteScene);

  const [body, setBody] = useState(scene.body);
  const [phase, setPhase] = useState<ShotsPhase>({ state: "idle" });
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Regeneration and external edits replace the scene record; reset the body
  // draft when the store value moves (render-time adjustment, no effect).
  const [seenBody, setSeenBody] = useState(scene.body);
  if (scene.body !== seenBody) {
    setSeenBody(scene.body);
    setBody(scene.body);
  }

  const sceneShots = useMemo(
    () => selectShotsForScene(shotsById, scene.id),
    [shotsById, scene.id],
  );
  const shotCount = sceneShots.length;

  const commitBody = () => {
    if (body !== scene.body) updateScene(scene.id, { body });
  };

  const toggleCharacter = (characterId: CharacterId) => {
    const next = scene.characterIds.includes(characterId)
      ? scene.characterIds.filter((id) => id !== characterId)
      : [...scene.characterIds, characterId];
    updateScene(scene.id, { characterIds: next });
  };

  const runBreakdown = async () => {
    setReplaceOpen(false);
    setPhase({ state: "running" });
    try {
      const sceneCharacterNames = projectCharacters
        .filter((character) => scene.characterIds.includes(character.id))
        .map((character) => character.name);
      const provider = resolveTextProvider();
      const result = await provider.generateShotList({
        sceneSummary: scene.summary,
        sceneBody: scene.body,
        characterNames: sceneCharacterNames,
      });
      if (!result.ok) {
        setPhase({ state: "failed", message: result.error.message });
        return;
      }

      const store = useProjectsStore.getState();
      for (const existing of selectShotsForScene(store.shots, scene.id)) {
        store.deleteShot(existing.id);
      }
      const byName = characterIdsByName(projectCharacters);
      result.value.shots.forEach((shot, position) => {
        store.addShot({
          sceneId: scene.id,
          projectId: project.id,
          index: position,
          description: shot.description,
          dialogue: normalizeDialogue(shot.dialogue),
          size: shot.size,
          angle: shot.angle,
          movement: shot.movement,
          lens: "35mm",
          lighting: lightingForSceneTime(scene.timeOfDay),
          durationSeconds: clampShotDuration(shot.durationSeconds),
          characterIds: resolveCharacterIds(shot.characterNames, byName),
        });
      });
      setPhase({ state: "idle" });
    } catch (cause) {
      setPhase({ state: "failed", message: messageFromUnknown(cause) });
    }
  };

  const handleBreakClick = () => {
    if (shotCount > 0) {
      setReplaceOpen(true);
      return;
    }
    void runBreakdown();
  };

  const handleDelete = () => {
    setDeleteOpen(false);
    deleteScene(scene.id);
  };

  const running = phase.state === "running";
  const slug = slugLineForScene(scene);

  return (
    <article
      aria-label={slug}
      className="flex flex-col gap-3 border border-line bg-ink-panel p-4"
    >
      <p className="font-mono text-xs text-fg-muted">
        {sceneNumber}. {slug}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          ariaLabel={copy.settingAria}
          options={SETTING_OPTIONS}
          value={scene.setting}
          onChange={(setting) => updateScene(scene.id, { setting })}
        />
        <TextInput
          aria-label={copy.locationAria}
          placeholder={copy.locationPlaceholder}
          className="min-w-40 flex-1"
          value={scene.location}
          onChange={(event) =>
            updateScene(scene.id, { location: event.target.value })
          }
        />
        <Select
          aria-label={copy.timeAria}
          className="w-28"
          value={scene.timeOfDay}
          onChange={(event) =>
            updateScene(scene.id, {
              timeOfDay: event.target.value as SceneTimeOfDay,
            })
          }
        >
          {TIMES_OF_DAY.map((time) => (
            <option key={time.value} value={time.value}>
              {time.label}
            </option>
          ))}
        </Select>
      </div>

      <TextInput
        aria-label={copy.summaryAria}
        placeholder={copy.summaryPlaceholder}
        value={scene.summary}
        onChange={(event) =>
          updateScene(scene.id, { summary: event.target.value })
        }
      />

      <TextArea
        aria-label={copy.bodyAria}
        placeholder={copy.bodyPlaceholder}
        className="min-h-40 font-mono text-[13px] leading-relaxed"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onBlur={commitBody}
      />

      {projectCharacters.length === 0 ? (
        <p className="text-xs text-fg-muted">{copy.noCharacters}</p>
      ) : (
        <div
          role="group"
          aria-label={copy.charactersAria}
          className="flex flex-wrap gap-1.5"
        >
          {projectCharacters.map((character) => {
            const included = scene.characterIds.includes(character.id);
            return (
              <button
                key={character.id}
                type="button"
                aria-pressed={included}
                onClick={() => toggleCharacter(character.id)}
                className={`inline-flex h-6 items-center border px-2 text-xs transition-colors duration-150 ${
                  included
                    ? "border-accent text-accent"
                    : "border-line text-fg-muted hover:border-line-strong hover:text-fg-secondary"
                }`}
              >
                {character.name.trim().length > 0
                  ? character.name
                  : copy.unnamed}
              </button>
            );
          })}
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-fg-muted">
            {shotCount} {shotCount === 1 ? copy.shotCountOne : copy.shotCountMany}
          </span>
          {shotCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("../storyboard")}
            >
              {copy.openBoard}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            busy={running}
            onClick={handleBreakClick}
          >
            {copy.breakIntoShots}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={copy.deleteScene}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash size={14} aria-hidden />
          </Button>
        </div>
      </footer>

      {phase.state === "failed" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs leading-relaxed text-danger">
            {phase.message}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void runBreakdown()}>
            {copy.tryAgain}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        title={copy.replaceShotsTitle}
      >
        <p className="text-sm text-fg-secondary">
          {copy.replaceShotsBody(shotCount)}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setReplaceOpen(false)}>
            {copy.cancel}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void runBreakdown()}>
            {copy.replaceShotsConfirm}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={copy.deleteTitle}
      >
        <p className="text-sm text-fg-secondary">
          {copy.deleteBody(
            scene.location.trim().length > 0
              ? scene.location
              : copy.untitledLocation,
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeleteOpen(false)}>
            {copy.cancel}
          </Button>
          <Button size="sm" variant="danger" onClick={handleDelete}>
            {copy.deleteConfirm}
          </Button>
        </div>
      </Dialog>
    </article>
  );
};
