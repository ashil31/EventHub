import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// jsdom doesn't implement HTMLDialogElement.showModal()/close() (as of
// jsdom 30 — confirmed while adding the Dialog primitive in Phase 7).
// `open` is a normal reflected boolean attribute, which jsdom already
// handles generically, so these two shims are all that's missing for
// components using the native <dialog> element to work under jsdom.
if (
  typeof HTMLDialogElement !== 'undefined' &&
  !HTMLDialogElement.prototype.showModal
) {
  HTMLDialogElement.prototype.showModal = function (
    this: HTMLDialogElement,
  ): void {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement): void {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
