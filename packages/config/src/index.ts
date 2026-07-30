import { z } from 'zod';

// ── Base / Environment ──────────────────────────────────────────────

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().max(65535).default(4310),
    PORT: z.coerce.number().int().positive().max(65535).optional(),

    // Database
    DATABASE_URL: z.string().url(),
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().max(200).default(20),
    DATABASE_SSL: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default('false'),

    // Redis
    REDIS_URL: z.string().url(),
    REDIS_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),

    // S3 / Object Storage
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().min(1).optional(),
    S3_SECRET_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default('false'),

    // OIDC
    OIDC_ISSUER_URL: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URI: z.string().url().optional(),

    // AI Provider
    AI_PROVIDER: z.enum(['mock', 'openai-compatible']).default('mock'),
    AI_BASE_URL: z.string().url().optional(),
    AI_API_KEY: z.string().min(1).optional(),
    AI_MODEL: z.string().min(1).optional(),

    // Speech Provider
    SPEECH_PROVIDER: z.enum(['deepgram', 'local']).default('deepgram'),
    DEEPGRAM_API_KEY: z.string().min(1).optional(),

    // Translation Provider
    TRANSLATION_PROVIDER: z.enum(['google', 'azure', 'deepl', 'openai']).optional(),

    // Limits and Concurrency
    MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(5),
    JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
    RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(500),

    // Observability
    OTEL_EXPORTER_ENDPOINT: z.string().url().optional(),
    SENTRY_DSN: z.string().url().optional(),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

    // Release/Environment tag
    RELEASE_TAG: z.string().default('unknown'),
  })
  .strict();

export type EnvInput = z.input<typeof envSchema>;
export type EnvOutput = z.output<typeof envSchema>;

// ── App Config (parsed + normalized) ────────────────────────────────

export interface AppConfig {
  NODE_ENV: string;
  API_PORT: number;
  DATABASE_URL: string;
  DATABASE_MAX_CONNECTIONS: number;
  DATABASE_SSL: boolean;
  REDIS_URL: string;
  REDIS_MAX_RETRIES: number;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_REGION: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_FORCE_PATH_STYLE: boolean;
  OIDC_ISSUER_URL?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  AI_PROVIDER: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  SPEECH_PROVIDER: string;
  DEEPGRAM_API_KEY?: string;
  TRANSLATION_PROVIDER?: string;
  MAX_CONCURRENT_JOBS: number;
  JOB_TIMEOUT_MS: number;
  RATE_LIMIT_RPM: number;
  MAX_UPLOAD_SIZE_MB: number;
  OTEL_EXPORTER_ENDPOINT?: string;
  SENTRY_DSN?: string;
  LOG_LEVEL: string;
  RELEASE_TAG: string;
}

// ── Validation ──────────────────────────────────────────────────────

export type ConfigResult =
  { isError: false; config: AppConfig } | { isError: true; message: string };

const SECRET_FIELD_NAMES = new Set([
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'OIDC_CLIENT_SECRET',
  'AI_API_KEY',
  'DEEPGRAM_API_KEY',
  'SENTRY_DSN',
]);

function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    // Never include the actual value in the error message
    return `${path}: ${issue.message}`;
  });
  return `Configuration error: ${issues.join('; ')}`;
}

export function validateConfig(raw: Record<string, string | undefined>): ConfigResult {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    return { isError: true, message: formatZodError(result.error) };
  }
  return { isError: false, config: result.data as unknown as AppConfig };
}

// ── Redaction ───────────────────────────────────────────────────────

export function redactConfig(config: AppConfig): Partial<AppConfig> {
  const redacted: Partial<AppConfig> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_FIELD_NAMES.has(key)) {
      (redacted as Record<string, unknown>)[key] = value !== undefined ? '[REDACTED]' : undefined;
    } else {
      (redacted as Record<string, unknown>)[key] = value;
    }
  }
  return redacted;
}

// ── Client-Safe Config ──────────────────────────────────────────────

const CLIENT_SAFE_KEYS = new Set([
  'NODE_ENV',
  'OIDC_ISSUER_URL',
  'OIDC_CLIENT_ID',
  'OIDC_REDIRECT_URI',
  'AI_PROVIDER',
  'SPEECH_PROVIDER',
  'RELEASE_TAG',
  'LOG_LEVEL',
]);

export function clientSafeConfig(config: AppConfig): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of CLIENT_SAFE_KEYS) {
    if (key in config) {
      safe[key] = (config as unknown as Record<string, unknown>)[key];
    }
  }
  return safe;
}
