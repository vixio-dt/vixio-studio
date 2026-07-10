import type { Balloon, BalloonKind } from "@/domain/types";

/**
 * Balloon geometry shared by the SVG lettering editor and the canvas
 * compositor. Everything is computed in panel pixel space from the balloon's
 * 0..1 fractions; shapes come out as SVG path data, which the compositor
 * replays through Path2D so the export matches the editor stroke for stroke.
 */

export const BALLOON_FONT_STACK = '"Space Grotesk", "Trebuchet MS", sans-serif';

/** Lettering ink and paper, shared by the editor overlay and the compositor. */
export const LETTERING_INK = "#101014";
export const LETTERING_PAPER = "#ffffff";

/** Lettering never drops below this size on the page, however small the box. */
const MIN_FONT_PX = 11;
const MAX_FONT_PX = 46;

/** Body-fit search: shrink the font this much per step until the text block
 * clears the panel or the size floor is hit. */
const FONT_FIT_STEP = 0.92;
const MAX_FONT_FIT_STEPS = 24;

/** Cloud and burst outlines bulge past their nominal radius; pad clamping by
 * this much so the drawn spikes and bumps stay inside the panel too. */
const BULGE_KINDS: readonly BalloonKind[] = ["thought", "burst"];
const BULGE_FACTOR = 1.22;

export type BalloonGeometry = {
  kind: BalloonKind;
  /** Balloon center in panel pixels. */
  cx: number;
  cy: number;
  /** Half extents of the body shape. */
  rx: number;
  ry: number;
  fontSize: number;
  lineHeight: number;
  /** Word-wrapped text lines, centered on (cx, cy). */
  lines: string[];
  /** SVG path data for the body; empty for sfx (outlined text only). */
  bodyPath: string;
  /** SVG path data for the tail; null when the kind has none. */
  tailPath: string | null;
  /** Whisper balloons stroke dashed. */
  dashed: boolean;
  strokeWidth: number;
};

/** Deterministic wrap by estimated character budget per line. */
export const wrapBalloonText = (text: string, maxChars: number): string[] => {
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [" "];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxChars || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Radius of an ellipse along a direction, for tail attachment points. */
const ellipseRadiusAt = (rx: number, ry: number, radians: number): number =>
  (rx * ry) /
  Math.sqrt((ry * Math.cos(radians)) ** 2 + (rx * Math.sin(radians)) ** 2);

const round = (value: number): number => Math.round(value * 100) / 100;

const ellipsePath = (cx: number, cy: number, rx: number, ry: number): string =>
  `M ${round(cx - rx)} ${round(cy)} ` +
  `A ${round(rx)} ${round(ry)} 0 1 0 ${round(cx + rx)} ${round(cy)} ` +
  `A ${round(rx)} ${round(ry)} 0 1 0 ${round(cx - rx)} ${round(cy)} Z`;

const rectPath = (cx: number, cy: number, rx: number, ry: number): string =>
  `M ${round(cx - rx)} ${round(cy - ry)} H ${round(cx + rx)} ` +
  `V ${round(cy + ry)} H ${round(cx - rx)} Z`;

/** Cloud: sample the ellipse and bow each segment outward with a quadratic. */
const cloudPath = (cx: number, cy: number, rx: number, ry: number): string => {
  const bumps = 10;
  const bulge = 1.22;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < bumps; i++) {
    const angle = (i / bumps) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  const first = points[0];
  if (!first) return ellipsePath(cx, cy, rx, ry);
  let path = `M ${round(first.x)} ${round(first.y)} `;
  for (let i = 0; i < bumps; i++) {
    const to = points[(i + 1) % bumps] ?? first;
    const midAngle = ((i + 0.5) / bumps) * Math.PI * 2;
    const controlX = cx + rx * bulge * Math.cos(midAngle);
    const controlY = cy + ry * bulge * Math.sin(midAngle);
    path += `Q ${round(controlX)} ${round(controlY)} ${round(to.x)} ${round(to.y)} `;
  }
  return `${path}Z`;
};

/** Burst: alternating outer and inner radii around the ellipse. */
const burstPath = (cx: number, cy: number, rx: number, ry: number): string => {
  const spikes = 12;
  const segments: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const scale = i % 2 === 0 ? 1.22 : 0.82;
    const x = cx + rx * scale * Math.cos(angle);
    const y = cy + ry * scale * Math.sin(angle);
    segments.push(`${i === 0 ? "M" : "L"} ${round(x)} ${round(y)}`);
  }
  return `${segments.join(" ")} Z`;
};

