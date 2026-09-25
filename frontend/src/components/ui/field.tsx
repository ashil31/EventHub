import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { Input } from './input';
import { Label } from './label';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/**
 * Wires one label + one input + one error message together with a single
 * generated id, so every form field in the app gets the same
 * label-for/aria-invalid/aria-describedby association automatically
 * (§ 38) instead of each form re-deriving it by hand. This earns its
 * place as a component: it's the one reusable accessibility pattern every
 * form field needs, not a one-HTML-element wrapper.
 */
export function Field({ label, error, id, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        invalid={Boolean(error)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
