import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-media text-ink-canvas font-semibold hover:bg-accent disabled:hover:bg-accent-media",
  ghost:
    "bg-transparent text-fg-secondary hover:bg-ink-hover hover:text-fg",
  outline:
    "bg-transparent text-fg border border-line-strong hover:bg-ink-hover",
  danger:
    "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export const Button = ({
  variant = "ghost",
  size = "md",
  busy = false,
  children,
  className = "",
  disabled,
  type,
  ...rest
}: ButtonProps) => (
  <button
    type={type ?? "button"}
    disabled={disabled || busy}
    className={`inline-flex select-none items-center justify-center gap-2 whitespace-nowrap transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    {...rest}
  >
    {busy ? <BusyDots /> : null}
    {children}
  </button>
);

/** Inline activity indicator for buttons; full-surface loading uses Skeleton. */
export const BusyDots = () => (
  <span className="inline-flex items-center gap-1" aria-hidden>
    <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
    <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
    <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
  </span>
);
