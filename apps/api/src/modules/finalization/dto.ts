import { z } from 'zod';
import { FinalizationManifestV1Schema } from '@kms/domain';

export const FinalizeMeetingBodySchema = z
  .object({
    manifest: FinalizationManifestV1Schema,
    desktopAvailable: z.boolean().default(false),
    localModelAvailable: z.boolean().default(false),
    cloudProviderAvailable: z.boolean().default(false),
  })
  .strict();

export const FinalizationStatusResponseSchema = z.object({
  meetingId: z.string().uuid(),
  state: z.enum(['finalizing', 'processing', 'partial_ready', 'ready', 'recovery_required']),
  primaryAction: z.enum([
    'none',
    'local',
    'cloud',
    'waiting_for_desktop',
    'waiting_for_model',
    'review_required',
  ]),
  version: z.number().int().positive(),
});
