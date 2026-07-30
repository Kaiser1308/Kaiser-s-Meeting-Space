export interface Clock {
  /** RFC 3339 UTC wall-clock timestamp with millisecond fraction. */
  now(): string;

  /** Monotonic high-resolution timestamp (e.g. performance.now() equivalent). */
  monotonicNow(): number;

  /** Sleep for `ms` milliseconds. */
  sleep(ms: number): Promise<void>;
}
