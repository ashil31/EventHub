import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EventFormValues } from '../schemas/event-schema';
import { EventForm } from './event-form';

function futureLocal(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const VALID_DEFAULTS: EventFormValues = {
  title: 'Backend Engineering Meetup',
  description: 'A meetup for backend engineers.',
  location: 'Ahmedabad',
  startsAt: futureLocal(24),
  endsAt: futureLocal(27),
  capacity: 50,
};

describe('EventForm — create mode', () => {
  it('renders create-mode labels and button text', () => {
    render(
      <EventForm
        mode="create"
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Create event' }),
    ).toBeInTheDocument();
  });

  it('shows field-level validation errors and does not call onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EventForm
        mode="create"
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Location is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with the entered values once the form is valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EventForm
        mode="create"
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Title'), VALID_DEFAULTS.title);
    await user.type(screen.getByLabelText('Location'), VALID_DEFAULTS.location);
    const capacityInput = screen.getByLabelText('Capacity');
    await user.clear(capacityInput);
    await user.type(capacityInput, '50');
    const startsInput = screen.getByLabelText('Starts');
    await user.type(startsInput, VALID_DEFAULTS.startsAt);
    const endsInput = screen.getByLabelText('Ends');
    await user.type(endsInput, VALID_DEFAULTS.endsAt);

    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [values] = onSubmit.mock.calls[0] as [EventFormValues];
    expect(values.title).toBe(VALID_DEFAULTS.title);
    expect(values.location).toBe(VALID_DEFAULTS.location);
    expect(values.capacity).toBe(50);
  });

  it('shows a cross-field error when end is before start', async () => {
    const user = userEvent.setup();
    render(
      <EventForm
        mode="create"
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Title'), 'x');
    await user.type(screen.getByLabelText('Location'), 'x');
    await user.type(screen.getByLabelText('Starts'), futureLocal(27));
    await user.type(screen.getByLabelText('Ends'), futureLocal(24));
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(
      await screen.findByText('Start must be before end'),
    ).toBeInTheDocument();
  });

  it('calls onCancel without submitting when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <EventForm
        mode="create"
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the pending label and disables the submit button while submitting', () => {
    render(
      <EventForm
        mode="create"
        isSubmitting
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('shows a server-level error banner when provided', () => {
    render(
      <EventForm
        mode="create"
        isSubmitting={false}
        serverError="We couldn't save this event. Please try again."
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't save this event. Please try again.",
    );
  });
});

describe('EventForm — edit mode', () => {
  it('pre-fills fields from defaultValues', () => {
    render(
      <EventForm
        mode="edit"
        defaultValues={VALID_DEFAULTS}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Title')).toHaveValue(VALID_DEFAULTS.title);
    expect(screen.getByLabelText('Location')).toHaveValue(
      VALID_DEFAULTS.location,
    );
    expect(screen.getByLabelText('Capacity')).toHaveValue(50);
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument();
  });

  it('disables Save changes until a field is actually edited', async () => {
    const user = userEvent.setup();
    render(
      <EventForm
        mode="edit"
        defaultValues={VALID_DEFAULTS}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), '!');

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('does not reject an unmodified past startsAt (edit schema has no not-in-past check)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EventForm
        mode="edit"
        defaultValues={{
          ...VALID_DEFAULTS,
          startsAt: futureLocal(-24),
          endsAt: futureLocal(-20),
        }}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Only touch capacity — the already-past startsAt is never edited.
    const capacityInput = screen.getByLabelText('Capacity');
    await user.clear(capacityInput);
    await user.type(capacityInput, '75');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
