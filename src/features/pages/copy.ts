/** Every visible string in the pages view, per the build charter. */
export const pagesCopy = {
  empty: {
    title: "No pages yet",
    hint: "Pages hold your panel layouts. Plan pages from your script, or add a page and pick a layout, then fill each panel in the panel lab.",
  },
  header: {
    styleLabel: "Comic style",
    directionLabel: "Reading direction",
    plan: "Plan pages from script",
    planHelper:
      "One page per scene, in script order. Rerunning only adds pages for scenes past your current page count.",
    planDisabledNoScenes: "Write scenes in the script room first.",
    planDisabledCaughtUp: "Every scene already has a page.",
    addLayoutLabel: "Layout",
    add: "Add page",
    counts: (pages: number, panels: number) =>
      `${pages} ${pages === 1 ? "page" : "pages"}, ${panels} ${panels === 1 ? "panel" : "panels"}`,
  },
  card: {
    pageLabel: (position: number) => `Page ${position}`,
    panelCount: (count: number) =>
      `${count} ${count === 1 ? "panel" : "panels"}`,
    layoutLabel: "Layout",
    open: (position: number) => `Open page ${position} in the panel lab`,
    openPanel: (pageNumber: number, panelNumber: number) =>
      `Open panel ${panelNumber} of page ${pageNumber}`,
    moveUp: "Move page earlier",
    moveDown: "Move page later",
    remove: "Delete page",
    thumbnailFailed: "Could not render this page.",
  },
  shrinkDialog: {
    title: "Switch layout?",
    body: (shown: number, total: number, orphaned: number) =>
      `This layout shows ${shown} of ${total} panels. ${orphaned} ${orphaned === 1 ? "panel keeps" : "panels keep"} their art and lettering but leave the page.`,
    cancel: "Cancel",
    confirm: "Switch layout",
  },
} as const;
