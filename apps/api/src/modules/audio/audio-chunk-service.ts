import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  AudioRepository,
  MeetingsRepository,
  DbError,
  type Connection,
  type Db,
  schema,
  type OwnerContext,
} from '@kms/database';
import { formatChunkId, MeetingIdSchema } from '@kms/domain';
import { deriveStorageKey, StorageError, type ObjectStore } from '@kms/storage';
import {
  CompleteChunkResponseSchema,
  RegisterChunkResponseSchema,
  type CompleteChunkRequest,
  type CompleteChunkResponse,
  type RegisterChunkRequest,
  type RegisterChunkResponse,
} from './dto.js';

const REGISTER_ENTITY = 'audio_chunk' as const;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface RegisterChunkInput {
  readonly meetingId: string;
  readonly idempotencyKey: string;
  readonly body: RegisterChunkRequest;
}

export interface AudioChunkServiceOptions {
  readonly db: Db;
  readonly objectStore: ObjectStore;
  readonly now?: () => Date;
}

export interface CompleteChunkInput {
  readonly meetingId: string;
  readonly chunkId: string;
  readonly idempotencyKey: string;
  readonly body: CompleteChunkRequest;
}

export class AudioChunkService {
  private readonly audio = new AudioRepository();
  private readonly meetings = new MeetingsRepository();
  private readonly inFlight = new Map<
    string,
    Promise<RegisterChunkResponse | CompleteChunkResponse>
  >();
  private readonly now: () => Date;

  constructor(private readonly options: AudioChunkServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async registerChunk(
    owner: OwnerContext,
    input: RegisterChunkInput,
  ): Promise<RegisterChunkResponse> {
    const key = `${owner.ownerId}:${input.idempotencyKey}`;
    const active = this.inFlight.get(key) as Promise<RegisterChunkResponse> | undefined;
    if (active) return active;
    const operation = this.registerChunkTransaction(owner, input).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, operation);
    return operation;
  }

  private async registerChunkTransaction(
    owner: OwnerContext,
    input: RegisterChunkInput,
  ): Promise<RegisterChunkResponse> {
    return this.options.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${owner.ownerId}:register:${input.idempotencyKey}`}))`,
      );
      await tx
        .delete(schema.idempotencyRecords)
        .where(
          and(
            eq(schema.idempotencyRecords.ownerId, owner.ownerId),
            eq(schema.idempotencyRecords.entityType, REGISTER_ENTITY),
            eq(schema.idempotencyRecords.idempotencyKey, input.idempotencyKey),
            lt(schema.idempotencyRecords.expiresAt, this.now()),
          ),
        );
      const meetingId = MeetingIdSchema.parse(input.meetingId);
      const candidateChunkId = formatChunkId(meetingId, input.body.source, input.body.chunkIndex);
      const cached = await tx
        .select({ responseSummary: schema.idempotencyRecords.responseSummary })
        .from(schema.idempotencyRecords)
        .where(
          and(
            eq(schema.idempotencyRecords.ownerId, owner.ownerId),
            eq(schema.idempotencyRecords.entityType, REGISTER_ENTITY),
            eq(schema.idempotencyRecords.idempotencyKey, input.idempotencyKey),
            gt(schema.idempotencyRecords.expiresAt, this.now()),
          ),
        )
        .limit(1);
      if (cached[0]?.responseSummary) {
        const response = RegisterChunkResponseSchema.parse(cached[0].responseSummary);
        const existing = await this.audio.getChunk(owner, tx as Connection, candidateChunkId);
        if (
          response.chunkId !== candidateChunkId ||
          !existing ||
          existing.sha256 !== input.body.sha256 ||
          existing.byteLength !== input.body.byteLength ||
          existing.durationMs !== input.body.durationMs ||
          existing.startedAt !== input.body.startedAt ||
          existing.wallClockStart !== input.body.wallClockStart ||
          existing.wallClockEnd !== input.body.wallClockEnd ||
          existing.monotonicStart !== input.body.monotonicStart ||
          existing.monotonicEnd !== input.body.monotonicEnd
        ) {
          throw new DbError('conflict');
        }
        return response;
      }

      const meeting = await this.meetings.get(owner, tx as Connection, input.meetingId);
      if (!meeting || !meeting.captureSources.includes(input.body.source)) {
        throw new DbError('not_found');
      }

      const chunkId = formatChunkId(meetingId, input.body.source, input.body.chunkIndex);
      const storageKey = deriveStorageKey(
        owner.ownerId,
        meetingId,
        input.body.source,
        input.body.chunkIndex,
      );
      const registration = await this.audio.registerChunk(owner, tx as Connection, {
        id: chunkId,
        meetingId,
        source: input.body.source,
        chunkIndex: input.body.chunkIndex,
        storageKey,
        startedAt: input.body.startedAt,
        durationMs: input.body.durationMs,
        byteLength: input.body.byteLength,
        codec: input.body.codec,
        container: input.body.container,
        sampleRate: input.body.sampleRate,
        channels: input.body.channels,
        sha256: input.body.sha256,
        uploadStatus: 'pending',
        wallClockStart: input.body.wallClockStart,
        wallClockEnd: input.body.wallClockEnd,
        monotonicStart: input.body.monotonicStart,
        monotonicEnd: input.body.monotonicEnd,
      });

