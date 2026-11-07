import { useId, type InputHTMLAttributes } from 'react';
import { focusRing } from './focus';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Says what went wrong and how to fix it. */
  error?: string;
  hint?: string;
}

/** Filled input with a label. No border; the focus ring is the only outline. */
export function Field({ label, error, hint, id, className = '', ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={`h-10 rounded-lg bg-sunk px-3 text-ink placeholder:text-faint ${focusRing}`}
        {...rest}
      />
      {note && (
        <p id={noteId} className={`text-sm ${error ? 'text-bad' : 'text-muted'}`}>
          {note}
        </p>
      )}
    </div>
  );
}
