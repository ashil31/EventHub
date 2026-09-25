import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * The one text-input primitive every form in this app uses. `invalid`
 * drives both the visual state and is meant to be passed alongside
 * `aria-invalid` at the call site (kept separate from `aria-invalid`
 * itself so a caller can't forget the visual half while wiring the a11y
 * half, or vice versa — see `field.tsx`, which wires both from one
 * source of truth).
 */
export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground transition-colors',
        'placeholder:text-muted',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-destructive' : 'border-border',
        className,
      )}
      {...props}
    />
  );
}
