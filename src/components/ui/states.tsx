import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: Icon;
  title: string;
  /** Tells the user how to populate the surface, never just "nothing here". */
  hint: string;
  action?: ReactNode;
};

export const EmptyState = ({ icon: IconComponent, title, hint, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    <IconComponent size={28} className="text-fg-muted" aria-hidden />
    <div>
      <p className="font-display text-base font-bold tracking-[-0.02em]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-fg-secondary">{hint}</p>
    </div>
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

type SkeletonProps = {
  /** Matches the final layout's shape; aspect for media, height for text rows. */
  className?: string;
};

export const Skeleton = ({ className = "" }: SkeletonProps) => (
  <div
    aria-hidden
    className={`animate-pulse bg-gradient-to-r from-ink-raised via-ink-hover to-ink-raised bg-[length:200%_100%] ${className}`}
  />
);

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger";
};

export const Badge = ({ children, tone = "neutral" }: BadgeProps) => {
  const toneClasses =
    tone === "accent"
      ? "border-accent-media/40 text-accent"
      : tone === "danger"
        ? "border-danger/40 text-danger"
        : "border-line-strong text-fg-secondary";
  return (
    <span
      className={`inline-flex h-6 items-center border px-2 text-xs ${toneClasses}`}
    >
      {children}
    </span>
  );
};
