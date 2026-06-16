import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";

import type { TextProvider } from "../types";
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
import {
  asString,
  falCopy,
  FAL_SYNC_BASE,
  falPost,
  isRecord,
  missingKeyError,
  readFalSettings,
} from "./shared";

/**
 * Script and shot-list generation over fal's any-llm endpoint. Unlike Gemini,
 * any-llm has no schema enforcement, so the prompt spells out the exact JSON
 * shape and the response is extracted from any surrounding prose or code
 * fences before the shared normalizers validate it.
 */

const ANY_LLM_PATH = "fal-ai/any-llm";

const orList = (values: readonly string[]): string =>
  values.map((value) => `"${value}"`).join(" | ");

const SCRIPT_SHAPE = `{"synopsis": string, "characters": [{"name": string, "role": ${orList(
  CHARACTER_ROLES,
)}, "bio": string, "appearance": string, "wardrobe": string}], "scenes": [{"setting": ${orList(
  SCENE_SETTINGS,
)}, "location": string, "timeOfDay": ${orList(
  SCENE_TIMES,
)}, "summary": string, "body": string, "characterNames": string[]}]}`;

const SHOT_SHAPE = `{"shots": [{"description": string, "dialogue": string | null, "size": ${orList(
  SHOT_SIZES,
)}, "angle": ${orList(SHOT_ANGLES)}, "movement": ${orList(
  SHOT_MOVEMENTS,
)}, "durationSeconds": number, "characterNames": string[]}]}`;

const withJsonInstruction = (prompt: string, shape: string): string =>
  `${prompt}\n\nReturn ONLY a single JSON object, no markdown and no commentary, matching this exact shape:\n${shape}`;

/** Pull the JSON object out of model output that may wrap it in prose or fences. */
const extractJsonObject = (text: string): string | null => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
};

const readAnyLlmOutput = (payload: unknown): Result<string> => {
  if (!isRecord(payload)) {
    return err(appError("provider-response-invalid", falCopy.noText));
  }
  const errorDetail = payload["error"];
  if (typeof errorDetail === "string" && errorDetail.length > 0) {
    return err(appError("provider-request-failed", errorDetail));
  }
  const output = asString(payload["output"], "").trim();
  if (output.length === 0) {
    return err(appError("provider-response-invalid", falCopy.noText));
  }
  return ok(output);
};

const generateStructured = async <T>(input: {
  prompt: string;
  normalize: (parsed: unknown) => T | null;
}): Promise<Result<T>> => {
  const settings = readFalSettings();
  if (settings.apiKey.length === 0) return err(missingKeyError());

  const response = await falPost(`${FAL_SYNC_BASE}/${ANY_LLM_PATH}`, settings.apiKey, {
    prompt: input.prompt,
    model: settings.textModel,
  });
  if (!response.ok) return response;

  const output = readAnyLlmOutput(response.value);
  if (!output.ok) return output;

  const json = extractJsonObject(output.value);
  if (json === null) {
    return err(appError("provider-response-invalid", falCopy.unparseable));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (cause) {
    return err(appError("provider-response-invalid", falCopy.unparseable, cause));
  }

  const normalized = input.normalize(parsed);
  if (normalized === null) {
    return err(appError("provider-response-invalid", falCopy.unparseable));
  }
  return ok(normalized);
};

export const falTextProvider: TextProvider = {
  id: "fal",
  name: "fal.ai",

  generateScript: async (request) => {
    try {
      return await generateStructured({
        prompt: withJsonInstruction(buildScriptPrompt(request), SCRIPT_SHAPE),
        normalize: normalizeScript,
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
        prompt: withJsonInstruction(buildShotListPrompt(input), SHOT_SHAPE),
        normalize: normalizeShotList,
      });
    } catch (cause) {
      return err(
        appError("provider-request-failed", messageFromUnknown(cause), cause),
      );
    }
  },
};
