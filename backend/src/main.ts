import {
  Logger as NestLogger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  setupSwagger(app);

  app.enableShutdownHooks();

  // Explicit host bind: containers (Docker/Railway) route traffic to the
  // container's network interface, not just loopback, so the app must
  // listen on all interfaces rather than relying on Node's default.
  const port = configService.get<number>('app.port', 3000);
  await app.listen(port, '0.0.0.0');
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

// Mounted at a fixed path, independent of the URI versioning applied to
// application routes — /api/docs stays stable even once a v2 exists.
function setupSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('EventHub API')
      .setDescription('Event management and RSVP platform — backend API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build(),
  );

  SwaggerModule.setup('api/docs', app, document);
}

// PostgreSQL is the sole source of truth for this API — an app that
// "starts" without a database connection isn't actually functional. Fail
// fast and let the process exit non-zero rather than serve a permanently
// degraded instance; container orchestration (Docker/Railway/k8s) is built
// to restart on a crash, which is simpler and clearer than a bespoke
// retry/backoff loop here.
bootstrap().catch((error: unknown) => {
  new NestLogger('Bootstrap').error(
    'Application failed to start',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
