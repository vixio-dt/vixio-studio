/** Small shared pieces for the parsed document views. */

/** Verbatim text: monospace, whitespace preserved exactly, soft-wrapped. */
export const RawBlock = ({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) => (
  <pre
    className={`whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-fg ${className}`}
  >
    {text}
  </pre>
);

/** Field/kind label chip, monospace so CJK markers align. */
export const KindChip = ({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "danger";
}) => {
  const toneClasses =
    tone === "accent"
      ? "border-accent-media/40 text-accent"
      : tone === "danger"
        ? "border-danger/40 text-danger"
        : "border-line-strong text-fg-secondary";
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center border px-1.5 font-mono text-[11px] ${toneClasses}`}
    >
      {label}
    </span>
  );
};
