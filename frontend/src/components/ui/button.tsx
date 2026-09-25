import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary:
    'border border-secondary-border bg-secondary text-secondary-foreground hover:bg-secondary-hover',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
};

/**
 * The one UI primitive Phase 1 actually needs (§ 20) — a real, reusable
 * visual pattern used by the error boundary and every future form/action.
 * Not extended with props nothing calls yet (no `size`, no `asChild`);
 * those get added when a real caller needs them.
 */
export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
