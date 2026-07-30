import { z } from 'zod';

// ── Error category ──

export const ErrorCategorySchema = z.enum([
  'illegal_transition',
  'validation',
  'conflict',
  'auth',
  'storage',
  'provider',
  'rate',
  'resource',
  'unsupported_version',
  'internal',
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

// ── Error codes ──

export const ALL_ERROR_CODES = [
  // Meeting state
  'MEETING_INVALID_TRANSITION',
  'MEETING_VERSION_CONFLICT',
  'MEETING_NOT_FOUND',
  'MEETING_ALREADY_DELETED',

  // Validation
  'VALIDATION_ERROR',
  'INVALID_CHUNK_ID',
  'INVALID_TIMESTAMP_RANGE',

  // Conflict
  'AUDIO_CHUNK_CONFLICT',
  'TRANSCRIPT_REVISION_CONFLICT',
  'DUPLICATE_PROVIDER_EVENT',

  // Auth
  'AUTH_UNAUTHORIZED',
  'AUTH_TOKEN_EXPIRED',

  // Storage
  'STORAGE_UPLOAD_FAILED',
  'STORAGE_OBJECT_NOT_FOUND',
  'STORAGE_CHECKSUM_MISMATCH',

  // Provider
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_INVALID_RESPONSE',

  // Rate
  'RATE_LIMIT_EXCEEDED',

  // Resource
  'RESOURCE_NOT_FOUND',
  'RESOURCE_ALREADY_EXISTS',

  // Unsupported version
  'UNSUPPORTED_SCHEMA_VERSION',
  'UNSUPPORTED_ENVELOPE_VERSION',

  // Internal
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ALL_ERROR_CODES)[number];

export const ErrorCodeSchema = z.enum(ALL_ERROR_CODES);

// ── Safe error details ──

// Forbidden keys: content, credentials, tokens, secrets
const FORBIDDEN_DETAIL_KEYS = [
  'transcriptText',
  'audioData',
  'minutesContent',
  'meetingContent',
  'apiKey',
  'accessToken',
  'refreshToken',
  'secretKey',
  'password',
  'credential',
  'token',
  'secret',
  'key',
  'providerResponseBody',
  'rawBody',
  'responseBody',
];

export const SafeErrorDetailSchema = z.record(z.unknown()).refine(
  (data) => {
    const keys = Object.keys(data).map((k) => k.toLowerCase());
    for (const forbidden of FORBIDDEN_DETAIL_KEYS) {
      if (keys.some((k) => k.includes(forbidden.toLowerCase()))) {
        return false;
      }
    }
    return true;
  },
  { message: 'Error details must not contain content, credentials, or secrets' },
);

// ── Error catalog entry ──

export interface ErrorCatalogEntry {
  code: ErrorCode;
  message: string;
  category: ErrorCategory;
  httpStatus: number;
  retryable: boolean;
  userFacing: boolean;
  localizationKey: string;
}

// ── Error catalog ──

export const ErrorCatalog: Record<ErrorCode, ErrorCatalogEntry> = {
  MEETING_INVALID_TRANSITION: {
    code: 'MEETING_INVALID_TRANSITION',
    message: 'Meeting cannot perform the requested action from its current state',
    category: 'illegal_transition',
    httpStatus: 409,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.meeting.invalid_transition',
  },
  MEETING_VERSION_CONFLICT: {
    code: 'MEETING_VERSION_CONFLICT',
    message: 'Meeting has been modified since your last view',
    category: 'conflict',
    httpStatus: 409,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.meeting.version_conflict',
  },
  MEETING_NOT_FOUND: {
    code: 'MEETING_NOT_FOUND',
    message: 'Meeting not found',
    category: 'resource',
    httpStatus: 404,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.meeting.not_found',
  },
  MEETING_ALREADY_DELETED: {
    code: 'MEETING_ALREADY_DELETED',
    message: 'Meeting has been deleted',
    category: 'resource',
    httpStatus: 410,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.meeting.already_deleted',
  },

  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'The request contains invalid data',
    category: 'validation',
    httpStatus: 400,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.validation.generic',
  },
  INVALID_CHUNK_ID: {
    code: 'INVALID_CHUNK_ID',
    message: 'The chunk ID format is invalid',
    category: 'validation',
    httpStatus: 400,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.audio.invalid_chunk_id',
  },
  INVALID_TIMESTAMP_RANGE: {
    code: 'INVALID_TIMESTAMP_RANGE',
    message: 'The timestamp range is invalid',
    category: 'validation',
    httpStatus: 400,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.validation.invalid_timestamp',
  },

  AUDIO_CHUNK_CONFLICT: {
    code: 'AUDIO_CHUNK_CONFLICT',
    message: 'A chunk with this ID already exists with different content',
    category: 'conflict',
    httpStatus: 409,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.audio.chunk_conflict',
  },
  TRANSCRIPT_REVISION_CONFLICT: {
    code: 'TRANSCRIPT_REVISION_CONFLICT',
    message: 'This segment has been revised since your last view',
    category: 'conflict',
    httpStatus: 409,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.transcript.revision_conflict',
  },
  DUPLICATE_PROVIDER_EVENT: {
    code: 'DUPLICATE_PROVIDER_EVENT',
    message: 'A transcript segment with this provider event already exists',
    category: 'conflict',
    httpStatus: 409,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.transcript.duplicate_event',
  },

  AUTH_UNAUTHORIZED: {
    code: 'AUTH_UNAUTHORIZED',
    message: 'Authentication required',
    category: 'auth',
    httpStatus: 401,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.auth.unauthorized',
  },
  AUTH_TOKEN_EXPIRED: {
    code: 'AUTH_TOKEN_EXPIRED',
    message: 'Authentication token has expired',
    category: 'auth',
    httpStatus: 401,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.auth.token_expired',
  },

  STORAGE_UPLOAD_FAILED: {
    code: 'STORAGE_UPLOAD_FAILED',
    message: 'Failed to upload file to storage',
    category: 'storage',
    httpStatus: 502,
    retryable: true,
    userFacing: true,
    localizationKey: 'error.storage.upload_failed',
  },
  STORAGE_OBJECT_NOT_FOUND: {
    code: 'STORAGE_OBJECT_NOT_FOUND',
    message: 'The requested file was not found in storage',
    category: 'storage',
    httpStatus: 404,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.storage.object_not_found',
  },
  STORAGE_CHECKSUM_MISMATCH: {
    code: 'STORAGE_CHECKSUM_MISMATCH',
    message: 'File checksum does not match the expected value',
    category: 'storage',
    httpStatus: 409,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.storage.checksum_mismatch',
  },

  PROVIDER_TIMEOUT: {
    code: 'PROVIDER_TIMEOUT',
    message: 'The external provider timed out',
    category: 'provider',
    httpStatus: 502,
    retryable: true,
    userFacing: true,
    localizationKey: 'error.provider.timeout',
  },
  PROVIDER_UNAVAILABLE: {
    code: 'PROVIDER_UNAVAILABLE',
    message: 'The external provider is currently unavailable',
    category: 'provider',
    httpStatus: 502,
    retryable: true,
    userFacing: true,
    localizationKey: 'error.provider.unavailable',
  },
  PROVIDER_RATE_LIMITED: {
    code: 'PROVIDER_RATE_LIMITED',
    message: 'The external provider rate limit has been reached',
    category: 'provider',
    httpStatus: 429,
    retryable: true,
    userFacing: true,
    localizationKey: 'error.provider.rate_limited',
  },
  PROVIDER_INVALID_RESPONSE: {
    code: 'PROVIDER_INVALID_RESPONSE',
    message: 'The external provider returned an invalid response',
    category: 'provider',
    httpStatus: 502,
    retryable: true,
    userFacing: true,
    localizationKey: 'error.provider.invalid_response',
  },

  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
    category: 'rate',
    httpStatus: 429,
    retryable: true,
    userFacing: true,
    localizationKey: 'error.rate.limit_exceeded',
  },

  RESOURCE_NOT_FOUND: {
    code: 'RESOURCE_NOT_FOUND',
    message: 'The requested resource was not found',
    category: 'resource',
    httpStatus: 404,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.resource.not_found',
  },
  RESOURCE_ALREADY_EXISTS: {
    code: 'RESOURCE_ALREADY_EXISTS',
    message: 'A resource with this identifier already exists',
    category: 'resource',
    httpStatus: 409,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.resource.already_exists',
  },

  UNSUPPORTED_SCHEMA_VERSION: {
    code: 'UNSUPPORTED_SCHEMA_VERSION',
    message: 'The schema version is not supported',
    category: 'unsupported_version',
    httpStatus: 400,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.version.unsupported_schema',
  },
  UNSUPPORTED_ENVELOPE_VERSION: {
    code: 'UNSUPPORTED_ENVELOPE_VERSION',
    message: 'The envelope version is not supported',
    category: 'unsupported_version',
    httpStatus: 400,
    retryable: false,
    userFacing: true,
    localizationKey: 'error.version.unsupported_envelope',
  },

  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected internal error occurred',
    category: 'internal',
    httpStatus: 500,
    retryable: true,
    userFacing: true,
    localizationKey: 'error.internal.generic',
  },
};

// ── Domain error schema ──

export const DomainErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
    category: ErrorCategorySchema,
    httpStatus: z.number().int().min(100).max(599),
    retryable: z.boolean(),
    userFacing: z.boolean(),
    localizationKey: z.string().min(1),
    details: SafeErrorDetailSchema.optional(),
  })
  .strict();
export type DomainError = z.infer<typeof DomainErrorSchema>;

// ── Utility functions ──

export function hasDuplicateCodes(codes: readonly ErrorCode[] = ALL_ERROR_CODES): boolean {
  const seen = new Set<ErrorCode>();
  for (const code of codes) {
    if (seen.has(code)) return true;
    seen.add(code);
  }
  return false;
}

export function getErrorInfo(code: ErrorCode): ErrorCatalogEntry {
  return ErrorCatalog[code];
}

export function isRetryableError(code: ErrorCode): boolean {
  return ErrorCatalog[code]?.retryable ?? false;
}

export function isUserFacingError(code: ErrorCode): boolean {
  return ErrorCatalog[code]?.userFacing ?? true;
}

export function getHttpStatus(code: ErrorCode): number {
  return ErrorCatalog[code]?.httpStatus ?? 500;
}
