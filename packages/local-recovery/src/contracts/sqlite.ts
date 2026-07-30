/** Minimal SQLite connection interface. Backed by sql.js, better-sqlite3, or any embedded SQLite. */

export interface SqliteRow {
  readonly [column: string]: unknown;
}

export interface SqliteConnection {
  /** Execute SQL with no return. */
  exec(sql: string): void;

  /** Run a mutation SQL statement with positional parameters. */
  run(sql: string, params?: unknown[]): { changes: number };

  /** Get a single row. */
  get<R extends SqliteRow>(sql: string, params?: unknown[]): R | undefined;

  /** Get all matching rows. */
  all<R extends SqliteRow>(sql: string, params?: unknown[]): R[];

  /** Close the connection. */
  close(): void;
}
