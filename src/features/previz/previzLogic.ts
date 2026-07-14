import type { CapturePass } from "@/lib/previz/capture";

/** Viewport interaction mode: move blocks on the floor, or edit the camera. */
export type StageMode = "blocking" | "camera";

export type KeyframeId = "a" | "b";

/** The capture surface's four-state machine. */
export type CaptureStatus =
  | { state: "idle" }
  | { state: "rendering"; pass: CapturePass; fraction: number }
  | { state: "saving" }
  | { state: "failed"; message: string }
  | { state: "done"; codec: string; depthUrl: string; depthExtension: string };

export const isCapturing = (status: CaptureStatus): boolean =>
  status.state === "rendering" || status.state === "saving";

/** Mono scrub readout: "2.4" for 2.4 seconds. */
export const formatScrubSeconds = (seconds: number): string =>
  seconds.toFixed(1);
