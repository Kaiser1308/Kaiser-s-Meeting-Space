import { describe, it, expect } from 'vitest';
import {
  ErrorCategory,
  ErrorCatalog,
  ALL_ERROR_CODES,
  getErrorInfo,
  isRetryableError,
  isUserFacingError,
  ErrorCodeSchema,
  ErrorCategorySchema,
  DomainErrorSchema,
  SafeErrorDetailSchema,
  hasDuplicateCodes,
  getHttpStatus,
  type ErrorCode,
} from './catalog.js';

describe('ErrorCode', () => {
  it('accepts all defined error codes', () => {
    for (const code of ALL_ERROR_CODES) {
      expect(ErrorCodeSchema.parse(code)).toBe(code);
    }
  });

  it('rejects unknown error codes', () => {
    const result = ErrorCodeSchema.safeParse('UNKNOWN_CODE_XYZ');
    expect(result.success).toBe(false);
  });
});

describe('ErrorCategory', () => {
  it('accepts all categories', () => {
    const cats: ErrorCategory[] = [
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
    ];
    for (const cat of cats) {
      expect(ErrorCategorySchema.parse(cat)).toBe(cat);
    }
  });
});

describe('SafeErrorDetail', () => {
  it('accepts safe details with allowed fields', () => {
    const result = SafeErrorDetailSchema.parse({
      currentState: 'recording',
      expectedVersion: 2,
      actualVersion: 3,
    });
    expect(result.currentState).toBe('recording');
  });

  it('rejects content fields', () => {
    const result = SafeErrorDetailSchema.safeParse({
      transcriptText: 'secret meeting content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects credential fields', () => {
    const result = SafeErrorDetailSchema.safeParse({
      apiKey: 'sk-secret-key',
    });
    expect(result.success).toBe(false);
  });

  it('rejects token fields', () => {
    const result = SafeErrorDetailSchema.safeParse({
      accessToken: 'bearer-token',
    });
    expect(result.success).toBe(false);
  });
});

describe('DomainError', () => {
  it('creates valid domain error', () => {
    const result = DomainErrorSchema.parse({
      code: 'MEETING_INVALID_TRANSITION',
      message: 'Cannot Start from recording state',
      category: 'illegal_transition',
      httpStatus: 409,
      retryable: false,
      userFacing: true,
      localizationKey: 'error.meeting.invalid_transition',
    });
    expect(result.code).toBe('MEETING_INVALID_TRANSITION');
  });

  it('rejects unknown error code structure', () => {
    const result = DomainErrorSchema.safeParse({
      code: 'random_string',
      message: 'test',
      category: 'validation',
      httpStatus: 400,
      retryable: false,
      userFacing: true,
      localizationKey: 'error.test',
    });
    expect(result.success).toBe(false);
  });
});

describe('Error catalog integrity', () => {
  it('has no duplicate error codes', () => {
    expect(hasDuplicateCodes()).toBe(false);
  });

  it('every error code has a catalog entry', () => {
    for (const code of ALL_ERROR_CODES) {
      const info = getErrorInfo(code);
      expect(info).toBeDefined();
      expect(info.code).toBe(code);
    }
  });

  it('every catalog entry code is in ALL_ERROR_CODES', () => {
    for (const [code] of Object.entries(ErrorCatalog)) {
      expect(ALL_ERROR_CODES).toContain(code);
    }
  });

  it('no error message contains "provider" raw body hints', () => {
    for (const [, info] of Object.entries(ErrorCatalog)) {
      expect(info.message).not.toContain('provider body');
      expect(info.message).not.toContain('raw response');
    }
  });
});

describe('Utility functions', () => {
  it('isRetryableError returns true for retryable codes', () => {
    expect(isRetryableError('PROVIDER_TIMEOUT')).toBe(true);
    expect(isRetryableError('PROVIDER_RATE_LIMITED')).toBe(true);
    expect(isRetryableError('STORAGE_UPLOAD_FAILED')).toBe(true);
    expect(isRetryableError('MEETING_INVALID_TRANSITION')).toBe(false);
    expect(isRetryableError('MEETING_NOT_FOUND')).toBe(false);
  });

  it('isUserFacingError returns true for user-facing codes', () => {
    expect(isUserFacingError('MEETING_INVALID_TRANSITION')).toBe(true);
    expect(isUserFacingError('VALIDATION_ERROR')).toBe(true);
    expect(isUserFacingError('AUTH_UNAUTHORIZED')).toBe(true);
    // Internal errors may not be user-facing
  });

  it('getHttpStatus returns correct status', () => {
    expect(getHttpStatus('MEETING_INVALID_TRANSITION')).toBe(409);
    expect(getHttpStatus('MEETING_NOT_FOUND')).toBe(404);
    expect(getHttpStatus('VALIDATION_ERROR')).toBe(400);
    expect(getHttpStatus('AUTH_UNAUTHORIZED')).toBe(401);
    expect(getHttpStatus('PROVIDER_TIMEOUT')).toBe(502);
    expect(getHttpStatus('PROVIDER_RATE_LIMITED')).toBe(429);
  });

  it('defensive defaults apply for an unknown code (fail-safe)', () => {
    const unknown = '__UNKNOWN_DEFENSIVE__' as ErrorCode;
    expect(getHttpStatus(unknown)).toBe(500);
    expect(isRetryableError(unknown)).toBe(false);
    expect(isUserFacingError(unknown)).toBe(true);
  });

  it('hasDuplicateCodes reports no duplicates in the catalog', () => {
    expect(hasDuplicateCodes()).toBe(false);
  });

  it('hasDuplicateCodes detects a duplicate when injected', () => {
    const first = ALL_ERROR_CODES[0] as ErrorCode;
    expect(hasDuplicateCodes([first, first])).toBe(true);
  });
});
