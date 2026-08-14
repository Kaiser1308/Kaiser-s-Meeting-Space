import { z } from 'zod';
import { MeetingIdSchema } from '@kms/domain';

const EditorNodeSchema = z.union([
  z.object({ type: z.literal('heading'), id: z.string().min(1), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: z.string() }).strict(),
  z.object({ type: z.literal('paragraph'), id: z.string().min(1), text: z.string() }).strict(),
  z.object({ type: z.literal('list'), id: z.string().min(1), ordered: z.boolean(), items: z.array(z.string()) }).strict(),
  z.object({ type: z.literal('citation'), id: z.string().min(1), segmentId: z.string().min(1), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), stale: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('confirmation'), id: z.string().min(1), text: z.string(), needsConfirmation: z.literal(true) }).strict(),
]);

export const MinutesEditorDocumentSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    nodes: z.array(EditorNodeSchema),
  })
  .strict();

export const SaveMinutesDocumentBodySchema = z.object({
  baseVersion: z.number().int().positive(),
  document: MinutesEditorDocumentSchema,
}).strict();

export const MinutesEditorVersionResponseSchema = z.object({
  versionId: z.string().min(1),
  documentId: z.string().min(1),
  version: z.number().int().positive(),
  contentHash: z.string(),
  createdAt: z.string().datetime(),
});
