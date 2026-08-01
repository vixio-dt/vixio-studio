import type {
  DesignView,
  DesignViewStyleBlock,
  DesignViewSubBlock,
} from "../api";
import { KindChip, RawBlock } from "./shared";

/**
 * Design view: character entries with their marker-driven sub-blocks
 * (CORE / NEGATIVE / VARIANT payloads verbatim in monospace), then sets,
 * props, and the stale STYLE BLOCK A/B entries. Style blocks always wear a
 * prominent SUPERSEDED badge — they exist for provenance and must never be
 * mistaken for the live style lock.
 */

const subBlockTone = (kind: string): "neutral" | "accent" | "danger" => {
  if (kind === "core") return "accent";
  if (kind === "negative") return "danger";
  return "neutral";
};

const SubBlockCard = ({ block }: { block: DesignViewSubBlock }) => (
  <div className="border border-line bg-ink-canvas p-3">
    <header className="flex flex-wrap items-center gap-2">
      <KindChip label={block.kind.toUpperCase()} tone={subBlockTone(block.kind)} />
      <span className="font-mono text-xs text-fg-secondary">{block.label}</span>
    </header>
    <RawBlock text={block.payloadRaw} className="mt-2" />
  </div>
);

const StyleBlockCard = ({ block }: { block: DesignViewStyleBlock }) => (
  <div className="border border-danger/40 bg-ink-canvas p-3">
    <header className="flex flex-wrap items-center gap-2">
      <span
        data-testid="library-design-superseded"
        className="inline-flex h-6 items-center bg-danger px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-canvas"
      >
        Superseded
      </span>
      <span className="font-mono text-[13px] font-medium">{block.label}</span>
      {block.gloss !== undefined && block.gloss !== null ? (
        <span className="font-mono text-xs text-fg-muted">（{block.gloss}）</span>
      ) : null}
    </header>
    <p className="mt-1.5 text-xs text-fg-muted">
      Stale — the live style lock is production-pipeline-spec §8. Never compile
      this block.
    </p>
    {block.payloadRaw !== undefined ? (
      <RawBlock text={block.payloadRaw} className="mt-2 opacity-60" />
    ) : null}
  </div>
);

export const DesignDocView = ({ view }: { view: DesignView }) => {
  const characters = view.characters ?? [];
  const sets = view.sets ?? [];
  const props = view.props ?? [];
  const styleBlocks = view.styleBlocks ?? [];
  return (
    <div data-testid="library-view-design" className="flex flex-col gap-8">
      {characters.length > 0 ? (
        <section aria-label="Characters" className="flex flex-col gap-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-fg-muted">
            Characters
          </h2>
          {characters.map((character, index) => (
            <article key={index} className="border border-line bg-ink-panel">
              <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <span className="font-mono text-xs text-fg-muted">
                  {character.ordinal !== undefined ? `${character.ordinal}.` : ""}
                </span>
                <h3 className="font-display text-sm font-bold tracking-[-0.02em]">
                  {character.nameLiteral}
                </h3>
                {character.qualifier !== undefined && character.qualifier !== null ? (
                  <span className="font-mono text-xs text-fg-muted">
                    （{character.qualifier}）
                  </span>
                ) : null}
              </header>
              <div className="flex flex-col gap-3 p-3">
                {(character.subBlocks ?? []).map((block, blockIndex) => (
                  <SubBlockCard key={blockIndex} block={block} />
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {sets.length > 0 ? (
        <section aria-label="Sets" className="flex flex-col gap-3">
          <h2 className="font-mono text-xs uppercase tracking-wide text-fg-muted">
            Sets
          </h2>
          {sets.map((set, index) => (
            <article key={index} className="border border-line bg-ink-panel p-3">
              <header className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] font-medium">
                  {set.nameLiteral}
                </span>
                {set.gloss !== undefined && set.gloss !== null ? (
                  <span className="font-mono text-xs text-fg-muted">
                    （{set.gloss}）
                  </span>
                ) : null}
              </header>
              {set.payloadRaw !== undefined ? (
                <RawBlock text={set.payloadRaw} className="mt-2" />
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {props.length > 0 ? (
        <section aria-label="Props" className="flex flex-col gap-3">
          <h2 className="font-mono text-xs uppercase tracking-wide text-fg-muted">
            Props
          </h2>
          {props.map((prop, index) => (
            <article key={index} className="border border-line bg-ink-panel p-3">
              <span className="font-mono text-[13px] font-medium">
                {prop.nameLiteral}
              </span>
              {prop.payloadRaw !== undefined ? (
                <RawBlock text={prop.payloadRaw} className="mt-2" />
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {styleBlocks.length > 0 ? (
        <section aria-label="Style blocks" className="flex flex-col gap-3">
          <h2 className="font-mono text-xs uppercase tracking-wide text-fg-muted">
            Style blocks
          </h2>
          {styleBlocks.map((block, index) => (
            <StyleBlockCard key={index} block={block} />
          ))}
        </section>
      ) : null}
    </div>
  );
};
