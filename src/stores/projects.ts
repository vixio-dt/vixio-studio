import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_STYLE_ID } from "@/domain/constants";
import type {
  AspectRatio,
  Character,
  Project,
  ProjectFormat,
  Scene,
  Shot,
} from "@/domain/types";
import {
  createCharacterId,
  createProjectId,
  createSceneId,
  createShotId,
  type AssetId,
  type CharacterId,
  type ProjectId,
  type SceneId,
  type ShotId,
} from "@/lib/id";
import { randomSeed } from "@/lib/random";
import { nowIso } from "@/lib/time";

type ProjectsState = {
  projects: Record<ProjectId, Project>;
  scenes: Record<SceneId, Scene>;
  shots: Record<ShotId, Shot>;
  characters: Record<CharacterId, Character>;

  createProject: (input: {
    title: string;
    logline: string;
    format: ProjectFormat;
    genre: string;
    styleId: string;
    aspectRatio: AspectRatio;
  }) => Project;
  updateProject: (id: ProjectId, patch: Partial<Omit<Project, "id">>) => void;
  deleteProject: (id: ProjectId) => void;

  addScene: (input: Omit<Scene, "id">) => Scene;
  updateScene: (id: SceneId, patch: Partial<Omit<Scene, "id" | "projectId">>) => void;
  deleteScene: (id: SceneId) => void;
  replaceScenes: (projectId: ProjectId, scenes: Omit<Scene, "id">[]) => Scene[];

  addShot: (input: Omit<Shot, "id" | "seed" | "seedLocked" | "frameAssetId" | "videoAssetId" | "frameHistory" | "promptNotes">) => Shot;
  updateShot: (id: ShotId, patch: Partial<Omit<Shot, "id" | "projectId" | "sceneId">>) => void;
  deleteShot: (id: ShotId) => void;
  attachFrameToShot: (id: ShotId, assetId: AssetId) => void;
  attachVideoToShot: (id: ShotId, assetId: AssetId) => void;

  addCharacter: (input: Omit<Character, "id" | "seed" | "portraitAssetId" | "portraitHistory">) => Character;
  updateCharacter: (id: CharacterId, patch: Partial<Omit<Character, "id" | "projectId">>) => void;
  deleteCharacter: (id: CharacterId) => void;
  attachPortraitToCharacter: (id: CharacterId, assetId: AssetId) => void;
};

