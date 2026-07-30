import { z } from 'zod';

export const OidcIssuerConfigSchema = z.object({
  issuer: z.string().url(),
  jwksUri: z.string().url(),
  audience: z.array(z.string()).min(1),
  algorithms: z.array(z.enum(['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'])).min(1),
});

export type OidcIssuerConfig = z.infer<typeof OidcIssuerConfigSchema>;

export const OidcCacheConfigSchema = z.object({
  maxSize: z.number().int().positive().default(100),
  ttlSeconds: z.number().int().positive().default(300),
  staleWhileRevalidateSeconds: z.number().int().nonnegative().default(60),
});

export type OidcCacheConfig = z.infer<typeof OidcCacheConfigSchema>;

export const OidcRetryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  initialBackoffMs: z.number().int().positive().default(100),
  maxBackoffMs: z.number().int().positive().default(6400),
  cacheOnlyOnOutage: z.boolean().default(false),
});

export type OidcRetryConfig = z.infer<typeof OidcRetryConfigSchema>;

export const OidcTimeValidationConfigSchema = z.object({
  clockSkewSeconds: z.number().int().nonnegative().default(30),
});

export type OidcTimeValidationConfig = z.infer<typeof OidcTimeValidationConfigSchema>;

export const OidcConfigSchema = z.object({
  issuers: z.array(OidcIssuerConfigSchema).min(1),
  cache: OidcCacheConfigSchema,
  retry: OidcRetryConfigSchema,
  timeValidation: OidcTimeValidationConfigSchema,
});

export type OidcConfig = z.infer<typeof OidcConfigSchema>;

export const DEFAULT_CACHE_CONFIG: OidcCacheConfig = {
  maxSize: 100,
  ttlSeconds: 300,
  staleWhileRevalidateSeconds: 60,
};

export const DEFAULT_RETRY_CONFIG: OidcRetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 100,
  maxBackoffMs: 6400,
  cacheOnlyOnOutage: false,
};

export const DEFAULT_TIME_VALIDATION_CONFIG: OidcTimeValidationConfig = {
  clockSkewSeconds: 30,
};

export function createOidcConfig(config: Partial<OidcConfig> = {}): OidcConfig {
  return OidcConfigSchema.parse({
    issuers: config.issuers || [],
    cache: { ...DEFAULT_CACHE_CONFIG, ...config.cache },
    retry: { ...DEFAULT_RETRY_CONFIG, ...config.retry },
    timeValidation: { ...DEFAULT_TIME_VALIDATION_CONFIG, ...config.timeValidation },
  });
}

export interface JwtVerificationResult {
  valid: boolean;
  payload?: Record<string, unknown>;
  issuer?: string;
  subject?: string;
  audience?: string[];
  expiresAt?: number;
  notBefore?: number;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

export interface JwtVerificationOptions {
  token: string;
  requiredAudience?: string[];
  requiredIssuer?: string;
  currentTime?: number;
}
