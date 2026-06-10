/**
 * Visible strings for the settings page. Sentence case, no dashes, one verb
 * per intent (Delete destroys).
 */
export const settingsCopy = {
  topBar: {
    back: "Projects",
  },
  heading: "Settings",
  providers: {
    heading: "Providers",
    intro: "Choose what renders each kind of generation.",
    preview: "Preview renderer",
    gemini: "Gemini",
    text: {
      label: "Text",
      hint: "Script and shot list drafting",
    },
    image: {
      label: "Image",
      hint: "Frames and character portraits",
    },
    video: {
      label: "Video",
      hint: "Shot motion clips",
    },
  },
  gemini: {
    heading: "Gemini",
    keyLabel: "API key",
    keyHelper: "Stored only in this browser.",
    keyPlaceholder: "Paste your Google AI Studio key",
    textModelLabel: "Text model",
    imageModelLabel: "Image model",
    videoModelLabel: "Video model",
    note: "Without a key, everything runs on the built-in preview renderer.",
  },
  workspace: {
    heading: "Workspace",
    deleteTitle: "Delete all local data",
    deleteHint:
      "Removes every project, generated asset, and setting from this browser.",
    deleteAction: "Delete",
    dialogTitle: "Delete all local data",
    dialogBody:
      "This removes every project, scene, shot, character, generated asset, and setting stored in this browser. There is no undo.",
    confirm: "Delete",
    cancel: "Cancel",
  },
} as const;
