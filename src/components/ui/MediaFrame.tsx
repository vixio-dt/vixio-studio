import type { ReactNode } from "react";

type MediaFrameProps = {
  /** "16:9" style ratio string drives the reserved space. */
  aspectRatio: string;
  children: ReactNode;
  /** Cyan live edge while a generation is in flight. */
  live?: boolean;
  className?: string;
};

const ratioToCss = (ratio: string): string => ratio.replace(":", " / ");

/**
 * The one sanctioned bezel in the app: media reads as a physical slide in a
 * tray. Reserved aspect space means zero layout shift when frames land.
 */
export const MediaFrame = ({
  aspectRatio,
  children,
  live = false,
  className = "",
}: MediaFrameProps) => (
  <div
    className={`bg-white/5 p-1.5 ring-1 ${
      live ? "ring-accent-media/60" : "ring-line"
    } ${className}`}
  >
    <div
      className="relative w-full overflow-hidden bg-ink-canvas"
      style={{ aspectRatio: ratioToCss(aspectRatio) }}
    >
      {children}
    </div>
  </div>
);
