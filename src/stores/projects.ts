import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_COMIC_STYLE_ID, DEFAULT_STYLE_ID } from "@/domain/constants";
import type {
  AspectRatio,
  AudioTrack,
  Character,
  ComicPage,
  Panel,
  Project,
  ProjectFormat,
  ProjectMode,
  Scene,
  Shot,
} from "@/domain/types";
import {
  createCharacterId,
  createPageId,
  createPanelId,
  createProjectId,
  createSceneId,
  createShotId,
  type AssetId,
  type CharacterId,
  type PageId,
  type PanelId,
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
  pages: Record<PageId, ComicPage>;
  panels: Record<PanelId, Panel>;
  audioTracks: Record<string, AudioTrack>;

  createProject: (input: {
    title: string;
    logline: string;
    mode: ProjectMode;
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
  attachDialogueToShot: (id: ShotId, assetId: AssetId) => void;

  addCharacter: (input: Omit<Character, "id" | "seed" | "portraitAssetId" | "portraitHistory">) => Character;
  updateCharacter: (id: CharacterId, patch: Partial<Omit<Character, "id" | "projectId">>) => void;
  deleteCharacter: (id: CharacterId) => void;
  attachPortraitToCharacter: (id: CharacterId, assetId: AssetId) => void;

  addPage: (input: Omit<ComicPage, "id" | "createdAt" | "updatedAt">) => ComicPage;
  updatePage: (id: PageId, patch: Partial<Omit<ComicPage, "id" | "projectId" | "createdAt">>) => void;
  removePage: (id: PageId) => void;
  /** Reassigns page indexes to match the given order; ids from other projects are ignored. */
  reorderPages: (projectId: ProjectId, orderedIds: readonly PageId[]) => void;

  addPanel: (input: Omit<Panel, "id" | "seed" | "seedLocked" | "imageAssetId" | "imageHistory" | "balloons" | "promptNotes">) => Panel;
  updatePanel: (id: PanelId, patch: Partial<Omit<Panel, "id" | "projectId" | "pageId">>) => void;
  removePanel: (id: PanelId) => void;
  attachImageToPanel: (id: PanelId, assetId: AssetId) => void;

  addAudioTrack: (input: Omit<AudioTrack, "id">) => AudioTrack;
  updateAudioTrack: (id: string, patch: Partial<Omit<AudioTrack, "id" | "projectId">>) => void;
  removeAudioTrack: (id: string) => void;
  attachAssetToAudioTrack: (id: string, assetId: AssetId) => void;
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

/** The persisted slices, pre-migration; older snapshots miss the comic fields. */
type PersistedProjectsState = Partial<
  Pick<
    ProjectsState,
    "projects" | "scenes" | "shots" | "characters" | "pages" | "panels" | "audioTracks"
  >
>;

/**
 * Version 0 snapshots predate the comic engine: projects have no mode and the
 * pages, panels, and audio track slices do not exist. Every legacy project is
 * a film project; the new slices start empty.
 */
const migratePersistedProjects = (persisted: unknown): PersistedProjectsState => {
  const state = (persisted ?? {}) as PersistedProjectsState;
  const legacyProjects = (state.projects ?? {}) as Record<
    ProjectId,
    Omit<Project, "mode"> & { mode?: Project["mode"] }
  >;
  const projects = Object.fromEntries(
    Object.entries(legacyProjects).map(([id, project]) => [
      id,
      { ...project, mode: project.mode ?? "film" },
    ]),
  ) as Record<ProjectId, Project>;
  return {
    ...state,
    projects,
    pages: state.pages ?? {},
    panels: state.panels ?? {},
    audioTracks: state.audioTracks ?? {},
  };
};

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: {},
      scenes: {},
      shots: {},
      characters: {},
      pages: {},
      panels: {},
      audioTracks: {},

      createProject: (input) => {
        const comic = input.mode === "comic";
        const project: Project = {
          id: createProjectId(),
          title: input.title,
          logline: input.logline,
          synopsis: "",
          mode: input.mode,
          format: input.format,
          genre: input.genre,
          styleId: input.styleId || DEFAULT_STYLE_ID,
          aspectRatio: input.aspectRatio,
          coverAssetId: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          ...(comic
            ? { comicStyleId: DEFAULT_COMIC_STYLE_ID, readingDirection: "ltr" as const }
            : {}),
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
          const pages = Object.fromEntries(
            Object.entries(state.pages).filter(
              ([, page]) => page.projectId !== id,
            ),
          );
          const panels = Object.fromEntries(
            Object.entries(state.panels).filter(
              ([, panel]) => panel.projectId !== id,
            ),
          );
          const audioTracks = Object.fromEntries(
            Object.entries(state.audioTracks).filter(
              ([, track]) => track.projectId !== id,
            ),
          );
          return { projects, scenes, shots, characters, pages, panels, audioTracks };
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

      attachDialogueToShot: (id, assetId) => {
        set((state) => {
          const existing = state.shots[id];
          if (!existing) return state;
          return {
            shots: {
              ...state.shots,
              [id]: { ...existing, dialogueAssetId: assetId },
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
          const panels = Object.fromEntries(
            Object.entries(state.panels).map(([panelId, panel]) => {
              const inCast = panel.characterIds.includes(id);
              const speaks = panel.balloons.some(
                (balloon) => balloon.characterId === id,
              );
              if (!inCast && !speaks) return [panelId, panel];
              return [
                panelId,
                {
                  ...panel,
                  characterIds: panel.characterIds.filter(
                    (candidate) => candidate !== id,
                  ),
                  balloons: panel.balloons.map((balloon) =>
                    balloon.characterId === id
                      ? { ...balloon, characterId: undefined }
                      : balloon,
                  ),
                },
              ];
            }),
          );
          return {
            characters,
            scenes,
            shots,
            panels,
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

      addPage: (input) => {
        const page: ComicPage = {
          ...input,
          id: createPageId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set((state) => ({
          pages: { ...state.pages, [page.id]: page },
          projects: touchProject(state.projects, page.projectId),
        }));
        return page;
      },

      updatePage: (id, patch) => {
        set((state) => {
          const existing = state.pages[id];
          if (!existing) return state;
          return {
            pages: {
              ...state.pages,
              [id]: { ...existing, ...patch, updatedAt: nowIso() },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      removePage: (id) => {
        set((state) => {
          const existing = state.pages[id];
          if (!existing) return state;
          const pages = { ...state.pages };
          delete pages[id];
          const panels = Object.fromEntries(
            Object.entries(state.panels).filter(
              ([, panel]) => panel.pageId !== id,
            ),
          );
          return {
            pages,
            panels,
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      reorderPages: (projectId, orderedIds) => {
        set((state) => {
          const pages = { ...state.pages };
          orderedIds.forEach((id, position) => {
            const page = pages[id];
            if (!page || page.projectId !== projectId) return;
            if (page.index === position) return;
            pages[id] = { ...page, index: position, updatedAt: nowIso() };
          });
          return {
            pages,
            projects: touchProject(state.projects, projectId),
          };
        });
      },

      addPanel: (input) => {
        const panel: Panel = {
          ...input,
          id: createPanelId(),
          promptNotes: "",
          seed: randomSeed(),
          seedLocked: false,
          imageHistory: [],
          balloons: [],
        };
        set((state) => ({
          panels: { ...state.panels, [panel.id]: panel },
          projects: touchProject(state.projects, panel.projectId),
        }));
        return panel;
      },

      updatePanel: (id, patch) => {
        set((state) => {
          const existing = state.panels[id];
          if (!existing) return state;
          return {
            panels: { ...state.panels, [id]: { ...existing, ...patch } },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      removePanel: (id) => {
        set((state) => {
          const existing = state.panels[id];
          if (!existing) return state;
          const panels = { ...state.panels };
          delete panels[id];
          return {
            panels,
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      attachImageToPanel: (id, assetId) => {
        set((state) => {
          const existing = state.panels[id];
          if (!existing) return state;
          return {
            panels: {
              ...state.panels,
              [id]: {
                ...existing,
                imageAssetId: assetId,
                imageHistory: [
                  assetId,
                  ...existing.imageHistory.filter((entry) => entry !== assetId),
                ].slice(0, 24),
              },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      addAudioTrack: (input) => {
        const track: AudioTrack = { ...input, id: crypto.randomUUID() };
        set((state) => ({
          audioTracks: { ...state.audioTracks, [track.id]: track },
          projects: touchProject(state.projects, track.projectId),
        }));
        return track;
      },

      updateAudioTrack: (id, patch) => {
        set((state) => {
          const existing = state.audioTracks[id];
          if (!existing) return state;
          return {
            audioTracks: {
              ...state.audioTracks,
              [id]: { ...existing, ...patch },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      removeAudioTrack: (id) => {
        set((state) => {
          const existing = state.audioTracks[id];
          if (!existing) return state;
          const audioTracks = { ...state.audioTracks };
          delete audioTracks[id];
          return {
            audioTracks,
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },

      attachAssetToAudioTrack: (id, assetId) => {
        set((state) => {
          const existing = state.audioTracks[id];
          if (!existing) return state;
          return {
            audioTracks: {
              ...state.audioTracks,
              [id]: { ...existing, assetId },
            },
            projects: touchProject(state.projects, existing.projectId),
          };
        });
      },
    }),
    {
      name: "vixio-projects",
      version: 1,
      migrate: (persisted) => migratePersistedProjects(persisted) as ProjectsState,
    },
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

export const selectPagesForProject = (
  pages: Record<PageId, ComicPage>,
  projectId: ProjectId,
): ComicPage[] =>
  Object.values(pages)
    .filter((page) => page.projectId === projectId)
    .sort((a, b) => a.index - b.index);

export const selectPanelsForPage = (
  panels: Record<PanelId, Panel>,
  pageId: PageId,
): Panel[] =>
  Object.values(panels)
    .filter((panel) => panel.pageId === pageId)
    .sort((a, b) => a.index - b.index);

export const selectPanelsForProject = (
  panels: Record<PanelId, Panel>,
  pages: Record<PageId, ComicPage>,
  projectId: ProjectId,
): Panel[] => {
  const pageOrder = new Map(
    selectPagesForProject(pages, projectId).map((page, position) => [
      page.id,
      position,
    ]),
  );
  return Object.values(panels)
    .filter((panel) => panel.projectId === projectId)
    .sort(
      (a, b) =>
        (pageOrder.get(a.pageId) ?? 0) - (pageOrder.get(b.pageId) ?? 0) ||
        a.index - b.index,
    );
};

export const selectAudioTracksForProject = (
  audioTracks: Record<string, AudioTrack>,
  projectId: ProjectId,
): AudioTrack[] =>
  Object.values(audioTracks)
    .filter((track) => track.projectId === projectId)
    .sort((a, b) =>
      a.lane === b.lane
        ? a.id.localeCompare(b.id)
        : a.lane === "music"
          ? -1
          : 1,
    );
