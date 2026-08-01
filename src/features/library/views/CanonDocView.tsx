import { EyeSlash } from "@phosphor-icons/react";

import type { CanonView, CanonViewSection } from "../api";
import { KindChip, RawBlock } from "./shared";

/**
 * Canon view: sections in file order, body verbatim. Never-ship sections are
 * structural: outside the author's drawer the server sends
 * `body: { redacted: true }` and this view renders a sealed placeholder —
 * the client never has the private text unless the drawer is open.
 */

const isRedacted = (
  body: CanonViewSection["body"],
): body is { redacted: true } =>
  typeof body === "object" && body !== null && body.redacted === true;

const SectionCard = ({ section }: { section: CanonViewSection }) => {
  const redacted = isRedacted(section.body);
  const neverShip = section.neverShip === true;
  return (
    <section
      className={`border bg-ink-panel ${
        neverShip ? "border-danger/40" : "border-line"
      }`}
    >
      <header
        className={`flex flex-wrap items-center gap-2 border-b px-4 py-3 ${
          neverShip ? "border-danger/40" : "border-line"
        }`}
      >
        <h2 className="font-display text-sm font-bold tracking-[-0.02em]">
          {section.headingRaw}
        </h2>
        {neverShip ? <KindChip label="永不入作品" tone="danger" /> : null}
      </header>
      {redacted ? (
        <div
          data-testid="library-canon-redacted"
          className="flex items-center gap-3 bg-danger/10 px-4 py-6"
        >
          <EyeSlash size={18} className="shrink-0 text-danger" aria-hidden />
          <p className="text-sm text-fg-secondary">
            Sealed. This section never ships — open the author&#39;s drawer to
            read it.
          </p>
        </div>
      ) : typeof section.body === "string" ? (
        <div className={`px-4 py-3 ${neverShip ? "bg-danger/5" : ""}`}>
          <RawBlock text={section.body} />
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-fg-muted">（此節無正文）</p>
      )}
    </section>
  );
};

export const CanonDocView = ({ view }: { view: CanonView }) => (
  <div data-testid="library-view-canon" className="flex flex-col gap-4">
    {(view.sections ?? []).length === 0 ? (
      <p className="text-sm text-fg-muted">This document has no sections.</p>
    ) : (
      (view.sections ?? []).map((section, index) => (
        <SectionCard key={index} section={section} />
      ))
    )}
  </div>
);
