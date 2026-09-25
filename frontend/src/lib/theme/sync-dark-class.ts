/**
 * This app's own color tokens (`globals.css`) follow the OS-level
 * `prefers-color-scheme` media query directly — no JS-driven theme
 * toggle, by design (Phase 1 § 17). HeroUI's default theme doesn't key
 * off that media query at all: it keys off a `.dark` class (or
 * `data-theme="dark"` attribute) on the document, full stop — confirmed
 * by reading `@heroui/styles`' own theme CSS. Without this, HeroUI's
 * *own* dark-mode tokens (the date-picker popover's background chief
 * among them) would stay on their light values even when the system is
 * in dark mode, while the rest of the page correctly went dark.
 *
 * This is the one bridge between the two systems — it never presents a
 * toggle to the user, it only keeps `.dark` in sync with the exact same
 * OS preference this app has always followed.
 */
export function syncDarkClassWithSystemPreference(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function apply(matches: boolean): void {
    document.documentElement.classList.toggle('dark', matches);
  }

  apply(media.matches);
  media.addEventListener('change', (event) => apply(event.matches));
}
