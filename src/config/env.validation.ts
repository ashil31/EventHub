import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * The env-var contract for the whole application. DATABASE_URL and the JWT_*
 * variables aren't consumed by anything yet (Phase 1 has no database or auth),
 * but they're validated now so the contract is fixed before later phases
 * start depending on it.
 */
export class EnvironmentVariables {
  @IsIn(Object.values(Environment))
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL must be a postgresql:// connection string',
  })
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_SECRET must be at least 32 characters long',
  })
  JWT_SECRET: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false },
    { message: 'FRONTEND_URL must be a valid URL' },
  )
  FRONTEND_URL?: string;

  // Rate limiting (Phase 6). Default initializers, matching PORT/NODE_ENV
  // above — not secrets, just tunables, so a missing env var falls back
  // to a sensible default rather than failing startup.
  @IsInt()
  @Min(1)
  THROTTLE_TTL: number = 60;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 100;

  @IsInt()
  @Min(1)
  AUTH_THROTTLE_TTL: number = 60;

  @IsInt()
  @Min(1)
  AUTH_THROTTLE_LIMIT: number = 5;
}

const DEV_PLACEHOLDER_SECRET_MARKER = 'replace-this-in-development';

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  // Production has a stricter requirement than development/test: the JWT
  // secret must not still be the placeholder shipped in .env.example.
  if (
    validatedConfig.NODE_ENV === Environment.Production &&
    validatedConfig.JWT_SECRET.includes(DEV_PLACEHOLDER_SECRET_MARKER)
  ) {
    throw new Error(
      'JWT_SECRET is still the development placeholder value. Set a real secret before running in production.',
    );
  }

  return validatedConfig;
}
