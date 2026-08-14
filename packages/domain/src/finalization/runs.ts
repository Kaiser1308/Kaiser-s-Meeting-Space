import { z } from 'zod';
import { MeetingIdSchema, Sha256Schema } from '../meeting/schemas.js';
import { TranscriptionPolicyV1Schema } from '../transcription/policy.js';
import { FinalizationRangeV1Schema } from './manifest.js';

export const FinalRunPlanV1Schema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    meetingId: MeetingIdSchema,
    ownerId: z.string().min(1),
    primaryAction: z.enum(['local', 'cloud']),
    manifestHash: Sha256Schema,
    policy: TranscriptionPolicyV1Schema,
    ranges: z.array(FinalizationRangeV1Schema).min(1),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.primaryAction === 'cloud' && plan.policy.cloudConsent !== 'granted') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cloud primary action requires granted cloud consent',
        path: ['policy', 'cloudConsent'],
      });
    }
    if (plan.primaryAction === 'local' && plan.policy.final === 'cloud') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a cloud policy cannot create a local primary plan',
        path: ['primaryAction'],
      });
    }
  });
export type FinalRunPlanV1 = z.infer<typeof FinalRunPlanV1Schema>;

export const CompletenessStateV1Schema = z.enum([
  'waiting_for_desktop',
  'waiting_for_model',
  'needs_recovery',
  'processing',
  'partial_ready',
  'review_required',
  'final_ready',
]);
export type CompletenessStateV1 = z.infer<typeof CompletenessStateV1Schema>;

export const CompletenessSnapshotV1Schema = z
  .object({
    version: z.literal(1),
    meetingId: MeetingIdSchema,
    state: CompletenessStateV1Schema,
    policyApproved: z.boolean(),
    downstreamEligible: z.boolean(),
    expectedRangeCount: z.number().int().nonnegative(),
    classifiedRangeCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.classifiedRangeCount > snapshot.expectedRangeCount) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'classified ranges exceed expected ranges' });
    }
    if (
      snapshot.downstreamEligible &&
      (snapshot.state !== 'final_ready' || !snapshot.policyApproved ||
        snapshot.classifiedRangeCount !== snapshot.expectedRangeCount)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'downstream eligibility requires policy-approved final completeness',
        path: ['downstreamEligible'],
      });
    }
  });
export type CompletenessSnapshotV1 = z.infer<typeof CompletenessSnapshotV1Schema>;
