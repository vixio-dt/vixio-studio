/**
 * Every user-visible string the Gemini providers can surface. These appear in
 * task failure rows and inline error states, so they follow the copy charter:
 * sentence case, no em or en dashes, plain functional language.
 */
export const geminiCopy = {
  missingKey: "Add a Gemini API key in settings before generating",
  networkFailed: (detail: string) => `Could not reach Gemini (${detail})`,
  requestFailed: (status: number, detail: string) =>
    detail.length > 0
      ? `Gemini request failed with status ${status} (${detail})`
      : `Gemini request failed with status ${status}`,
  unreadableResponse: "Gemini returned a response that could not be read",
  noScriptText: "Gemini returned no script text, try again",
  scriptUnparseable: "Gemini returned a script that could not be parsed, try again",
  noShotListText: "Gemini returned no shot list text, try again",
  shotListUnparseable: "Gemini returned a shot list that could not be parsed, try again",
  fallbackLocation: "Unknown location",
  noImageData: "Gemini returned no image data, try again",
  referenceUnreadable: "A reference image could not be read",
  videoNoOperation: "Veo did not return a generation operation",
  drivingUnsupported:
    "Veo cannot use a previz driving clip, switch the video provider to fal.ai",
  videoUnknownError: "no detail provided",
  videoFailed: (detail: string) => `Veo generation failed (${detail})`,
  videoTimedOut: "Veo generation timed out after 8 minutes",
  videoMissingFile: "Veo finished without a downloadable video",
  videoDownloadFailed: (status: number) =>
    `Veo video download failed with status ${status}`,
} as const;
