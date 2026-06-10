import { useCallback, useState } from "react";

import type { Project } from "@/domain/types";
import { messageFromUnknown } from "@/lib/result";
import { resolveTextProvider } from "@/providers/registry";
import {
  selectCharactersForProject,
  useProjectsStore,
} from "@/stores/projects";

import { mapGeneratedScenes, upsertCharactersByName } from "./scriptLogic";

export type GenerationPhase =
  | { state: "idle" }
  | { state: "running" }
  | { state: "failed"; message: string };

export type GenerateScriptInput = {
  logline: string;
  synopsis: string;
  sceneCount: number;
};

/**
 * Runs full script generation: provider call, character upsert by name,
 * scene replacement, and synopsis write-back. The phase union drives the
 * busy button, the inline error, and the skeleton scene cards.
 */
export const useGenerateScript = (
  project: Project,
): {
  phase: GenerationPhase;
  generate: (input: GenerateScriptInput) => Promise<void>;
} => {
  const [phase, setPhase] = useState<GenerationPhase>({ state: "idle" });
  const { id: projectId, title, format, genre } = project;

  const generate = useCallback(
    async (input: GenerateScriptInput) => {
      setPhase({ state: "running" });
      try {
        const provider = resolveTextProvider();
        const result = await provider.generateScript({
          title,
          logline: input.logline,
          synopsis: input.synopsis,
          format,
          genre,
          sceneCount: input.sceneCount,
        });
        if (!result.ok) {
          setPhase({ state: "failed", message: result.error.message });
          return;
        }

        const store = useProjectsStore.getState();
        const byName = upsertCharactersByName({
          projectId,
          existing: selectCharactersForProject(store.characters, projectId),
          incoming: result.value.characters,
          addCharacter: store.addCharacter,
        });
        store.replaceScenes(
          projectId,
          mapGeneratedScenes(projectId, result.value.scenes, byName),
        );
        store.updateProject(projectId, { synopsis: result.value.synopsis });
        setPhase({ state: "idle" });
      } catch (cause) {
        setPhase({ state: "failed", message: messageFromUnknown(cause) });
      }
    },
    [projectId, title, format, genre],
  );

  return { phase, generate };
};
