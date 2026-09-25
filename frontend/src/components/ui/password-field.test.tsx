import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PasswordField } from './password-field';

describe('PasswordField', () => {
  it('masks the value by default', () => {
    render(<PasswordField label="Password" />);
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('reveals the value when the toggle is clicked, and re-masks on a second click', async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Password" />);

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('is a type="button" so it can never submit the surrounding form', () => {
    render(<PasswordField label="Password" />);
    expect(
      screen.getByRole('button', { name: 'Show password' }),
    ).toHaveAttribute('type', 'button');
  });

  it('wires the error message with role="alert" and aria-describedby', () => {
    render(<PasswordField label="Password" error="Password is required" />);
    const input = screen.getByLabelText('Password');
    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent('Password is required');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
  });
});
