import { and, eq, asc, sql } from 'drizzle-orm';
import type { Connection } from '../client.js';
import {
  transcriptSegments,
  transcriptRevisions,
  speakers,
  translationSegments,
  translationCurrent,
  transcriptCompleteness,
} from '../schema/index.js';
import {
  type TranscriptSegment,
  type TranscriptRevision,
  type Speaker,
  type TranslationSegment,
  type Completeness,
  TranscriptSegmentSchema,
  TranscriptRevisionSchema,
  SpeakerSchema,
  TranslationSegmentSchema,
  CompletenessSchema,
} from '@kms/domain';
import { type OwnerContext, type Page, type PageQuery, DbError } from './types.js';
import { ownerCondition, paginate, toDomain, mapDbError } from './base.js';

export class TranscriptRepository {
  // ── appendSegments (bulk insert) ──

  async appendSegments(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    segments: TranscriptSegment[],
  ): Promise<void> {
    if (segments.length === 0) return;

    try {
      await conn.insert(transcriptSegments).values(
        segments.map((s) => ({
          id: s.id,
          meetingId,
          ownerId: ctx.ownerId,
          sequence: s.sequence,
          speakerId: s.speakerId,
          language: s.language,
          text: s.text,
          startMs: s.startMs,
          endMs: s.endMs,
          confidence: s.confidence ?? null,
          source: s.source,
          provider: s.provider ?? null,
          providerEventId: s.providerEventId ?? null,
          isGap: s.isGap ?? false,
          gapReason: s.gapReason ?? null,
          createdAt: new Date(s.createdAt),
        })),
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new DbError('duplicate');
      }
      throw mapDbError(e);
    }
  }

  // ── finalizeTranscript ──

  async finalizeTranscript(
    _ctx: OwnerContext,
    _conn: Connection,
    _meetingId: string,
  ): Promise<void> {
    // No-op marker — sequence is already stable; immutability is row-level.
    return;
  }

  // ── getSegment ──

