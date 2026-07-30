import { and, eq, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Connection } from '../client.js';
import {
  audioChunks,
  audioManifests,
  audioAssets,
  audioReconciliation,
  audioOrphanRecords,
  timelineMarkers,
} from '../schema/index.js';
import { type AudioChunk, type ChunkId, type AudioSource, AudioChunkSchema } from '@kms/domain';
import { type OwnerContext, type Page, type PageQuery, DbError } from './types.js';
import { ownerCondition, paginate, toDomain, mapDbError } from './base.js';

// ── Domain schemas for manifest/asset (not yet in P02) ──

const ManifestRowSchema = z
  .object({
    id: z.string(),
    meetingId: z.string(),
    ownerId: z.string(),
    source: z.enum(['mic', 'system', 'derived_mix']),
    storageKey: z.string(),
    sha256: z.string().length(64),
    byteLength: z.number().int().positive(),
    entryCount: z.number().int().nonnegative(),
    firstChunkIndex: z.number().int().nonnegative(),
    lastChunkIndex: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

const AssetRowSchema = z
  .object({
    id: z.string(),
    meetingId: z.string(),
    ownerId: z.string(),
    source: z.enum(['mic', 'system', 'derived_mix']),
    label: z.string(),
    storageKey: z.string(),
    sha256: z.string().length(64),
    byteLength: z.number().int().positive(),
    derivedFrom: z.array(z.enum(['mic', 'system'])),
    mixVersion: z.number().int().positive(),
    createdAt: z.string(),
  })
  .strict();

export interface ChunkRegisterResult {
  id: ChunkId;
  created: boolean;
}

export interface ManifestInput {
  storageKey: string;
  sha256: string;
  byteLength: number;
  entryCount: number;
  firstChunkIndex: number;
  lastChunkIndex: number;
}

export interface AudioAssetInput {
  source: 'derived_mix';
  label: string;
  storageKey: string;
  sha256: string;
  byteLength: number;
  derivedFrom: string[];
  mixVersion: number;
}

function isSameRegistrationShape(existing: AudioChunk, incoming: AudioChunk): boolean {
  return (
    existing.id === incoming.id &&
    existing.meetingId === incoming.meetingId &&
    existing.source === incoming.source &&
    existing.chunkIndex === incoming.chunkIndex &&
    existing.storageKey === incoming.storageKey &&
    existing.startedAt === incoming.startedAt &&
    existing.durationMs === incoming.durationMs &&
    existing.byteLength === incoming.byteLength &&
    existing.codec === incoming.codec &&
    existing.container === incoming.container &&
    existing.sampleRate === incoming.sampleRate &&
    existing.channels === incoming.channels &&
    existing.sha256 === incoming.sha256 &&
    existing.wallClockStart === incoming.wallClockStart &&
    existing.wallClockEnd === incoming.wallClockEnd &&
    existing.monotonicStart === incoming.monotonicStart &&
    existing.monotonicEnd === incoming.monotonicEnd
  );
}

export class AudioRepository {
  // ── registerChunk (idempotent) ──

  async registerChunk(
    ctx: OwnerContext,
    conn: Connection,
    chunk: AudioChunk,
  ): Promise<ChunkRegisterResult> {
    const { id, meetingId, source, chunkIndex, sha256 } = chunk;

    // First check if chunk exists (avoids transaction-aborted state from 23505)
    const existing = await this.getChunk(ctx, conn, id as ChunkId);
    if (existing) {
      if (isSameRegistrationShape(existing, chunk)) {
        return { id: id as ChunkId, created: false };
      }
      throw new DbError('conflict');
    }

    // Use conflict-safe insertion so concurrent registrations can re-read the
    // canonical row without leaving the transaction aborted on a unique error.
    try {
      const inserted = await conn
        .insert(audioChunks)
        .values({
          id,
          meetingId,
          ownerId: ctx.ownerId,
          source,
          chunkIndex,
          storageKey: chunk.storageKey,
          startedAt: new Date(chunk.startedAt),
          durationMs: chunk.durationMs,
          byteLength: chunk.byteLength,
          codec: chunk.codec,
          container: chunk.container,
          sampleRate: chunk.sampleRate,
          channels: chunk.channels,
          sha256,
          uploadStatus: chunk.uploadStatus,
          finalizedAt: chunk.finalizedAt ? new Date(chunk.finalizedAt) : null,
          wallClockStart: new Date(chunk.wallClockStart),
          wallClockEnd: new Date(chunk.wallClockEnd),
          monotonicStart: chunk.monotonicStart,
          monotonicEnd: chunk.monotonicEnd,
        })
        .onConflictDoNothing()
        .returning({ id: audioChunks.id });
      if (inserted.length > 0) return { id: id as ChunkId, created: true };
      const concurrent = await this.getChunk(ctx, conn, id as ChunkId);
      if (concurrent && isSameRegistrationShape(concurrent, chunk)) {
        return { id: id as ChunkId, created: false };
      }
      throw new DbError('conflict');
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async bumpReconciliation(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<number> {
    const [row]: any[] = await conn
      .insert(audioReconciliation)
      .values({ meetingId, ownerId: ctx.ownerId, version: 1 })
      .onConflictDoUpdate({
        target: audioReconciliation.meetingId,
        set: { version: sql`${audioReconciliation.version} + 1`, updatedAt: new Date() },
      })
      .returning({ version: audioReconciliation.version });
    return Number(row?.version ?? 1);
  }

  // ── finalizeChunk ──

  async finalizeChunk(
    ctx: OwnerContext,
    conn: Connection,
    id: ChunkId,
    sha256: string,
    finalizedAt: string,
  ): Promise<AudioChunk> {
    try {
      const [row]: any[] = await conn
        .update(audioChunks)
        .set({
          uploadStatus: 'completed',
          finalizedAt: new Date(finalizedAt),
        })
        .where(
          and(
            eq(audioChunks.id, id),
            eq(audioChunks.ownerId, ctx.ownerId),
            eq(audioChunks.sha256, sha256),
          ),
        )
        .returning();

      if (!row) {
        // Check if chunk exists
        const existing = await this.getChunk(ctx, conn, id);
        if (!existing) throw new DbError('not_found');
        // sha256 mismatch or already finalized
        throw new DbError('conflict');
      }

      const { ownerId: _ownerId, ...chunkFields } = row;
      return toDomain(chunkFields, AudioChunkSchema);
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }
  }

  // ── getChunk ──

  async getChunk(ctx: OwnerContext, conn: Connection, id: ChunkId): Promise<AudioChunk | null> {
    const [row]: any[] = await conn
      .select()
      .from(audioChunks)
      .where(and(eq(audioChunks.id, id), eq(audioChunks.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    const { ownerId: _ownerId, ...chunkFields } = row;
    return toDomain(chunkFields, AudioChunkSchema);
  }

  // ── listChunks ──

  async listChunks(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    source: AudioSource,
    query: PageQuery,
  ): Promise<Page<AudioChunk>> {
    const page = await paginate(
      conn,
      query,
      audioChunks,
      audioChunks.startedAt,
      audioChunks.id,
      [
        ownerCondition(ctx, audioChunks),
        eq(audioChunks.meetingId, meetingId),
        eq(audioChunks.source, source),
      ],
      'startedAt',
    );
    const items: readonly AudioChunk[] = page.items.map((row: any) => {
      const { ownerId: _ownerId, ...chunkFields } = row;
      return toDomain(chunkFields, AudioChunkSchema);
    });
    return { items, nextCursor: page.nextCursor };
  }

  // ── upsertManifest ──

  async upsertManifest(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    source: AudioSource,
    manifest: ManifestInput,
  ): Promise<void> {
    try {
      await conn
        .insert(audioManifests)
        .values({
          meetingId,
          ownerId: ctx.ownerId,
          source,
          storageKey: manifest.storageKey,
          sha256: manifest.sha256,
          byteLength: manifest.byteLength,
          entryCount: manifest.entryCount,
          firstChunkIndex: manifest.firstChunkIndex,
          lastChunkIndex: manifest.lastChunkIndex,
        })
        .onConflictDoUpdate({
          target: [audioManifests.meetingId, audioManifests.source],
          set: {
            storageKey: manifest.storageKey,
            sha256: manifest.sha256,
            byteLength: manifest.byteLength,
            entryCount: manifest.entryCount,
            firstChunkIndex: manifest.firstChunkIndex,
            lastChunkIndex: manifest.lastChunkIndex,
            updatedAt: new Date(),
          },
        });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── getManifest ──

  async getManifest(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    source: AudioSource,
  ): Promise<Record<string, unknown> | null> {
    const [row]: any[] = await conn
      .select()
      .from(audioManifests)
      .where(
        and(
          eq(audioManifests.meetingId, meetingId),
          eq(audioManifests.source, source),
          eq(audioManifests.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);

    return row ? toDomain(row as Record<string, unknown>, ManifestRowSchema) : null;
  }

  // ── createAsset ──

  async createAsset(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    asset: AudioAssetInput,
  ): Promise<any> {
    try {
      const [row]: any[] = await conn
        .insert(audioAssets)
        .values({
          meetingId,
          ownerId: ctx.ownerId,
          source: asset.source,
          label: asset.label,
          storageKey: asset.storageKey,
          sha256: asset.sha256,
          byteLength: asset.byteLength,
          derivedFrom: asset.derivedFrom,
          mixVersion: asset.mixVersion,
        })
        .returning();

      return toDomain(row as Record<string, unknown>, AssetRowSchema);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── listAssets ──

  async listAssets(ctx: OwnerContext, conn: Connection, meetingId: string): Promise<any[]> {
    try {
      const rows: any[] = await conn
        .select()
        .from(audioAssets)
        .where(and(eq(audioAssets.meetingId, meetingId), eq(audioAssets.ownerId, ctx.ownerId)))
        .orderBy(asc(audioAssets.createdAt));

      return rows.map((row) => toDomain(row as Record<string, unknown>, AssetRowSchema));
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── recordOrphan ──
  async recordOrphan(
    ctx: OwnerContext,
    conn: Connection,
    input: {
      meetingId: string;
      source: AudioSource;
      chunkIndex: number;
      storageKey: string;
      sha256?: string | null;
      byteLength?: number | null;
      status:
        | 'pending_object'
        | 'size_mismatch'
        | 'corrupt_object'
        | 'missing_completion'
        | 'reconciled'
        | 'abandoned';
    },
  ): Promise<void> {
    try {
      await conn
        .insert(audioOrphanRecords)
        .values({
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          source: input.source,
          chunkIndex: input.chunkIndex,
          storageKey: input.storageKey,
          sha256: input.sha256 ?? null,
          byteLength: input.byteLength ?? null,
          status: input.status,
        })
        .onConflictDoUpdate({
          target: [
            audioOrphanRecords.meetingId,
            audioOrphanRecords.source,
            audioOrphanRecords.chunkIndex,
          ],
          set: {
            status: input.status,
            sha256: input.sha256 ?? null,
            byteLength: input.byteLength ?? null,
            reconciledAt: input.status === 'reconciled' ? new Date() : null,
          },
        });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── listOrphans ──
  async listOrphans(ctx: OwnerContext, conn: Connection, meetingId: string): Promise<any[]> {
    try {
      const rows = await conn
        .select()
        .from(audioOrphanRecords)
        .where(
          and(
            eq(audioOrphanRecords.meetingId, meetingId),
            eq(audioOrphanRecords.ownerId, ctx.ownerId),
          ),
        )
        .orderBy(asc(audioOrphanRecords.chunkIndex));
      return rows.map(({ storageKey: _storageKey, ownerId: _ownerId, ...rest }) => rest);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── getTimelineMarkers ──
  async getTimelineMarkers(ctx: OwnerContext, conn: Connection, meetingId: string): Promise<any[]> {
    try {
      const rows = await conn
        .select()
        .from(timelineMarkers)
        .where(
          and(eq(timelineMarkers.meetingId, meetingId), eq(timelineMarkers.ownerId, ctx.ownerId)),
        )
        .orderBy(asc(timelineMarkers.startMs));
      return rows;
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── getReconciliation ──
  async getReconciliation(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<{ version: number; updatedAt: Date } | null> {
    try {
      const [row]: any[] = await conn
        .select()
        .from(audioReconciliation)
        .where(
          and(
            eq(audioReconciliation.meetingId, meetingId),
            eq(audioReconciliation.ownerId, ctx.ownerId),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        version: Number(row.version),
        updatedAt: row.updatedAt,
      };
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }
}
