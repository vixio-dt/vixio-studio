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

/** Full geometry for one balloon over a panel of the given pixel size. */
export const layoutBalloon = (
  balloon: Balloon,
  panelWidth: number,
  panelHeight: number,
): BalloonGeometry => {
  const cx = balloon.x * panelWidth;
  const cy = balloon.y * panelHeight;
  const bodyWidth = Math.max(24, balloon.width * panelWidth);

  const isSfx = balloon.kind === "sfx";
  const baseFont = Math.min(
    MAX_FONT_PX,
    Math.max(MIN_FONT_PX, bodyWidth * 0.13),
  );
  const fontSize = isSfx ? Math.min(MAX_FONT_PX * 2, baseFont * 1.9) : baseFont;
  const lineHeight = fontSize * 1.28;

  const textWidth = balloon.kind === "caption" ? bodyWidth * 0.9 : bodyWidth * 0.82;
  const maxChars = Math.max(4, Math.floor(textWidth / (fontSize * 0.56)));
  const lines = wrapBalloonText(balloon.text, maxChars);
  const textBlockHeight = lines.length * lineHeight;

  let rx = bodyWidth / 2;
  let ry = textBlockHeight / 2 + fontSize * 0.55;
  if (
    balloon.kind === "speech" ||
    balloon.kind === "thought" ||
    balloon.kind === "whisper" ||
    balloon.kind === "burst"
  ) {
    // Ellipses need extra room so the text block stays inside the curve.
    rx = bodyWidth / 2;
    ry = textBlockHeight / 2 + fontSize * 0.9;
  }

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
