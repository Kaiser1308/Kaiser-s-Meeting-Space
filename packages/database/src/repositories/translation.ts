import { and, eq, asc, sql } from 'drizzle-orm';
import type { Connection } from '../client.js';
import { translationVersions, translationVersionsCurrent } from '../schema/index.js';
import { TranslationVersionV1Schema, type TranslationVersionV1 } from '@kms/translation';
import { type OwnerContext, DbError } from './types.js';
import { mapDbError, toDomain } from './base.js';

export class TranslationRepository {
  async recordVersion(
    ctx: OwnerContext,
    conn: Connection,
    version: TranslationVersionV1,
  ): Promise<TranslationVersionV1> {
    try {
      await conn.insert(translationVersions).values({
        id: version.id,
        meetingId: version.meetingId,
        ownerId: ctx.ownerId,
        sourceSegmentId: version.sourceSegmentId,
        sourceRevision: version.sourceRevision,
        sourceTextHash: version.sourceTextHash,
        sourceLanguage: version.sourceLanguage,
        targetLanguage: version.targetLanguage,
        translatedText: version.translatedText,
        provider: version.provider,
        model: version.model,
        config: version.config,
        promptId: version.promptId ?? null,
        status: version.status,
        confidence: version.confidence ?? null,
        usage: version.usage ?? null,
        createdAt: new Date(version.createdAt),
        completedAt: version.completedAt ? new Date(version.completedAt) : null,
      });
      return version;
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async getVersion(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
  ): Promise<TranslationVersionV1 | null> {
    const [row]: any[] = await conn
      .select()
      .from(translationVersions)
      .where(and(eq(translationVersions.id, id), eq(translationVersions.ownerId, ctx.ownerId)))
      .limit(1);
    if (!row) return null;
    return this.toVersion(row);
  }

  async listVersions(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<TranslationVersionV1[]> {
    const rows: any[] = await conn
      .select()
      .from(translationVersions)
      .where(and(eq(translationVersions.meetingId, meetingId), eq(translationVersions.ownerId, ctx.ownerId)))
      .orderBy(asc(translationVersions.sourceSegmentId), asc(translationVersions.sourceRevision));
    return rows.map((row) => this.toVersion(row));
  }

  async setCurrent(
    ctx: OwnerContext,
    conn: Connection,
    sourceSegmentId: string,
    meetingId: string,
    targetLanguage: 'vi' | 'en',
    currentVersionId: string,
  ): Promise<void> {
    try {
      await conn
        .insert(translationVersionsCurrent)
        .values({
          sourceSegmentId,
          meetingId,
          ownerId: ctx.ownerId,
          targetLanguage,
          currentVersionId,
          version: 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: translationVersionsCurrent.sourceSegmentId,
          set: {
            currentVersionId,
            targetLanguage,
            version: sql`${translationVersionsCurrent.version} + 1`,
            updatedAt: new Date(),
          },
        });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async getCurrent(
    ctx: OwnerContext,
    conn: Connection,
    sourceSegmentId: string,
  ): Promise<TranslationVersionV1 | null> {
    const [row]: any[] = await conn
      .select({
        id: translationVersions.id,
        meetingId: translationVersions.meetingId,
        sourceSegmentId: translationVersions.sourceSegmentId,
        sourceRevision: translationVersions.sourceRevision,
        sourceTextHash: translationVersions.sourceTextHash,
        sourceLanguage: translationVersions.sourceLanguage,
        targetLanguage: translationVersions.targetLanguage,
        translatedText: translationVersions.translatedText,
        provider: translationVersions.provider,
        model: translationVersions.model,
        config: translationVersions.config,
        promptId: translationVersions.promptId,
        status: translationVersions.status,
        confidence: translationVersions.confidence,
        usage: translationVersions.usage,
        createdAt: translationVersions.createdAt,
        completedAt: translationVersions.completedAt,
      })
      .from(translationVersionsCurrent)
      .innerJoin(
        translationVersions,
        eq(translationVersionsCurrent.currentVersionId, translationVersions.id),
      )
      .where(
        and(
          eq(translationVersionsCurrent.sourceSegmentId, sourceSegmentId),
          eq(translationVersionsCurrent.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.toVersion(row);
  }

  private toVersion(row: Record<string, unknown>): TranslationVersionV1 {
    const { ownerId: _ownerId, ...fields } = row;
    return toDomain(fields, TranslationVersionV1Schema, (r) => ({
      ...r,
      promptId: r.promptId ?? undefined,
      confidence: r.confidence ?? undefined,
      usage: r.usage ?? undefined,
      completedAt: r.completedAt ?? undefined,
    }));
  }
}
