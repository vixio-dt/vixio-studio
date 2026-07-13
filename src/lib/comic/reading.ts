import { ASPECT_RATIOS, aspectRatioToDimensions } from "@/domain/constants";
import type {
  AspectRatio,
  ComicLayout,
  ComicLayoutFrame,
  Panel,
  ReadingDirection,
} from "@/domain/types";

/**
 * Reading-direction helpers. COMIC_LAYOUTS frames are authored in
 * left-to-right reading order; a right-to-left book mirrors the x axis when
 * numbering and navigating, while the stored panel indexes stay untouched.
 */

const FALLBACK_FRAME: ComicLayoutFrame = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };

/** Frames on (nearly) the same row band compare by x; rows compare by y. */
const SAME_ROW_EPSILON = 0.02;

/** The layout frame a panel occupies; extra panels reuse the last frame. */
export const frameForPanelIndex = (
  layout: ComicLayout,
  panelIndex: number,
): ComicLayoutFrame => {
  const clamped = Math.max(0, Math.min(panelIndex, layout.frames.length - 1));
  return layout.frames[clamped] ?? FALLBACK_FRAME;
};

/**
 * Frame indexes in display (reading) order. Left-to-right is the authored
 * order; right-to-left keeps the row order and mirrors each row's x axis.
 */
export const readingOrderForLayout = (
  layout: ComicLayout,
  direction: ReadingDirection,
): number[] => {
  const indexes = layout.frames.map((_, position) => position);
  if (direction !== "rtl") return indexes;
  return [...indexes].sort((a, b) => {
    const frameA = layout.frames[a] ?? FALLBACK_FRAME;
    const frameB = layout.frames[b] ?? FALLBACK_FRAME;
    const rowDelta = frameA.y - frameB.y;
    if (Math.abs(rowDelta) > SAME_ROW_EPSILON) return rowDelta;
    // Mirror x: the rightmost frame of a row reads first.
    const mirroredA = 1 - (frameA.x + frameA.w);
    const mirroredB = 1 - (frameB.x + frameB.w);
    return mirroredA - mirroredB;
  });
};

/** 1-based display number for the panel sitting at a frame index. */
export const displayNumberForPanel = (
  layout: ComicLayout,
  direction: ReadingDirection,
  panelIndex: number,
): number => {
  const order = readingOrderForLayout(layout, direction);
  const position = order.indexOf(panelIndex);
  // Panels beyond the layout's frame count number after the framed ones.
  return position === -1 ? panelIndex + 1 : position + 1;
};

/** Panels sorted into display order; panels beyond the frames trail behind. */
export const orderPanelsForReading = (
  panels: readonly Panel[],
  layout: ComicLayout,
  direction: ReadingDirection,
): Panel[] => {
  const order = readingOrderForLayout(layout, direction);
  const rank = new Map(order.map((frameIndex, position) => [frameIndex, position]));
  return [...panels].sort(
    (a, b) =>
      (rank.get(a.index) ?? order.length + a.index) -
      (rank.get(b.index) ?? order.length + b.index),
  );
};

/* ------------------------------------------------------------------ */
/* Frame geometry                                                      */
/* ------------------------------------------------------------------ */

/** Pixel dimensions of one layout frame on its page. */
export const framePixelSize = (
  layout: ComicLayout,
  panelIndex: number,
): { width: number; height: number } => {
  const frame = frameForPanelIndex(layout, panelIndex);
  return {
    width: Math.max(1, Math.round(frame.w * layout.pageSize.width)),
    height: Math.max(1, Math.round(frame.h * layout.pageSize.height)),
  };
};

/** "451:676" style ratio string for MediaFrame, from the frame's pixel box. */
export const frameAspectString = (
  layout: ComicLayout,
  panelIndex: number,
): string => {
  const { width, height } = framePixelSize(layout, panelIndex);
  return `${width}:${height}`;
};

/**
 * The supported aspect ratio nearest to a frame's shape, compared on a log
 * scale so wide and tall frames deviate symmetrically.
 */
export const closestAspectRatio = (width: number, height: number): AspectRatio => {
  const target = Math.log(Math.max(width, 1) / Math.max(height, 1));
  let best: AspectRatio = ASPECT_RATIOS[0] ?? "1:1";
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of ASPECT_RATIOS) {
    const dims = aspectRatioToDimensions(candidate);
    const delta = Math.abs(Math.log(dims.width / dims.height) - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
};
