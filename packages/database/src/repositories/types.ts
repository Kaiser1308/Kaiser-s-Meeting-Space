// ── Core types for repositories ──
// DESIGN §5.1 — stable, owner-agnostic, content-free error categories.

/** Mandatory context on every user-data method. */
export interface OwnerContext {
  readonly ownerId: string;
}

/** Generic paginated response. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Pagination query parameters. */
export interface PageQuery {
  readonly limit: number;
  readonly cursor?: string;
}

/**
 * Stable cursor = base64url(`${createdAtIso}|${id}`).
 * Ordering is always (created_at ASC, id ASC).
 */
export function encodeCursor(createdAt: Date, id: string): string {
  const payload = `${createdAt.toISOString()}|${id}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const payload = Buffer.from(cursor, 'base64url').toString('utf8');
  const separatorIndex = payload.lastIndexOf('|');
  const createdAt = new Date(payload.substring(0, separatorIndex));
  const id = payload.substring(separatorIndex + 1);
  return { createdAt, id };
}

/** Stable, owner-agnostic DB error categories (never leak SQL/text). */
export type DbErrorCategory =
  | 'not_found'
  | 'conflict'
  | 'version_conflict'
  | 'duplicate'
  | 'constraint_violation'
  | 'immutable_violation'
  | 'internal';

export class DbError extends Error {
  constructor(
    public readonly category: DbErrorCategory,
    public readonly cause?: unknown,
  ) {
    super(category);
    this.name = 'DbError';
  }
}

/**
 * Forbidden metadata keys for audit entries (mirrors SafeErrorDetailSchema).
 * Any key (case-insensitive) containing these substrings must be rejected.
 */
export const FORBIDDEN_AUDIT_KEYS = [
  'transcriptText',
  'audioData',
  'minutesContent',
  'meetingContent',
  'apiKey',
  'accessToken',
  'refreshToken',
  'secretKey',
  'password',
  'credential',
  'token',
  'secret',
  'key',
  'providerResponseBody',
  'rawBody',
  'responseBody',
];

/** Helper to check if a metadata key is forbidden. */
export function hasForbiddenAuditKey(metadata: Record<string, unknown>): boolean {
  const keys = Object.keys(metadata).map((k) => k.toLowerCase());
  return FORBIDDEN_AUDIT_KEYS.some((forbidden) =>
    keys.some((k) => k.includes(forbidden.toLowerCase())),
  );
}
