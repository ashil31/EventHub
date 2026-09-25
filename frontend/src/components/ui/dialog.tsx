import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A thin wrapper around the native `<dialog>` element — the "small
 * accessible implementation" the phase brief asks for when no dialog
 * primitive exists yet (§27), rather than a custom-built modal system.
 * `showModal()`/`close()` give correct modal semantics for free: focus
 * moves inside and is trapped there, Escape closes it (fires `cancel`
 * then `close`), background content becomes inert to assistive tech —
 * none of that is reimplemented here.
 *
 * The imperative `showModal()`/`close()` calls only run inside a
 * `useEffect` because they're the one thing here that isn't React state
 * — synchronizing a boolean prop with a non-React DOM widget's own
 * open/closed state is a legitimate effect, not server-state mirroring.
 */
export function Dialog({ open, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="w-[min(90vw,28rem)] rounded-xl border border-border bg-card p-6 text-left text-foreground shadow-lg"
    >
      {children}
    </dialog>
  );
}
