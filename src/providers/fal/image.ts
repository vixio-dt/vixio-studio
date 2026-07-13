import { MODEL_REGISTRY } from "@/domain/modelRegistry";
import { appError, err, ok } from "@/lib/result";

import type { ImageRequest, ImageProvider, ImageResult } from "../types";
import {
  asString,
  aspectToFalImageSize,
  falCopy,
  FAL_SYNC_BASE,
  falPost,
  isRecord,
  mediaUrlForFal,
  missingKeyError,
  readFalSettings,
} from "./shared";

/**
 * Image generation over fal's synchronous endpoint. Text-to-image goes to the
 * configured model directly. When the request carries reference images and
 * the registry says the model accepts them, the call routes to the model's
 * reference endpoint (usually the /edit sibling) with the references uploaded
 * to fal storage and sent as image_urls. Models without registry reference
 * support keep dropping references, since their endpoints would reject the
 * field. fal returns a CDN URL the task queue fetches into a blob.
 */

/**
 * The JSON body a fal image model family expects, keyed off the model id.
 * Pure so the wire contract is testable without a network. The nano-banana
 * family takes aspect_ratio and rejects the flux-style size and safety
 * fields; flux, seedream, and unknown models take the classic flux shape.
 */
export const buildImageBody = (
  modelId: string,
  request: ImageRequest,
): Record<string, unknown> => {
  if (modelId.includes("nano-banana")) {
    return {
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
    };
  }
  return {
    prompt: request.prompt,
    image_size: aspectToFalImageSize(request.aspectRatio),
    num_images: 1,
    seed: request.seed,
    enable_safety_checker: false,
  };
};

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

    const entry = MODEL_REGISTRY.find((model) => model.id === settings.imageModel);
    const maxReferences = entry?.maxReferenceImages ?? 0;
    const references = request.referenceImageUrls.slice(0, maxReferences);
    const useReferences = references.length > 0;
    const wireModel = useReferences
      ? (entry?.referenceEndpointId ?? settings.imageModel)
      : settings.imageModel;

    const body = buildImageBody(settings.imageModel, request);
    if (useReferences) {
      onProgress(0.05);
      const imageUrls: string[] = [];
      for (const [index, url] of references.entries()) {
        const uploaded = await mediaUrlForFal(url, `reference-${index + 1}.png`);
        if (!uploaded.ok) {
          return err(
            appError("provider-request-failed", falCopy.referenceUnreadable),
          );
        }
        imageUrls.push(uploaded.value);
      }
      body["image_urls"] = imageUrls;
    }

    onProgress(0.15);
    const response = await falPost(
      `${FAL_SYNC_BASE}/${wireModel}`,
      settings.apiKey,
      body,
    );
    if (!response.ok) return response;

    onProgress(0.9);
    const image = readFirstImage(response.value);
    if (image === null) {
      return err(appError("provider-response-invalid", falCopy.noImage));
    }
    return ok(image);
  },
};
