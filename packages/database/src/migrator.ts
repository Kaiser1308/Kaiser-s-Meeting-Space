import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.js';

/**
 * Replay the committed SQL migrations in `migrationsFolder` against the given
 * drizzle handle. Used by the test harness and the migration/restore tests (§7).
 * It does not create schema objects itself — only replays committed SQL.
 */
export async function runMigrations(db: Db, migrationsFolder = './drizzle'): Promise<void> {
  await migrate(db, { migrationsFolder });
}
