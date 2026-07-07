import { Cube } from "@phosphor-icons/react";

import { EmptyState } from "@/components/ui";

import { previzCopy } from "./copy";

/** 3d camera blocking per shot; the previz feature builds out from this stub. */
export const PrevizPage = () => (
  <div
    data-testid="page-previz"
    className="flex h-full items-center justify-center overflow-y-auto"
  >
    <EmptyState
      icon={Cube}
      title={previzCopy.empty.title}
      hint={previzCopy.empty.hint}
    />
  </div>
);
