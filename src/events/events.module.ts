import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
  // RsvpModule (Phase 5) reuses EventsRepository — specifically
  // findByIdForUpdate/countAttendees — rather than duplicating the "lock
  // the event row" logic in a second place.
  exports: [EventsRepository],
})
export class EventsModule {}
