import type {
  Character,
  CharacterRole,
  LightingChoice,
  Scene,
  SceneTimeOfDay,
} from "@/domain/types";
import type { CharacterId, ProjectId } from "@/lib/id";
import type { GeneratedScript } from "@/providers/types";
import type { ProviderChoice } from "@/stores/settings";

import { scriptCopy } from "./copy";

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Screenplay slug rendered from scene fields: "INT. LIGHTHOUSE KITCHEN, NIGHT". */
export const slugLineForScene = (scene: Scene): string => {
  const prefix = scene.setting === "interior" ? "INT." : "EXT.";
  const location =
    scene.location.trim().length > 0
      ? scene.location.trim()
      : scriptCopy.scene.untitledLocation;
  return `${prefix} ${location.toUpperCase()}, ${scene.timeOfDay.toUpperCase()}`;
};

/* ------------------------------------------------------------------ */
/* Generation defaults                                                 */
/* ------------------------------------------------------------------ */

export const SCENE_COUNT_CHOICES: readonly number[] = [
  3, 4, 5, 6, 7, 8, 9, 10,
];

export const DEFAULT_SCENE_COUNT = 5;

/** Lighting for freshly broken-down shots follows the scene's time of day. */
const LIGHTING_BY_TIME: Record<SceneTimeOfDay, LightingChoice> = {
  day: "natural",
  night: "low-key",
  dawn: "golden-hour",
  dusk: "blue-hour",
};

export const lightingForSceneTime = (
  timeOfDay: SceneTimeOfDay,
): LightingChoice => LIGHTING_BY_TIME[timeOfDay];

/** Keeps provider-suggested durations inside the range the cut can use. */
export const clampShotDuration = (seconds: number): number => {
  if (!Number.isFinite(seconds)) return 5;
  return Math.min(30, Math.max(1, Math.round(seconds)));
};

/** Blank or whitespace dialogue becomes a silent shot. */
export const normalizeDialogue = (dialogue: string | null): string | null => {
  if (dialogue === null) return null;
  const trimmed = dialogue.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/* ------------------------------------------------------------------ */
/* Character name resolution                                           */
/* ------------------------------------------------------------------ */

const normalizeName = (name: string): string => name.trim().toLowerCase();

/** Case-insensitive lookup from character name to id. */
export const characterIdsByName = (
  characters: readonly Character[],
): Map<string, CharacterId> => {
  const byName = new Map<string, CharacterId>();
  for (const character of characters) {
    const key = normalizeName(character.name);
    if (key.length === 0) continue;
    if (!byName.has(key)) byName.set(key, character.id);
  }
  return byName;
};

/** Resolves provider character names to known ids, dropping unknowns. */
export const resolveCharacterIds = (
  names: readonly string[],
  byName: ReadonlyMap<string, CharacterId>,
): CharacterId[] => {
  const ids: CharacterId[] = [];
  for (const name of names) {
    const id = byName.get(normalizeName(name));
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
};

/**
 * Merges generated characters into the cast by case-insensitive name match:
 * existing characters stay untouched, missing ones are created. Returns the
 * full name-to-id map for scene wiring.
 */
export const upsertCharactersByName = (input: {
  projectId: ProjectId;
  existing: readonly Character[];
  incoming: GeneratedScript["characters"];
  addCharacter: (character: {
    projectId: ProjectId;
    name: string;
    role: CharacterRole;
    bio: string;
    appearance: string;
    wardrobe: string;
  }) => Character;
}): Map<string, CharacterId> => {
  const byName = characterIdsByName(input.existing);
  for (const candidate of input.incoming) {
    const key = normalizeName(candidate.name);
    if (key.length === 0) continue;
    if (byName.has(key)) continue;
    const created = input.addCharacter({
      projectId: input.projectId,
      name: candidate.name.trim(),
      role: candidate.role,
      bio: candidate.bio,
      appearance: candidate.appearance,
      wardrobe: candidate.wardrobe,
    });
    byName.set(key, created.id);
  }
  return byName;
};

/** Generated scenes mapped to store inputs; index comes from array order. */
export const mapGeneratedScenes = (
  projectId: ProjectId,
  generated: GeneratedScript["scenes"],
  byName: ReadonlyMap<string, CharacterId>,
): Omit<Scene, "id">[] =>
  generated.map((scene, order) => ({
    projectId,
    index: order,
    setting: scene.setting,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    summary: scene.summary,
    body: scene.body,
    characterIds: resolveCharacterIds(scene.characterNames, byName),
  }));

/* ------------------------------------------------------------------ */
/* Provider note                                                       */
/* ------------------------------------------------------------------ */

/** True when text generation will actually hit Gemini, not the preview writer. */
export const willUseGemini = (
  textProvider: ProviderChoice,
  geminiApiKey: string,
): boolean => textProvider === "gemini" && geminiApiKey.trim().length > 0;
