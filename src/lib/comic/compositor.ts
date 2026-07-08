import type { Asset, ComicLayout, Panel } from "@/domain/types";
import type { AssetId } from "@/lib/id";
import { appError, err, ok, type Result } from "@/lib/result";

import {
  BALLOON_FONT_STACK,
  layoutBalloon,
  LETTERING_INK,
  LETTERING_PAPER,
} from "./balloons";
import { frameForPanelIndex } from "./reading";

/**
 * Canvas page compositor: a white page at the layout's pixel size, panel art
 * cover-fit into the frame rects behind a 4px ink border, then the balloons
 * replayed from the same geometry the lettering editor renders. Pure DOM
 * canvas work, no React.
 */

const PAGE_BACKGROUND = LETTERING_PAPER;
const INK = LETTERING_INK;
const EMPTY_PANEL_FILL = "#eef0f2";
const PANEL_BORDER_PX = 4;

export type PageComposition = {
  layout: ComicLayout;
  /** Panels for the page; only indexes that map to a frame are drawn. */
  panels: readonly Panel[];
  /** Asset index used to resolve each panel's imageAssetId. */
  assets: Record<AssetId, Asset>;
};

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });

/** Cover-fit: fill the box completely, cropping the overflow axis. */
const drawCover = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
};

const drawBalloons = (
  context: CanvasRenderingContext2D,
  panel: Panel,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  for (const balloon of panel.balloons) {
    const geometry = layoutBalloon(balloon, width, height);
    context.save();
    context.translate(x, y);

    context.lineJoin = "round";
    context.strokeStyle = INK;
    context.fillStyle = PAGE_BACKGROUND;
    context.lineWidth = geometry.strokeWidth;

    if (geometry.tailPath) {
      const tail = new Path2D(geometry.tailPath);
      context.fill(tail);
      context.stroke(tail);
    }
    if (geometry.bodyPath.length > 0) {
      const body = new Path2D(geometry.bodyPath);
      if (geometry.dashed) {
        context.setLineDash([geometry.strokeWidth * 3, geometry.strokeWidth * 2.2]);
      }
      context.fill(body);
      context.stroke(body);
      context.setLineDash([]);
    }

    const weight = geometry.kind === "sfx" ? 700 : 600;
    context.font = `${weight} ${geometry.fontSize}px ${BALLOON_FONT_STACK}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const firstLineY =
      geometry.cy - ((geometry.lines.length - 1) / 2) * geometry.lineHeight;
    geometry.lines.forEach((line, index) => {
      const lineY = firstLineY + index * geometry.lineHeight;
      if (geometry.kind === "sfx") {
        // Bold outlined display text, no bubble body.
        context.lineWidth = geometry.fontSize * 0.16;
        context.strokeStyle = INK;
        context.strokeText(line, geometry.cx, lineY);
        context.fillStyle = PAGE_BACKGROUND;
        context.fillText(line, geometry.cx, lineY);
      } else {
        context.fillStyle = INK;
        context.fillText(line, geometry.cx, lineY);
      }
    });

    context.restore();
  }
};

/** Render one full page. Missing or unloadable art degrades to empty frames. */
export const renderPageToCanvas = async (
  input: PageComposition,
): Promise<Result<HTMLCanvasElement>> => {
  const { layout, panels, assets } = input;
  const canvas = document.createElement("canvas");
  canvas.width = layout.pageSize.width;
  canvas.height = layout.pageSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return err(appError("storage-failed", "Canvas 2d context is unavailable"));
  }

  context.fillStyle = PAGE_BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const drawable = panels.filter((panel) => panel.index < layout.frames.length);
  for (const panel of drawable) {
    const frame = frameForPanelIndex(layout, panel.index);
    const x = frame.x * canvas.width;
    const y = frame.y * canvas.height;
    const width = frame.w * canvas.width;
    const height = frame.h * canvas.height;

    const asset = panel.imageAssetId ? assets[panel.imageAssetId] : undefined;
    const image =
      asset && asset.url.length > 0 ? await loadImage(asset.url) : null;

    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    if (image) {
      drawCover(context, image, x, y, width, height);
    } else {
      context.fillStyle = EMPTY_PANEL_FILL;
      context.fillRect(x, y, width, height);
    }
    drawBalloons(context, panel, x, y, width, height);
    context.restore();

    context.strokeStyle = INK;
    context.lineWidth = PANEL_BORDER_PX;
    context.strokeRect(
      x + PANEL_BORDER_PX / 2,
      y + PANEL_BORDER_PX / 2,
      width - PANEL_BORDER_PX,
      height - PANEL_BORDER_PX,
    );
  }

  return ok(canvas);
};

export const canvasToPngBlob = (
  canvas: HTMLCanvasElement,
): Promise<Result<Blob>> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(
        blob
          ? ok(blob)
          : err(appError("storage-failed", "Could not encode the page as PNG")),
      );
    }, "image/png");
  });

/** Render a page straight to a PNG blob. */
export const composePageBlob = async (
  input: PageComposition,
): Promise<Result<Blob>> => {
  const rendered = await renderPageToCanvas(input);
  if (!rendered.ok) return rendered;
  return canvasToPngBlob(rendered.value);
};

/**
 * Webtoon strip: every page scaled to the narrowest page's width and stacked
 * vertically into one tall canvas.
 */
export const composeWebtoonStrip = (
  pages: readonly HTMLCanvasElement[],
): Result<HTMLCanvasElement> => {
  if (pages.length === 0) {
    return err(appError("not-found", "No pages to stack"));
  }
  const targetWidth = Math.min(...pages.map((page) => page.width));
  const heights = pages.map((page) =>
    Math.round(page.height * (targetWidth / page.width)),
  );
  const strip = document.createElement("canvas");
  strip.width = targetWidth;
  strip.height = heights.reduce((total, height) => total + height, 0);
  const context = strip.getContext("2d");
  if (!context) {
    return err(appError("storage-failed", "Canvas 2d context is unavailable"));
  }
  context.fillStyle = PAGE_BACKGROUND;
  context.fillRect(0, 0, strip.width, strip.height);
  let offsetY = 0;
  pages.forEach((page, index) => {
    const height = heights[index] ?? 0;
    context.drawImage(page, 0, offsetY, targetWidth, height);
    offsetY += height;
  });
  return ok(strip);
};
