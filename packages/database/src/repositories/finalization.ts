import { and, eq, asc, sql } from 'drizzle-orm';
import type { Connection } from '../client.js';
import {
  finalizationManifests,
  finalizationStates,
  finalizationRanges,
  finalizationRunParts,
} from '../schema/index.js';
import { FinalizationManifestV1Schema, type FinalizationManifestV1 } from '@kms/domain';
import { type OwnerContext, DbError } from './types.js';
import { ownerCondition, mapDbError } from './base.js';

export type FinalizationStateValue =
  | 'finalizing'
  | 'processing'
  | 'partial_ready'
  | 'ready'
  | 'recovery_required';
export type FinalizationPrimaryAction =
  | 'none'
  | 'local'
  | 'cloud'
  | 'waiting_for_desktop'
  | 'waiting_for_model'
  | 'review_required';
export type FinalizationRangeClassification =
  | 'verified'
  | 'missing'
  | 'corrupt'
  | 'overlapping'
  | 'pending'
  | 'paused'
  | 'gap'
  | 'waived';
export type FinalizationPartState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type FinalizationLocality = 'local' | 'cloud';
export type FinalizationSource = 'mic' | 'system';

export interface FinalizationState {
  meetingId: string;
  state: FinalizationStateValue;
  primaryAction: FinalizationPrimaryAction;
  version: number;
  updatedAt: string;
}

export interface FinalizationRangeRecord {
  id: string;
  meetingId: string;
  source: FinalizationSource;
  startMs: number;
  endMs: number;
  classification: FinalizationRangeClassification;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface FinalizationRunPart {
  id: string;
  meetingId: string;
  runId: string;
  index: number;
  startMs: number;
  endMs: number;
  locality: FinalizationLocality;
  lifecycleState: FinalizationPartState;
  rawResultHash: string | null;
  safeError: unknown;
  completedAt: string | null;
  createdAt: string;
}

export class FinalizationRepository {
  // ── Manifest (immutable) ──

  async recordManifest(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    manifest: FinalizationManifestV1,
    localManifestHash: string,
  ): Promise<void> {
    try {
      await conn.insert(finalizationManifests).values({
        meetingId,
        ownerId: ctx.ownerId,
        manifest: manifest as unknown as Record<string, unknown>,
        localManifestHash,
        createdAt: new Date(),
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async getManifest(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<FinalizationManifestV1 | null> {
    const [row]: any[] = await conn
      .select({ manifest: finalizationManifests.manifest })
      .from(finalizationManifests)
      .where(and(eq(finalizationManifests.meetingId, meetingId), eq(finalizationManifests.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    try {
      return FinalizationManifestV1Schema.parse(row.manifest);
    } catch {
      throw new DbError('internal');
    }
  }

  // ── State (optimistic) ──

  async upsertState(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    state: FinalizationStateValue,
    primaryAction: FinalizationPrimaryAction,
  ): Promise<FinalizationState> {
    try {
      await conn
        .insert(finalizationStates)
        .values({
          meetingId,
          ownerId: ctx.ownerId,
          state,
          primaryAction,
          version: 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: finalizationStates.meetingId,
          set: {
            state,
            primaryAction,
            version: sql`${finalizationStates.version} + 1`,
            updatedAt: new Date(),
          },
        });
      return (await this.getState(ctx, conn, meetingId))!;
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async getState(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<FinalizationState | null> {
    const [row]: any[] = await conn
      .select()
      .from(finalizationStates)
      .where(and(eq(finalizationStates.meetingId, meetingId), eq(finalizationStates.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    return {
      meetingId: row.meetingId,
      state: row.state as FinalizationStateValue,
      primaryAction: row.primaryAction as FinalizationPrimaryAction,
      version: row.version as number,
      updatedAt: (row.updatedAt as Date).toISOString(),
    };
  }

  // ── Range classification (immutable, append-only) ──

  async recordRangeClassification(
    ctx: OwnerContext,
    conn: Connection,
    input: {
      id: string;
      meetingId: string;
      source: FinalizationSource;
      startMs: number;
      endMs: number;
      classification: FinalizationRangeClassification;
      actorId?: string;
      reason?: string;
    },
  ): Promise<void> {
    try {
      await conn.insert(finalizationRanges).values({
        id: input.id,
        meetingId: input.meetingId,
        ownerId: ctx.ownerId,
        source: input.source,
        startMs: input.startMs,
        endMs: input.endMs,
        classification: input.classification,
        actorId: input.actorId ?? null,
        reason: input.reason ?? null,
        createdAt: new Date(),
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async listRangeClassifications(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<FinalizationRangeRecord[]> {
    const rows: any[] = await conn
      .select()
      .from(finalizationRanges)
      .where(and(eq(finalizationRanges.meetingId, meetingId), eq(finalizationRanges.ownerId, ctx.ownerId)))
      .orderBy(asc(finalizationRanges.startMs), asc(finalizationRanges.source));

    return rows.map((row: any) => ({
      id: row.id,
      meetingId: row.meetingId,
      source: row.source as FinalizationSource,
      startMs: row.startMs,
      endMs: row.endMs,
      classification: row.classification as FinalizationRangeClassification,
      actorId: row.actorId ?? null,
      reason: row.reason ?? null,
      createdAt: (row.createdAt as Date).toISOString(),
    }));
  }

  // ── Run parts (immutable) ──

  async recordRunPart(
    ctx: OwnerContext,
    conn: Connection,
    input: {
      id: string;
      meetingId: string;
      runId: string;
      index: number;
      startMs: number;
      endMs: number;
      locality: FinalizationLocality;
      lifecycleState: FinalizationPartState;
      rawResultHash?: string;
      safeError?: unknown;
      completedAt?: string;
    },
  ): Promise<void> {
    try {
      await conn.insert(finalizationRunParts).values({
        id: input.id,
        meetingId: input.meetingId,
        ownerId: ctx.ownerId,
        runId: input.runId,
        index: input.index,
        startMs: input.startMs,
        endMs: input.endMs,
        locality: input.locality,
        lifecycleState: input.lifecycleState,
        rawResultHash: input.rawResultHash ?? null,
        safeError: input.safeError ?? null,
        completedAt: input.completedAt ? new Date(input.completedAt) : null,
        createdAt: new Date(),
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async listRunParts(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<FinalizationRunPart[]> {
    const rows: any[] = await conn
      .select()
      .from(finalizationRunParts)
      .where(and(eq(finalizationRunParts.meetingId, meetingId), eq(finalizationRunParts.ownerId, ctx.ownerId)))
      .orderBy(asc(finalizationRunParts.runId), asc(finalizationRunParts.index));

    return rows.map((row: any) => ({
      id: row.id,
      meetingId: row.meetingId,
      runId: row.runId,
      index: row.index,
      startMs: row.startMs,
      endMs: row.endMs,
      locality: row.locality as FinalizationLocality,
      lifecycleState: row.lifecycleState as FinalizationPartState,
      rawResultHash: row.rawResultHash ?? null,
      safeError: row.safeError ?? null,
      completedAt: row.completedAt ? (row.completedAt as Date).toISOString() : null,
      createdAt: (row.createdAt as Date).toISOString(),
    }));
  }
}
