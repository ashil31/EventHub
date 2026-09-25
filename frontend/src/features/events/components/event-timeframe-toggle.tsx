import { cn } from '../../../lib/utils/cn';
import type { EventTimeframe } from '../lib/event-search-params';

const OPTIONS: Array<{ value: EventTimeframe; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All events' },
];

interface EventTimeframeToggleProps {
  value: EventTimeframe;
  onChange: (value: EventTimeframe) => void;
}

export function EventTimeframeToggle({
  value,
  onChange,
}: EventTimeframeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Filter by timeframe"
      className="inline-flex rounded-md border border-border p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-3 py-1.5 text-sm font-medium transition-colors',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
