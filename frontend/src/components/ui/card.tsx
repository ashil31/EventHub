import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

/** A single, genuinely reusable surface — the auth cards today, any
 * future panel-shaped content later. Not a whole sub-component family
 * (CardHeader/CardBody/CardFooter) since nothing here needs that yet. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
