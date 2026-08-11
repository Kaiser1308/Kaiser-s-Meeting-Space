import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Connection } from '../client.js';
import {
  finalizationRunParts,
  finalizationRuns,
  outboxEvents,
  transcriptReviewDecisions,
  transcriptReviewIdempotency,
  transcriptReviewProjections,
  transcriptReviewRevisions,
  transcriptReviewLineage,
  transcriptSegments,
} from '../schema/index.js';
import {
  ProjectionDecisionCommandSchema,
  ProjectionRevisionCommandSchema,
  type ProjectionDecisionCommand,
  type ProjectionRevisionCommand,
} from '@kms/domain';
import { DbError, type OwnerContext, type Page, type PageQuery } from './types.js';
import { paginate } from './base.js';

export interface TranscriptRunSummary {
  readonly id: string;
  readonly meetingId: string;
  readonly ownerId: string;
  readonly action: string;
  readonly provider: string | null;
  readonly planHash: string;
  readonly state: string;
  readonly createdAt: Date;
}

export interface TranscriptRunDetail extends TranscriptRunSummary {
  readonly parts: readonly {
    id: string;
    runId: string;
    partIndex: number;
    startMs: number;
    endMs: number;
    state: string;
  }[];
  readonly lineage: readonly TranscriptLineageRecord[];
}

export interface TranscriptLineageRecord {
  readonly id: string;
  readonly runId: string;
  readonly partId: string;
  readonly eventId: string;
  readonly sourceSegmentId: string;
  readonly finalizationManifestHash: string;
  readonly audioManifestHash: string;
}

export function getReviewCommandFingerprint(command: unknown): string {
  return createHash('sha256').update(JSON.stringify(command), 'utf8').digest('hex');
}

export function validateReviewCommandOwnership(
  ctx: OwnerContext,
  command: { ownerId: string },
): void {
  if (ctx.ownerId !== command.ownerId) throw new DbError('not_found');
}

export function createContentFreeReviewOutboxPayload(
  commandType: 'decision' | 'revision',
  command: {
    id: string;
    ownerId: string;
    meetingId: string;
    segmentId: string;
    actorId: string;
    idempotencyKey: string;
  },
  projectionVersion: number,
) {
  return {
    commandType,
    commandId: command.id,
    ownerId: command.ownerId,
    meetingId: command.meetingId,
    segmentId: command.segmentId,
    actorId: command.actorId,
    projectionVersion,
    idempotencyKey: command.idempotencyKey,
  };
}

export class TranscriptReviewRepository {
  async listRuns(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    query: PageQuery = { limit: 50 },
  ): Promise<Page<TranscriptRunSummary>> {
    const page = await paginate(
      conn,
      query,
      finalizationRuns,
      finalizationRuns.createdAt,
      finalizationRuns.id,
      [eq(finalizationRuns.ownerId, ctx.ownerId), eq(finalizationRuns.meetingId, meetingId)],
    );
    return {
      ...page,
      items: page.items.map((row: any) => ({
        id: row.id,
        meetingId: row.meetingId,
        ownerId: row.ownerId,
        action: row.action,
        provider: row.provider,
        planHash: row.planHash,
        state: row.state,
        createdAt: row.createdAt,
      })),
    };
  }

  async getRun(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    runId: string,
  ): Promise<TranscriptRunDetail | null> {
    const [run] = await conn
      .select()
      .from(finalizationRuns)
      .where(
        and(
          eq(finalizationRuns.id, runId),
          eq(finalizationRuns.ownerId, ctx.ownerId),
          eq(finalizationRuns.meetingId, meetingId),
        ),
      )
      .limit(1);
    if (!run) return null;
    const parts = await conn
      .select()
      .from(finalizationRunParts)
      .where(
        and(eq(finalizationRunParts.runId, runId), eq(finalizationRunParts.ownerId, ctx.ownerId)),
      )
      .orderBy(asc(finalizationRunParts.partIndex));
    const lineageRows = await conn
      .select()
      .from(transcriptReviewLineage)
      .where(
        and(
          eq(transcriptReviewLineage.ownerId, ctx.ownerId),
          eq(transcriptReviewLineage.meetingId, meetingId),
          eq(transcriptReviewLineage.runId, runId),
        ),
      );
    return {
      id: run.id,
      meetingId: run.meetingId,
      ownerId: run.ownerId,
      action: run.action,
      provider: run.provider,
      planHash: run.planHash,
      state: run.state,
      createdAt: run.createdAt,
      parts: parts.map((part) => ({
        id: part.id,
        runId: part.runId,
        partIndex: part.partIndex,
        startMs: part.startMs,
        endMs: part.endMs,
        state: part.state,
      })),
      lineage: lineageRows.map((lineage) => ({
        id: lineage.id,
        runId: lineage.runId,
        partId: lineage.partId,
        eventId: lineage.eventId,
        sourceSegmentId: lineage.sourceSegmentId,
        finalizationManifestHash: lineage.finalizationManifestHash,
        audioManifestHash: lineage.audioManifestHash,
      })),
    };
  }

