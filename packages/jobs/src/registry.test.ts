import { describe, expect, it } from 'vitest';
import { getJobConfig } from './registry.js';
import type { JobType } from '@kms/domain';

describe('Job Configuration Registry', () => {
  const jobTypes: JobType[] = [
    'speech_transcription',
    'translation',
    'minutes_generation',
    'export',
    'deletion',
    'finalization',
    'backfill',
  ];

  it('should return valid configuration for all registered job types', () => {
    for (const type of jobTypes) {
      const config = getJobConfig(type);
      expect(config).toBeDefined();
      expect(config.type).toBe(type);
      expect(config.concurrency).toBeGreaterThan(0);
      expect(config.timeoutMs).toBeGreaterThan(0);
      expect(config.retryPolicy).toBeDefined();
      expect(config.retryPolicy.maxAttempts).toBeGreaterThan(0);
      expect(config.retryPolicy.delayMs).toBeGreaterThan(0);
    }
  });

  it('should throw an error for unsupported job types', () => {
    expect(() => getJobConfig('invalid_type' as JobType)).toThrow(
      'Unsupported job type: invalid_type',
    );
  });
});
