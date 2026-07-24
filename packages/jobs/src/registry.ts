import type { JobType } from '@kms/domain';
import type { JobConfig } from './types.js';

const REGISTRY: Record<JobType, JobConfig> = {
  speech_transcription: {
    type: 'speech_transcription',
    concurrency: 2,
    timeoutMs: 300_000,
    retryPolicy: { type: 'exponential', delayMs: 5000, maxAttempts: 3 },
    deduplicate: true,
  },
  translation: {
    type: 'translation',
    concurrency: 3,
    timeoutMs: 120_000,
    retryPolicy: { type: 'exponential', delayMs: 2000, maxAttempts: 3 },
    deduplicate: true,
  },
  minutes_generation: {
    type: 'minutes_generation',
    concurrency: 1,
    timeoutMs: 600_000,
    retryPolicy: { type: 'exponential', delayMs: 10000, maxAttempts: 3 },
    deduplicate: true,
  },
  export: {
    type: 'export',
    concurrency: 2,
    timeoutMs: 180_000,
    retryPolicy: { type: 'fixed', delayMs: 5000, maxAttempts: 2 },
    deduplicate: false,
  },
  deletion: {
    type: 'deletion',
    concurrency: 1,
    timeoutMs: 60_000,
    retryPolicy: { type: 'fixed', delayMs: 1000, maxAttempts: 5 },
    deduplicate: true,
  },
  finalization: {
    type: 'finalization',
    concurrency: 2,
    timeoutMs: 120_000,
    retryPolicy: { type: 'exponential', delayMs: 2000, maxAttempts: 3 },
    deduplicate: true,
  },
  backfill: {
    type: 'backfill',
    concurrency: 2,
    timeoutMs: 180_000,
    retryPolicy: { type: 'exponential', delayMs: 2000, maxAttempts: 3 },
    deduplicate: true,
  },
};

export function getJobConfig(type: JobType): JobConfig {
  const config = REGISTRY[type];
  if (!config) {
    throw new Error(`Unsupported job type: ${type}`);
  }
  return Object.freeze({ ...config });
}
