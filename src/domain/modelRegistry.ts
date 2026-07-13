import type { AspectRatio } from "./types";

/**
 * Capability catalog for the model id pickers in settings. The registry is
 * advisory: every model field stays free text, and an id outside this list
 * is passed to the provider untouched. Entries describe what a model can do
 * so the UI can hint at aspect ratios, clip lengths, and reference support.
 */

export type ModelProvider = "fal" | "gemini";

export type ModelKind = "image" | "video" | "audio" | "text";

export type ModelInfo = {
  /** Provider-side model id, exactly as sent on the wire. */
  id: string;
  provider: ModelProvider;
  kind: ModelKind;
  label: string;
  aspectRatios?: readonly AspectRatio[];
  maxDurationSeconds?: number;
  /** Video models that render a soundtrack alongside the picture. */
  supportsAudio?: boolean;
  /** How many reference images the model accepts; absent means none. */
  maxReferenceImages?: number;
  /** Wire id used instead of `id` when reference images ride along. */
  referenceEndpointId?: string;
  /** Video models that follow the camera and motion of a previz clip. */
  supportsDrivingVideo?: boolean;
  /** Video models that REQUIRE a driving clip; unusable as plain image to video. */
  drivingOnly?: boolean;
  notes?: string;
};

export const MODEL_REGISTRY: readonly ModelInfo[] = [
  /* ---------------------------- fal image ---------------------------- */
  {
    id: "fal-ai/flux-2",
    provider: "fal",
    kind: "image",
    label: "Flux 2",
    aspectRatios: ["16:9", "9:16", "21:9", "1:1", "4:3"],
    maxReferenceImages: 4,
    referenceEndpointId: "fal-ai/flux-2/edit",
    notes: "Strong general purpose frames with fast turnaround.",
  },
  {
    id: "fal-ai/flux-2-pro",
    provider: "fal",
    kind: "image",
    label: "Flux 2 Pro",
    aspectRatios: ["16:9", "9:16", "21:9", "1:1", "4:3"],
    maxReferenceImages: 4,
    referenceEndpointId: "fal-ai/flux-2-pro/edit",
    notes: "Higher fidelity Flux tier for hero frames.",
  },
  {
    id: "fal-ai/nano-banana-pro",
    provider: "fal",
    kind: "image",
    label: "Nano Banana Pro",
    aspectRatios: ["16:9", "9:16", "21:9", "1:1", "4:3"],
    maxReferenceImages: 14,
    referenceEndpointId: "fal-ai/nano-banana-pro/edit",
    notes: "Excels at edits and multi reference character consistency.",
  },
  {
    id: "fal-ai/nano-banana-2",
    provider: "fal",
    kind: "image",
    label: "Nano Banana 2",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3"],
    maxReferenceImages: 14,
    referenceEndpointId: "fal-ai/nano-banana-2/edit",
    notes: "Fast iteration tier of the Nano Banana family.",
  },
  {
    id: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    provider: "fal",
    kind: "image",
    label: "Seedream 4.5",
    aspectRatios: ["16:9", "9:16", "21:9", "1:1", "4:3"],
    notes: "Detailed cinematic stills with strong text rendering.",
  },

  /* ---------------------------- fal video ---------------------------- */
  {
    id: "fal-ai/kling-video/v3/standard/image-to-video",
    provider: "fal",
    kind: "video",
    label: "Kling 3 Standard",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDurationSeconds: 15,
    supportsAudio: true,
    notes: "Reliable motion from a start frame, 3 to 15 second clips.",
  },
  {
    id: "fal-ai/kling-video/v3/pro/image-to-video",
    provider: "fal",
    kind: "video",
    label: "Kling 3 Pro",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDurationSeconds: 15,
    supportsAudio: true,
    notes: "Higher fidelity Kling tier, 3 to 15 second clips.",
  },
  {
    id: "fal-ai/veo3.1/image-to-video",
    provider: "fal",
    kind: "video",
    label: "Veo 3.1",
    aspectRatios: ["16:9", "9:16"],
    maxDurationSeconds: 8,
    supportsAudio: true,
    notes: "Google Veo with native soundtrack, strong prompt adherence.",
  },
  {
    id: "fal-ai/veo3.1/lite",
    provider: "fal",
    kind: "video",
    label: "Veo 3.1 Lite",
    aspectRatios: ["16:9", "9:16"],
    maxDurationSeconds: 8,
    supportsAudio: true,
    notes: "Cheaper Veo tier for drafts and previz passes.",
  },
  {
    id: "fal-ai/sora-2/image-to-video",
    provider: "fal",
    kind: "video",
    label: "Sora 2",
    aspectRatios: ["16:9", "9:16"],
    maxDurationSeconds: 12,
    supportsAudio: true,
    notes: "OpenAI Sora with synchronized audio and physics aware motion.",
  },
  {
    id: "wan/v2.6/image-to-video",
    provider: "fal",
    kind: "video",
    label: "Wan 2.6",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDurationSeconds: 10,
    supportsAudio: false,
    notes: "Open weights family, good value for stylized motion.",
  },
  {
    id: "fal-ai/ltx-2/image-to-video",
    provider: "fal",
    kind: "video",
    label: "LTX 2",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDurationSeconds: 10,
    supportsAudio: true,
    notes: "Fast clips up to 4k with optional synchronized audio.",
  },
  {
    id: "bytedance/seedance-2.0/fast/reference-to-video",
    provider: "fal",
    kind: "video",
    label: "Seedance 2.0 Fast",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "21:9"],
    maxDurationSeconds: 12,
    supportsAudio: true,
    supportsDrivingVideo: true,
    notes: "Follows the camera and motion of a previz clip, fast tier.",
  },
  {
    id: "bytedance/seedance-2.0/reference-to-video",
    provider: "fal",
    kind: "video",
    label: "Seedance 2.0",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "21:9"],
    maxDurationSeconds: 12,
    supportsAudio: true,
    supportsDrivingVideo: true,
    notes: "Higher fidelity Seedance tier for reference driven motion.",
  },
  {
    id: "moonvalley/marey/motion-transfer",
    provider: "fal",
    kind: "video",
    label: "Marey motion transfer",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDurationSeconds: 10,
    supportsAudio: false,
    supportsDrivingVideo: true,
    drivingOnly: true,
    notes: "Transfers the source clip's motion onto a new first frame.",
  },
  {
    id: "fal-ai/ltx-2-19b/distilled/video-to-video/lora",
    provider: "fal",
    kind: "video",
    label: "LTX 2 vid2vid",
    aspectRatios: ["16:9", "9:16", "1:1"],
    maxDurationSeconds: 10,
    supportsAudio: false,
    supportsDrivingVideo: true,
    drivingOnly: true,
    notes: "Restyles a previz clip while keeping its camera and timing.",
  },

  /* ---------------------------- fal audio ---------------------------- */
  {
    id: "fal-ai/elevenlabs/tts/eleven-v3",
    provider: "fal",
    kind: "audio",
    label: "ElevenLabs Eleven v3",
    notes: "Expressive text to speech routed through fal.",
  },

  /* ----------------------------- gemini ------------------------------ */
  {
    id: "gemini-2.5-flash",
    provider: "gemini",
    kind: "text",
    label: "Gemini 2.5 Flash",
    notes: "Fast structured drafting for scripts and shot lists.",
  },
  {
    id: "gemini-2.5-flash-image",
    provider: "gemini",
    kind: "image",
    label: "Gemini 2.5 Flash Image",
    aspectRatios: ["16:9", "9:16", "21:9", "1:1", "4:3"],
    maxReferenceImages: 3,
    notes: "Native image generation with inline reference image support.",
  },
  {
    id: "veo-3.1-fast-generate-001",
    provider: "gemini",
    kind: "video",
    label: "Veo 3.1 Fast",
    aspectRatios: ["16:9", "9:16"],
    maxDurationSeconds: 8,
    supportsAudio: true,
    notes: "Veo over the Gemini API, fast tier with soundtrack.",
  },
];

/** Catalog entries for one provider and generation kind, in registry order. */
export const modelsFor = (
  provider: ModelProvider,
  kind: ModelKind,
): readonly ModelInfo[] =>
  MODEL_REGISTRY.filter((model) => model.provider === provider && model.kind === kind);

/** Registry entry for an exact wire id, or null for custom ids. */
export const findModel = (id: string): ModelInfo | null =>
  MODEL_REGISTRY.find((model) => model.id === id) ?? null;
