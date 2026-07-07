import { Export } from "@phosphor-icons/react";

import { EmptyState } from "@/components/ui";

import { comicExportCopy } from "./copy";

/** Lettered page export; the comic export feature builds out from this stub. */
export const ComicExportPage = () => (
  <div
    data-testid="page-comicexport"
    className="flex h-full items-center justify-center overflow-y-auto"
  >
    <EmptyState
      icon={Export}
      title={comicExportCopy.empty.title}
      hint={comicExportCopy.empty.hint}
    />
  </div>
);
