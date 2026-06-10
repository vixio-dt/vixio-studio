import { aspectRatioToDimensions } from "@/domain/constants";
import { composeFramePrompt, composeVideoPrompt } from "@/domain/prompt";
import type {
  Asset,
  Character,
  Project,
  Scene,
  Shot,
} from "@/domain/types";
import type { AssetId } from "@/lib/id";
import {
  appError,
  err,
  messageFromUnknown,
  ok,
  type Result,
} from "@/lib/result";

import { timelineCopy } from "./copy";
import { displaySeconds, formatShortSeconds } from "./cutLogic";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export type SceneGroup = {
  scene: Scene;
  shots: readonly Shot[];
};

export const slugifyTitle = (title: string): string => {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
};

const triggerDownload = (href: string, filename: string): void => {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
};

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });

/* ------------------------------------------------------------------ */
/* Contact sheet                                                       */
/* ------------------------------------------------------------------ */

const COLS = 5;
const CELL_W = 320;
const LABEL_H = 28;
const GUTTER = 16;
const SCENE_GAP = 24;
const SHEET_BG = "#0c0d10";
const CELL_BG = "#121417";
const LABEL_COLOR = "#9ba1a6";
const MISSING_COLOR = "#5c6167";
const MONO_FONT = "'Geist Mono Variable', ui-monospace, monospace";

const drawCover = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(
    image,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
};

/**
 * Composites every shot's frame into a PNG board: 5 columns at the project
 * aspect, a label band under each cell, scene groups separated by an extra
 * gap (the hard cuts of the timeline), downloaded as "{title}-board.png".
 */
export const exportContactSheet = async (input: {
  project: Project;
  groups: readonly SceneGroup[];
  assets: Record<AssetId, Asset>;
}): Promise<Result<void>> => {
  const { project, groups, assets } = input;
  const populated = groups.filter((group) => group.shots.length > 0);
  if (populated.length === 0) {
    return err(appError("not-found", timelineCopy.exporter.nothingToExport));
  }

  try {
    const dims = aspectRatioToDimensions(project.aspectRatio);
    const cellH = Math.round((CELL_W * dims.height) / dims.width);
    const rowH = cellH + LABEL_H + GUTTER;
    const width = GUTTER + COLS * (CELL_W + GUTTER);
    const height =
      GUTTER +
      populated.reduce(
        (sum, group) => sum + Math.ceil(group.shots.length / COLS) * rowH,
        0,
      ) +
      (populated.length - 1) * SCENE_GAP;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return err(appError("storage-failed", "Canvas is not available."));
    }

    context.fillStyle = SHEET_BG;
    context.fillRect(0, 0, width, height);

    let y = GUTTER;
    let shotNumber = 0;
    for (const [groupIndex, group] of populated.entries()) {
      for (let position = 0; position < group.shots.length; position++) {
        const shot = group.shots[position];
        if (!shot) continue;
        shotNumber += 1;
        const column = position % COLS;
        const rowTop = y + Math.floor(position / COLS) * rowH;
        const x = GUTTER + column * (CELL_W + GUTTER);

        const frame = shot.frameAssetId ? assets[shot.frameAssetId] : undefined;
        const image = frame ? await loadImage(frame.url) : null;
        if (image) {
          drawCover(context, image, x, rowTop, CELL_W, cellH);
        } else {
          context.fillStyle = CELL_BG;
          context.fillRect(x, rowTop, CELL_W, cellH);
          context.fillStyle = MISSING_COLOR;
          context.font = `14px ${MONO_FONT}`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(`#${shotNumber}`, x + CELL_W / 2, rowTop + cellH / 2);
        }

        context.fillStyle = LABEL_COLOR;
        context.font = `12px ${MONO_FONT}`;
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(
          `#${shotNumber} ${formatShortSeconds(displaySeconds(shot, assets))}`,
          x,
          rowTop + cellH + LABEL_H / 2,
        );
      }
      y += Math.ceil(group.shots.length / COLS) * rowH;
      if (groupIndex < populated.length - 1) y += SCENE_GAP;
    }

    triggerDownload(
      canvas.toDataURL("image/png"),
      `${slugifyTitle(project.title)}-board.png`,
    );
    return ok(undefined);
  } catch (cause) {
    return err(appError("storage-failed", messageFromUnknown(cause), cause));
  }
};

/* ------------------------------------------------------------------ */
/* Cut data                                                            */
/* ------------------------------------------------------------------ */

/**
 * Serializes the whole cut (project, cast, scenes, shots, composed prompts)
 * as JSON, downloaded as "{title}-cut.json". The timestamp is captured at
 * click time inside this function.
 */
export const exportCutData = (input: {
  project: Project;
  groups: readonly SceneGroup[];
  characters: readonly Character[];
}): Result<void> => {
  const { project, groups, characters } = input;
  if (groups.every((group) => group.shots.length === 0)) {
    return err(appError("not-found", timelineCopy.exporter.nothingToExport));
  }

  try {
    const payload = {
      version: "1",
      generatedAt: new Date().toISOString(),
      project: {
        title: project.title,
        logline: project.logline,
        synopsis: project.synopsis,
        format: project.format,
        genre: project.genre,
        styleId: project.styleId,
        aspectRatio: project.aspectRatio,
      },
      characters: characters.map((character) => ({
        name: character.name,
        role: character.role,
        bio: character.bio,
        appearance: character.appearance,
        wardrobe: character.wardrobe,
        hasPortrait: character.portraitAssetId !== null,
      })),
      scenes: groups.map(({ scene, shots }, sceneIndex) => ({
        index: sceneIndex + 1,
        setting: scene.setting,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        summary: scene.summary,
        shots: shots.map((shot, shotIndex) => {
          const prompt = composeFramePrompt({
            project,
            scene,
            shot,
            characters: [...characters],
          });
          return {
            index: shotIndex + 1,
            description: shot.description,
            dialogue: shot.dialogue,
            size: shot.size,
            angle: shot.angle,
            movement: shot.movement,
            lens: shot.lens,
            lighting: shot.lighting,
            durationSeconds: shot.durationSeconds,
            seed: shot.seed,
            prompt,
            videoPrompt: composeVideoPrompt({ framePrompt: prompt, shot }),
            hasFrame: shot.frameAssetId !== null,
            hasClip: shot.videoAssetId !== null,
          };
        }),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${slugifyTitle(project.title)}-cut.json`);
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return ok(undefined);
  } catch (cause) {
    return err(appError("storage-failed", messageFromUnknown(cause), cause));
  }
};
