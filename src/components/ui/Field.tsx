import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

/**
 * Form discipline: label above input, helper text in markup, error below.
 * Every control passes WCAG AA against the panel surface.
 */

type FieldProps = {
  label: string;
  helper?: string;
  error?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
};

export const Field = ({ label, helper, error, children }: FieldProps) => {
  const inputId = useId();
  const helperId = useId();
  const errorId = useId();
  const describedBy =
    [helper ? helperId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[13px] font-medium text-fg-secondary">
        {label}
      </label>
      {children({ inputId, describedBy })}
      {helper && !error ? (
        <p id={helperId} className="text-xs text-fg-muted">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const CONTROL_CLASSES =
  "w-full bg-ink-canvas border border-line-strong px-3 text-sm text-fg placeholder:text-fg-muted focus:border-accent-media focus:outline-none transition-colors duration-150";

export const TextInput = ({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={`h-10 ${CONTROL_CLASSES} ${className}`} {...rest} />
);

export const TextArea = ({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={`min-h-24 py-2.5 leading-relaxed ${CONTROL_CLASSES} ${className}`}
    {...rest}
  />
);

export const Select = ({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={`h-10 appearance-none ${CONTROL_CLASSES} ${className}`} {...rest}>
    {children}
  </select>
);
