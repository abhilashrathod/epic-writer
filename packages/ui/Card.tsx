import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
}

/** A filled tone block. No border: regions separate by tone. */
export function Card({ selected = false, className = '', ...rest }: CardProps) {
  const tone = selected ? 'bg-selected text-on-selected' : 'bg-surface text-ink';
  return (
    <div
      data-selected={selected || undefined}
      className={`rounded-xl p-4 transition-colors motion-reduce:transition-none ${tone} ${className}`}
      {...rest}
    />
  );
}
