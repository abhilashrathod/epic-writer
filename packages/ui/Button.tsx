import type { ButtonHTMLAttributes } from 'react';
import { focusRing } from './focus';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` is the one solid pill per screen; everything else is `quiet`. */
  variant?: 'primary' | 'quiet';
}

const variants = {
  primary: 'rounded-full bg-primary px-5 text-on-primary hover:opacity-90',
  quiet: 'rounded-md px-2 text-muted hover:text-ink',
};

export function Button({
  variant = 'quiet',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-9 items-center justify-center gap-2 text-sm font-medium transition-colors motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 ${focusRing} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
