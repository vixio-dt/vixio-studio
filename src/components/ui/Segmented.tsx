type SegmentedOption<TValue extends string> = {
  value: TValue;
  label: string;
};

type SegmentedProps<TValue extends string> = {
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  ariaLabel: string;
  size?: "sm" | "md";
};

/** Sharp-cornered segmented control for closed sets (aspect, format, mode). */
export const Segmented = <TValue extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: SegmentedProps<TValue>) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className="inline-flex border border-line-strong bg-ink-canvas"
  >
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(option.value)}
          className={`${size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3 text-[13px]"} whitespace-nowrap transition-colors duration-150 ${
            selected
              ? "bg-ink-hover text-fg"
              : "text-fg-muted hover:text-fg-secondary"
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
