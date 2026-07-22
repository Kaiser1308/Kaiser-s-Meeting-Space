import { describe, it, expect } from 'vitest';
import {
  JobTypeSchema,
  JobStateSchema,
  JobSchema,
  JobAttemptSchema,
  isTerminalJobState,
  isRetryableJobState,
} from './schemas.js';

describe('JobType', () => {
  it('accepts known job types', () => {
    expect(JobTypeSchema.parse('speech_transcription')).toBe('speech_transcription');
    expect(JobTypeSchema.parse('translation')).toBe('translation');
    expect(JobTypeSchema.parse('minutes_generation')).toBe('minutes_generation');
    expect(JobTypeSchema.parse('export')).toBe('export');
    expect(JobTypeSchema.parse('deletion')).toBe('deletion');
    expect(JobTypeSchema.parse('finalization')).toBe('finalization');
    expect(JobTypeSchema.parse('backfill')).toBe('backfill');
  });
});

describe('JobState', () => {
  it('accepts all states', () => {
    expect(JobStateSchema.parse('pending')).toBe('pending');
    expect(JobStateSchema.parse('running')).toBe('running');
    expect(JobStateSchema.parse('completed')).toBe('completed');
    expect(JobStateSchema.parse('failed')).toBe('failed');
    expect(JobStateSchema.parse('cancelled')).toBe('cancelled');
    expect(JobStateSchema.parse('retrying')).toBe('retrying');
  });
});

describe('JobAttempt', () => {
  it('accepts valid attempt', () => {
    const result = JobAttemptSchema.parse({
      attempt: 1,
      startedAt: '2026-07-22T09:00:00.000Z',
      completedAt: '2026-07-22T09:05:00.000Z',
      success: true,
    });
    expect(result.attempt).toBe(1);
  });

  it('accepts failed attempt with error', () => {
    const result = JobAttemptSchema.parse({
      attempt: 1,
      startedAt: '2026-07-22T09:00:00.000Z',
      completedAt: '2026-07-22T09:01:00.000Z',
      success: false,
      error: { code: 'PROVIDER_TIMEOUT', message: 'Provider timed out' },
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_TIMEOUT');
  });
});

describe('Job', () => {
  it('accepts valid job', () => {
    const result = JobSchema.parse({
      id: 'job-001',
      type: 'minutes_generation',
      state: 'running',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      ownerId: 'user-1',
      maxAttempts: 3,
      attempts: [
        {
          attempt: 1,
          startedAt: '2026-07-22T09:00:00.000Z',
          completedAt: '2026-07-22T09:05:00.000Z',
          success: false,
          error: { code: 'PROVIDER_RATE_LIMITED', message: 'Rate limited' },
        },
      ],
      progress: 45,
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.type).toBe('minutes_generation');
    expect(result.state).toBe('running');
    expect(result.attempts).toHaveLength(1);
  });

  it('accepts pending job', () => {
    const result = JobSchema.parse({
      id: 'job-002',
      type: 'export',
      state: 'pending',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      ownerId: 'user-1',
      maxAttempts: 3,
      attempts: [],
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.state).toBe('pending');
  });

  it('rejects progress < 0', () => {
    const result = JobSchema.safeParse({
      id: 'job-001',
      type: 'export',
      state: 'running',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      ownerId: 'user-1',
      maxAttempts: 3,
      attempts: [],
      progress: -1,
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects progress > 100', () => {
    const result = JobSchema.safeParse({
      id: 'job-001',
      type: 'export',
      state: 'running',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      ownerId: 'user-1',
      maxAttempts: 3,
      attempts: [],
      progress: 101,
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxAttempts <= 0', () => {
    const result = JobSchema.safeParse({
      id: 'job-001',
      type: 'export',
      state: 'pending',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      ownerId: 'user-1',
      maxAttempts: 0,
      attempts: [],
      createdAt: '2026-07-22T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = JobSchema.safeParse({
      id: 'job-001',
      type: 'export',
      state: 'pending',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      ownerId: 'user-1',
      maxAttempts: 3,
      attempts: [],
      createdAt: '2026-07-22T09:00:00.000Z',
      internalNote: 'secret',
    });
    expect(result.success).toBe(false);
  });
});

describe('Utility functions', () => {
  it('isTerminalJobState identifies terminal states', () => {
    expect(isTerminalJobState('completed')).toBe(true);
    expect(isTerminalJobState('failed')).toBe(true);
    expect(isTerminalJobState('cancelled')).toBe(true);
    expect(isTerminalJobState('running')).toBe(false);
    expect(isTerminalJobState('pending')).toBe(false);
    expect(isTerminalJobState('retrying')).toBe(false);
  });

  it('isRetryableJobState identifies retryable states', () => {
    expect(isRetryableJobState('failed')).toBe(true);
    expect(isRetryableJobState('cancelled')).toBe(true);
    expect(isRetryableJobState('running')).toBe(false);
    expect(isRetryableJobState('completed')).toBe(false);
  });
});
