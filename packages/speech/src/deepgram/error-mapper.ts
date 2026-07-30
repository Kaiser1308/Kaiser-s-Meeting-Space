import type { SpeechSafeError } from '@kms/domain';

export function toSafeError(err: unknown, isRetryable: boolean): SpeechSafeError {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    code: 'PROVIDER_ERROR',
    message: msg.slice(0, 512),
    category: 'provider',
    retryable: isRetryable,
  };
}
