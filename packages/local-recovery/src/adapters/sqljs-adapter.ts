import initSqlJs, { type SqlJsStatic } from 'sql.js';
import type { SqliteConnection, SqliteRow } from '../contracts/sqlite.js';

let SQL: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * Create an in-memory sql.js SQLite connection. Suitable for testing and
 * platforms where native bindings are unavailable.
 */
export async function createSqlJsConnection(): Promise<SqliteConnection> {
  const sql = await getSqlJs();
  const db = new sql.Database();

  return {
    exec(sql: string): void {
      db.run(sql);
    },

    run(sql: string, params?: unknown[]): { changes: number } {
      if (params) {
        db.run(sql, params);
      } else {
        db.run(sql);
      }
      return { changes: db.getRowsModified() };
    },

    get<R extends SqliteRow>(sql: string, params?: unknown[]): R | undefined {
      const stmt = db.prepare(sql);
      try {
        if (params) {
          stmt.bind(params);
        }
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row: Record<string, unknown> = {};
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]!] = vals[i];
          }
          return row as R;
        }
        return undefined;
      } finally {
        stmt.free();
      }
    },

    all<R extends SqliteRow>(sql: string, params?: unknown[]): R[] {
      const stmt = db.prepare(sql);
      try {
        if (params) {
          stmt.bind(params);
        }
        const rows: R[] = [];
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row: Record<string, unknown> = {};
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]!] = vals[i];
          }
          rows.push(row as R);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },

    close(): void {
      db.close();
    },
  };
}