  async compareRuns(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    runIds: readonly string[],
  ) {
    if (runIds.length < 2) throw new DbError('constraint_violation');
    const rows = await conn
      .select()
      .from(finalizationRuns)
      .where(
        and(
          eq(finalizationRuns.ownerId, ctx.ownerId),
          eq(finalizationRuns.meetingId, meetingId),
          inArray(finalizationRuns.id, [...runIds]),
        ),
      );
    if (rows.length !== runIds.length) throw new DbError('not_found');
    const lineageRows = await conn
      .select({
        runId: transcriptReviewLineage.runId,
        finalizationManifestHash: transcriptReviewLineage.finalizationManifestHash,
        audioManifestHash: transcriptReviewLineage.audioManifestHash,
      })
      .from(transcriptReviewLineage)
      .where(
        and(
          eq(transcriptReviewLineage.ownerId, ctx.ownerId),
          eq(transcriptReviewLineage.meetingId, meetingId),
          inArray(transcriptReviewLineage.runId, [...runIds]),
        ),
      );
    if (new Set(lineageRows.map((row) => row.runId)).size !== runIds.length)
      throw new DbError('conflict');
    const lineageHashes = new Set(
      lineageRows.map((row) => `${row.finalizationManifestHash}:${row.audioManifestHash}`),
    );
    if (lineageHashes.size !== 1) throw new DbError('conflict');
    const lineageByRun = new Map(lineageRows.map((row) => [row.runId, row]));
    return rows.map((row) => ({
      id: row.id,
      meetingId: row.meetingId,
      provider: row.provider,
      finalizationManifestHash: lineageByRun.get(row.id)!.finalizationManifestHash,
      audioManifestHash: lineageByRun.get(row.id)!.audioManifestHash,
      state: row.state,
    }));
  }

  async saveLineage(
    ctx: OwnerContext,
    conn: Connection,
    lineage: TranscriptLineageRecord & { meetingId: string },
  ): Promise<void> {
    await conn
      .insert(transcriptReviewLineage)
      .values({ ...lineage, ownerId: ctx.ownerId })
      .onConflictDoNothing({ target: transcriptReviewLineage.id });
  }

  async getProjectionVersion(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
  ): Promise<number> {
    const [row] = await conn
      .select({ version: transcriptReviewProjections.version })
      .from(transcriptReviewProjections)
      .where(
        and(
          eq(transcriptReviewProjections.ownerId, ctx.ownerId),
          eq(transcriptReviewProjections.meetingId, meetingId),
        ),
      )
      .limit(1);
    return row?.version ?? 0;
  }

  async recordDecision(ctx: OwnerContext, conn: Connection, command: ProjectionDecisionCommand) {
    const parsed = ProjectionDecisionCommandSchema.parse(command);
    return this.recordCommand(ctx, conn, parsed, 'decision');
  }

  async recordRevision(ctx: OwnerContext, conn: Connection, command: ProjectionRevisionCommand) {
    const parsed = ProjectionRevisionCommandSchema.parse(command);
    return this.recordCommand(ctx, conn, parsed, 'revision');
  }

