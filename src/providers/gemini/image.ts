import { aspectRatioToDimensions } from "@/domain/constants";
import { appError, err, messageFromUnknown, ok } from "@/lib/result";

import type { ImageProvider } from "../types";
import { geminiCopy } from "./copy";
import {
  extractInlineImage,
  geminiRequest,
  missingKeyError,
  readGeminiSettings,
  urlToInlineData,
  type InlineImage,
} from "./shared";

/**
 * Frame and portrait generation over Gemini generateContent with image
 * output. Reference images (character identity, location) ride along as
 * inlineData parts; unreadable references are skipped rather than failing
 * the whole generation, since they are best-effort identity anchors.
 */

type ContentPart = { text: string } | { inlineData: InlineImage };

export const geminiImageProvider: ImageProvider = {
  id: "gemini",
  name: "Gemini image",

  generateImage: async (request, onProgress) => {
    try {
      const settings = readGeminiSettings();
      if (settings.apiKey.length === 0) return err(missingKeyError());

      const parts: ContentPart[] = [
        {
          text: `${request.prompt}, composition framed for ${request.aspectRatio}`,
        },
      ];
      for (const url of request.referenceImageUrls) {
        const reference = await urlToInlineData(url);
        if (reference.ok) parts.push({ inlineData: reference.value });
      }

      onProgress(0.15);
      const response = await geminiRequest(
        `/models/${settings.imageModel}:generateContent`,
        settings.apiKey,
        {
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"] },
        },
      );
      if (!response.ok) return response;

      onProgress(0.9);
      const image = extractInlineImage(response.value);
      if (image === null) {
        return err(appError("provider-response-invalid", geminiCopy.noImageData));
      }

      const { width, height } = aspectRatioToDimensions(request.aspectRatio);
      return ok({
        url: `data:${image.mimeType};base64,${image.data}`,
        width,
        height,
      });
    } catch (cause) {
      return err(
        appError("provider-request-failed", messageFromUnknown(cause), cause),
      );
    }
  },
};