      const signed = await this.options.objectStore.signUrl(storageKey, {
        method: 'PUT',
        expiresInSeconds: 300,
        contentType: 'audio/webm',
        contentLength: input.body.byteLength,
      });
      const response = RegisterChunkResponseSchema.parse({
        chunkId,
        created: registration.created,
        upload: signed,
      });

      if (registration.created) {
        await this.audio.bumpReconciliation(owner, tx as Connection, input.meetingId);
      }
      await tx
        .insert(schema.idempotencyRecords)
        .values({
          ownerId: owner.ownerId,
          entityType: REGISTER_ENTITY,
          idempotencyKey: input.idempotencyKey,
          requestId: chunkId,
          responseCode: '200',
          responseSummary: response,
          expiresAt: new Date(this.now().getTime() + IDEMPOTENCY_TTL_MS),
        })
        .onConflictDoNothing();

      const canonical = await tx
        .select({ responseSummary: schema.idempotencyRecords.responseSummary })
        .from(schema.idempotencyRecords)
        .where(
          and(
            eq(schema.idempotencyRecords.ownerId, owner.ownerId),
            eq(schema.idempotencyRecords.entityType, REGISTER_ENTITY),
            eq(schema.idempotencyRecords.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      return RegisterChunkResponseSchema.parse(canonical[0]?.responseSummary ?? response);
    });
  }

  async completeChunk(
    owner: OwnerContext,
    input: CompleteChunkInput,
  ): Promise<CompleteChunkResponse> {
    const key = `${owner.ownerId}:complete:${input.idempotencyKey}`;
    const active = this.inFlight.get(key) as Promise<CompleteChunkResponse> | undefined;
    if (active) return active;
    const operation = this.completeChunkTransaction(owner, input).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, operation);
    return operation;
  }

  private async completeChunkTransaction(
    owner: OwnerContext,
    input: CompleteChunkInput,
  ): Promise<CompleteChunkResponse> {
    return this.options.db.transaction(async (tx) => {
      const idempotencyKey = `complete:${input.idempotencyKey}`;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${owner.ownerId}:${idempotencyKey}`}))`,
      );
      await tx
        .delete(schema.idempotencyRecords)
        .where(
          and(
            eq(schema.idempotencyRecords.ownerId, owner.ownerId),
            eq(schema.idempotencyRecords.entityType, REGISTER_ENTITY),
            eq(schema.idempotencyRecords.idempotencyKey, idempotencyKey),
            lt(schema.idempotencyRecords.expiresAt, this.now()),
          ),
        );
      const cached = await tx
        .select({ responseSummary: schema.idempotencyRecords.responseSummary })
        .from(schema.idempotencyRecords)
        .where(
          and(
            eq(schema.idempotencyRecords.ownerId, owner.ownerId),
            eq(schema.idempotencyRecords.entityType, REGISTER_ENTITY),
            eq(schema.idempotencyRecords.idempotencyKey, idempotencyKey),
            gt(schema.idempotencyRecords.expiresAt, this.now()),
          ),
        )
        .limit(1);
      if (cached[0]?.responseSummary)
        return CompleteChunkResponseSchema.parse(cached[0].responseSummary);

      const meetingId = MeetingIdSchema.parse(input.meetingId);
      const chunk = await this.audio.getChunk(owner, tx as Connection, input.chunkId as never);
      if (!chunk || chunk.meetingId !== meetingId) throw new DbError('not_found');
      if (chunk.sha256 !== input.body.sha256) throw new DbError('conflict');
      const storageKey = chunk.storageKey as Parameters<ObjectStore['head']>[0];
      const head = await this.options.objectStore.head(storageKey);
      if (!head.exists) throw new StorageError('object_not_found');
      if (head.contentLength !== chunk.byteLength) throw new StorageError('checksum_mismatch');
      const object = await this.options.objectStore.get(storageKey);
      const reader = object.body.getReader();
      const hash = createHash('sha256');
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          hash.update(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      if (hash.digest('hex') !== chunk.sha256.toLowerCase())
        throw new StorageError('checksum_mismatch');
      const finalizedAt = this.now().toISOString();
      await this.audio.finalizeChunk(
        owner,
        tx as Connection,
        input.chunkId as never,
        chunk.sha256,
        finalizedAt,
      );
      const response = CompleteChunkResponseSchema.parse({
        chunkId: input.chunkId,
        completed: true,
        finalizedAt,
      });
      await tx
        .insert(schema.idempotencyRecords)
        .values({
          ownerId: owner.ownerId,
          entityType: REGISTER_ENTITY,
          idempotencyKey,
          requestId: input.chunkId,
          responseCode: '200',
          responseSummary: response,
          expiresAt: new Date(this.now().getTime() + IDEMPOTENCY_TTL_MS),
        })
        .onConflictDoNothing();
      return response;
    });
  }
}