/** Speech tail: a triangle rooted on the ellipse edge, tip pointing outward. */
const speechTailPath = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angleDeg: number,
): string => {
  const angle = toRadians(angleDeg);
  const spread = toRadians(14);
  const tipDistance = ellipseRadiusAt(rx, ry, angle) * 1.55;
  const tipX = cx + tipDistance * Math.cos(angle);
  const tipY = cy + tipDistance * Math.sin(angle);
  const baseA = angle - spread;
  const baseB = angle + spread;
  const radiusA = ellipseRadiusAt(rx, ry, baseA) * 0.94;
  const radiusB = ellipseRadiusAt(rx, ry, baseB) * 0.94;
  return (
    `M ${round(cx + radiusA * Math.cos(baseA))} ${round(cy + radiusA * Math.sin(baseA))} ` +
    `L ${round(tipX)} ${round(tipY)} ` +
    `L ${round(cx + radiusB * Math.cos(baseB))} ${round(cy + radiusB * Math.sin(baseB))} Z`
  );
};

/** Thought tail: a trail of shrinking bubbles along the tail direction. */
const thoughtTailPath = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angleDeg: number,
  fontSize: number,
): string => {
  const angle = toRadians(angleDeg);
  const edge = ellipseRadiusAt(rx, ry, angle);
  const steps = [
    { distance: edge * 1.15, radius: fontSize * 0.42 },
    { distance: edge * 1.38, radius: fontSize * 0.28 },
    { distance: edge * 1.58, radius: fontSize * 0.16 },
  ];
  return steps
    .map(({ distance, radius }) => {
      const x = cx + distance * Math.cos(angle);
      const y = cy + distance * Math.sin(angle);
      return (
        `M ${round(x + radius)} ${round(y)} ` +
        `A ${round(radius)} ${round(radius)} 0 1 0 ${round(x - radius)} ${round(y)} ` +
        `A ${round(radius)} ${round(radius)} 0 1 0 ${round(x + radius)} ${round(y)} Z`
      );
    })
    .join(" ");
};

/** Half extents of the ellipse-shaped kinds need extra clearance so the text
 * block stays inside the curve, not just inside the bounding box. */
const isEllipseKind = (kind: BalloonKind): boolean =>
  kind === "speech" || kind === "thought" || kind === "whisper" || kind === "burst";

/** Text block and body half-extents for one font size, everything else fixed. */
const measureBody = (
  balloon: Balloon,
  bodyWidth: number,
  fontSize: number,
): { lineHeight: number; lines: string[]; rx: number; ry: number } => {
  const lineHeight = fontSize * 1.28;
  const textWidth = balloon.kind === "caption" ? bodyWidth * 0.9 : bodyWidth * 0.82;
  const maxChars = Math.max(4, Math.floor(textWidth / (fontSize * 0.56)));
  const lines = wrapBalloonText(balloon.text, maxChars);
  const textBlockHeight = lines.length * lineHeight;

  const rx = bodyWidth / 2;
  const ry = isEllipseKind(balloon.kind)
    ? textBlockHeight / 2 + fontSize * 0.9
    : textBlockHeight / 2 + fontSize * 0.55;
  return { lineHeight, lines, rx, ry };
};

/** Shift a center so its half-extent stays inside [0, total]; when the shape
 * is wider than the panel, centering is the best we can do. */
const clampCenter = (center: number, halfExtent: number, total: number): number => {
  if (total <= halfExtent * 2) return total / 2;
  return Math.min(Math.max(center, halfExtent), total - halfExtent);
};

