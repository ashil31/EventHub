import { ApiProperty } from '@nestjs/swagger';

/**
 * Added during the frontend's Phase 6 (RSVP UI) — see
 * docs/specs/phase-5-rsvp.md's "Addendum" section for why. Deliberately
 * minimal: one boolean plus the one timestamp already tracked on
 * `EventAttendee`, nothing this endpoint's single indexed lookup
 * (`eventAttendee.findUnique` on `eventId_userId`) can't answer.
 */
export class RsvpStatusResponseDto {
  @ApiProperty({
    example: true,
    description:
      'Whether the authenticated user currently has an RSVP for this event.',
  })
  attending: boolean;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    nullable: true,
    description: 'When the user joined, or null if not attending.',
  })
  joinedAt: Date | null;
}
