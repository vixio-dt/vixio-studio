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
    preview: "Preview",
    gemini: "Gemini",
    fal: "fal.ai",
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
  fal: {
    heading: "fal.ai",
    keyLabel: "API key",
    keyHelper: "Stored only in this browser. Format is key_id:key_secret.",
    keyPlaceholder: "Paste your fal.ai key",
    textModelLabel: "Text model",
    textModelHelper: "any-llm model id, for example anthropic/claude-3.5-sonnet.",
    imageModelLabel: "Image model",
    imageModelHelper: "For example fal-ai/flux/schnell for fast drafts.",
    videoModelLabel: "Video model",
    videoModelHelper: "Image to video model. Needs a shot frame first.",
  },
  drive: {
    heading: "Google Drive",
    intro:
      "Sign in to mirror this workspace to your own Google Drive. Local storage keeps working until you do.",
    clientIdLabel: "Google client id",
    clientIdHelper:
      "An OAuth client id from your Google Cloud console. Stored only in this browser.",
    clientIdPlaceholder: "Paste your Google OAuth client id",
    signIn: "Sign in with Google",
    signOut: "Sign out",
    signingIn: "Signing in",
    signedInAs: (email: string): string =>
      email.length > 0 ? `Signed in as ${email}` : "Signed in",
    modeLocalNote:
      "Storage mode is local. Projects and assets live in this browser only.",
    modeDriveNote:
      "Storage mode is Drive. Changes sync to the Vixio Studio folder in your Drive.",
    syncing: "Syncing to Drive",
    syncIdle: "Workspace is up to date",
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
