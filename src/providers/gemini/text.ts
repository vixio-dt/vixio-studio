import { appError, err, messageFromUnknown, ok } from "@/lib/result";

import {
  buildScriptPrompt,
  buildShotListPrompt,
  CHARACTER_ROLES,
  normalizeScript,
  normalizeShotList,
  SCENE_SETTINGS,
  SCENE_TIMES,
  SHOT_ANGLES,
  SHOT_MOVEMENTS,
  SHOT_SIZES,
} from "../shared/script";
import type { TextProvider } from "../types";
import { geminiCopy } from "./copy";
import {
  extractTextFromCandidates,
  geminiRequest,
  missingKeyError,
  readGeminiSettings,
} from "./shared";

/**
 * Structured screenplay generation over Gemini generateContent with a JSON
 * response schema. The model is constrained by the schema; the shared
 * normalizers then re-check every field so bad output never crashes the app.
 * Prompts and normalizers live in providers/shared/script so Gemini and fal
 * stay identical.
 */

/* ------------------------------------------------------------------ */
/* Gemini response schemas (built from the shared vocabularies)        */
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
          timeOfDay: { type: "STRING", enum: [...SCENE_TIMES] },
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
        emptyMessage: geminiCopy.noScriptText,
        invalidMessage: geminiCopy.scriptUnparseable,
      });
    } catch (cause) {
      return err(
        appError("provider-request-failed", messageFromUnknown(cause), cause),
      );
    }
  },
};
