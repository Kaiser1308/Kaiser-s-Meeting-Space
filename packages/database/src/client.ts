import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/** The underlying postgresjs client type. */
export type Sql = ReturnType<typeof postgres>;

export type Db = PostgresJsDatabase<typeof schema>;
// A transaction is exactly the callback argument of db.transaction:
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
// Any code path (top-level or inside a tx) is a Connection:
export type Connection = Db | Tx;

export interface CreateClientOptions {
  max?: number;
  /** set true under Testcontainers/pooled tx */
  prepare?: boolean;
  ssl?: 'require' | 'disable';
}

export interface ClientHandle {
  db: Db;
  readonly $raw: ReturnType<typeof postgres>;
  close(): Promise<void>;
}

export function createClient(databaseUrl: string, options: CreateClientOptions = {}): ClientHandle {
  const raw = postgres(databaseUrl, {
    max: options.max ?? 10,
    // `prepare:false` is the Drizzle-recommended setting for pooled transactions.
    prepare: options.prepare ?? false,
    ssl: options.ssl === 'require' ? 'require' : undefined,
    onnotice: () => {},
  });
  const db = drizzle(raw, { schema });
  return {
    db,
    get $raw() {
      return raw;
    },
    async close() {
      await raw.end({ timeout: 5 });
    },
  };
}
