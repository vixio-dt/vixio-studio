import type { OpenQuestionsView } from "../api";
import { KindChip, RawBlock } from "./shared";

/**
 * Open-questions view: categories and items in exact file order — the file's
 * own ordering is meaningful (七之四 precedes 七之二), so nothing is sorted.
 * Items carry their inline state token (已定 / 已定・改) as a chip; items
 * without one are still open.
 */
export const OpenQuestionsDocView = ({ view }: { view: OpenQuestionsView }) => (
  <div data-testid="library-view-open-questions" className="flex flex-col gap-6">
    {(view.categories ?? []).length === 0 ? (
      <p className="text-sm text-fg-muted">No categories.</p>
    ) : (
      (view.categories ?? []).map((category, categoryIndex) => (
        <section
          key={categoryIndex}
          className="border border-line bg-ink-panel"
        >
          <h2 className="border-b border-line px-4 py-3 font-display text-sm font-bold tracking-[-0.02em]">
            {category.nameRaw}
          </h2>
          <ul className="divide-y divide-line">
            {(category.items ?? []).map((item, itemIndex) => (
              <li key={itemIndex} className="flex items-start gap-3 px-4 py-3">
                <span className="w-14 shrink-0 pt-0.5 text-right font-mono text-[13px] text-fg-secondary">
                  {item.ordinalRaw ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <RawBlock text={item.textRaw} />
                </div>
                {item.state !== undefined && item.state !== null ? (
                  <KindChip label={item.state} tone="accent" />
                ) : (
                  <KindChip label="待決" />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))
    )}
  </div>
);
