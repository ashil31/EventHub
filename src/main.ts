import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// Event/RSVP payloads are small JSON objects; this bounds request size
// without constraining any legitimate use of the API.
const JSON_BODY_LIMIT = '100kb';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

  app.enableCors(buildCorsOptions(configService));

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);
}

function buildCorsOptions(configService: ConfigService): {
  origin: string[];
  credentials: boolean;
} {
  const frontendUrl = configService.get<string>('app.frontendUrl');
  const environment = configService.get<string>('app.environment');

  if (frontendUrl) {
    return { origin: [frontendUrl], credentials: true };
  }

  // Production with no FRONTEND_URL configured: deny all cross-origin
  // requests rather than defaulting to a wildcard. Development gets a
  // convenience allowlist for common local frontend ports.
  const allowedOrigins =
    environment === 'production'
      ? []
      : ['http://localhost:5173', 'http://localhost:3000'];

  return { origin: allowedOrigins, credentials: true };
}

void bootstrap();
