import { CaretDown } from "@phosphor-icons/react";

import type { ScriptView, ScriptViewPage, ScriptViewPanel } from "../api";
import { KindChip, RawBlock } from "./shared";

/**
 * Script view: a grid of page cards; each expands to its panels, every panel
 * listing its 畫/白/音/註 fields verbatim in monospace with the field kind
 * as a label. Nothing is re-wrapped or trimmed — `raw` is shown exactly.
 */

const pageLabel = (page: ScriptViewPage, index: number): string => {
  if (page.pageStart === undefined) return `頁塊 ${index + 1}`;
  return page.pageEnd !== undefined && page.pageEnd !== null
    ? `第${page.pageStart}至${page.pageEnd}頁`
    : `第${page.pageStart}頁`;
};

const panelLabel = (panel: ScriptViewPanel, index: number): string => {
  if (panel.ordinal !== undefined && panel.ordinal !== null) {
    return `格${panel.ordinal}`;
  }
  return panel.implicit ? `（隱格 ${index + 1}）` : `格 ${index + 1}`;
};

const PanelCard = ({
  panel,
  index,
}: {
  panel: ScriptViewPanel;
  index: number;
}) => (
  <article className="border border-line bg-ink-canvas p-3">
    <header className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[13px] font-medium">
        {panelLabel(panel, index)}
      </span>
      {panel.attrRaw ? (
        <span className="font-mono text-xs text-fg-muted">（{panel.attrRaw}）</span>
      ) : null}
    </header>
    <div className="mt-2 flex flex-col gap-2">
      {(panel.fields ?? []).map((field, fieldIndex) => (
        <div key={fieldIndex} className="flex items-start gap-2.5">
          <KindChip label={field.kind} tone={field.kind === "白" ? "accent" : "neutral"} />
          <div className="min-w-0 flex-1">
            {field.paren !== undefined && field.paren !== null ? (
              <span className="mr-1 font-mono text-xs text-fg-secondary">
                （{field.paren}）
              </span>
            ) : null}
            <RawBlock text={field.raw} className="inline-block w-full align-top" />
          </div>
        </div>
      ))}
    </div>
  </article>
);

export const ScriptDocView = ({ view }: { view: ScriptView }) => {
  const pages = view.pages ?? [];
  return (
    <div data-testid="library-view-script" className="flex flex-col gap-3">
      {pages.length === 0 ? (
        <p className="text-sm text-fg-muted">This script has no page blocks.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pages.map((page, pageIndex) => (
            <details
              key={pageIndex}
              data-testid="library-script-page"
              className="group border border-line bg-ink-panel open:sm:col-span-2"
            >
              <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 transition-colors duration-150 hover:bg-ink-hover [&::-webkit-details-marker]:hidden">
                <span className="font-display text-sm font-bold tracking-[-0.02em]">
                  {pageLabel(page, pageIndex)}
                </span>
                {page.attrRaw ? (
                  <span className="font-mono text-xs text-fg-muted">
                    （{page.attrRaw}）
                  </span>
                ) : null}
                <span className="ml-auto font-mono text-xs text-fg-muted">
                  {(page.panels ?? []).length} 格
                </span>
                <CaretDown
                  size={14}
                  className="shrink-0 text-fg-muted transition-transform duration-150 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="flex flex-col gap-3 border-t border-line p-3">
                {(page.panels ?? []).map((panel, panelIndex) => (
                  <PanelCard key={panelIndex} panel={panel} index={panelIndex} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
};
