import { z } from 'zod';
import { MeetingIdSchema } from '../meeting/schemas.js';

// ── Job type ──

export const JobTypeSchema = z.enum([
  'speech_transcription',
  'translation',
  'minutes_generation',
  'export',
  'deletion',
  'finalization',
  'backfill',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

// ── Job state ──

export const JobStateSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'retrying',
]);
export type JobState = z.infer<typeof JobStateSchema>;

// ── Job attempt ──

export const JobAttemptSchema = z
  .object({
    attempt: z.number().int().positive(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    success: z.boolean(),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .optional(),
  })
  .strict();
export type JobAttempt = z.infer<typeof JobAttemptSchema>;

// ── Job ──

export const JobSchema = z
  .object({
    id: z.string().min(1),
    type: JobTypeSchema,
    state: JobStateSchema,
    meetingId: MeetingIdSchema,
    ownerId: z.string().min(1),
    maxAttempts: z.number().int().positive(),
    attempts: z.array(JobAttemptSchema),
    progress: z.number().int().min(0).max(100).optional(),
    result: z.record(z.unknown()).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();
export type Job = z.infer<typeof JobSchema>;

// ── Utility functions ──

export function isTerminalJobState(state: JobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

export function isRetryableJobState(state: JobState): boolean {
  return state === 'failed' || state === 'cancelled';
}
