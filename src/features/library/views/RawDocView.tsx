import { FileText, PencilSimple } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import { formatBytes, type RawView } from "../api";

/**
 * Raw view: the server has no parser for this document, so the wiki shows
 * the file's size and hands off to the byte-faithful editor.
 */
export const RawDocView = ({
  view,
  editHref,
}: {
  view: RawView;
  editHref: string;
}) => (
  <div
    data-testid="library-view-raw"
    className="flex flex-col items-center gap-3 border border-line bg-ink-panel px-6 py-16 text-center"
  >
    <FileText size={28} className="text-fg-muted" aria-hidden />
    <div>
      <p className="font-display text-base font-bold tracking-[-0.02em]">
        No parsed view for this file
      </p>
      <p className="mt-1 text-sm text-fg-secondary">
        {view.size !== undefined ? `${formatBytes(view.size)} on disk. ` : ""}
        Open it in the editor to read or change the exact bytes.
      </p>
    </div>
    <Link
      to={editHref}
      className="mt-2 inline-flex h-9 items-center gap-2 border border-line-strong px-3 text-sm transition-colors duration-150 hover:bg-ink-hover"
    >
      <PencilSimple size={16} aria-hidden />
      Open in editor
    </Link>
  </div>
);
