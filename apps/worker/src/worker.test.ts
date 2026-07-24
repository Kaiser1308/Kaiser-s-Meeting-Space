import { describe, expect, it } from 'vitest';
import { KMSWorker } from './worker.js';

describe('KMSWorker Unit Isolation', () => {
  it('should construct correctly for a specific job type', () => {
    const worker = new KMSWorker('speech_transcription', {
      databaseUrl: 'postgres://localhost:5432/kms',
      redisUrl: 'redis://localhost:6379/0',
    });

    expect(worker).toBeDefined();
    expect(worker.start).toBeDefined();
    expect(worker.stop).toBeDefined();
  });
});