  private async recordCommand(
    ctx: OwnerContext,
    conn: Connection,
    command: ProjectionDecisionCommand | ProjectionRevisionCommand,
    commandType: 'decision' | 'revision',
  ) {
    validateReviewCommandOwnership(ctx, command);
    const requestHash = getReviewCommandFingerprint(command);
    const [existing] = await conn
      .select()
      .from(transcriptReviewIdempotency)
      .where(
        and(
          eq(transcriptReviewIdempotency.ownerId, ctx.ownerId),
          eq(transcriptReviewIdempotency.commandType, commandType),
          eq(transcriptReviewIdempotency.idempotencyKey, command.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new DbError('conflict');
      return existing.result;
    }
    const [segment] = await conn
      .select({ id: transcriptSegments.id })
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.id, command.segmentId),
          eq(transcriptSegments.meetingId, command.meetingId),
          eq(transcriptSegments.ownerId, ctx.ownerId),
        ),
      )
      .limit(1);
    if (!segment) throw new DbError('not_found');
    const parentId =
      commandType === 'decision'
        ? (command as ProjectionDecisionCommand).baseDecisionId
        : (command as ProjectionRevisionCommand).baseRevisionId;
    if (parentId) {
      const parentTable =
        commandType === 'decision' ? transcriptReviewDecisions : transcriptReviewRevisions;
      const [parent] = await conn
        .select({ id: parentTable.id })
        .from(parentTable)
        .where(
          and(
            eq(parentTable.id, parentId),
            eq(parentTable.ownerId, ctx.ownerId),
            eq(parentTable.meetingId, command.meetingId),
            eq(parentTable.segmentId, command.segmentId),
          ),
        )
        .limit(1);
      if (!parent) throw new DbError('conflict');
    }
    await conn
      .insert(transcriptReviewProjections)
      .values({ meetingId: command.meetingId, ownerId: ctx.ownerId, version: 0 })
      .onConflictDoNothing({
        target: [transcriptReviewProjections.ownerId, transcriptReviewProjections.meetingId],
      });
    const [projection] = await conn
      .select()
      .from(transcriptReviewProjections)
      .where(
        and(
          eq(transcriptReviewProjections.ownerId, ctx.ownerId),
          eq(transcriptReviewProjections.meetingId, command.meetingId),
        ),
      )
      .limit(1);
    const currentVersion = projection?.version ?? 0;
    if (command.baseProjectionVersion !== currentVersion) throw new DbError('version_conflict');
    if (commandType === 'decision') {
      await conn.insert(transcriptReviewDecisions).values({
        id: command.id,
        meetingId: command.meetingId,
        ownerId: ctx.ownerId,
        segmentId: command.segmentId,
        alternativeId: (command as ProjectionDecisionCommand).alternativeId,
        baseDecisionId: (command as ProjectionDecisionCommand).baseDecisionId,
        baseProjectionVersion: command.baseProjectionVersion,
        actorId: command.actorId,
        idempotencyKey: command.idempotencyKey,
        createdAt: new Date(command.createdAt),
      });
    } else {
      const revision = command as ProjectionRevisionCommand;
      await conn.insert(transcriptReviewRevisions).values({
        id: revision.id,
        meetingId: revision.meetingId,
        ownerId: ctx.ownerId,
        segmentId: revision.segmentId,
        baseRevisionId: revision.baseRevisionId,
        revisedText: revision.revisedText,
        revisedSpeakerId: revision.revisedSpeakerId ?? null,
        reason: revision.reason ?? null,
        baseProjectionVersion: revision.baseProjectionVersion,
        actorId: revision.actorId,
        idempotencyKey: revision.idempotencyKey,
        createdAt: new Date(revision.createdAt),
      });
    }
    const updated = await conn
      .update(transcriptReviewProjections)
      .set({ version: currentVersion + 1, updatedAt: new Date() })
      .where(
        and(
          eq(transcriptReviewProjections.ownerId, ctx.ownerId),
          eq(transcriptReviewProjections.meetingId, command.meetingId),
          eq(transcriptReviewProjections.version, currentVersion),
        ),
      )
      .returning({ meetingId: transcriptReviewProjections.meetingId });
    if (updated.length !== 1) throw new DbError('version_conflict');
    await conn.insert(transcriptReviewIdempotency).values({
      ownerId: ctx.ownerId,
      meetingId: command.meetingId,
      commandType,
      idempotencyKey: command.idempotencyKey,
      requestHash,
      result: { id: command.id, projectionVersion: currentVersion + 1 },
    });
    await conn.insert(outboxEvents).values({
      messageId: `${commandType}:${command.id}`,
      correlationId: command.id,
      causationId: null,
      ownerId: ctx.ownerId,
      entityType: 'transcript_revision',
      entityId: command.id,
      eventType: `transcript_review.${commandType}.recorded`,
      eventVersion: 1,
      actorId: command.actorId,
      idempotencyKey: command.idempotencyKey,
      payload: createContentFreeReviewOutboxPayload(commandType, command, currentVersion + 1),
      state: 'pending',
      attempts: 0,
      meetingEventSequence: null,
    });
    return { id: command.id, projectionVersion: currentVersion + 1 };
  }
}
