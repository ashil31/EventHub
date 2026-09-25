import type { InputHTMLAttributes, SVGProps } from 'react';
import { useId, useState } from 'react';
import { cn } from '../../lib/utils/cn';
import { Input } from './input';
import { Label } from './label';

interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label: string;
  error?: string;
}

function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.3 17.3 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

/**
 * `Field`'s exact label/error/id wiring (§ 38), for the one input shape
 * that needs an extra control inside it — the show/hide toggle. Kept as
 * its own component rather than growing `Field` with a `type="password"`
 * special case, since every other caller of `Field` genuinely has no use
 * for it.
 */
export function PasswordField({
  label,
  error,
  id,
  className,
  ...inputProps
}: PasswordFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <Input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          invalid={Boolean(error)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn('pr-10', className)}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-muted hover:text-foreground"
        >
          {visible ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </button>
      </div>
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
