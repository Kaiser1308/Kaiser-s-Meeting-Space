import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createClient, type Db, type Tx, type Sql } from '../src/client.js';
import { runMigrations } from '../src/migrator.js';

export type { Db, Tx, Sql } from '../src/client.js';

export interface TestDb {
  /** postgres://… (hand to createClient if needed) */
  readonly url: string;
  /** drizzle handle, migrations already applied */
  readonly db: Db;
  /** postgresjs raw client for adversarial SQL / pg_dump helpers */
  readonly $raw: Sql;
  /** stop container (afterAll) */
  readonly close: () => Promise<void>;
}

const DEFAULT_IMAGE = 'postgres:17-alpine';
const DEFAULT_DATABASE = 'kms_test';

/**
 * Start one isolated Postgres, apply all migrations, return a ready handle.
 * One container per test file; migrate once in beforeAll.
 */
export async function startPostgres(
  opts: { image?: string; database?: string } = {},
): Promise<TestDb> {
  const image = opts.image ?? DEFAULT_IMAGE;
  const database = opts.database ?? DEFAULT_DATABASE;
  const container = await new PostgreSqlContainer(image)
    .withDatabase(database)
    .withStartupTimeout(60_000)
    .start();

  const url = container.getConnectionUri();
  const handle = createClient(url, { prepare: false });
  await runMigrations(handle.db);

  const close = async () => {
    await handle.close();
    await container.stop();
  };

  return {
    url,
    db: handle.db,
    get $raw() {
      return handle.$raw;
    },
    close,
  };
}

/** Sugar: start → fn(db) → close. For whole-file setup use startPostgres + afterAll. */
export async function withTestDb(fn: (db: TestDb) => Promise<void>): Promise<void> {
  const testDb = await startPostgres();
  try {
    await fn(testDb);
  } finally {
    await testDb.close();
  }
}

// Sentinel used to force a transaction rollback without surfacing an error.
class RollbackSignal {
  readonly tag = 'rollback';
}

/**
 * Per-test isolation: run fn inside a transaction that is ALWAYS rolled back.
 * The fn's resolved value is returned to the caller despite the rollback.
 */
export async function withRollbackTx<T>(db: TestDb, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T;
  await db.db
    .transaction(async (tx) => {
      result = await fn(tx);
      throw new RollbackSignal();
    })
    .catch((err: unknown) => {
      if (!(err instanceof RollbackSignal)) throw err;
    });
  // result is assigned before the sentinel throws
  return result!;
}

/**
 * Unique identifier for namespacing test databases/schemas.
 * Mirrors the @kms/test-support uniqueNamespace algorithm (same counter+timestamp
 * scheme) but implemented locally so @kms/database stays on its declared dep set.
 */
let dbNameCounter = 0;
export function uniqueDbName(prefix: string): string {
  dbNameCounter++;
  const sanitized = prefix.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  return `${sanitized}_${dbNameCounter}_${Date.now()}`;
}
