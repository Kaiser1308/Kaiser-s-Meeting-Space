import type { JobType } from '@kms/domain';

export interface RetryPolicy {
  type: 'fixed' | 'exponential';
  delayMs: number;
  maxAttempts: number;
}

export interface JobConfig {
  type: JobType;
  concurrency: number;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  deduplicate: boolean;
}
