import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Provider configuration. The preview renderer works with no setup; a Google
 * AI Studio key unlocks real Gemini text, image, and Veo video generation.
 * Keys never leave the browser.
 */

export type ProviderChoice = "vixio-preview" | "gemini";

type SettingsState = {
  geminiApiKey: string;
  textProvider: ProviderChoice;
  imageProvider: ProviderChoice;
  videoProvider: ProviderChoice;
  geminiTextModel: string;
  geminiImageModel: string;
  geminiVideoModel: string;
  setGeminiApiKey: (key: string) => void;
  setTextProvider: (choice: ProviderChoice) => void;
  setImageProvider: (choice: ProviderChoice) => void;
  setVideoProvider: (choice: ProviderChoice) => void;
  setGeminiTextModel: (model: string) => void;
  setGeminiImageModel: (model: string) => void;
  setGeminiVideoModel: (model: string) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      geminiApiKey: "",
      textProvider: "vixio-preview",
      imageProvider: "vixio-preview",
      videoProvider: "vixio-preview",
      geminiTextModel: "gemini-2.5-flash",
      geminiImageModel: "gemini-2.5-flash-image",
      geminiVideoModel: "veo-3.1-fast-generate-001",
      setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),
      setTextProvider: (textProvider) => set({ textProvider }),
      setImageProvider: (imageProvider) => set({ imageProvider }),
      setVideoProvider: (videoProvider) => set({ videoProvider }),
      setGeminiTextModel: (geminiTextModel) => set({ geminiTextModel }),
      setGeminiImageModel: (geminiImageModel) => set({ geminiImageModel }),
      setGeminiVideoModel: (geminiVideoModel) => set({ geminiVideoModel }),
    }),
    { name: "vixio-settings" },
  ),
);
