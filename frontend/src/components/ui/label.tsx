import type { LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * A generic primitive — the a11y rule below can't see that every real
 * caller (`Field`, the one thing that renders this) always passes
 * `htmlFor` via the spread; that association is enforced there, not
 * statically visible here.
 */
export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      className={cn(
        'mb-1.5 block text-sm font-medium text-foreground',
        className,
      )}
      {...props}
    />
  );
}
