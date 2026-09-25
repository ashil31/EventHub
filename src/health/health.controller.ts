import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthService,
  LivenessStatus,
  ReadinessStatus,
} from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness check',
    description: 'Is the process alive? No dependency checks.',
  })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  liveness(): LivenessStatus {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description:
      'Can this instance serve requests? Verifies PostgreSQL connectivity.',
  })
  @ApiResponse({ status: 200, description: 'Ready to serve requests' })
  @ApiResponse({ status: 503, description: 'Database unreachable' })
  readiness(): Promise<ReadinessStatus> {
    return this.healthService.readiness();
  }
}
