import { and, eq, asc, sql } from 'drizzle-orm';
import type { Connection } from '../client.js';
import {
  finalizationManifests,
  finalizationStates,
  finalizationRuns,
  finalizationRanges,
  finalizationRunParts,
} from '../schema/index.js';
import { FinalizationManifestV1Schema, type FinalizationManifestV1 } from '@kms/domain';
import { type OwnerContext, DbError } from './types.js';
import { mapDbError } from './base.js';

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

export interface FinalizationRun {
  id: string;
  meetingId: string;
  ownerId: string;
  action: FinalizationLocality;
  provider: string | null;
  planHash: string;
  state: FinalizationPartState;
  createdAt: string;
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
  partIndex: number;
  startMs: number;
  endMs: number;
  locality: FinalizationLocality;
  state: FinalizationPartState;
  rawResultHash: string | null;
  safeError: unknown;
  completedAt: string | null;
  createdAt: string;
}

export class FinalizationRepository {
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
        .values({ meetingId, ownerId: ctx.ownerId, state, primaryAction, version: 1, updatedAt: new Date() })
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

  async getState(ctx: OwnerContext, conn: Connection, meetingId: string): Promise<FinalizationState | null> {
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

  async recordRun(
    ctx: OwnerContext,
    conn: Connection,
    run: FinalizationRun,
  ): Promise<void> {
    try {
      await conn.insert(finalizationRuns).values({
        id: run.id,
        meetingId: run.meetingId,
        ownerId: ctx.ownerId,
        action: run.action,
        provider: run.provider,
        planHash: run.planHash,
        state: run.state,
        createdAt: new Date(run.createdAt),
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async getRun(
    ctx: OwnerContext,
    conn: Connection,
    runId: string,
  ): Promise<FinalizationRun | null> {
    const [row]: any[] = await conn
      .select()
      .from(finalizationRuns)
      .where(and(eq(finalizationRuns.id, runId), eq(finalizationRuns.ownerId, ctx.ownerId)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      meetingId: row.meetingId,
      ownerId: row.ownerId,
      action: row.action as FinalizationLocality,
      provider: row.provider ?? null,
      planHash: row.planHash,
      state: row.state as FinalizationPartState,
      createdAt: (row.createdAt as Date).toISOString(),
    };
  }

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

  async recordRunPart(
    ctx: OwnerContext,
    conn: Connection,
    input: {
      id: string;
      meetingId: string;
      runId: string;
      partIndex: number;
      startMs: number;
      endMs: number;
      locality: FinalizationLocality;
      state: FinalizationPartState;
      rawResultHash?: string;
      safeError?: unknown;
      completedAt?: string;
    },
  ): Promise<void> {
    try {
      await conn.insert(finalizationRunParts).values({
        id: input.id,
        runId: input.runId,
        meetingId: input.meetingId,
        ownerId: ctx.ownerId,
        partIndex: input.partIndex,
        startMs: input.startMs,
        endMs: input.endMs,
        locality: input.locality,
        state: input.state,
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
    runId: string,
  ): Promise<FinalizationRunPart[]> {
    const rows: any[] = await conn
      .select()
      .from(finalizationRunParts)
      .where(and(eq(finalizationRunParts.runId, runId), eq(finalizationRunParts.ownerId, ctx.ownerId)))
      .orderBy(asc(finalizationRunParts.partIndex));
    return rows.map((row: any) => ({
      id: row.id,
      meetingId: row.meetingId,
      runId: row.runId,
      partIndex: row.partIndex,
      startMs: row.startMs,
      endMs: row.endMs,
      locality: row.locality as FinalizationLocality,
      state: row.state as FinalizationPartState,
      rawResultHash: row.rawResultHash ?? null,
      safeError: row.safeError ?? null,
      completedAt: row.completedAt ? (row.completedAt as Date).toISOString() : null,
      createdAt: (row.createdAt as Date).toISOString(),
    }));
  }
}
