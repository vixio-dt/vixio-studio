import { aspectRatioToDimensions } from "@/domain/constants";
import { createRng, pickFrom } from "@/lib/random";
import { appError, err, ok } from "@/lib/result";
import { sleep } from "@/lib/time";

import type { ImageProvider } from "../types";

/**
 * Offline preview renderer. Paints a designed cinematic placeholder frame
 * instead of calling a model: the project style's grade colors drive a
 * layered diagonal gradient, a seeded key light sits on a thirds line,
 * silhouetted landforms build depth, and film grain plus a vignette finish
 * the treatment. The same seed always paints the same frame.
 */

type Rng = () => number;
type Rgb = { r: number; g: number; b: number };

const previewImageCopy = {
  canvasUnavailable: "A 2d drawing context could not be created for the preview frame",
} as const;

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

const hexToRgb = (hex: string, fallback: Rgb): Rgb => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (digits === undefined) return fallback;
  const value = parseInt(digits, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

const rgba = (color: Rgb, alpha: number): string =>
  `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;

/* ------------------------------------------------------------------ */
/* Paint passes                                                        */
/* ------------------------------------------------------------------ */

/** Layered diagonal grade between the style's two stops. */
const paintGrade = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  from: Rgb,
  to: Rgb,
  rng: Rng,
): void => {
  const flip = rng() < 0.5;
  const drift = (rng() - 0.5) * width * 0.4;
  const base = ctx.createLinearGradient(
    flip ? width : 0,
    -height * 0.1,
    (flip ? 0 : width) + drift,
    height * 1.1,
  );
  base.addColorStop(0, rgba(mix(from, BLACK, 0.25), 1));
  base.addColorStop(0.45 + rng() * 0.15, rgba(mix(from, to, 0.45), 1));
  base.addColorStop(1, rgba(to, 1));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, rgba(mix(to, WHITE, 0.15), 0.16));
  wash.addColorStop(1, rgba(mix(from, BLACK, 0.4), 0.34));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
};

/** Seeded key light glow placed on a rule-of-thirds intersection. */
const paintKeyLight = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  to: Rgb,
  rng: Rng,
): void => {
  const centerX = pickFrom([1 / 3, 2 / 3] as const, rng) * width + (rng() - 0.5) * width * 0.08;
  const centerY = height * (0.28 + rng() * 0.14);
  const radius = Math.max(width, height) * (0.45 + rng() * 0.25);
  const glowColor = mix(to, WHITE, 0.35);
  const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  glow.addColorStop(0, rgba(glowColor, 0.5));
  glow.addColorStop(0.4, rgba(glowColor, 0.16));
  glow.addColorStop(1, rgba(glowColor, 0));
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
};

/** Two to four translucent landform layers built from seeded bezier ridges. */
const paintSilhouettes = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  from: Rgb,
  rng: Rng,
): void => {
  const dark = mix(from, BLACK, 0.55);
  const layers = 2 + Math.floor(rng() * 3);

  for (let layer = 0; layer < layers; layer++) {
    const depth = (layer + 1) / layers;
    const baseY = height * (0.5 + depth * 0.32 + rng() * 0.05);
    ctx.fillStyle = rgba(mix(dark, BLACK, depth * 0.4), 0.35 + depth * 0.35);
    ctx.beginPath();
    let x = -width * 0.06;
    let y = baseY + (rng() - 0.5) * height * 0.08;
    ctx.moveTo(x, y);
    const segments = 3 + Math.floor(rng() * 2);
    for (let segment = 0; segment < segments; segment++) {
      const nextX = x + (width * 1.12) / segments;
      const nextY = baseY + (rng() - 0.5) * height * 0.16 * (1.1 - depth * 0.5);
      ctx.bezierCurveTo(
        x + (nextX - x) * (0.3 + rng() * 0.15),
        y - rng() * height * 0.1,
        x + (nextX - x) * (0.6 + rng() * 0.15),
        nextY + (rng() - 0.5) * height * 0.08,
        nextX,
        nextY,
      );
      x = nextX;
      y = nextY;
    }
    ctx.lineTo(width * 1.06, height * 1.1);
    ctx.lineTo(-width * 0.06, height * 1.1);
    ctx.closePath();
    ctx.fill();
  }

  // Some seeds add a distant standing form on a thirds line.
  if (rng() < 0.6) {
    const formX = pickFrom([1 / 3, 2 / 3] as const, rng) * width + (rng() - 0.5) * width * 0.05;
    const formWidth = width * (0.022 + rng() * 0.026);
    const topY = height * (0.42 + rng() * 0.12);
    ctx.fillStyle = rgba(mix(dark, BLACK, 0.5), 0.8);
    ctx.beginPath();
    ctx.moveTo(formX - formWidth, height);
    ctx.bezierCurveTo(
      formX - formWidth * 0.9,
      height * 0.75,
      formX - formWidth * 0.45,
      topY + formWidth * 2.2,
      formX - formWidth * 0.35,
      topY + formWidth,
    );
    ctx.quadraticCurveTo(formX, topY, formX + formWidth * 0.35, topY + formWidth);
    ctx.bezierCurveTo(
      formX + formWidth * 0.45,
      topY + formWidth * 2.2,
      formX + formWidth * 0.9,
      height * 0.75,
      formX + formWidth,
      height,
    );
    ctx.closePath();
    ctx.fill();
  }
};

/** Fine film grain: noise on a half-size buffer scaled up at ~5% alpha. */
const paintGrain = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rng: Rng,
): void => {
  const buffer = document.createElement("canvas");
  buffer.width = Math.max(1, Math.floor(width / 2));
  buffer.height = Math.max(1, Math.floor(height / 2));
  const bufferCtx = buffer.getContext("2d");
  if (bufferCtx === null) return;
  const imageData = bufferCtx.createImageData(buffer.width, buffer.height);
  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    const value = Math.floor(rng() * 256);
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }
  bufferCtx.putImageData(imageData, 0, 0);
  ctx.globalAlpha = 0.05;
  ctx.drawImage(buffer, 0, 0, width, height);
  ctx.globalAlpha = 1;
};

const paintVignette = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void => {
  const centerX = width / 2;
  const centerY = height / 2;
  const vignette = ctx.createRadialGradient(
    centerX,
    centerY,
    Math.min(width, height) * 0.35,
    centerX,
    centerY,
    Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
};

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const previewImageProvider: ImageProvider = {
  id: "vixio-preview",
  name: "Vixio preview renderer",

  generateImage: async (request, onProgress) => {
    const { width, height } = aspectRatioToDimensions(request.aspectRatio);
    const rng = createRng(request.seed);
    const pace = createRng(request.seed ^ 0x5f356495);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return err(appError("provider-request-failed", previewImageCopy.canvasUnavailable));
    }

    const from = hexToRgb(request.style.gradeFrom, { r: 28, g: 39, b: 51 });
    const to = hexToRgb(request.style.gradeTo, { r: 140, g: 154, b: 168 });

    await sleep(320 + Math.floor(pace() * 140));
    onProgress(0.2);
    paintGrade(ctx, width, height, from, to, rng);
    paintKeyLight(ctx, width, height, to, rng);

    await sleep(320 + Math.floor(pace() * 140));
    onProgress(0.5);
    paintSilhouettes(ctx, width, height, from, rng);

    await sleep(320 + Math.floor(pace() * 140));
    onProgress(0.8);
    paintGrain(ctx, width, height, rng);
    paintVignette(ctx, width, height);

    await sleep(240 + Math.floor(pace() * 120));
    return ok({ url: canvas.toDataURL("image/png"), width, height });
  },
};
