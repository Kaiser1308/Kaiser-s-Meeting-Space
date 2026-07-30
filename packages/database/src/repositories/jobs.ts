import { and, eq, asc, sql, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Connection } from '../client.js';
import { jobs, jobAttempts, jobProgress } from '../schema/index.js';
import { type Job, type JobAttempt, type JobState, type JobType, JobSchema } from '@kms/domain';
import { type OwnerContext, type Page, type PageQuery, DbError } from './types.js';
import { ownerCondition, paginate, toDomain, mapDbError } from './base.js';

export interface JobCreateInput {
  id: string;
  meetingId: string;
  type: JobType;
  state?: JobState;
  maxAttempts: number;
  progress?: number;
  result?: Record<string, unknown>;
  createdAt?: string;
}

export interface JobListFilter {
  meetingId?: string;
  type?: JobType;
  state?: JobState;
}

export interface DispatchableJob {
  id: string;
  ownerId: string;
  meetingId: string;
  type: JobType;
  state: Extract<JobState, 'pending' | 'running' | 'retrying'>;
}

export class JobsMetadataRepository {
  // ── create ──

  async create(ctx: OwnerContext, conn: Connection, input: JobCreateInput): Promise<Job> {
    try {
      const [row]: any[] = await conn
        .insert(jobs)
        .values({
          id: input.id,
          ownerId: ctx.ownerId,
          meetingId: input.meetingId,
          type: input.type,
          state: input.state ?? 'pending',
          maxAttempts: input.maxAttempts,
          progress: input.progress ?? null,
          result: input.result ?? null,
          ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
        })
        .returning();

      if (!row) throw new DbError('internal');
      return this.toJob(row, []);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── get ──

  async get(ctx: OwnerContext, conn: Connection, id: string): Promise<Job | null> {
    const [row]: any[] = await conn
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    const attempts = await this.loadAttempts(conn, id);
    return this.toJob(row, attempts);
  }

  // ── list ──

  async list(
    ctx: OwnerContext,
    conn: Connection,
    query: PageQuery,
    filter?: JobListFilter,
  ): Promise<Page<Job>> {
    const conditions: any[] = [ownerCondition(ctx, jobs)];

    if (filter?.meetingId) {
      conditions.push(eq(jobs.meetingId, filter.meetingId));
    }
    if (filter?.type) {
      conditions.push(eq(jobs.type, filter.type));
    }
    if (filter?.state) {
      conditions.push(eq(jobs.state, filter.state));
    }

    const page = await paginate(conn, query, jobs, jobs.createdAt, jobs.id, conditions);

    // Load attempts for all returned job IDs
    const jobIds = page.items.map((r: any) => r.id);
    const allAttempts =
      jobIds.length > 0
        ? await this.loadAttemptsForJobs(conn, jobIds)
        : new Map<string, JobAttempt[]>();

    const items = page.items.map((row: any) => this.toJob(row, allAttempts.get(row.id) ?? []));
    return { items, nextCursor: page.nextCursor };
  }

  /**
   * Redis is a disposable queue projection. Rebuild only jobs that are not
   * terminal in PostgreSQL; completed/failed/cancelled jobs must never replay.
   */
  async listDispatchable(conn: Connection): Promise<DispatchableJob[]> {
    const rows: any[] = await conn
      .select({
        id: jobs.id,
        ownerId: jobs.ownerId,
        meetingId: jobs.meetingId,
        type: jobs.type,
        state: jobs.state,
      })
      .from(jobs)
      .where(
        or(
          inArray(jobs.state, ['pending', 'retrying']),
          and(
            eq(jobs.state, 'running'),
            or(isNull(jobs.leaseExpiresAt), lt(jobs.leaseExpiresAt, new Date())),
          ),
        ),
      )
      .orderBy(asc(jobs.createdAt), asc(jobs.id));

    return rows as DispatchableJob[];
  }

  // ── lease ──

  async lease(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<Job | null> {
    try {
      const result: any = await conn
        .update(jobs)
        .set({
          leaseToken,
          leaseExpiresAt: new Date(leaseExpiresAt),
          state: 'running',
        })
        .where(
          and(
            eq(jobs.id, id),
            eq(jobs.ownerId, ctx.ownerId),
            sql`${jobs.state} IN ('pending', 'retrying')`,
          ),
        )
        .returning();

      if (result.length === 0) return null;

      // Leased successfully — return the full job
      return this.get(ctx, conn, id);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── recordAttempt ──

  async recordAttempt(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    attempt: JobAttempt,
  ): Promise<void> {
    try {
      await conn.insert(jobAttempts).values({
        jobId: id,
        attempt: attempt.attempt,
        startedAt: new Date(attempt.startedAt),
        completedAt: attempt.completedAt ? new Date(attempt.completedAt) : null,
        success: attempt.success,
        errorCode: attempt.error?.code ?? null,
        errorMessage: attempt.error?.message ?? null,
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── recordProgress ──

  async recordProgress(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    percent: number,
    message?: string,
  ): Promise<void> {
    try {
      await conn.insert(jobProgress).values({
        jobId: id,
        percent,
        message: message ?? null,
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── markState ──

  async markState(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    state: JobState,
    result?: Record<string, unknown>,
  ): Promise<Job> {
    try {
      const setValues: Record<string, unknown> = {
        state,
        updatedAt: new Date(),
      };

      if (result !== undefined) {
        setValues.result = result;
      }

      if (state === 'completed' || state === 'failed' || state === 'cancelled') {
        setValues.completedAt = new Date();
      }

      const updateResult: any[] = await conn
        .update(jobs)
        .set(setValues)
        .where(and(eq(jobs.id, id), eq(jobs.ownerId, ctx.ownerId)))
        .returning({ id: jobs.id });

      if (updateResult.length === 0) {
        throw new DbError('not_found');
      }

      const job = await this.get(ctx, conn, id);
      if (!job) throw new DbError('internal');
      return job;
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }
  }

  // ── Private helpers ──

  private async loadAttempts(conn: Connection, jobId: string): Promise<JobAttempt[]> {
    const rows: any[] = await conn
      .select()
      .from(jobAttempts)
      .where(eq(jobAttempts.jobId, jobId))
      .orderBy(asc(jobAttempts.attempt));

    return rows.map((row: any) => ({
      attempt: row.attempt,
      startedAt: row.startedAt instanceof Date ? row.startedAt.toISOString() : row.startedAt,
      completedAt: row.completedAt
        ? row.completedAt instanceof Date
          ? row.completedAt.toISOString()
          : row.completedAt
        : undefined,
      success: row.success,
      error: row.errorCode ? { code: row.errorCode, message: row.errorMessage ?? '' } : undefined,
    }));
  }

  private async loadAttemptsForJobs(
    conn: Connection,
    jobIds: string[],
  ): Promise<Map<string, JobAttempt[]>> {
    if (jobIds.length === 0) return new Map();

    const rows: any[] = await conn
      .select()
      .from(jobAttempts)
      .where(inArray(jobAttempts.jobId, jobIds))
      .orderBy(asc(jobAttempts.attempt));

    const map = new Map<string, JobAttempt[]>();
    for (const row of rows) {
      const list = map.get(row.jobId) ?? [];
      list.push({
        attempt: row.attempt,
        startedAt: row.startedAt instanceof Date ? row.startedAt.toISOString() : row.startedAt,
        completedAt: row.completedAt
          ? row.completedAt instanceof Date
            ? row.completedAt.toISOString()
            : row.completedAt
          : undefined,
        success: row.success,
        error: row.errorCode ? { code: row.errorCode, message: row.errorMessage ?? '' } : undefined,
      });
      map.set(row.jobId, list);
    }
    return map;
  }

  private toJob(row: any, attempts: JobAttempt[]): Job {
    return toDomain(
      {
        id: row.id,
        type: row.type,
        state: row.state,
        meetingId: row.meetingId,
        ownerId: row.ownerId,
        maxAttempts: row.maxAttempts,
        attempts,
        progress: row.progress ?? undefined,
        result: row.result ?? undefined,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
        completedAt: row.completedAt
          ? row.completedAt instanceof Date
            ? row.completedAt.toISOString()
            : row.completedAt
          : undefined,
      },
      JobSchema,
    );
  }
}
