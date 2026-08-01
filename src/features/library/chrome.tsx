import { ArrowLeft } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { BusyDots } from "@/components/ui";

/**
 * Shared chrome for the library pages: the same quiet full-page layout as
 * Settings — sticky hairlined top bar with a back link, centered column.
 * The library reads long-form text, so the column is wider than Settings'.
 */

export type Loadable<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

type LibraryPageProps = {
  backTo: string;
  backLabel: string;
  title: string;
  /** Extra top-bar content, right-aligned. */
  actions?: ReactNode;
  children: ReactNode;
};

export const LibraryPage = ({
  backTo,
  backLabel,
  title,
  actions,
  children,
}: LibraryPageProps) => (
  <div className="min-h-dvh bg-ink-canvas">
    <header className="sticky top-0 z-10 border-b border-line bg-ink-panel">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-3 px-4">
        <Link
          to={backTo}
          className="flex h-9 shrink-0 items-center gap-2 px-2 text-sm text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
        >
          <ArrowLeft size={16} aria-hidden />
          {backLabel}
        </Link>
        <span className="h-4 w-px shrink-0 bg-line" aria-hidden />
        <h1 className="min-w-0 truncate font-display text-base font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {actions ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
    <main className="mx-auto w-full max-w-4xl px-4 py-8">{children}</main>
  </div>
);

export const LoadingRow = ({ label }: { label: string }) => (
  <p
    role="status"
    className="inline-flex items-center gap-2 py-8 text-sm text-fg-muted"
  >
    <BusyDots />
    {label}
  </p>
);

export const ErrorRow = ({ message }: { message: string }) => (
  <p role="alert" className="border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
    {message}
  </p>
);
