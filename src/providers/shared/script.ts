import type {
  GeneratedScript,
  GeneratedShotList,
  ScriptRequest,
} from "../types";

/**
 * Provider-neutral screenplay logic: the closed vocabularies, the prompt
 * builders, and the defensive normalizers that turn loosely typed model
 * output into valid domain objects. Gemini (schema-constrained) and fal
 * (free-form JSON) both call this, so bad output never crashes the app and
 * the writing instructions stay identical across providers.
 */

type ScriptCharacter = GeneratedScript["characters"][number];
type ScriptScene = GeneratedScript["scenes"][number];
type ShotEntry = GeneratedShotList["shots"][number];

export const CHARACTER_ROLES = [
  "lead",
  "supporting",
  "minor",
] as const satisfies readonly ScriptCharacter["role"][];

export const SCENE_SETTINGS = [
  "interior",
  "exterior",
] as const satisfies readonly ScriptScene["setting"][];

export const SCENE_TIMES = [
  "day",
  "night",
  "dawn",
  "dusk",
] as const satisfies readonly ScriptScene["timeOfDay"][];

export const SHOT_SIZES = [
  "extreme-wide",
  "wide",
  "medium",
  "close-up",
  "extreme-close-up",
  "over-the-shoulder",
  "insert",
] as const satisfies readonly ShotEntry["size"][];

export const SHOT_ANGLES = [
  "eye-level",
  "low",
  "high",
  "overhead",
  "dutch",
] as const satisfies readonly ShotEntry["angle"][];

export const SHOT_MOVEMENTS = [
  "static",
  "push-in",
  "pull-out",
  "pan-left",
  "pan-right",
  "tilt-up",
  "tilt-down",
  "tracking",
  "orbit",
  "handheld",
  "crane-up",
] as const satisfies readonly ShotEntry["movement"][];

const FALLBACK_LOCATION = "Unnamed location";

/* ------------------------------------------------------------------ */
/* Loose JSON readers                                                  */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const normalizeEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (typeof value !== "string") return fallback;
  return allowed.find((candidate) => candidate === value) ?? fallback;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      items.push(entry.trim());
    }
  }
  return items;
};

const clampDuration = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(20, Math.max(1, Math.round(parsed * 10) / 10));
};

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

export const buildScriptPrompt = (request: ScriptRequest): string => {
  const sceneCount = Number.isFinite(request.sceneCount)
    ? Math.min(24, Math.max(1, Math.round(request.sceneCount)))
    : 5;
  const lines = [
    `You are a professional screenwriter hired to write a ${request.format} in the ${request.genre} genre.`,
    "",
    `Title: ${request.title}`,
    `Logline: ${request.logline}`,
  ];
  const synopsis = request.synopsis.trim();
  if (synopsis.length > 0) lines.push(`Working synopsis: ${synopsis}`);
  lines.push(
    "",
    `Write a structured screenplay with exactly ${sceneCount} scenes.`,
    "Stay faithful to the title and logline.",
    "Write concrete, filmable visual action: describe only what a camera can see and hear, no abstractions or inner thoughts.",
    "Scene bodies use screenplay style, alternating action lines and dialogue blocks.",
    "Keep dialogue lines short, two sentences at most, and give each line a clear purpose.",
    "Give every character a distinct physical appearance and consistent wardrobe, written so an artist could paint them from the words alone.",
    "Each scene lists characterNames that exactly match names from the characters list.",
  );
  return lines.join("\n");
};

export const buildShotListPrompt = (input: {
  sceneSummary: string;
  sceneBody: string;
  characterNames: string[];
}): string => {
  const names = input.characterNames.filter((name) => name.trim().length > 0);
  return [
    "You are a film director breaking a scripted scene into a storyboard shot list.",
    "",
    `Scene summary: ${input.sceneSummary}`,
    names.length > 0
      ? `Characters in the scene: ${names.join(", ")}`
      : "No named characters appear in the scene.",
    "Scene text:",
    input.sceneBody,
    "",
    "Break the scene into 4 to 8 shots that tell the scene in order.",
    "Each shot description is one concrete, filmable moment: who or what is in frame, what they do, and the composition the camera sees.",
    "Set dialogue only when a line is spoken during that exact shot, keep it short, otherwise use null.",
    "Vary shot sizes and angles with intent, and pick the movement that supports the action.",
    "durationSeconds is between 2 and 8.",
    "characterNames in each shot must exactly match names from the character list.",
  ].join("\n");
};

/* ------------------------------------------------------------------ */
/* Normalizers                                                         */
/* ------------------------------------------------------------------ */

export const normalizeScript = (parsed: unknown): GeneratedScript | null => {
  if (!isRecord(parsed)) return null;

  const characters: ScriptCharacter[] = [];
  const rawCharacters = parsed["characters"];
  if (Array.isArray(rawCharacters)) {
    for (const entry of rawCharacters) {
      if (!isRecord(entry)) continue;
      const name = asString(entry["name"], "").trim();
      if (name.length === 0) continue;
      characters.push({
        name,
        role: normalizeEnum(entry["role"], CHARACTER_ROLES, "supporting"),
        bio: asString(entry["bio"], "").trim(),
        appearance: asString(entry["appearance"], "").trim(),
        wardrobe: asString(entry["wardrobe"], "").trim(),
      });
    }
  }

  const scenes: ScriptScene[] = [];
  const rawScenes = parsed["scenes"];
  if (Array.isArray(rawScenes)) {
    for (const entry of rawScenes) {
      if (!isRecord(entry)) continue;
      const summary = asString(entry["summary"], "").trim();
      const body = asString(entry["body"], "").trim();
      if (summary.length === 0 && body.length === 0) continue;
      const location = asString(entry["location"], "").trim();
      scenes.push({
        setting: normalizeEnum(entry["setting"], SCENE_SETTINGS, "interior"),
        location: location.length > 0 ? location : FALLBACK_LOCATION,
        timeOfDay: normalizeEnum(entry["timeOfDay"], SCENE_TIMES, "day"),
        summary,
        body,
        characterNames: normalizeStringArray(entry["characterNames"]),
      });
    }
  }

  if (scenes.length === 0) return null;
  return {
    synopsis: asString(parsed["synopsis"], "").trim(),
    characters,
    scenes,
  };
};

export const normalizeShotList = (parsed: unknown): GeneratedShotList | null => {
  if (!isRecord(parsed)) return null;
  const rawShots = parsed["shots"];
  if (!Array.isArray(rawShots)) return null;

  const shots: ShotEntry[] = [];
  for (const entry of rawShots) {
    if (!isRecord(entry)) continue;
    const description = asString(entry["description"], "").trim();
    if (description.length === 0) continue;
    const rawDialogue = entry["dialogue"];
    const dialogue =
      typeof rawDialogue === "string" && rawDialogue.trim().length > 0
        ? rawDialogue.trim()
        : null;
    shots.push({
      description,
      dialogue,
      size: normalizeEnum(entry["size"], SHOT_SIZES, "medium"),
      angle: normalizeEnum(entry["angle"], SHOT_ANGLES, "eye-level"),
      movement: normalizeEnum(entry["movement"], SHOT_MOVEMENTS, "static"),
      durationSeconds: clampDuration(entry["durationSeconds"]),
      characterNames: normalizeStringArray(entry["characterNames"]),
    });
  }

  if (shots.length === 0) return null;
  return { shots };
};
