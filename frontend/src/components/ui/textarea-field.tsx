import type { TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../../lib/utils/cn';
import { Label } from './label';

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

/** The `<textarea>` counterpart to `Field` (§10/§40 — a second, concrete
 * component earns its place here since a textarea genuinely isn't an
 * `<input>`; this is not a generic field-factory). Same label/error
 * wiring as `Field`, same visual language as `Input`. */
export function TextareaField({
  label,
  error,
  id,
  className,
  ...textareaProps
}: TextareaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <textarea
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground transition-colors',
          'placeholder:text-muted',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-destructive' : 'border-border',
          className,
        )}
        {...textareaProps}
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
