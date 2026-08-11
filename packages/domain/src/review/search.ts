import { z } from 'zod';
import { MeetingIdSchema } from '../meeting/schemas.js';

export const TranscriptSearchItemSchema = z
  .object({
    id: z.string().min(1),
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    sequence: z.number().int().nonnegative(),
    sourceText: z.string(),
    currentText: z.string(),
    revisedText: z.string().nullable(),
    translationText: z.string().nullable(),
    speakerId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    confidence: z.number().min(0).max(1).nullable(),
    isGap: z.boolean(),
    locality: z.enum(['local', 'cloud', 'source']),
    disagreement: z.boolean(),
    bookmarked: z.boolean(),
  })
  .strict();
export type TranscriptSearchItem = z.infer<typeof TranscriptSearchItemSchema>;

export const TranscriptSearchQuerySchema = z
  .object({
    ownerId: z.string().trim().min(1),
    meetingId: MeetingIdSchema.optional(),
    text: z.string().trim().min(1).optional(),
    speakerId: z.string().min(1).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().positive().optional(),
    confidenceBelow: z.number().min(0).max(1).optional(),
    locality: z.enum(['local', 'cloud', 'source']).optional(),
    revised: z.boolean().optional(),
    targetLanguage: z.enum(['vi', 'en']).default('en'),
    isGap: z.boolean().optional(),
    disagreement: z.boolean().optional(),
    bookmarked: z.boolean().optional(),
    cursor: z
      .string()
      .regex(/^(?:0|[1-9]\d*):[^:]+$/)
      .optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();
export type TranscriptSearchQuery = z.infer<typeof TranscriptSearchQuerySchema>;

export type TranscriptSearchInput = {
  readonly items: readonly TranscriptSearchItem[];
  readonly query: z.input<typeof TranscriptSearchQuerySchema>;
};

export function searchTranscriptProjection(input: TranscriptSearchInput) {
  const query = TranscriptSearchQuerySchema.parse(input.query);
  const normalized = query.text?.normalize('NFC').toLocaleLowerCase('vi-VN');
  const filtered = input.items
    .map((item) => TranscriptSearchItemSchema.parse(item))
    .filter((item) => item.ownerId === query.ownerId)
    .filter((item) => !query.meetingId || item.meetingId === query.meetingId)
    .filter(
      (item) =>
        !normalized ||
        [
          item.sourceText,
          item.currentText,
          item.revisedText ?? '',
          item.translationText ?? '',
        ].some((text) => text.normalize('NFC').toLocaleLowerCase('vi-VN').includes(normalized)),
    )
    .filter((item) => !query.speakerId || item.speakerId === query.speakerId)
    .filter((item) => query.startMs === undefined || item.startMs >= query.startMs)
    .filter((item) => query.endMs === undefined || item.endMs <= query.endMs)
    .filter(
      (item) =>
        query.confidenceBelow === undefined ||
        (item.confidence !== null && item.confidence < query.confidenceBelow),
    )
    .filter((item) => !query.locality || item.locality === query.locality)
    .filter((item) => query.revised === undefined || (item.revisedText !== null) === query.revised)
    .filter((item) => query.isGap === undefined || item.isGap === query.isGap)
    .filter((item) => query.disagreement === undefined || item.disagreement === query.disagreement)
    .filter((item) => query.bookmarked === undefined || item.bookmarked === query.bookmarked)
    .sort(
      (left, right) =>
        left.startMs - right.startMs || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  const cursor = query.cursor
    ? (() => {
        const [start, ...rest] = query.cursor!.split(':');
        return { startMs: Number(start), id: rest.join(':') };
      })()
    : null;
  const after = cursor
    ? filtered.filter(
        (item) =>
          item.startMs > cursor.startMs || (item.startMs === cursor.startMs && item.id > cursor.id),
      )
    : filtered;
  const page = after.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: after.length > page.length && last ? `${last.startMs}:${last.id}` : null,
  };
}
