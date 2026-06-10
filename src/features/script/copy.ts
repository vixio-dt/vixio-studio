/**
 * Visible strings for the script room. Sentence case, functional verbs,
 * no dashes. Components render from here and never define prose inline.
 */
export const scriptCopy = {
  development: {
    heading: "Development",
    panelAria: "Development panel",

    loglineLabel: "Logline",
    loglineHelper: "One sentence that drives the whole script.",
    loglinePlaceholder: "Who wants what, and what stands in the way",

    synopsisLabel: "Synopsis",
    synopsisHelper: "Optional. Generating a script fills this in.",
    synopsisPlaceholder: "A short paragraph covering the whole story",

    sceneCountLabel: "Scene count",
    sceneCountHelper: "How many scenes the generated script targets.",

    generate: "Generate script",
    tryAgain: "Try again",

    providerGemini: "Gemini writes the script.",
    providerPreview:
      "Preview writer drafts offline. Connect Gemini in settings for real model output.",

    regenerateTitle: "Replace the script",
    regenerateBody:
      "Generating again replaces every scene and every shot in this project. Characters and their portraits stay.",
    regenerateConfirm: "Replace",
    cancel: "Cancel",
  },

  scenes: {
    paneAria: "Scenes",
    countOne: "scene",
    countMany: "scenes",
    addScene: "Add scene",
    newLocation: "New location",
    emptyTitle: "No scenes yet",
    emptyHint:
      "Write a logline on the left and generate a script, or add a scene by hand.",
  },

  scene: {
    settingAria: "Interior or exterior",
    interior: "Interior",
    exterior: "Exterior",
    untitledLocation: "Untitled location",

    locationAria: "Location",
    locationPlaceholder: "Location",
    timeAria: "Time of day",

    summaryAria: "Scene summary",
    summaryPlaceholder: "One line on what this scene does",

    bodyAria: "Scene body",
    bodyPlaceholder: "Action lines and dialogue, screenplay style",

    charactersAria: "Characters in scene",
    noCharacters:
      "No characters in this project yet. They arrive with a generated script, or add them in the cast room.",
    unnamed: "Unnamed",

    shotCountOne: "shot",
    shotCountMany: "shots",
    openBoard: "Open board",

    breakIntoShots: "Break into shots",
    tryAgain: "Try again",

    replaceShotsTitle: "Replace shots",
    replaceShotsBody: (count: number): string =>
      `This scene already has ${count} ${count === 1 ? "shot" : "shots"}. Breaking it down again replaces them, along with their frames.`,
    replaceShotsConfirm: "Replace",

    deleteScene: "Delete scene",
    deleteTitle: "Delete scene",
    deleteBody: (location: string): string =>
      `This removes the scene at ${location} and every shot inside it. This cannot be undone.`,
    deleteConfirm: "Delete",
    cancel: "Cancel",
  },
} as const;
