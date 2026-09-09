import { and, eq, gt, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Connection, Db } from '@kms/database';
import type { OwnerContext } from '@kms/database';
import type { ObjectStore } from '@kms/storage';
import {
  MeetingIdSchema,
  MeetingSettingsSchema,
  policyFromLegacySpeechMode,
  TranscriptionPolicyV1Schema,
  type MeetingState,
  type TranscriptionPolicyV1,
} from '@kms/domain';
import { MeetingsRepository, schema } from '@kms/database';
import { deriveStorageKey } from '@kms/storage';
import { DbError } from '@kms/database';
import { MeetingError } from './errors.js';

export interface MeetingServiceOptions {
  readonly db: Db;
  readonly objectStore?: ObjectStore;
}

export interface CreateMeetingInput {
  readonly id?: string;
  readonly title: string;
  readonly language: 'vi' | 'en';
  readonly mode: 'meeting_only' | 'meeting_translate';
  readonly timezone: string;
  readonly captureSources: Array<'mic' | 'system'>;
  readonly speechMode: 'api' | 'local';
  readonly policy: TranscriptionPolicyV1;
}

export class MeetingService {
  private readonly meetingsRepo = new MeetingsRepository();

  constructor(private readonly options: MeetingServiceOptions) {}

  async createMeeting(ctx: OwnerContext, input: CreateMeetingInput, idempotencyKey: string) {
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.options.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${ctx.ownerId}:meeting:${idempotencyKey}`}))`,
      );
      const cached = await tx
        .select({
          requestId: schema.idempotencyRecords.requestId,
          responseSummary: schema.idempotencyRecords.responseSummary,
        })
        .from(schema.idempotencyRecords)
        .where(
          and(
            eq(schema.idempotencyRecords.ownerId, ctx.ownerId),
            eq(schema.idempotencyRecords.entityType, 'meeting'),
            eq(schema.idempotencyRecords.idempotencyKey, idempotencyKey),
            gt(schema.idempotencyRecords.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (cached[0]?.responseSummary) {
        if (cached[0].requestId !== requestHash) throw new DbError('conflict');
        return cached[0].responseSummary as Record<string, unknown>;
      }

      const now = new Date();
      const settings = MeetingSettingsSchema.parse({
        id: MeetingIdSchema.parse(input.id ?? crypto.randomUUID()),
        ownerId: ctx.ownerId,
        title: input.title,
        language: input.language,
        mode: input.mode,
        captureSources: input.captureSources,
        speechMode: input.speechMode,
        timezone: input.timezone,
        version: 1,
        createdAt: now.toISOString(),
      });
      const policy = TranscriptionPolicyV1Schema.parse(input.policy);
      if (policy.language !== settings.language) {
        throw new MeetingError('POLICY_LANGUAGE_MISMATCH', 'Meeting policy language mismatch', 400);
      }
      const created = await this.meetingsRepo.create(
        ctx,
        tx,
        { ...settings, transcriptionPolicy: policy },
        'draft',
      );
      const response = { ...created, state: 'draft' as const };
      await tx.insert(schema.idempotencyRecords).values({
        ownerId: ctx.ownerId,
        entityType: 'meeting',
        idempotencyKey,
        requestId: requestHash,
        responseCode: '201',
        responseSummary: response,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
      return response;
    });
  }

  async startMeeting(ctx: OwnerContext, meetingId: string, idempotencyKey?: string) {
    if (idempotencyKey) {
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ meetingId, operation: 'start' }))
        .digest('hex');
      const storageKey = `${meetingId}:start:${idempotencyKey}`;
      return this.options.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${ctx.ownerId}:meeting:${storageKey}`}))`,
        );
        const cached = await tx
          .select({
            requestId: schema.idempotencyRecords.requestId,
            responseSummary: schema.idempotencyRecords.responseSummary,
          })
          .from(schema.idempotencyRecords)
          .where(
            and(
              eq(schema.idempotencyRecords.ownerId, ctx.ownerId),
              eq(schema.idempotencyRecords.entityType, 'meeting'),
              eq(schema.idempotencyRecords.idempotencyKey, storageKey),
              gt(schema.idempotencyRecords.expiresAt, new Date()),
            ),
          )
          .limit(1);
        if (cached[0]?.responseSummary) {
          if (cached[0].requestId !== requestHash) throw new DbError('conflict');
          return cached[0].responseSummary as {
            meetingId: string;
            state: 'recording';
            startedAt: string;
            policyVersion: 1;
          };
        }

