import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Provider configuration. The preview renderer works with no setup. A Google
 * AI Studio key unlocks Gemini text/image and Veo video; a fal.ai key unlocks
 * the fal model aggregator (Flux, Kling, and more). Keys never leave the
 * browser.
 */

export type ProviderChoice = "vixio-preview" | "gemini" | "fal";

/** Audio (speech and track) generation routes through its own provider set. */
export type AudioProviderChoice = "vixio-preview" | "elevenlabs" | "fal";

/**
 * The Vixio Creatives Google OAuth client id ships as the default so the
 * deployed app is sign-in-ready for the whole team without per-device setup.
 * An OAuth client id is public by design — the security boundary is the
 * authorized JavaScript origins configured in Google Cloud, not secrecy of the
 * id — so embedding it is safe. Override at build time with
 * VITE_GOOGLE_CLIENT_ID, or per-browser in Settings.
 */
const DEFAULT_GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "157133855208-4lf5c8tqrq8tbi8bgoa8iujv40oacjhv.apps.googleusercontent.com";

type SettingsState = {
  geminiApiKey: string;
  falApiKey: string;
  elevenLabsApiKey: string;
  meshyApiKey: string;
  googleClientId: string;
  textProvider: ProviderChoice;
  imageProvider: ProviderChoice;
  videoProvider: ProviderChoice;
  audioProvider: AudioProviderChoice;
  geminiTextModel: string;
  geminiImageModel: string;
  geminiVideoModel: string;
  falTextModel: string;
  falImageModel: string;
  falVideoModel: string;
  falAudioModel: string;
  elevenLabsTtsModel: string;
  setGeminiApiKey: (key: string) => void;
  setFalApiKey: (key: string) => void;
  setElevenLabsApiKey: (key: string) => void;
  setMeshyApiKey: (key: string) => void;
  setGoogleClientId: (clientId: string) => void;
  setTextProvider: (choice: ProviderChoice) => void;
  setImageProvider: (choice: ProviderChoice) => void;
  setVideoProvider: (choice: ProviderChoice) => void;
  setAudioProvider: (choice: AudioProviderChoice) => void;
  setGeminiTextModel: (model: string) => void;
  setGeminiImageModel: (model: string) => void;
  setGeminiVideoModel: (model: string) => void;
  setFalTextModel: (model: string) => void;
  setFalImageModel: (model: string) => void;
  setFalVideoModel: (model: string) => void;
  setFalAudioModel: (model: string) => void;
  setElevenLabsTtsModel: (model: string) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      geminiApiKey: "",
      falApiKey: "",
      elevenLabsApiKey: "",
      meshyApiKey: "",
      googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
      textProvider: "vixio-preview",
      imageProvider: "vixio-preview",
      videoProvider: "vixio-preview",
      audioProvider: "vixio-preview",
      geminiTextModel: "gemini-2.5-flash",
      geminiImageModel: "gemini-2.5-flash-image",
      geminiVideoModel: "veo-3.1-fast-generate-001",
      falTextModel: "google/gemini-flash-1.5",
      falImageModel: "fal-ai/flux/dev",
      falVideoModel: "fal-ai/kling-video/v1.6/standard/image-to-video",
      falAudioModel: "fal-ai/elevenlabs/tts/eleven-v3",
      elevenLabsTtsModel: "eleven_multilingual_v2",
      setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),
      setFalApiKey: (falApiKey) => set({ falApiKey }),
      setElevenLabsApiKey: (elevenLabsApiKey) => set({ elevenLabsApiKey }),
      setMeshyApiKey: (meshyApiKey) => set({ meshyApiKey }),
      setGoogleClientId: (googleClientId) => set({ googleClientId }),
      setTextProvider: (textProvider) => set({ textProvider }),
      setImageProvider: (imageProvider) => set({ imageProvider }),
      setVideoProvider: (videoProvider) => set({ videoProvider }),
      setAudioProvider: (audioProvider) => set({ audioProvider }),
      setGeminiTextModel: (geminiTextModel) => set({ geminiTextModel }),
      setGeminiImageModel: (geminiImageModel) => set({ geminiImageModel }),
      setGeminiVideoModel: (geminiVideoModel) => set({ geminiVideoModel }),
      setFalTextModel: (falTextModel) => set({ falTextModel }),
      setFalImageModel: (falImageModel) => set({ falImageModel }),
      setFalVideoModel: (falVideoModel) => set({ falVideoModel }),
      setFalAudioModel: (falAudioModel) => set({ falAudioModel }),
      setElevenLabsTtsModel: (elevenLabsTtsModel) => set({ elevenLabsTtsModel }),
    }),
    {
      name: "vixio-settings",
      // A browser that persisted settings before the client id shipped would
      // hold an empty string; don't let that mask the shipped default. Keep an
      // explicitly-set custom id, otherwise fall back to the current default.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        const googleClientId =
          saved.googleClientId && saved.googleClientId.length > 0
            ? saved.googleClientId
            : current.googleClientId;
        return { ...current, ...saved, googleClientId };
      },
    },
  ),
);
