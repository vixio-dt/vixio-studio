import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Width preset; panels stay narrow, wizards get room. */
  width?: "md" | "lg";
};

export const Dialog = ({ open, onClose, title, children, width = "md" }: DialogProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-canvas/80 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[85dvh] w-full ${width === "lg" ? "max-w-2xl" : "max-w-lg"} flex-col border border-line-strong bg-ink-panel shadow-[0_24px_80px_rgba(0,0,0,0.5)]`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-bold tracking-[-0.02em]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center text-fg-muted transition-colors hover:bg-ink-hover hover:text-fg"
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
