/** Every visible string in the panel lab, per the build charter. */
export const panelLabCopy = {
  empty: {
    title: "No panels to draw",
    hint: "The panel lab works one panel at a time. Create pages with layouts first, then direct and generate each panel here.",
    action: "Go to pages",
  },
  rail: {
    label: "Panels",
    pageLabel: (pageNumber: number) => `Page ${pageNumber}`,
    noPanels: "No panels on this page.",
    noDescription: "No description yet",
    balloonCount: (count: number) =>
      `${count} ${count === 1 ? "balloon" : "balloons"}`,
  },
  stage: {
    label: (pageNumber: number, panelNumber: number) =>
      `Page ${pageNumber}, panel ${panelNumber}`,
    noImage: "No art yet. Direct the panel in the console and generate.",
    panelAlt: (pageNumber: number, panelNumber: number) =>
      `Art for page ${pageNumber}, panel ${panelNumber}`,
    seed: (seed: number) => `seed ${seed}`,
  },
  lettering: {
    toggle: "Lettering",
    hint: "Drag balloons into place on the art. Edit text and speakers below.",
    addLabel: "Add balloon",
    kinds: {
      speech: "Speech",
      thought: "Thought",
      whisper: "Whisper",
      burst: "Burst",
      caption: "Caption",
      sfx: "Sfx",
    },
    none: "No balloons yet. Add one above, then drag it into place.",
    textLabel: "Text",
    speakerLabel: "Speaker",
    noSpeaker: "No speaker",
    widthLabel: "Width",
    tailLabel: "Tail angle",
    remove: "Delete balloon",
    balloonLabel: (position: number) => `Balloon ${position}`,
    defaultText: {
      speech: "Say something",
      thought: "Think it over",
      whisper: "Keep it quiet",
      burst: "Not now!",
      caption: "Meanwhile",
      sfx: "Krak!",
    },
  },
  console: {
    promptLabel: "Prompt",
    rebuild: "Rebuild prompt",
    charCount: (count: number) => `${count} chars`,
    descriptionLabel: "Description",
    descriptionHelper: "What the reader sees in this panel",
    notesLabel: "Notes",
    notesHelper: "Extra direction appended to the prompt",
    charactersLabel: "Characters in panel",
    noCharacters: "No characters in this project yet. Add them in cast.",
    seedInputLabel: "Seed",
    reroll: "New seed",
    lockOn: "Seed locked. Every take reuses this seed.",
    lockOff: "Seed unlocked. Every take gets a fresh seed.",
    generate: "Generate",
    dismiss: "Dismiss",
  },
  history: {
    label: "Take history",
    empty: "Takes land here.",
    use: "Use this take",
    takeLabel: (position: number) => `Take ${position}`,
  },
  taskLabel: (pageNumber: number, panelNumber: number) =>
    `Panel, page ${pageNumber} panel ${panelNumber}`,
} as const;
