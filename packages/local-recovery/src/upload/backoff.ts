/**
 * Compute exponential backoff delay with jitter.
 *
 * Formula: min(maxDelay, baseDelay * 2^attempt) + random jitter.
 */
export function computeBackoff(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 60000,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const jitter = Math.random() * exponential * 0.3; // ±30% jitter
  return Math.floor(exponential + jitter);
}

/**
 * Compute the next retry timestamp (ISO 8601) given the current attempt count.
 */
export function nextRetryAt(attempt: number, baseDelayMs?: number, maxDelayMs?: number): string {
  const delay = computeBackoff(attempt, baseDelayMs, maxDelayMs);
  return new Date(Date.now() + delay).toISOString();
}
