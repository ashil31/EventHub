import { useEffect, useState } from 'react';
import { Input } from '../../../components/ui/input';

const DEBOUNCE_MS = 400;

interface EventSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Local interaction state (`draft`, keystroke-by-keystroke) is kept
 * separate from URL state (`value`, committed after a pause) so typing
 * feels instant while the actual query/URL update — and therefore the
 * network request — only fires once the user pauses (§ 8). This is the
 * one small, deliberate exception to "no `useEffect` for synchronizing
 * state": there is no server data being mirrored here, just a debounce
 * timer, which is a genuine side effect.
 */
export function EventSearchInput({ value, onChange }: EventSearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [committedValue, setCommittedValue] = useState(value);

  // Adjusting state during render (react.dev's documented alternative to
  // an effect for "reset state when a prop changes"): follows external
  // changes to the committed value — the "Clear search" action elsewhere
  // on the page, or browser back/forward — without fighting the debounce
  // commit below (that commit sets `value` to what `draft` already is, so
  // this is a no-op in the common typing case).
  if (value !== committedValue) {
    setCommittedValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timeout = setTimeout(() => onChange(draft), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [draft, value, onChange]);

  return (
    <div className="w-full sm:max-w-xs">
      <label htmlFor="event-search" className="sr-only">
        Search events
      </label>
      <Input
        id="event-search"
        type="search"
        placeholder="Search events…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
}
