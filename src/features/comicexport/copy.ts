/** Every visible string in the comic export view, per the build charter. */
export const comicExportCopy = {
  empty: {
    title: "Nothing to export yet",
    hint: "Generate panel art and place balloons, then come back here to export finished pages.",
  },
  actions: {
    pagesPng: "Pages as PNG",
    cbz: "CBZ archive",
    webtoon: "Webtoon strip",
    webtoonHint:
      "One tall image, panels stacked full width in reading order, sized for phone scrolling.",
    json: "Project JSON",
  },
  status: {
    idle: "Ready to export.",
    renderingPages: "Rendering pages",
    packagingCbz: "Packaging CBZ",
    buildingStrip: "Building strip",
    writingJson: "Writing JSON",
    done: (label: string) => `${label} saved.`,
    skipped: (count: number) =>
      `${count} unplaced ${count === 1 ? "panel" : "panels"} skipped.`,
  },
  previews: {
    label: "Page previews",
    pageLabel: (pageNumber: number) => `Page ${pageNumber}`,
    renderFailed: "Could not render this page.",
    retry: "Retry",
  },
  convert: {
    title: "Convert to film",
    hint: "Panels become shots in reading order, with camera settings suggested from layout and cast.",
    disabledNoPanels: "Add pages and panels first, then convert them into shots.",
    disabledNoScenes: "Write scenes in the script first so converted shots have a home.",
    action: "Convert to film",
    dialogTitle: "Convert to film",
    planningLabel: "Planning the conversion",
    planFailed: "Could not plan the conversion.",
    applyFailed: "Conversion failed.",
    retry: "Retry",
    cancel: "Cancel",
    accept: "Convert",
    totals: (creates: number, updates: number, unchanged: number) =>
      `${creates} new shots, ${updates} updated, ${unchanged} unchanged`,
    sceneLabel: (sceneNumber: number, location: string) =>
      location.trim().length > 0
        ? `Scene ${sceneNumber}, ${location}`
        : `Scene ${sceneNumber}`,
    sceneCounts: (creates: number, updates: number, unchanged: number) =>
      `${creates} new, ${updates} updated, ${unchanged} unchanged`,
    cameraTitle: "Camera suggestions",
    cameraItem: (sizeLabel: string, presetLabel: string) =>
      `${sizeLabel}, ${presetLabel.toLowerCase()}`,
    nothingToConvert: "There are no panels to convert yet.",
    captionsCarried: (count: number) =>
      `${count} caption ${count === 1 ? "line" : "lines"} carried to shot notes.`,
    invariant: "Re-running updates converted shots and never duplicates them.",
  },
} as const;
