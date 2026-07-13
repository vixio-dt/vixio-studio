/** Visible strings for the motion view. Sentence case, no dashes. */
export const motionCopy = {
  rail: {
    title: "Shots",
    clipReady: "Clip rendered",
    frameReady: "Frame ready, no clip yet",
    needsFrame: "No start frame yet",
    noDescription: "No description yet",
  },
  stage: {
    startFrameCaption: "Start frame",
    needsFrameTitle: "This shot needs a frame first",
    needsFrameHint:
      "Render a start frame in the frame lab, then come back to animate it.",
    openFrameLab: "Open frame lab",
    frameAlt: (shotNumber: number) => `Start frame for shot ${shotNumber}`,
  },
  console: {
    cameraMove: "Camera move",
    duration: "Duration",
    durationOption: (seconds: number) => `${seconds}s`,
    prompt: "Video prompt",
    promptHelper:
      "Composed from the frame prompt and the camera move. Edits stick until you rebuild.",
    rebuildPrompt: "Rebuild prompt",
    generate: "Generate clip",
    needsFrameReason: "Generate a start frame before rendering a clip.",
    previewNote:
      "The preview animatic renders the start frame with the chosen camera move.",
    veoNote: "Veo renders this clip.",
    rendersWith: (providerName: string) => `Renders with ${providerName}`,
    failedTitle: "Clip generation failed",
    dismiss: "Dismiss",
    dismissFailed: "Dismiss failed task",
    clipTaskLabel: (shotNumber: number) => `Clip, shot #${shotNumber}`,
    previzToggle: "Use previz clip",
    previzHelper: (modelLabel: string) =>
      `The previz clip drives the camera and motion. Renders with ${modelLabel}.`,
    previzPreviewNote:
      "The offline preview keeps your choice. Add a fal key in settings for real driving video.",
    previzNeedsFal:
      "Driving video needs the fal.ai provider. Add a fal key and route video to fal in settings.",
  },
  empty: {
    title: "No shots to animate",
    hint: "Build the shot list on the board and render start frames in the frame lab first.",
    action: "Open the board",
  },
} as const;