  async getSegment(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
  ): Promise<TranscriptSegment | null> {
    const [row]: any[] = await conn
      .select()
      .from(transcriptSegments)
      .where(and(eq(transcriptSegments.id, id), eq(transcriptSegments.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    const { ownerId: _ownerId, ...segFields } = row;
    return toDomain(segFields, TranscriptSegmentSchema);
  }

  // ── listSegments ──

  async listSegments(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    query: PageQuery,
  ): Promise<Page<TranscriptSegment>> {
    const page = await paginate(
      conn,
      query,
      transcriptSegments,
      transcriptSegments.createdAt,
      transcriptSegments.id,
      [ownerCondition(ctx, transcriptSegments), eq(transcriptSegments.meetingId, meetingId)],
    );
    const items: readonly TranscriptSegment[] = page.items.map((row: any) => {
      const { ownerId: _ownerId, ...segFields } = row;
      return toDomain(segFields, TranscriptSegmentSchema);
    });
    return { items, nextCursor: page.nextCursor };
  }

  // ── addRevision ──

  async addRevision(
    ctx: OwnerContext,
    conn: Connection,
    revision: TranscriptRevision,
  ): Promise<TranscriptRevision> {
    // Look up the segment to get the meetingId
    const [segment]: any[] = await conn
      .select({ meetingId: transcriptSegments.meetingId })
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.id, revision.segmentId),
          eq(transcriptSegments.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);

    if (!segment) throw new DbError('not_found');

    try {
      const [row]: any[] = await conn
        .insert(transcriptRevisions)
        .values({
          id: revision.id,
          segmentId: revision.segmentId,
          meetingId: segment.meetingId,
          ownerId: ctx.ownerId,
          baseRevisionId: revision.baseRevisionId,
          revisedText: revision.revisedText,
          revisedSpeakerId: revision.revisedSpeakerId ?? null,
          actorId: revision.actorId,
          reason: revision.reason ?? null,
          createdAt: new Date(revision.createdAt),
        })
        .returning();

      if (!row) throw new DbError('internal');
      const { ownerId: _ro, meetingId: _rm, ...revFields } = row;
      // baseRevisionId is .nullable() — postProcess restores null after prepareRow
      return toDomain(revFields, TranscriptRevisionSchema, (r) => ({
        ...r,
        baseRevisionId: r.baseRevisionId ?? null,
      }));
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── listRevisions ──

  async listRevisions(
    ctx: OwnerContext,
    conn: Connection,
    segmentId: string,
  ): Promise<TranscriptRevision[]> {
    try {
      const rows: any[] = await conn
        .select()
        .from(transcriptRevisions)
        .where(
          and(
            eq(transcriptRevisions.segmentId, segmentId),
            eq(transcriptRevisions.ownerId, ctx.ownerId),
          ),
        )
        .orderBy(asc(transcriptRevisions.createdAt));

      return rows.map((row: any) => {
        const { ownerId: _ro, meetingId: _rm, ...revFields } = row;
        return toDomain(revFields, TranscriptRevisionSchema, (r) => ({
          ...r,
          baseRevisionId: r.baseRevisionId ?? null,
        }));
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── upsertSpeaker ──

  async upsertSpeaker(ctx: OwnerContext, conn: Connection, speaker: Speaker): Promise<Speaker> {
    try {
      const [row]: any[] = await conn
        .insert(speakers)
        .values({
          id: speaker.id,
          meetingId: speaker.meetingId,
          ownerId: ctx.ownerId,
          label: speaker.label,
          displayName: speaker.displayName ?? null,
        })
        .onConflictDoUpdate({
          target: [speakers.meetingId, speakers.label],
          set: {
            displayName: speaker.displayName ?? null,
          },
        })
        .returning();

      if (!row) throw new DbError('internal');
      const { ownerId: _ownerId, createdAt: _createdAt, ...spkFields } = row;
      return toDomain(spkFields, SpeakerSchema);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── listSpeakers ──

  async listSpeakers(ctx: OwnerContext, conn: Connection, meetingId: string): Promise<Speaker[]> {
    try {
      const rows: any[] = await conn
        .select()
        .from(speakers)
        .where(and(eq(speakers.meetingId, meetingId), eq(speakers.ownerId, ctx.ownerId)))
        .orderBy(asc(speakers.createdAt));

      return rows.map((row: any) => {
        const { ownerId: _ownerId, createdAt: _createdAt, ...spkFields } = row;
        return toDomain(spkFields, SpeakerSchema);
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── upsertTranslation ──

  async upsertTranslation(
    ctx: OwnerContext,
    conn: Connection,
    input: {
      id: string;
      sourceSegmentId: string;
      meetingId: string;
      targetLanguage: 'vi' | 'en';
      translatedText: string;
      provider?: string;
      model?: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      createdAt: string;
    },
  ): Promise<TranslationSegment> {
    try {
      // Insert immutable translation row
      const [row]: any[] = await conn
        .insert(translationSegments)
        .values({
          id: input.id,
          sourceSegmentId: input.sourceSegmentId,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          targetLanguage: input.targetLanguage,
          translatedText: input.translatedText,
          provider: input.provider ?? null,
          model: input.model ?? null,
          status: input.status,
          createdAt: new Date(input.createdAt),
        })
        .returning();

      if (!row) throw new DbError('internal');
      const { ownerId: _to, meetingId: _tm, ...transFields } = row;
      const translationResult = toDomain(transFields, TranslationSegmentSchema);

      // Upsert current pointer
      await conn
        .insert(translationCurrent)
        .values({
          sourceSegmentId: input.sourceSegmentId,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          currentTranslationId: input.id,
          version: 1,
        })
        .onConflictDoUpdate({
          target: translationCurrent.sourceSegmentId,
          set: {
            currentTranslationId: input.id,
            version: sql`${translationCurrent.version} + 1`,
          },
        });

      return translationResult;
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── getCurrentTranslation ──

  async getCurrentTranslation(
    ctx: OwnerContext,
    conn: Connection,
    segmentId: string,
  ): Promise<TranslationSegment | null> {
    try {
      const [row]: any[] = await conn
        .select({
          id: translationSegments.id,
          sourceSegmentId: translationSegments.sourceSegmentId,
          targetLanguage: translationSegments.targetLanguage,
          translatedText: translationSegments.translatedText,
          provider: translationSegments.provider,
          model: translationSegments.model,
          status: translationSegments.status,
          createdAt: translationSegments.createdAt,
        })
        .from(translationCurrent)
        .innerJoin(
          translationSegments,
          eq(translationCurrent.currentTranslationId, translationSegments.id),
        )
        .where(
          and(
            eq(translationCurrent.sourceSegmentId, segmentId),
            eq(translationCurrent.ownerId, ctx.ownerId),
          ),
        )
        .limit(1);

      if (!row) return null;
      return toDomain(row, TranslationSegmentSchema);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── setCompleteness (optimistic) ──

  async setCompleteness(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    completeness: Completeness,
    expectedVersion: number,
  ): Promise<Completeness> {
    try {
      // INSERT … ON CONFLICT (meetingId is PK) DO UPDATE with version check
      await conn
        .insert(transcriptCompleteness)
        .values({
          meetingId,
          ownerId: ctx.ownerId,
          audioComplete: completeness.audioComplete,
          transcriptComplete: completeness.transcriptComplete,
          diarizationComplete: completeness.diarizationComplete ?? null,
          translationComplete: completeness.translationComplete ?? null,
          gaps: completeness.gaps,
          pendingRanges: completeness.pendingRanges,
          version: 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: transcriptCompleteness.meetingId,
          set: {
            audioComplete: completeness.audioComplete,
            transcriptComplete: completeness.transcriptComplete,
            diarizationComplete: completeness.diarizationComplete ?? null,
            translationComplete: completeness.translationComplete ?? null,
            gaps: completeness.gaps,
            pendingRanges: completeness.pendingRanges,
            version: sql`${transcriptCompleteness.version} + 1`,
            updatedAt: new Date(),
          },
          // WHERE version = expectedVersion — only update if version matches
          where:
            expectedVersion > 0
              ? sql`${transcriptCompleteness.version} = ${expectedVersion}`
              : undefined,
        });

      return (await this.getCompleteness(ctx, conn, meetingId))!;
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }
  }

  // ── getCompleteness ──

  async getCompleteness(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<Completeness | null> {
    const [row]: any[] = await conn
      .select()
      .from(transcriptCompleteness)
      .where(
        and(
          eq(transcriptCompleteness.meetingId, meetingId),
          eq(transcriptCompleteness.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);

    if (!row) return null;
    const { ownerId: _co, meetingId: _cm, version: _cv, updatedAt: _cu, ...compFields } = row;
    return toDomain(compFields, CompletenessSchema);
  }
}
