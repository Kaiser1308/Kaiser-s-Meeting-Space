export type StorageErrorCategory =
  | 'object_not_found'
  | 'upload_failed'
  | 'checksum_mismatch'
  | 'access_denied'
  | 'invalid_key'
  | 'provider_error'
  | 'config_error';

export class StorageError extends Error {
  constructor(
    public readonly category: StorageErrorCategory,
    public readonly cause?: unknown,
  ) {
    super(category);
    this.name = 'StorageError';
  }
}

interface SdkErrorLike {
  readonly name?: unknown;
  readonly $metadata?: { readonly httpStatusCode?: unknown } | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function classifyByShape(e: SdkErrorLike): StorageErrorCategory {
  const name = typeof e.name === 'string' ? e.name : '';
  const status = e.$metadata?.httpStatusCode;

  if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) {
    return 'object_not_found';
  }
  if (name === 'AccessDenied' || status === 403) {
    return 'access_denied';
  }
  if (name.includes('Timeout') || name.includes('Network')) {
    return 'provider_error';
  }
  return 'provider_error';
}

export function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) {
    return e;
  }
  const category = isObject(e) ? classifyByShape(e as SdkErrorLike) : 'provider_error';
  return new StorageError(category);
}
