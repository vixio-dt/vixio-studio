/**
 * Visible strings for the cast room. Sentence case, functional verbs,
 * no dashes. Components render from here and never define prose inline.
 */
export const castCopy = {
  countOne: "character",
  countMany: "characters",
  addCharacter: "Add character",

  emptyTitle: "No cast yet",
  emptyHint: "Generate a script in the script room, or add a character by hand.",

  unnamed: "Unnamed",
  nameLabel: "Character name",
  namePlaceholder: "Name",

  roleLabel: "Role",
  roleLead: "Lead",
  roleSupporting: "Supporting",
  roleMinor: "Minor",

  bioLabel: "Bio",
  bioPlaceholder: "Who they are in the story",

  appearanceLabel: "Appearance",
  appearanceHelper: "Feeds every frame prompt. Be concrete: build, face, hair.",
  appearancePlaceholder: "Build, face, hair, defining details",

  wardrobeLabel: "Wardrobe",
  wardrobeHelper: "Repeated in every prompt so the outfit stays the same across shots.",
  wardrobePlaceholder: "Signature clothing and props",

  generatePortrait: "Generate portrait",
  portraitAlt: (name: string): string => `Portrait of ${name}`,
  noPortraitTitle: "No portrait yet",
  noPortraitHint: "Fill in appearance, then generate.",
  portraitFailed: "Portrait failed.",
  retry: "Retry",

  seedLabel: "Seed",
  newSeed: "New seed",

  historyLabel: "Portrait history",
  usePortrait: "Use this portrait",

  deleteCharacter: "Delete character",
  deleteBody: (name: string): string =>
    `This removes ${name} from the cast and unlinks them from every scene and shot. Portraits already generated stay in the project assets.`,
  cancel: "Cancel",
  confirmDelete: "Delete",

  taskLabel: (name: string): string => `Portrait, ${name}`,
} as const;
