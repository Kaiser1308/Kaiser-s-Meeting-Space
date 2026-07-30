import { type SQL, eq, and, or, gt, asc, sql } from 'drizzle-orm';
import type { AnyPgTable, AnyPgColumn } from 'drizzle-orm/pg-core';
import { type Connection } from '../client.js';
import {
  type OwnerContext,
  type Page,
  type PageQuery,
  type DbErrorCategory,
  DbError,
  encodeCursor,
  decodeCursor,
} from './types.js';

/** Minimal parser interface (works with Zod schemas without direct dep). */
interface Parser<T> {
  parse: (data: unknown) => T;
}

// ── Owner scoping ──

/**
 * Add WHERE owner_id = ctx.ownerId to a query.
 * Returns the query builder so callers can chain further .where(), .orderBy(), etc.
 */
export function ownerScope(conn: Connection, ctx: OwnerContext, table: AnyPgTable) {
  const col = (table as any).ownerId as AnyPgColumn;
  return conn.select().from(table).where(eq(col, ctx.ownerId));
}

/**
 * Returns a SQL condition for owner scoping.
 * Use when building complex queries with multiple AND conditions.
 */
export function ownerCondition(ctx: OwnerContext, table: AnyPgTable): SQL {
  return eq((table as any).ownerId as AnyPgColumn, ctx.ownerId);
}

// ── Pagination ──

/**
 * Apply cursor-based pagination to a pre-built query.
 * The query must already include owner-scoping.
 *
 * The strategy: add `(created_at, id) > (cursor)` condition, then
 * query `limit + 1` rows. If the extra row exists, set `nextCursor`.
 */
export async function paginate(
  conn: Connection,
  query: PageQuery,
  table: AnyPgTable,
  sortCol: AnyPgColumn,
  idCol: AnyPgColumn,
  /** Additional WHERE conditions (e.g. owner filter) */
  filters: SQL[],
  /** CamelCase property name for the sort value on row objects (default: 'createdAt') */
  sortProp = 'createdAt',
): Promise<Page<any>> {
  const { limit, cursor } = query;

  const conditions = [...filters];

  if (cursor) {
    const decoded = decodeCursor(cursor);
    const cursorCondition = or(
      gt(sortCol, decoded.createdAt),
      and(eq(sortCol, decoded.createdAt), gt(idCol, decoded.id)),
    );
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
  }

  const rows: any[] = await conn
    .select()
    .from(table)
    .where(and(...conditions))
    .orderBy(asc(sortCol), asc(idCol))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1] as any;
  const nextCursor = hasMore && lastItem ? encodeCursor(lastItem[sortProp], lastItem.id) : null;

  return { items, nextCursor };
}

// ── Domain mapping ──

/**
 * Convert a DB row to a domain type by parsing through the P02 Zod schema.
 *
 * 1. Maps Date → ISO-8601 string
 * 2. Maps bigint → number (though schema uses mode: 'number', defensive)
 * 3. Calls schema.parse()
 *
 * On failure throws `DbError('internal')` — NEVER leaks the row or Zod path.
 */
export function toDomain<T>(
  row: Record<string, unknown>,
  schema: Parser<T>,
  postProcess?: (row: Record<string, unknown>) => Record<string, unknown>,
): T {
  try {
    const mapped = prepareRow(row);
    const processed = postProcess ? postProcess(mapped) : mapped;
    return schema.parse(processed);
  } catch {
    throw new DbError('internal');
  }
}

/**
 * Convert Date → ISO string, bigint → number, null → undefined.
 * Zod .optional() accepts undefined but not null; .nullable() accepts null.
 * For the rare .nullable() field, use postProcess (see toDomain).
 */
function prepareRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (typeof value === 'bigint') {
      result[key] = Number(value);
    } else if (value === null) {
      result[key] = undefined;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── Result assertion ──

/**
 * Maps 0 rows from an owner-scoped read to `null`.
 * Never distinguishes wrong-owner from genuinely missing.
 */
export function assertOneRow<T>(rows: T[]): T | null {
  return rows.length > 0 ? rows[0]! : null;
}

// ── Optimistic version update ──

/**
 * Atomic UPDATE with version check.
 *
 * Runs:  UPDATE table SET ... , version = version + 1
 *        WHERE id = $id AND owner_id = $owner AND version = $expected
 *
 * On 0 affected rows, probes existence to distinguish not_found vs version_conflict.
 * Uses raw SQL so it works generically across any table with `id`, `owner_id`, `version`.
 *
 * @returns The updated row(s) if successful.
 * @throws {DbError} 'not_found' or 'version_conflict'
 */
/**
 * Atomic UPDATE with version check.
 *
 * Runs: UPDATE table SET ... , version = version + 1
 *       WHERE id = $id AND owner_id = $owner AND version = $expected
 *
 * Uses drizzle's `.update()` builder with the provided table reference.
 * The `table` must have `id`, `ownerId`, and `version` columns.
 *
 * On 0 rows, probes existence to distinguish not_found vs version_conflict.
 * @returns row count (1 on success)
 * @throws {DbError} 'not_found' or 'version_conflict'
 */
export async function updateWithVersion(
  conn: Connection,
  table: any,
  id: string,
  ownerId: string,
  expectedVersion: number,
  updates: Record<string, unknown>,
): Promise<number> {
  const setValues: Record<string, unknown> = { ...updates, version: sql`${table.version} + 1` };

  const rows: any[] = await conn
    .update(table)
    .set(setValues)
    .where(and(eq(table.id, id), eq(table.ownerId, ownerId), eq(table.version, expectedVersion)))
    .returning({ id: table.id });

  if (rows.length === 1) return 1;

  // Probe existence
  const probe: any[] = await conn
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.ownerId, ownerId)))
    .limit(1);

  if (probe.length === 0) throw new DbError('not_found');
  throw new DbError('version_conflict');
}

// ── Error mapping ──

/**
 * Map a postgresjs error to a content-free DbError.
 *
 * Inspects error codes only:
 *   23505  → duplicate
 *   23503  → not_found (FK violation — referenced entity missing)
 *   23514  → constraint_violation
 *   P0311  → immutable_violation
 *   other  → internal
 *
 * STRIPs message/detail/hint/where — the DbError carries only the category.
 */
/**
 * Extract the PostgresError from any wrapper (DrizzleQueryError, etc.)
 * by searching for a `.code` that matches the SQLSTATE pattern.
 */
const PG_CODE_RE = /^[A-Z0-9]{2}\d{3}$/;

function extractPgCode(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const err = e as Record<string, unknown>;

  // Direct .code match
  if (typeof err.code === 'string' && PG_CODE_RE.test(err.code)) return err.code;

  // Check .cause
  if (err.cause && typeof err.cause === 'object') {
    const cause = err.cause as Record<string, unknown>;
    if (typeof cause.code === 'string' && PG_CODE_RE.test(cause.code)) return cause.code;
  }

  // Check nested .cause.cause (recursive for multi-wrap)
  try {
    const nested = JSON.parse(JSON.stringify(err));
    if (nested.code && PG_CODE_RE.test(nested.code)) return nested.code;
    if (nested.cause?.code && PG_CODE_RE.test(nested.cause?.code)) return nested.cause?.code;
  } catch {
    // ignore serialization errors
  }

  return undefined;
}

export function mapDbError(e: unknown): DbError {
  if (e instanceof DbError) return e;

  const code = extractPgCode(e);

  let category: DbErrorCategory;
  switch (code) {
    case '23505':
      category = 'duplicate';
      break;
    case '23503':
      category = 'not_found';
      break;
    case '23514':
      category = 'constraint_violation';
      break;
    case 'P0311':
      category = 'immutable_violation';
      break;
    default:
      category = 'internal';
      break;
  }

  return new DbError(category, undefined);
}
