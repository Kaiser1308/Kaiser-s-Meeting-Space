import { and, eq } from 'drizzle-orm';
import type { Connection } from '../client.js';
import { meetings, meetingCaptureSources, users } from '../schema/index.js';
import {
  type MeetingSettings,
  type MeetingState,
  type TranscriptionPolicyV1,
  TranscriptionPolicyV1Schema,
  MeetingSettingsSchema,
  DEFAULT_CAPTURE_PROFILE,
} from '@kms/domain';
import { type OwnerContext, type Page, type PageQuery, DbError } from './types.js';
import { ownerCondition, paginate, toDomain, updateWithVersion, mapDbError } from './base.js';

export interface StateUpdate {
  state: MeetingState;
  startedAt?: string;
  endedAt?: string;
}

export interface MeetingListFilter {
  state?: MeetingState;
}

export type MeetingLifecycle = MeetingSettings & { readonly state: MeetingState };

export type MeetingCreateInput = MeetingSettings & {
  /** Explicit P08 policy; omitted for legacy rows and never inferred as consent. */
  transcriptionPolicy?: TranscriptionPolicyV1;
};

export class MeetingsRepository {
  // ── create ──

  async create(
    ctx: OwnerContext,
    conn: Connection,
    input: MeetingCreateInput,
    state: MeetingState,
  ): Promise<MeetingSettings> {
    // Ensure the user exists (idempotent)
    try {
      await conn.insert(users).values({ id: ctx.ownerId }).onConflictDoNothing();
    } catch {
      // ignore — user may already exist
    }

    try {
      await conn.insert(meetings).values({
        id: input.id,
        ownerId: ctx.ownerId,
        title: input.title,
        language: input.language,
        mode: input.mode,
        speechMode: input.speechMode,
        transcriptionPolicy: input.transcriptionPolicy
          ? TranscriptionPolicyV1Schema.parse(input.transcriptionPolicy)
          : null,
        timezone: input.timezone,
        version: 1,
        state,
        captureProfile: DEFAULT_CAPTURE_PROFILE,
        createdAt: new Date(input.createdAt),
        startedAt: input.startedAt ? new Date(input.startedAt) : null,
        endedAt: input.endedAt ? new Date(input.endedAt) : null,
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }

    // Insert capture sources
    for (const source of input.captureSources) {
      try {
        await conn.insert(meetingCaptureSources).values({
          meetingId: input.id,
          source,
        });
      } catch (e: unknown) {
        throw mapDbError(e);
      }
    }

    // Return the created meeting
    const result = await this.get(ctx, conn, input.id);
    if (!result) throw new DbError('internal');
    return result;
  }

  // ── get ──

  async get(ctx: OwnerContext, conn: Connection, id: string): Promise<MeetingSettings | null> {
    return this.toMeetingSettings(conn, ctx, id);
  }

  async getTranscriptionPolicy(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
  ): Promise<TranscriptionPolicyV1 | null> {
    const [row] = await conn
      .select({ policy: meetings.transcriptionPolicy })
      .from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.ownerId, ctx.ownerId)))
      .limit(1);
    if (!row?.policy) return null;
    const parsed = TranscriptionPolicyV1Schema.safeParse(row.policy);
    if (!parsed.success) throw new DbError('constraint_violation');
    return parsed.data;
  }

  /**
   * Returns the owner-scoped lifecycle state for service-layer transitions.
   * The regular read API deliberately omits persistence-only state.
   */
  async getLifecycle(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
  ): Promise<MeetingLifecycle | null> {
    const [row]: any[] = await conn
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    const settings = await this.assembleMeeting(conn, row);
    return { ...settings, state: row.state as MeetingState };
  }

  // ── list──

  async list(
    ctx: OwnerContext,
    conn: Connection,
    query: PageQuery,
    filter?: MeetingListFilter,
  ): Promise<Page<MeetingSettings>> {
    const conditions: any[] = [ownerCondition(ctx, meetings)];

    if (filter?.state) {
      conditions.push(eq(meetings.state, filter.state));
    }

    const page = await paginate(conn, query, meetings, meetings.createdAt, meetings.id, conditions);

    return this.toMeetingSettingsPage(ctx, conn, page);
  }

  /**
   * Lists owner-scoped meetings while retaining the persistence-only state
   * needed by the library and service layer. The public `list` method keeps
   * returning MeetingSettings so callers cannot accidentally depend on DB
   * lifecycle columns.
   */
  async listLifecycle(
    ctx: OwnerContext,
    conn: Connection,
    query: PageQuery,
    filter?: MeetingListFilter,
  ): Promise<Page<MeetingLifecycle>> {
    const conditions: any[] = [ownerCondition(ctx, meetings)];

    if (filter?.state) {
      conditions.push(eq(meetings.state, filter.state));
    }

    const page = await paginate(conn, query, meetings, meetings.createdAt, meetings.id, conditions);
    const items = await Promise.all(
      (page.items as any[]).map(async (row) => ({
        ...(await this.assembleMeeting(conn, row)),
        state: row.state as MeetingState,
      })),
    );

    return { items, nextCursor: page.nextCursor };
  }

  // ── updateState (optimistic) ──

  async updateState(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    expectedVersion: number,
    update: StateUpdate,
  ): Promise<MeetingSettings> {
    const updates: Record<string, unknown> = { state: update.state };
    if (update.startedAt !== undefined) {
      updates.startedAt = new Date(update.startedAt);
    }
    if (update.endedAt !== undefined) {
      updates.endedAt = new Date(update.endedAt);
    }

    try {
      await updateWithVersion(conn, meetings, id, ctx.ownerId, expectedVersion, updates);
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }

    const result = await this.get(ctx, conn, id);
    if (!result) throw new DbError('internal');
    return result;
  }

  // ── softDelete ──

  async softDelete(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    expectedVersion: number,
  ): Promise<MeetingSettings> {
    try {
      await updateWithVersion(conn, meetings, id, ctx.ownerId, expectedVersion, {
        state: 'deleted',
        deleted_at: new Date(),
      });
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }

    const result = await this.get(ctx, conn, id);
    if (!result) throw new DbError('internal');
    return result;
  }

  // ── restore ──

  async restore(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    expectedVersion: number,
    previousState: MeetingState,
  ): Promise<MeetingSettings> {
    try {
      await updateWithVersion(conn, meetings, id, ctx.ownerId, expectedVersion, {
        state: previousState,
        deleted_at: null,
      });
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }

    const result = await this.get(ctx, conn, id);
    if (!result) throw new DbError('internal');
    return result;
  }

  // ── setCaptureSources ──

  async setCaptureSources(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    sources: readonly ('mic' | 'system')[],
  ): Promise<void> {
    // Capture sources do not carry owner_id; authorize through the parent
    // meeting before replacing child rows.
    try {
      const [meeting] = await conn
        .select({ id: meetings.id, state: meetings.state })
        .from(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.ownerId, ctx.ownerId)))
        .limit(1);
      if (!meeting) throw new DbError('not_found');
      if (meeting.state !== 'draft' && meeting.state !== 'checking') {
        throw new DbError('immutable_violation');
      }

      await conn.delete(meetingCaptureSources).where(eq(meetingCaptureSources.meetingId, id));
      for (const source of sources) {
        await conn.insert(meetingCaptureSources).values({
          meetingId: id,
          source,
        });
      }
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── Private helpers ──

  private async toMeetingSettings(
    conn: Connection,
    ctx: OwnerContext,
    id: string,
  ): Promise<MeetingSettings | null> {
    const [row]: any[] = await conn
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;

    return this.assembleMeeting(conn, row);
  }

  private async assembleMeeting(conn: Connection, row: any): Promise<MeetingSettings> {
    const sources: any[] = await conn
      .select({ source: meetingCaptureSources.source })
      .from(meetingCaptureSources)
      .where(eq(meetingCaptureSources.meetingId, row.id));

    // Strip DB-only columns not in MeetingSettingsSchema
    const {
      state: _state,
      captureProfile: _captureProfile,
      transcriptionPolicy: _transcriptionPolicy,
      deletedAt: _deletedAt,
      ...rest
    } = row;

    return toDomain(
      {
        ...rest,
        captureSources: sources.map((s: any) => s.source),
      },
      MeetingSettingsSchema,
    );
  }

  private async toMeetingSettingsPage(
    ctx: OwnerContext,
    conn: Connection,
    page: Page<any>,
  ): Promise<Page<MeetingSettings>> {
    const items = await Promise.all(
      (page.items as any[]).map((row) => this.assembleMeeting(conn, row)),
    );
    return { items, nextCursor: page.nextCursor };
  }

  private encodeCursorFromRow(row: any): string {
    const date = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    return Buffer.from(`${date.toISOString()}|${row.id}`, 'utf8').toString('base64url');
  }
}