/** Full geometry for one balloon over a panel of the given pixel size. The
 * body is always kept fully inside the panel: font size shrinks stepwise to
 * the floor first, then the center shifts inward as a last resort, so text
 * never slices at the panel border. */
export const layoutBalloon = (
  balloon: Balloon,
  panelWidth: number,
  panelHeight: number,
): BalloonGeometry => {
  const bodyWidth = Math.max(24, balloon.width * panelWidth);
  const isSfx = balloon.kind === "sfx";
  const fontScale = balloon.fontScale ?? 1;

  const baseFont = Math.min(
    MAX_FONT_PX,
    Math.max(MIN_FONT_PX, bodyWidth * 0.13),
  );
  let fontSize = Math.max(
    MIN_FONT_PX,
    (isSfx ? Math.min(MAX_FONT_PX * 2, baseFont * 1.9) : baseFont) * fontScale,
  );

  const bulge = BULGE_KINDS.includes(balloon.kind) ? BULGE_FACTOR : 1;
  let { lineHeight, lines, rx, ry } = measureBody(balloon, bodyWidth, fontSize);

  // Shrink the font stepwise until the text block's height clears the panel
  // or the size floor is reached; the body's width tracks the balloon's
  // width setting, not the font, so only height responds to shrinking.
  let step = 0;
  while (
    ry * bulge * 2 > panelHeight &&
    fontSize > MIN_FONT_PX &&
    step < MAX_FONT_FIT_STEPS
  ) {
    fontSize = Math.max(MIN_FONT_PX, fontSize * FONT_FIT_STEP);
    ({ lineHeight, lines, rx, ry } = measureBody(balloon, bodyWidth, fontSize));
    step += 1;
  }

  const cx = clampCenter(balloon.x * panelWidth, rx * bulge, panelWidth);
  const cy = clampCenter(balloon.y * panelHeight, ry * bulge, panelHeight);

  const tailAngle = balloon.tailAngle ?? 115;
  let bodyPath = "";
  let tailPath: string | null = null;
  switch (balloon.kind) {
    case "speech":
      bodyPath = ellipsePath(cx, cy, rx, ry);
      tailPath = speechTailPath(cx, cy, rx, ry, tailAngle);
      break;
    case "whisper":
      bodyPath = ellipsePath(cx, cy, rx, ry);
      break;
    case "thought":
      bodyPath = cloudPath(cx, cy, rx, ry);
      tailPath = thoughtTailPath(cx, cy, rx, ry, tailAngle, fontSize);
      break;
    case "burst":
      bodyPath = burstPath(cx, cy, rx, ry);
      break;
    case "caption":
      bodyPath = rectPath(cx, cy, rx, ry);
      break;
    case "sfx":
      bodyPath = "";
      break;
  }

  return {
    kind: balloon.kind,
    cx,
    cy,
    rx,
    ry,
    fontSize,
    lineHeight,
    lines,
    bodyPath,
    tailPath,
    dashed: balloon.kind === "whisper",
    strokeWidth: Math.max(1.5, fontSize * 0.09),
  };
};

/** Cycled offsets so sequential spawns fan out instead of landing on top of
 * each other; both manual adds and dialogue import share this. */
const SPAWN_OFFSETS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 },
  { dx: 0.14, dy: 0.1 },
  { dx: -0.14, dy: 0.1 },
  { dx: 0.14, dy: -0.1 },
  { dx: -0.14, dy: -0.1 },
  { dx: 0, dy: 0.2 },
];

const clampFraction = (value: number): number => Math.min(0.92, Math.max(0.08, value));

/**
 * Spawn position for the nth new balloon at a base point, cycling through a
 * fixed set of offsets so a run of new balloons fans out across the panel
 * instead of stacking dead center.
 */
export const spawnBalloonPosition = (
  baseX: number,
  baseY: number,
  index: number,
): { x: number; y: number } => {
  const offset = SPAWN_OFFSETS[index % SPAWN_OFFSETS.length] ?? SPAWN_OFFSETS[0]!;
  return { x: clampFraction(baseX + offset.dx), y: clampFraction(baseY + offset.dy) };
};
