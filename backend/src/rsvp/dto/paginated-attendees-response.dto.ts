import { ApiProperty } from '@nestjs/swagger';
import { AttendeeResponseDto } from './attendee-response.dto';

export class AttendeesPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 74 })
  total: number;

  @ApiProperty({ example: 4 })
  totalPages: number;
}

export class PaginatedAttendeesResponseDto {
  @ApiProperty({ type: [AttendeeResponseDto] })
  data: AttendeeResponseDto[];

  @ApiProperty({ type: AttendeesPaginationMetaDto })
  meta: AttendeesPaginationMetaDto;
}
