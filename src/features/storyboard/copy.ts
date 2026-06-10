/** Every visible string on the storyboard, per the build charter. */
export const storyboardCopy = {
  empty: {
    title: "No scenes on the board",
    hint: "The board fills in once your script has scenes. Write or generate them in the script room.",
    action: "Go to script",
  },
  scene: {
    generateAll: "Generate all frames",
    framesReady: "All frames ready",
    runtimeLabel: "Scene runtime",
    noShots: "No shots yet.",
    breakIntoShots: "Break into shots is in the script room",
  },
  shot: {
    add: "Add shot",
    noDescription: "No description yet",
    edit: "Edit shot",
    openFrameLab: "Open in frame lab",
    moveLeft: "Move shot left",
    moveRight: "Move shot right",
    delete: "Delete shot",
    failed: "Frame generation failed",
    retry: "Retry",
    frameAlt: (shotNumber: number) => `Frame for shot ${shotNumber}`,
  },
  frameTaskLabel: (sceneNumber: number, shotNumber: number) =>
    `Frame, scene ${sceneNumber} shot ${shotNumber}`,
  editDialog: {
    title: "Edit shot",
    description: "Description",
    descriptionPlaceholder: "What the audience sees, written as direction",
    dialogue: "Dialogue",
    dialogueHelper: "Leave blank for a silent shot",
    size: "Shot size",
    angle: "Camera angle",
    movement: "Camera movement",
    lens: "Lens",
    lighting: "Lighting",
    duration: "Duration (seconds)",
    characters: "Characters in shot",
    noCharacters: "This scene has no characters attached.",
    cancel: "Cancel",
    save: "Save",
  },
  deleteDialog: {
    title: "Delete shot",
    body: (shotNumber: number) =>
      `This removes shot ${shotNumber} from the scene, along with its frame history. This cannot be undone.`,
    cancel: "Cancel",
    confirm: "Delete",
  },
} as const;
