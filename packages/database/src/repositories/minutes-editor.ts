import { and, eq, asc, sql } from 'drizzle-orm';
import type { Connection } from '../client.js';
import { minutesEditorVersions, minutesEditorCurrent } from '../schema/index.js';
import { migrateMinutesDocument, type MinutesDocumentV1 } from '@kms/domain';
import { type OwnerContext, DbError } from './types.js';
import { mapDbError } from './base.js';

export interface MinutesEditorVersionRow {
  id: string;
  documentId: string;
  meetingId: string;
  version: number;
  contentHash: string;
  document: MinutesDocumentV1;
  createdAt: string;
}

export class MinutesEditorRepository {
  async saveVersion(
    ctx: OwnerContext,
    conn: Connection,
    input: {
      id: string;
      documentId: string;
      meetingId: string;
      version: number;
      contentHash: string;
      document: MinutesDocumentV1;
    },
  ): Promise<MinutesEditorVersionRow> {
    try {
      await conn.insert(minutesEditorVersions).values({
        id: input.id,
        documentId: input.documentId,
        meetingId: input.meetingId,
        ownerId: ctx.ownerId,
        version: input.version,
        contentHash: input.contentHash,
        document: input.document as unknown as Record<string, unknown>,
        createdAt: new Date(),
      });
      return {
        id: input.id,
        documentId: input.documentId,
        meetingId: input.meetingId,
        version: input.version,
        contentHash: input.contentHash,
        document: input.document,
        createdAt: new Date().toISOString(),
      };
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async getVersion(
    ctx: OwnerContext,
    conn: Connection,
    versionId: string,
  ): Promise<MinutesEditorVersionRow | null> {
    const [row]: any[] = await conn
      .select()
      .from(minutesEditorVersions)
      .where(and(eq(minutesEditorVersions.id, versionId), eq(minutesEditorVersions.ownerId, ctx.ownerId)))
      .limit(1);
    if (!row) return null;
    return this.toRow(row);
  }

  async listVersions(
    ctx: OwnerContext,
    conn: Connection,
    documentId: string,
  ): Promise<MinutesEditorVersionRow[]> {
    const rows: any[] = await conn
      .select()
      .from(minutesEditorVersions)
      .where(and(eq(minutesEditorVersions.documentId, documentId), eq(minutesEditorVersions.ownerId, ctx.ownerId)))
      .orderBy(asc(minutesEditorVersions.version));
    return rows.map((row) => this.toRow(row));
  }

  async setCurrent(
    ctx: OwnerContext,
    conn: Connection,
    documentId: string,
    meetingId: string,
    currentVersionId: string,
  ): Promise<void> {
    try {
      await conn
        .insert(minutesEditorCurrent)
        .values({
          documentId,
          meetingId,
          ownerId: ctx.ownerId,
          currentVersionId,
          version: 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: minutesEditorCurrent.documentId,
          set: {
            currentVersionId,
            version: sql`${minutesEditorCurrent.version} + 1`,
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
    documentId: string,
  ): Promise<MinutesEditorVersionRow | null> {
    const [row]: any[] = await conn
      .select({
        id: minutesEditorVersions.id,
        documentId: minutesEditorVersions.documentId,
        meetingId: minutesEditorVersions.meetingId,
        version: minutesEditorVersions.version,
        contentHash: minutesEditorVersions.contentHash,
        document: minutesEditorVersions.document,
        createdAt: minutesEditorVersions.createdAt,
      })
      .from(minutesEditorCurrent)
      .innerJoin(minutesEditorVersions, eq(minutesEditorCurrent.currentVersionId, minutesEditorVersions.id))
      .where(
        and(
          eq(minutesEditorCurrent.documentId, documentId),
          eq(minutesEditorCurrent.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.toRow(row);
  }

  private toRow(row: Record<string, unknown>): MinutesEditorVersionRow {
    let document: MinutesDocumentV1;
    try {
      document = migrateMinutesDocument(row.document);
    } catch {
      throw new DbError('internal');
    }
    return {
      id: row.id as string,
      documentId: row.documentId as string,
      meetingId: row.meetingId as string,
      version: row.version as number,
      contentHash: row.contentHash as string,
      document,
      createdAt: (row.createdAt as Date).toISOString(),
    };
  }
}
