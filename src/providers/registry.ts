import { useSettingsStore } from "@/stores/settings";

import {
  geminiImageProvider,
  geminiTextProvider,
  geminiVideoProvider,
} from "./gemini";
import { previewImageProvider } from "./mock/image";
import { previewTextProvider } from "./mock/text";
import { previewVideoProvider } from "./mock/video";
import type { ImageProvider, TextProvider, VideoProvider } from "./types";

/**
 * Providers resolve at call time so settings changes apply to the next
 * generation without any re-wiring. A missing Gemini key silently falls
 * back to the offline preview renderer; the settings screen explains this.
 */

const hasGeminiKey = (): boolean =>
  useSettingsStore.getState().geminiApiKey.trim().length > 0;

export const resolveTextProvider = (): TextProvider => {
  const { textProvider } = useSettingsStore.getState();
  if (textProvider === "gemini" && hasGeminiKey()) return geminiTextProvider;
  return previewTextProvider;
};

export const resolveImageProvider = (): ImageProvider => {
  const { imageProvider } = useSettingsStore.getState();
  if (imageProvider === "gemini" && hasGeminiKey()) return geminiImageProvider;
  return previewImageProvider;
};

export const resolveVideoProvider = (): VideoProvider => {
  const { videoProvider } = useSettingsStore.getState();
  if (videoProvider === "gemini" && hasGeminiKey()) return geminiVideoProvider;
  return previewVideoProvider;
};
