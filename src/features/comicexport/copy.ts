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
    json: "Project JSON",
  },
  status: {
    idle: "Ready to export.",
    renderingPages: "Rendering pages",
    packagingCbz: "Packaging CBZ",
    buildingStrip: "Building strip",
    writingJson: "Writing JSON",
    done: (label: string) => `${label} saved.`,
  },
  previews: {
    label: "Page previews",
    pageLabel: (pageNumber: number) => `Page ${pageNumber}`,
    renderFailed: "Could not render this page.",
    retry: "Retry",
  },
} as const;
