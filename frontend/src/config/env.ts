/**
 * The single place that reads `import.meta.env`. Nothing else in the
 * codebase should touch it directly — every Vite env var exposed here is
 * shipped to the browser and therefore public (never a secret), and
 * routing all reads through this module means a missing/misconfigured
 * value fails once, loudly, at startup instead of as an undefined `fetch`
 * base URL deep inside a component.
 */

function readRequiredEnvVar(key: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. Copy .env.example to .env and set it.`,
    );
  }
  return value;
}

export const env = {
  apiUrl: readRequiredEnvVar('VITE_API_URL', import.meta.env.VITE_API_URL),
} as const;
