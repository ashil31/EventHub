import { cn } from '../../../lib/utils/cn';
import type { Event } from '../../../types/event';

interface EventDetailHeaderProps {
  event: Event;
}

/** The page's one primary heading (§26) — only rendered on a successful
 * load, since it's the actual event title; loading/error/not-found
 * states supply their own heading instead of this one. */
export function EventDetailHeader({ event }: EventDetailHeaderProps) {
  const isFull = event.availableSpots <= 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <h1 className="text-2xl font-bold break-words text-foreground sm:text-3xl">
        {event.title}
      </h1>
      <span
        className={cn(
          'inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium',
          isFull ? 'bg-muted/15 text-muted' : 'bg-primary/10 text-primary',
        )}
      >
        {isFull
          ? 'Full'
          : `${event.availableSpots} spot${event.availableSpots === 1 ? '' : 's'} left`}
      </span>
    </div>
  );
}
