import {
  DEFAULT_COMIC_STYLE_ID,
  findCameraBody,
  findCameraPreset,
  findComicStyle,
  findVisualStyle,
  MOTION_PRESETS,
} from "./constants";
import type { Character, Panel, Project, Scene, Shot } from "./types";

/**
 * Prompt assembly follows the artcraft principle: the user controls every
 * ingredient, and the final prompt is always visible and editable. These
 * helpers produce the DEFAULT composition; the UI lets the user override it.
 */

const SHOT_SIZE_LANGUAGE: Record<Shot["size"], string> = {
  "extreme-wide": "extreme wide shot",
  wide: "wide shot",
  medium: "medium shot",
  "close-up": "close-up",
  "extreme-close-up": "extreme close-up",
  "over-the-shoulder": "over-the-shoulder shot",
  insert: "insert shot of a key detail",
};

const ANGLE_LANGUAGE: Record<Shot["angle"], string> = {
  "eye-level": "eye-level angle",
  low: "low angle looking up",
  high: "high angle looking down",
  overhead: "overhead top-down angle",
  dutch: "dutch tilt",
};

const LIGHTING_LANGUAGE: Record<Shot["lighting"], string> = {
  natural: "natural light",
  "golden-hour": "golden hour light, long warm shadows",
  "blue-hour": "blue hour light, cool ambient glow",
  "high-key": "high-key lighting, soft and bright",
  "low-key": "low-key lighting, deep shadows",
  neon: "neon practical lighting, saturated color spill",
  firelight: "flickering firelight, warm and unsteady",
  overcast: "overcast diffuse light, soft shadows",
};

/** Joining with ". " doubles up when a part already ends with punctuation. */
const stripTrailingPeriod = (part: string): string =>
  part.replace(/\.+\s*$/, "");

const joinPromptParts = (parts: string[]): string =>
  parts
    .map((part) => stripTrailingPeriod(part.trim()))
    .filter((part) => part.length > 0)
    .join(". ");

const describeSceneSetting = (scene: Scene): string => {
  const place = scene.setting === "interior" ? "interior" : "exterior";
  return `${place} of ${scene.location}, ${scene.timeOfDay}`;
};

const describeCharacter = (character: Character): string => {
  const wardrobe = character.wardrobe.trim();
  const base = `${character.name}: ${character.appearance.trim()}`;
  return wardrobe.length > 0 ? `${base}, wearing ${wardrobe}` : base;
};

export const composeFramePrompt = (input: {
  project: Project;
  scene: Scene;
  shot: Shot;
  characters: Character[];
}): string => {
  const { project, scene, shot, characters } = input;
  const style = findVisualStyle(project.styleId);

  const parts: string[] = [
    `${SHOT_SIZE_LANGUAGE[shot.size]}, ${ANGLE_LANGUAGE[shot.angle]}, ${shot.lens} lens`,
    shot.description.trim(),
    describeSceneSetting(scene),
  ];

  const present = characters.filter((character) =>
    shot.characterIds.includes(character.id),
  );
  for (const character of present) {
    parts.push(describeCharacter(character));
  }

  parts.push(LIGHTING_LANGUAGE[shot.lighting]);
  parts.push(style.promptFragment);

  const notes = shot.promptNotes.trim();
  if (notes.length > 0) parts.push(notes);

  return joinPromptParts(parts);
};

export const composePortraitPrompt = (input: {
  project: Project;
  character: Character;
}): string => {
  const { project, character } = input;
  const style = findVisualStyle(project.styleId);
  const parts = [
    `character portrait, medium close-up, neutral pose, plain backdrop`,
    describeCharacter(character),
    character.bio.trim(),
    style.promptFragment,
  ];
  return joinPromptParts(parts);
};

/**
 * Panels are generated as clean art; balloons are lettered as an overlay so
 * the text stays editable, so the prompt forbids baked-in lettering.
 */
const PANEL_FRAMING = "clean art, no speech balloons, no text";

export const composePanelPrompt = (input: {
  project: Project;
  panel: Panel;
  characters: Character[];
}): string => {
  const { project, panel, characters } = input;
  const style = findComicStyle(project.comicStyleId ?? DEFAULT_COMIC_STYLE_ID);

  const parts: string[] = ["comic panel illustration", panel.description.trim()];

  const present = characters.filter((character) =>
    panel.characterIds.includes(character.id),
  );
  for (const character of present) {
    parts.push(describeCharacter(character));
  }

  parts.push(style.promptFragment);
  parts.push(PANEL_FRAMING);

  const notes = panel.promptNotes.trim();
  if (notes.length > 0) parts.push(notes);

  return joinPromptParts(parts);
};

export const composeVideoPrompt = (input: {
  framePrompt: string;
  shot: Shot;
}): string => {
  const { shot } = input;
  // One camera voice per prompt: a chosen camera preset speaks for the shot;
  // the coarser movement fragment only fills in when no preset is set.
  const cameraPreset = shot.cameraPresetId
    ? findCameraPreset(shot.cameraPresetId)
    : null;
  const preset = MOTION_PRESETS.find(
    (candidate) => candidate.movement === shot.movement,
  );
  const motion =
    cameraPreset?.promptFragment ??
    preset?.promptFragment ??
    "subtle ambient motion";

  const parts: string[] = [input.framePrompt, `Camera: ${motion}`];

  const cameraBody = shot.cameraBodyId ? findCameraBody(shot.cameraBodyId) : null;
  if (cameraBody) parts.push(cameraBody.promptFragment);

  return `${joinPromptParts(parts)}.`;
};
