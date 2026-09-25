/**
 * Joins class names, dropping falsy values — the minimal version of the
 * clsx/tailwind-merge combo. No conflicting-Tailwind-class deduplication
 * yet because nothing in this codebase produces conflicting classes;
 * revisit if a real conflict shows up.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(' ');
}
