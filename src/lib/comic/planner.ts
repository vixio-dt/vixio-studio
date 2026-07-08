import { findComicLayout } from "@/domain/constants";
import type { ComicLayoutId, Scene } from "@/domain/types";

/**
 * Deterministic page planning: one page per scene, beats split from the
 * scene's text by sentence, layout chosen from the beat count. Same script
 * in, same book out.
 */

/** A planned page: the layout to create and one description per panel. */
export type PagePlan = {
  layoutId: ComicLayoutId;
  /** Panel descriptions in authored (ltr) frame order. */
  beats: string[];
};

/** Sentences end at ., !, ?, or a hard line break; screenplay noise drops out. */
const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 1);

/**
 * Beats for a scene: the summary sentences first, then the body's, deduped
 * and capped. A scene with no usable text still yields one beat so the page
 * never comes out empty.
 */
export const splitSceneIntoBeats = (scene: Scene, cap: number): string[] => {
  const seen = new Set<string>();
  const beats: string[] = [];
  for (const sentence of [
    ...splitSentences(scene.summary),
    ...splitSentences(scene.body),
  ]) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    beats.push(sentence);
    if (beats.length >= cap) break;
  }
  if (beats.length === 0) {
    beats.push(`Establishing view of ${scene.location || "the scene"}, ${scene.timeOfDay}`);
  }
  return beats;
};

/**
 * Layout heuristic by beat count: a single beat earns a splash, a handful
 * fills a grid, and long scenes compress into the nine panel grid.
 */
export const layoutForBeatCount = (count: number): ComicLayoutId => {
  if (count <= 1) return "splash";
  if (count <= 3) return "rows-3";
  if (count <= 4) return "grid-2x2";
  if (count <= 5) return "mixed-5";
  return "grid-3x3";
};

/** The largest frame count any layout offers; beats never split past it. */
const MAX_BEATS = 9;

/** Plan one page for a scene: pick the layout, then cap beats to its frames. */
export const planPageForScene = (scene: Scene): PagePlan => {
  const raw = splitSceneIntoBeats(scene, MAX_BEATS);
  const layoutId = layoutForBeatCount(raw.length);
  const frameCount = findComicLayout(layoutId).frames.length;
  return { layoutId, beats: raw.slice(0, frameCount) };
};