        const response = await this.startMeetingOnConnection(ctx, tx, meetingId);
        await tx.insert(schema.idempotencyRecords).values({
          ownerId: ctx.ownerId,
          entityType: 'meeting',
          idempotencyKey: storageKey,
          requestId: requestHash,
          responseCode: '200',
          responseSummary: response,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        return response;
      });
    }

    return this.startMeetingOnConnection(ctx, this.options.db, meetingId);
  }

  private async startMeetingOnConnection(ctx: OwnerContext, conn: Connection, meetingId: string) {
    const meeting = await this.meetingsRepo.getLifecycle(ctx, conn, meetingId);
    if (!meeting) throw new DbError('not_found');
    if (meeting.state === 'recording') {
      const policy = this.resolvePolicy(meeting, null);
      return {
        meetingId,
        state: 'recording' as const,
        startedAt: meeting.startedAt ?? new Date().toISOString(),
        policyVersion: policy.version as 1,
      };
    }
    if (meeting.state !== 'draft' && meeting.state !== 'checking') {
      throw new MeetingError(
        'MEETING_INVALID_STATE',
        `Cannot start meeting in state: ${meeting.state}`,
        409,
      );
    }
    const policy = this.resolvePolicy(
      meeting,
      await this.meetingsRepo.getTranscriptionPolicy(ctx, conn, meetingId),
    );
    if (this.requiresCloudConsent(policy) && policy.cloudConsent !== 'granted') {
      throw new MeetingError(
        'CLOUD_CONSENT_REQUIRED',
        'Cloud transcription consent is required',
        409,
      );
    }
    const startedAt = new Date().toISOString();
    await this.meetingsRepo.updateState(ctx, conn, meetingId, meeting.version, {
      state: 'recording',
      startedAt,
    });
    return {
      meetingId,
      state: 'recording' as const,
      startedAt,
      policyVersion: policy.version as 1,
    };
  }

  private resolvePolicy(
    meeting: { language: 'vi' | 'en'; speechMode: 'api' | 'local' },
    persisted: TranscriptionPolicyV1 | null,
  ): TranscriptionPolicyV1 {
    const policy = persisted ?? policyFromLegacySpeechMode(meeting.speechMode, meeting.language);
    if (policy.language !== meeting.language) {
      throw new MeetingError('POLICY_LANGUAGE_MISMATCH', 'Meeting policy language mismatch', 409);
    }
    return policy;
  }

  private requiresCloudConsent(policy: TranscriptionPolicyV1): boolean {
    return policy.live === 'cloud' || policy.final === 'cloud' || policy.cloudCheckScope !== 'off';
  }

  /** List meetings for the authenticated owner with cursor pagination. */
  async listMeetings(ctx: OwnerContext, query: { limit: number; cursor?: string; state?: string }) {
    const result = await this.meetingsRepo.listLifecycle(
      ctx,
      this.options.db,
      { limit: query.limit, cursor: query.cursor },
      query.state ? { state: query.state as MeetingState } : undefined,
    );

    // Filter out deleted meetings client-side
    const items = result.items.filter((m) => m.state !== 'deleted');

    // Map to library-safe shape (no internal fields)
    const mappedItems = items.map((m) => {
      const meeting = m as typeof m & Record<string, unknown>;
      return {
        id: String(meeting.id ?? ''),
        title: String(meeting.title ?? ''),
        language: meeting.language as 'vi' | 'en',
        mode: meeting.mode as 'meeting_only' | 'meeting_translate',
        captureSources: (meeting.captureSources as string[]) ?? [],
        state: String(meeting.state ?? ''),
        createdAt: String(meeting.createdAt ?? ''),
        startedAt: meeting.startedAt ? String(meeting.startedAt) : null,
        endedAt: meeting.endedAt ? String(meeting.endedAt) : null,
        timezone: String(meeting.timezone ?? ''),
        speechMode: meeting.speechMode as 'api' | 'local',
      };
    });

    return {
      items: mappedItems,
      nextCursor: result.nextCursor,
    };
  }

  /** Get meeting detail for the authenticated owner. */
  async getMeeting(ctx: OwnerContext, meetingId: string) {
    const meeting = await this.meetingsRepo.get(ctx, this.options.db, meetingId);
    if (!meeting) {
      throw new DbError('not_found');
    }
    return meeting;
  }

  /** Finalize a meeting (transition to 'finalizing'). Idempotent. */
  async endMeeting(ctx: OwnerContext, meetingId: string, idempotencyKey?: string) {
    if (idempotencyKey) {
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ meetingId, operation: 'end' }))
        .digest('hex');
      const storageKey = `${meetingId}:end:${idempotencyKey}`;
      return this.options.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${ctx.ownerId}:meeting:${storageKey}`}))`,
        );
        const cached = await tx
          .select({
            requestId: schema.idempotencyRecords.requestId,
            responseSummary: schema.idempotencyRecords.responseSummary,
          })
          .from(schema.idempotencyRecords)
          .where(
            and(
              eq(schema.idempotencyRecords.ownerId, ctx.ownerId),
              eq(schema.idempotencyRecords.entityType, 'meeting'),
              eq(schema.idempotencyRecords.idempotencyKey, storageKey),
              gt(schema.idempotencyRecords.expiresAt, new Date()),
            ),
          )
          .limit(1);
        if (cached[0]?.responseSummary) {
          if (cached[0].requestId !== requestHash) throw new DbError('conflict');
          return cached[0].responseSummary as {
            meetingId: string;
            state: string;
            finalizedAt: string;
          };
        }

        const response = await this.endMeetingOnConnection(ctx, tx, meetingId);
        await tx.insert(schema.idempotencyRecords).values({
          ownerId: ctx.ownerId,
          entityType: 'meeting',
          idempotencyKey: storageKey,
          requestId: requestHash,
          responseCode: '200',
          responseSummary: response,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        return response;
      });
    }

    return this.endMeetingOnConnection(ctx, this.options.db, meetingId);
  }

  private async endMeetingOnConnection(ctx: OwnerContext, conn: Connection, meetingId: string) {
    const meeting = await this.meetingsRepo.getLifecycle(ctx, conn, meetingId);
    if (!meeting) {
      throw new DbError('not_found');
    }

    const currentState = meeting.state;
    const currentVersion = meeting.version;

    // Idempotent: if already past finalizing, return current state
    if (['finalizing', 'processing', 'ready', 'partial_ready'].includes(currentState)) {
      return {
        meetingId,
        state: currentState,
        finalizedAt: meeting.endedAt ?? new Date().toISOString(),
      };
    }

    // Valid transition: recording|paused → finalizing
    if (currentState !== 'recording' && currentState !== 'paused') {
      throw new MeetingError(
        'MEETING_INVALID_STATE',
        `Cannot end meeting in state: ${currentState}`,
        409,
      );
    }

    const now = new Date().toISOString();
    const updated = await this.meetingsRepo.updateState(
      ctx,
      conn,
      meetingId,
      currentVersion,
      {
        state: 'finalizing',
        endedAt: now,
      },
    );

    return {
      meetingId,
      state: 'finalizing',
      finalizedAt: updated.endedAt ?? now,
    };
  }

  /** Generate a scoped, short-lived playback URL for a chunk or full source. */
  async getPlaybackUrl(
    ctx: OwnerContext,
    meetingId: string,
    source: 'mic' | 'system',
    chunkIndex?: number,
  ) {
    // Verify meeting ownership
    const meeting = await this.meetingsRepo.get(ctx, this.options.db, meetingId);
    if (!meeting) {
      throw new DbError('not_found');
    }

    if (!this.options.objectStore) {
      throw new MeetingError('SERVICE_UNAVAILABLE', 'Object store not configured', 503);
    }

    const expiresInSeconds = 900; // 15 minutes

    if (chunkIndex !== undefined) {
      const storageKey = deriveStorageKey(ctx.ownerId, meetingId, source, chunkIndex);
      const signed = await this.options.objectStore.signUrl(storageKey, {
        method: 'GET',
        expiresInSeconds,
      });

      return {
        url: signed.url,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        method: 'GET' as const,
        requiredHeaders: signed.requiredHeaders,
      };
    }

    // Full source playback: use chunk 0 as representative
    const storageKey = deriveStorageKey(ctx.ownerId, meetingId, source, 0);
    // For full-source playback, use the prefix-based approach
    const signed = await this.options.objectStore.signUrl(storageKey, {
      method: 'GET',
      expiresInSeconds,
    });

    return {
      url: signed.url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      method: 'GET' as const,
      requiredHeaders: signed.requiredHeaders,
    };
  }
}
