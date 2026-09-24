import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RsvpController } from './rsvp.controller';
import { RsvpRepository } from './rsvp.repository';
import { RsvpService } from './rsvp.service';

@Module({
  // For EventsRepository — the row-lock/attendee-count logic RsvpService
  // shares with EventsService's capacity-update path (see EventsModule).
  imports: [EventsModule],
  controllers: [RsvpController],
  providers: [RsvpService, RsvpRepository],
})
export class RsvpModule {}
