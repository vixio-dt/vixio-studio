import { PaintBrush } from "@phosphor-icons/react";

import { EmptyState } from "@/components/ui";

import { panelLabCopy } from "./copy";

/** One panel at a time, artcraft-style; the panel lab feature builds out from this stub. */
export const PanelLabPage = () => (
  <div
    data-testid="page-panellab"
    className="flex h-full items-center justify-center overflow-y-auto"
  >
    <EmptyState
      icon={PaintBrush}
      title={panelLabCopy.empty.title}
      hint={panelLabCopy.empty.hint}
    />
  </div>
);
