/** Visible strings for the cut view. Sentence case, no dashes. */
export const timelineCopy = {
  header: {
    clipsRendered: (rendered: number, total: number) =>
      `${rendered}/${total} clips rendered`,
    exportBoard: "Export contact sheet",
    exportCut: "Export cut data",
    exportFailed: "Export failed.",
  },
  stage: {
    frameAlt: (shotNumber: number) => `Frame for shot ${shotNumber}`,
    slateFallback: (shotNumber: number) => `Shot ${shotNumber}`,
  },
  transport: {
    previous: "Previous shot",
    next: "Next shot",
    play: "Play",
    pause: "Pause",
    shotOf: (current: number, total: number) => `shot ${current} / ${total}`,
    mute: "Mute clip audio",
    unmute: "Unmute clip audio",
  },
  filmstrip: {
    label: "Filmstrip",
    goToShot: (shotNumber: number) => `Go to shot ${shotNumber}`,
  },
  exporter: {
    nothingToExport: "There are no shots to export yet.",
  },
  empty: {
    title: "Nothing on the timeline",
    hint: "The cut assembles every shot in script order. Write scenes and break them into shots first.",
    action: "Go to script",
  },
} as const;
