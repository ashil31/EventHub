import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';

// PartialType wraps every inherited property with @IsOptional() (and
// carries over the Swagger metadata), so a request may supply any subset
// of fields without duplicating every validator here. Whichever fields
// ARE supplied are still validated the same way they are on create.
export class UpdateEventDto extends PartialType(CreateEventDto) {}
