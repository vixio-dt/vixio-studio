import { appError, err, messageFromUnknown, ok } from "@/lib/result";

import type {
  GeneratedScript,
  GeneratedShotList,
  ScriptRequest,
  TextProvider,
} from "../types";
import { geminiCopy } from "./copy";
import {
  asString,
  extractTextFromCandidates,
  geminiRequest,
  isRecord,
  missingKeyError,
  readGeminiSettings,
} from "./shared";

/**
 * Structured screenplay generation over Gemini generateContent with a JSON
 * response schema. The model is constrained by the schema, then every field
 * is re-checked and clamped on the way in so bad output never crashes the app.
 */

/* ------------------------------------------------------------------ */
/* Closed vocabularies (mirror the unions in providers/types.ts)       */
/* ------------------------------------------------------------------ */

type ScriptCharacter = GeneratedScript["characters"][number];
type ScriptScene = GeneratedScript["scenes"][number];
type ShotEntry = GeneratedShotList["shots"][number];

const CHARACTER_ROLES = [
  "lead",
  "supporting",
  "minor",
] as const satisfies readonly ScriptCharacter["role"][];

const SCENE_SETTINGS = [
  "interior",
  "exterior",
] as const satisfies readonly ScriptScene["setting"][];

const TIMES_OF_DAY = [
  "day",
  "night",
  "dawn",
  "dusk",
] as const satisfies readonly ScriptScene["timeOfDay"][];

const SHOT_SIZES = [
  "extreme-wide",
  "wide",
  "medium",
  "close-up",
  "extreme-close-up",
  "over-the-shoulder",
  "insert",
] as const satisfies readonly ShotEntry["size"][];

const SHOT_ANGLES = [
  "eye-level",
  "low",
  "high",
  "overhead",
  "dutch",
] as const satisfies readonly ShotEntry["angle"][];

const SHOT_MOVEMENTS = [
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

/* ------------------------------------------------------------------ */
/* Gemini response schemas                                             */
/* ------------------------------------------------------------------ */

const scriptResponseSchema = {
  type: "OBJECT",
  properties: {
    synopsis: {
      type: "STRING",
      description: "Two or three sentence synopsis of the whole piece",
    },
    characters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          role: { type: "STRING", enum: [...CHARACTER_ROLES] },
          bio: { type: "STRING", description: "Who they are in the story" },
          appearance: {
            type: "STRING",
            description:
              "Physical description concrete enough to paint: age, build, face, hair",
          },
          wardrobe: {
            type: "STRING",
            description: "Clothing and props kept consistent across scenes",
          },
        },
        required: ["name", "role", "bio", "appearance", "wardrobe"],
      },
    },
    scenes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          setting: { type: "STRING", enum: [...SCENE_SETTINGS] },
          location: { type: "STRING", description: "Slug line place name" },
          timeOfDay: { type: "STRING", enum: [...TIMES_OF_DAY] },
          summary: { type: "STRING", description: "One sentence scene summary" },
          body: {
            type: "STRING",
            description: "Full scene in screenplay style, action and dialogue",
          },
          characterNames: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: [
          "setting",
          "location",
          "timeOfDay",
          "summary",
          "body",
          "characterNames",
        ],
      },
    },
  },
  required: ["synopsis", "characters", "scenes"],
};

const shotListResponseSchema = {
  type: "OBJECT",
  properties: {
    shots: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          description: {
            type: "STRING",
            description: "One filmable moment, written as direction",
          },
          dialogue: { type: "STRING", nullable: true },
          size: { type: "STRING", enum: [...SHOT_SIZES] },
          angle: { type: "STRING", enum: [...SHOT_ANGLES] },
          movement: { type: "STRING", enum: [...SHOT_MOVEMENTS] },
          durationSeconds: { type: "NUMBER" },
          characterNames: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: [
          "description",
          "dialogue",
          "size",
          "angle",
          "movement",
          "durationSeconds",
          "characterNames",
        ],
      },
    },
  },
  required: ["shots"],
};

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const buildScriptPrompt = (request: ScriptRequest): string => {
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

const buildShotListPrompt = (input: {
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
/* Defensive normalization                                             */
/* ------------------------------------------------------------------ */

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

const normalizeScript = (parsed: unknown): GeneratedScript | null => {
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
        location: location.length > 0 ? location : geminiCopy.fallbackLocation,
        timeOfDay: normalizeEnum(entry["timeOfDay"], TIMES_OF_DAY, "day"),
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

const normalizeShotList = (parsed: unknown): GeneratedShotList | null => {
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

/* ------------------------------------------------------------------ */
/* Shared call path                                                    */
/* ------------------------------------------------------------------ */

const generateStructured = async <T>(input: {
  prompt: string;
  responseSchema: unknown;
  normalize: (parsed: unknown) => T | null;
  emptyMessage: string;
  invalidMessage: string;
}) => {
  const settings = readGeminiSettings();
  if (settings.apiKey.length === 0) return err(missingKeyError());

  const response = await geminiRequest(
    `/models/${settings.textModel}:generateContent`,
    settings.apiKey,
    {
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: input.responseSchema,
      },
    },
  );
  if (!response.ok) return response;

  const text = extractTextFromCandidates(response.value);
  if (text === null) {
    return err(appError("provider-response-invalid", input.emptyMessage));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause) {
    return err(
      appError("provider-response-invalid", input.invalidMessage, cause),
    );
  }

  const normalized = input.normalize(parsed);
  if (normalized === null) {
    return err(appError("provider-response-invalid", input.invalidMessage));
  }
  return ok(normalized);
};

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const geminiTextProvider: TextProvider = {
  id: "gemini",
  name: "Gemini",

  generateScript: async (request) => {
    try {
      return await generateStructured({
        prompt: buildScriptPrompt(request),
        responseSchema: scriptResponseSchema,
        normalize: normalizeScript,
        emptyMessage: geminiCopy.noScriptText,
        invalidMessage: geminiCopy.scriptUnparseable,
      });
    } catch (cause) {
      return err(
        appError("provider-request-failed", messageFromUnknown(cause), cause),
      );
    }
  },

  generateShotList: async (input) => {
    try {
      return await generateStructured({
        prompt: buildShotListPrompt(input),
        responseSchema: shotListResponseSchema,
        normalize: normalizeShotList,
        emptyMessage: geminiCopy.noShotListText,
        invalidMessage: geminiCopy.shotListUnparseable,
      });
    } catch (cause) {
      return err(
        appError("provider-request-failed", messageFromUnknown(cause), cause),
      );
    }
  },
};
