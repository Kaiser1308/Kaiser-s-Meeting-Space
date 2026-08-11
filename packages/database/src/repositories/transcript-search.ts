import { and, asc, eq, gt, or, sql, type SQL } from 'drizzle-orm';
import type { Connection } from '../client.js';
import {
  transcriptReviewBookmarks,
  transcriptReviewFlags,
  transcriptSegments,
} from '../schema/index.js';
import { DbError } from './types.js';
import type { TranscriptSearchItem, TranscriptSearchQuery } from '@kms/domain';
import { TranscriptSearchQuerySchema } from '@kms/domain';
import type { OwnerContext, Page } from './types.js';

/** PostgreSQL-backed owner-scoped transcript search read model. */
export class TranscriptSearchRepository {
  async addBookmark(
    ctx: OwnerContext,
    conn: Connection,
    input: { id: string; meetingId: string; segmentId: string },
  ): Promise<void> {
    const [segment] = await conn
      .select({ id: transcriptSegments.id })
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.id, input.segmentId),
          eq(transcriptSegments.meetingId, input.meetingId),
          eq(transcriptSegments.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);
    if (!segment) throw new DbError('not_found');
    const [existing] = await conn
      .select({ segmentId: transcriptReviewBookmarks.segmentId })
      .from(transcriptReviewBookmarks)
      .where(
        and(
          eq(transcriptReviewBookmarks.id, input.id),
          eq(transcriptReviewBookmarks.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);
    if (existing && existing.segmentId !== input.segmentId) throw new DbError('conflict');
    await conn
      .insert(transcriptReviewBookmarks)
      .values({
        id: input.id,
        ownerId: ctx.ownerId,
        meetingId: input.meetingId,
        segmentId: input.segmentId,
      })
      .onConflictDoNothing();
    const [stored] = await conn
      .select({ segmentId: transcriptReviewBookmarks.segmentId })
      .from(transcriptReviewBookmarks)
      .where(
        and(
          eq(transcriptReviewBookmarks.id, input.id),
          eq(transcriptReviewBookmarks.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);
    if (!stored || stored.segmentId !== input.segmentId) throw new DbError('conflict');
  }

  async removeBookmark(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    segmentId: string,
  ): Promise<void> {
    const [segment] = await conn
      .select({ id: transcriptSegments.id })
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.id, segmentId),
          eq(transcriptSegments.meetingId, meetingId),
          eq(transcriptSegments.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);
    if (!segment) throw new DbError('not_found');
    await conn
      .delete(transcriptReviewBookmarks)
      .where(
        and(
          eq(transcriptReviewBookmarks.ownerId, ctx.ownerId),
          eq(transcriptReviewBookmarks.segmentId, segmentId),
        ),
      );
  }

  async search(
    ctx: OwnerContext,
    conn: Connection,
    input: TranscriptSearchQuery,
  ): Promise<Page<TranscriptSearchItem>> {
    const query = TranscriptSearchQuerySchema.parse(input);
    const filters: SQL[] = [eq(transcriptSegments.ownerId, ctx.ownerId)];
    if (query.meetingId) filters.push(eq(transcriptSegments.meetingId, query.meetingId));
    if (query.speakerId) filters.push(eq(transcriptSegments.speakerId, query.speakerId));
    if (query.startMs !== undefined)
      filters.push(gt(transcriptSegments.startMs, query.startMs - 1));
    if (query.endMs !== undefined) filters.push(sql`${transcriptSegments.endMs} <= ${query.endMs}`);
    if (query.isGap !== undefined) filters.push(eq(transcriptSegments.isGap, query.isGap));
    if (query.confidenceBelow !== undefined) {
      filters.push(
        sql`${transcriptSegments.confidence} IS NOT NULL AND ${transcriptSegments.confidence} < ${query.confidenceBelow}`,
      );
    }
    if (query.locality) {
      const source =
        query.locality === 'local' ? 'local' : query.locality === 'cloud' ? 'api' : 'manual';
      filters.push(eq(transcriptSegments.source, source));
    }
    if (query.revised !== undefined) {
      const revisionExists = sql`EXISTS (SELECT 1 FROM transcript_revisions r WHERE r.segment_id = ${transcriptSegments.id} AND r.owner_id = ${ctx.ownerId})`;
      filters.push(query.revised ? revisionExists : sql`NOT ${revisionExists}`);
    }
    if (query.disagreement !== undefined) {
      const disagreementExists = sql`COALESCE((SELECT f.disagreement FROM transcript_review_flags f WHERE f.segment_id = ${transcriptSegments.id} AND f.owner_id = ${ctx.ownerId}), false)`;
      filters.push(query.disagreement ? disagreementExists : sql`NOT ${disagreementExists}`);
    }
    if (query.bookmarked !== undefined) {
      const bookmarkExists = sql`EXISTS (SELECT 1 FROM transcript_review_bookmarks b WHERE b.segment_id = ${transcriptSegments.id} AND b.owner_id = ${ctx.ownerId})`;
      filters.push(query.bookmarked ? bookmarkExists : sql`NOT ${bookmarkExists}`);
    }
    if (query.text) {
      const escaped = query.text
        .normalize('NFC')
        .replaceAll('\\', '\\\\')
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_');
      const pattern = `%${escaped}%`;
      filters.push(sql`(
        unaccent(lower(${transcriptSegments.text})) ILIKE unaccent(lower(${pattern})) ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM transcript_revisions r WHERE r.segment_id = ${transcriptSegments.id} AND r.owner_id = ${ctx.ownerId} AND unaccent(lower(r.revised_text)) ILIKE unaccent(lower(${pattern})) ESCAPE '\\')
        OR EXISTS (SELECT 1 FROM translation_current_versions tc JOIN translation_versions tv ON tv.id = tc.current_translation_id WHERE tc.source_segment_id = ${transcriptSegments.id} AND tc.owner_id = ${ctx.ownerId} AND tc.target_language = ${query.targetLanguage} AND unaccent(lower(tv.translated_text)) ILIKE unaccent(lower(${pattern})) ESCAPE '\\')
      )`);
    }
    if (query.cursor) {
      const [cursorStart, cursorId] = query.cursor.split(':');
      const startMs = Number(cursorStart);
      filters.push(
        or(
          gt(transcriptSegments.startMs, startMs),
          and(eq(transcriptSegments.startMs, startMs), gt(transcriptSegments.id, cursorId!)),
        )!,
      );
    }

    const rows = await conn
      .select({
        id: transcriptSegments.id,
        ownerId: transcriptSegments.ownerId,
        meetingId: transcriptSegments.meetingId,
        sequence: transcriptSegments.sequence,
        sourceText: transcriptSegments.text,
        speakerId: transcriptSegments.speakerId,
        startMs: transcriptSegments.startMs,
        endMs: transcriptSegments.endMs,
        confidence: transcriptSegments.confidence,
        isGap: transcriptSegments.isGap,
        source: transcriptSegments.source,
        bookmarkId: transcriptReviewBookmarks.id,
        revisedText: sql<
          string | null
        >`(SELECT r.revised_text FROM transcript_revisions r WHERE r.segment_id = ${transcriptSegments.id} AND r.owner_id = ${ctx.ownerId} ORDER BY r.created_at DESC, r.id DESC LIMIT 1)`,
        translationText: sql<
          string | null
        >`(SELECT tv.translated_text FROM translation_current_versions tc JOIN translation_versions tv ON tv.id = tc.current_translation_id JOIN transcript_review_projections p ON p.owner_id = tc.owner_id AND p.meeting_id = tc.meeting_id AND p.version = tc.source_projection_version WHERE tc.source_segment_id = ${transcriptSegments.id} AND tc.owner_id = ${ctx.ownerId} AND tc.target_language = ${query.targetLanguage} ORDER BY tc.version DESC LIMIT 1)`,
        disagreement: sql<boolean>`COALESCE((SELECT f.disagreement FROM transcript_review_flags f WHERE f.segment_id = ${transcriptSegments.id} AND f.owner_id = ${ctx.ownerId}), false)`,
      })
      .from(transcriptSegments)
      .leftJoin(
        transcriptReviewBookmarks,
        and(
          eq(transcriptReviewBookmarks.segmentId, transcriptSegments.id),
          eq(transcriptReviewBookmarks.ownerId, ctx.ownerId),
        ),
      )
      .where(and(...filters))
      .orderBy(asc(transcriptSegments.startMs), asc(transcriptSegments.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const items = pageRows.map((row) => {
      const locality = row.source === 'local' ? 'local' : row.source === 'api' ? 'cloud' : 'source';
      const revisedText = row.revisedText ?? null;
      const translationText = row.translationText ?? null;
      return {
        id: row.id,
        ownerId: row.ownerId,
        meetingId: row.meetingId as TranscriptSearchItem['meetingId'],
        sequence: row.sequence,
        sourceText: row.sourceText,
        currentText: revisedText ?? row.sourceText,
        revisedText,
        translationText,
        speakerId: row.speakerId,
        startMs: row.startMs,
        endMs: row.endMs,
        confidence: row.confidence,
        isGap: row.isGap,
        locality,
        disagreement: row.disagreement,
        bookmarked: row.bookmarkId !== null,
      } satisfies TranscriptSearchItem;
    });
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last ? `${last.startMs}:${last.id}` : null };
  }
}
