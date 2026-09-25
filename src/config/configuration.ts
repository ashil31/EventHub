export interface AppConfig {
  port: number;
  environment: string;
  frontendUrl?: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
  authTtl: number;
  authLimit: number;
}

export interface EnvironmentConfig {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  throttle: ThrottleConfig;
}

/**
 * Typed configuration namespaces, consumed via ConfigService.get('app.port')
 * etc. This is the only place in the codebase that should read process.env
 * directly — everywhere else should go through ConfigService.
 */
export default (): EnvironmentConfig => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    environment: process.env.NODE_ENV ?? 'development',
    frontendUrl: process.env.FRONTEND_URL,
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
    authTtl: parseInt(process.env.AUTH_THROTTLE_TTL ?? '60', 10),
    authLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '5', 10),
  },
});
