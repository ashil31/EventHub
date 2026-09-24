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

export interface EnvironmentConfig {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
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
});