const touchProject = (
  projects: Record<ProjectId, Project>,
  projectId: ProjectId,
): Record<ProjectId, Project> => {
  const project = projects[projectId];
  if (!project) return projects;
  return {
    ...projects,
    [projectId]: { ...project, updatedAt: nowIso() },
  };
};

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: {},
      scenes: {},
      shots: {},
      characters: {},

      createProject: (input) => {
        const project: Project = {
          id: createProjectId(),
          title: input.title,
          logline: input.logline,
          synopsis: "",
          format: input.format,
          genre: input.genre,
          styleId: input.styleId || DEFAULT_STYLE_ID,
          aspectRatio: input.aspectRatio,
          coverAssetId: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set((state) => ({
          projects: { ...state.projects, [project.id]: project },
        }));
        return project;
      },

      updateProject: (id, patch) => {
        set((state) => {
          const existing = state.projects[id];
          if (!existing) return state;
          return {
            projects: {
              ...state.projects,
              [id]: { ...existing, ...patch, updatedAt: nowIso() },
            },
          };
        });
      },

      deleteProject: (id) => {
        set((state) => {
          const projects = { ...state.projects };
          delete projects[id];
          const scenes = Object.fromEntries(
            Object.entries(state.scenes).filter(
              ([, scene]) => scene.projectId !== id,
            ),
          );
          const shots = Object.fromEntries(
            Object.entries(state.shots).filter(
              ([, shot]) => shot.projectId !== id,
            ),
          );
          const characters = Object.fromEntries(
            Object.entries(state.characters).filter(
              ([, character]) => character.projectId !== id,
            ),
          );
          return { projects, scenes, shots, characters };
        });
      },

      addScene: (input) => {
        const scene: Scene = { ...input, id: createSceneId() };
        set((state) => ({
          scenes: { ...state.scenes, [scene.id]: scene },
          projects: touchProject(state.projects, scene.projectId),
        }));
        return scene;
      },

      updateScene: (id, patch) => {
        set((state) => {
          const existing = state.scenes[id];
          if (!existing) return state;
          return {
            scenes: { ...state.scenes, [id]: { ...existing, ...patch } },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      deleteScene: (id) => {
        set((state) => {
          const existing = state.scenes[id];
          if (!existing) return state;
          const scenes = { ...state.scenes };
          delete scenes[id];
          const shots = Object.fromEntries(
            Object.entries(state.shots).filter(
              ([, shot]) => shot.sceneId !== id,
            ),
          );
          return {
            scenes,
            shots,
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      replaceScenes: (projectId, sceneInputs) => {
        const created = sceneInputs.map(
          (input): Scene => ({ ...input, id: createSceneId() }),
        );
        set((state) => {
          const scenes = Object.fromEntries(
            Object.entries(state.scenes).filter(
              ([, scene]) => scene.projectId !== projectId,
            ),
          );
          const shots = Object.fromEntries(
            Object.entries(state.shots).filter(
              ([, shot]) => shot.projectId !== projectId,
            ),
          );
          for (const scene of created) scenes[scene.id] = scene;
          return {
            scenes,
            shots,
            projects: touchProject(state.projects, projectId),
          };
        });
        return created;
      },

      addShot: (input) => {
        const shot: Shot = {
          ...input,
          id: createShotId(),
          promptNotes: "",
          seed: randomSeed(),
          seedLocked: false,
          frameAssetId: null,
          videoAssetId: null,
          frameHistory: [],
        };
        set((state) => ({
          shots: { ...state.shots, [shot.id]: shot },
          projects: touchProject(state.projects, shot.projectId),
        }));
        return shot;
      },

      updateShot: (id, patch) => {
        set((state) => {
          const existing = state.shots[id];
          if (!existing) return state;
          return {
            shots: { ...state.shots, [id]: { ...existing, ...patch } },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      deleteShot: (id) => {
        set((state) => {
          const existing = state.shots[id];
          if (!existing) return state;
          const shots = { ...state.shots };
          delete shots[id];
          return {
            shots,
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      attachFrameToShot: (id, assetId) => {
        set((state) => {
          const existing = state.shots[id];
          if (!existing) return state;
          return {
            shots: {
              ...state.shots,
              [id]: {
                ...existing,
                frameAssetId: assetId,
                frameHistory: [
                  assetId,
                  ...existing.frameHistory.filter((entry) => entry !== assetId),
                ].slice(0, 24),
              },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      attachVideoToShot: (id, assetId) => {
        set((state) => {
          const existing = state.shots[id];
          if (!existing) return state;
          return {
            shots: {
              ...state.shots,
              [id]: { ...existing, videoAssetId: assetId },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      addCharacter: (input) => {
        const character: Character = {
          ...input,
          id: createCharacterId(),
          seed: randomSeed(),
          portraitAssetId: null,
          portraitHistory: [],
        };
        set((state) => ({
          characters: { ...state.characters, [character.id]: character },
          projects: touchProject(state.projects, character.projectId),
        }));
        return character;
      },

      updateCharacter: (id, patch) => {
        set((state) => {
          const existing = state.characters[id];
          if (!existing) return state;
          return {
            characters: {
              ...state.characters,
              [id]: { ...existing, ...patch },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      deleteCharacter: (id) => {
        set((state) => {
          const existing = state.characters[id];
          if (!existing) return state;
          const characters = { ...state.characters };
          delete characters[id];
          // Drop dangling references from scenes and shots.
          const scenes = Object.fromEntries(
            Object.entries(state.scenes).map(([sceneId, scene]) => [
              sceneId,
              scene.characterIds.includes(id)
                ? {
                    ...scene,
                    characterIds: scene.characterIds.filter(
                      (candidate) => candidate !== id,
                    ),
                  }
                : scene,
            ]),
          );
          const shots = Object.fromEntries(
            Object.entries(state.shots).map(([shotId, shot]) => [
              shotId,
              shot.characterIds.includes(id)
                ? {
                    ...shot,
                    characterIds: shot.characterIds.filter(
                      (candidate) => candidate !== id,
                    ),
                  }
                : shot,
            ]),
          );
          return {
            characters,
            scenes,
            shots,
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      attachPortraitToCharacter: (id, assetId) => {
        set((state) => {
          const existing = state.characters[id];
          if (!existing) return state;
          return {
            characters: {
              ...state.characters,
              [id]: {
                ...existing,
                portraitAssetId: assetId,
                portraitHistory: [
                  assetId,
                  ...existing.portraitHistory.filter(
                    (entry) => entry !== assetId,
                  ),
                ].slice(0, 12),
              },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },
    }),
    { name: "vixio-projects" },
  ),
);

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export const selectScenesForProject = (
  scenes: Record<SceneId, Scene>,
  projectId: ProjectId,
): Scene[] =>
  Object.values(scenes)
    .filter((scene) => scene.projectId === projectId)
    .sort((a, b) => a.index - b.index);

export const selectShotsForScene = (
  shots: Record<ShotId, Shot>,
  sceneId: SceneId,
): Shot[] =>
  Object.values(shots)
    .filter((shot) => shot.sceneId === sceneId)
    .sort((a, b) => a.index - b.index);

export const selectShotsForProject = (
  shots: Record<ShotId, Shot>,
  scenes: Record<SceneId, Scene>,
  projectId: ProjectId,
): Shot[] => {
  const sceneOrder = new Map(
    selectScenesForProject(scenes, projectId).map((scene, position) => [
      scene.id,
      position,
    ]),
  );
  return Object.values(shots)
    .filter((shot) => shot.projectId === projectId)
    .sort(
      (a, b) =>
        (sceneOrder.get(a.sceneId) ?? 0) - (sceneOrder.get(b.sceneId) ?? 0) ||
        a.index - b.index,
    );
};

export const selectCharactersForProject = (
  characters: Record<CharacterId, Character>,
  projectId: ProjectId,
): Character[] =>
  Object.values(characters)
    .filter((character) => character.projectId === projectId)
    .sort((a, b) => a.name.localeCompare(b.name));
