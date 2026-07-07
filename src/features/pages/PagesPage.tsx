import { BookOpen } from "@phosphor-icons/react";

import { EmptyState } from "@/components/ui";

import { pagesCopy } from "./copy";

/** Comic page grid; the pages feature builds out from this stub. */
export const PagesPage = () => (
  <div
    data-testid="page-pages"
    className="flex h-full items-center justify-center overflow-y-auto"
  >
    <EmptyState
      icon={BookOpen}
      title={pagesCopy.empty.title}
      hint={pagesCopy.empty.hint}
    />
  </div>
);
