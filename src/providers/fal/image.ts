import { appError, err, messageFromUnknown, ok } from "@/lib/result";

import type { ImageProvider, ImageResult } from "../types";
import {
  asString,
  aspectToFalImageSize,
  falCopy,
  FAL_SYNC_BASE,
  falPost,
  isRecord,
  missingKeyError,
  readFalSettings,
} from "./shared";

/**
 * Image generation over fal's synchronous endpoint (Flux and similar). The
 * composed prompt already carries the character appearance, so this is a
 * text-to-image call; reference images are a model-specific follow-up and are
 * not sent here. fal returns a CDN URL the task queue fetches into a blob.
 */

const readFirstImage = (payload: unknown): ImageResult | null => {
  if (!isRecord(payload)) return null;
  const images = payload["images"];
  if (!Array.isArray(images)) return null;
  const first = images[0];
  if (!isRecord(first)) return null;
  const url = asString(first["url"], "");
  if (url.length === 0) return null;
  const width = typeof first["width"] === "number" ? first["width"] : 0;
  const height = typeof first["height"] === "number" ? first["height"] : 0;
  return { url, width, height };
};

export const falImageProvider: ImageProvider = {
  id: "fal",
  name: "fal.ai",

  generateImage: async (request, onProgress) => {
    const settings = readFalSettings();
    if (settings.apiKey.length === 0) return err(missingKeyError());

    onProgress(0.15);
    const response = await falPost(
      `${FAL_SYNC_BASE}/${settings.imageModel}`,
      settings.apiKey,
      {
        prompt: request.prompt,
        image_size: aspectToFalImageSize(request.aspectRatio),
        num_images: 1,
        seed: request.seed,
        enable_safety_checker: false,
      },
    );
    if (!response.ok) return response;

    onProgress(0.9);
    const image = readFirstImage(response.value);
    if (image === null) {
      return err(appError("provider-response-invalid", falCopy.noImage));
    }
    try {
      return ok(image);
    } catch (cause) {
      return err(
        appError("provider-request-failed", messageFromUnknown(cause), cause),
      );
    }
  },
};
