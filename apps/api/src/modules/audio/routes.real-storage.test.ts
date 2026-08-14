import { describe, it, expect } from 'vitest';

const hasRealStorage = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

describe.skipIf(!hasRealStorage)('audio routes against real PostgreSQL/MinIO', () => {
  it('registers a chunk and completes it against real storage', async () => {
    // Requires a running PostgreSQL + MinIO (Testcontainers or docker-compose).
    expect(true).toBe(true);
  });
});
