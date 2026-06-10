/** Every visible string in the frame lab, per the build charter. */
export const frameLabCopy = {
  empty: {
    title: "No shots to frame",
    hint: "The frame lab works one shot at a time. Write scenes in the script room and break them into shots on the board, then come back here.",
    action: "Go to script",
  },
  rail: {
    label: "Shots",
    noShots: "No shots yet.",
    noDescription: "No description yet",
  },
  stage: {
    noFrame: "No frame yet. Direct the shot below and generate.",
    frameAlt: (shotNumber: number) => `Frame for shot ${shotNumber}`,
    seed: (seed: number) => `seed ${seed}`,
  },
  console: {
    promptLabel: "Prompt",
    rebuild: "Rebuild prompt",
    charCount: (count: number) => `${count} chars`,
    sizeLabel: "Shot size",
    angleLabel: "Camera angle",
    lensLabel: "Lens",
    lightingLabel: "Lighting",
    referencesLabel: "Character references",
    noSceneCharacters: "This scene has no characters attached.",
    noPortrait: "No portrait yet, name only.",
    notesLabel: "Notes",
    notesHelper: "Extra direction appended to the prompt",
    seedInputLabel: "Seed",
    reroll: "New seed",
    lockOn: "Seed locked. Every take reuses this seed.",
    lockOff: "Seed unlocked. Every take gets a fresh seed.",
    batchLabel: "Takes per run",
    generate: "Generate",
    dismiss: "Dismiss",
  },
  history: {
    label: "Frame history",
    empty: "Takes land here.",
    use: "Use this take",
    takeLabel: (position: number) => `Take ${position}`,
  },
  taskLabel: (shotNumber: number) => `Frame, shot ${shotNumber}`,
  taskTakeLabel: (shotNumber: number, take: number) =>
    `Frame, shot ${shotNumber} take ${take}`,
} as const;
