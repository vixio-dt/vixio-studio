/**
 * Visible strings for the projects home. Sentence case, no dashes, one verb
 * per intent (New opens the dialog, Create commits, Delete destroys).
 */
export const projectsCopy = {
  topBar: {
    appName: "Vixio Studio",
    settings: "Settings",
  },
  page: {
    heading: "Projects",
    newProject: "New project",
  },
  empty: {
    title: "No projects yet",
    hint: "Start a project to develop a script, cast characters, and build a storyboard shot by shot.",
  },
  card: {
    openLabel: (title: string) => `Open ${title}`,
    coverAlt: (title: string) => `Latest frame from ${title}`,
    deleteLabel: (title: string) => `Delete ${title}`,
  },
  deleteDialog: {
    title: "Delete project",
    body: (title: string) =>
      `Deleting ${title} also removes its scenes, shots, and characters. There is no undo.`,
    confirm: "Delete",
    cancel: "Cancel",
  },
  newProject: {
    title: "New project",
    titleLabel: "Title",
    titlePlaceholder: "The lighthouse keeper",
    titleRequired: "Enter a title.",
    loglineLabel: "Logline",
    loglineHelper:
      "One or two sentences. The script view uses this to draft your scenes.",
    loglinePlaceholder:
      "A retired keeper returns to her decommissioned lighthouse to face the storm she fled.",
    loglineRequired: "Enter a logline.",
    formatLabel: "Format",
    genreLabel: "Genre",
    genrePlaceholder: "drama",
    styleLabel: "Visual style",
    aspectLabel: "Aspect ratio",
    cancel: "Cancel",
    submit: "Create project",
  },
  genreSuggestions: [
    "drama",
    "thriller",
    "romance",
    "science fiction",
    "fantasy",
    "mystery",
    "comedy",
    "horror",
  ],
} as const;
