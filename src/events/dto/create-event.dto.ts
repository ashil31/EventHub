import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'Backend Engineering Meetup', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: 'A meetup for backend engineers.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'Ahmedabad', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location: string;

  @ApiProperty({
    example: '2026-10-10T10:00:00.000Z',
    description: 'ISO-8601, UTC.',
  })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({
    example: '2026-10-10T13:00:00.000Z',
    description: 'ISO-8601, UTC. Must be after startsAt.',
  })
  @IsISO8601()
  endsAt: string;

  @ApiProperty({ example: 100, minimum: 1 })
  @IsInt()
  @IsPositive()
  capacity: number;

  // Deliberately no `createdBy` field: the creator is always derived from
  // the authenticated JWT user (EventsController), never from the request
  // body. The global ValidationPipe's `forbidNonWhitelisted: true` (Phase 1)
  // rejects any request that tries to send one with a 400, rather than
  // silently dropping it.
}
