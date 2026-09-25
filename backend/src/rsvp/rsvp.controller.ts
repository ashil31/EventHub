import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ListAttendeesDto } from './dto/list-attendees.dto';
import { PaginatedAttendeesResponseDto } from './dto/paginated-attendees-response.dto';
import { RsvpResponseDto } from './dto/rsvp-response.dto';
import { RsvpStatusResponseDto } from './dto/rsvp-status-response.dto';
import { RsvpService } from './rsvp.service';

@ApiTags('rsvp')
@Controller('events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class RsvpController {
  constructor(private readonly rsvpService: RsvpService) {}

  @Get(':id/rsvp')
  @ApiOperation({
    summary: "Get the current user's RSVP status for an event",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: RsvpStatusResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid event id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<RsvpStatusResponseDto> {
    return this.rsvpService.getStatus(id, currentUser);
  }

  @Post(':id/rsvp')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join an event (reserve one attendee position)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, type: RsvpResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid event id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({
    status: 404,
    description: 'Event not found',
  })
  @ApiResponse({
    status: 409,
    description: "Already RSVP'd, event full, or event already started",
  })
  join(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<RsvpResponseDto> {
    return this.rsvpService.join(id, currentUser);
  }

  @Delete(':id/rsvp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel your RSVP for an event' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Cancelled' })
  @ApiResponse({ status: 400, description: 'Invalid event id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({
    status: 404,
    description: 'Event not found, or you are not attending it',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<void> {
    return this.rsvpService.cancel(id, currentUser);
  }

  @Get(':id/attendees')
  @ApiOperation({ summary: "List an event's attendees, earliest RSVP first" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: PaginatedAttendeesResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid event id or query parameters',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  listAttendees(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListAttendeesDto,
  ): Promise<PaginatedAttendeesResponseDto> {
    return this.rsvpService.listAttendees(id, query);
  }
}
