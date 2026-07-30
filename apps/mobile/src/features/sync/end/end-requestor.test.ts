import { describe, it, expect, beforeEach } from 'vitest';
import { EndRequestor } from './end-requestor.js';
import { FakeUploadTransport, ManifestStore } from '@kms/local-recovery';
import { createSqlJsConnection } from '@kms/local-recovery';
import type { RecordingService } from '../../recording/service/recording-service.js';
import type { RecordingState } from '../../recording/reducer/types.js';

describe('EndRequestor', () => {
  let requestor: EndRequestor;
  let transport: FakeUploadTransport;
  let manifest: ManifestStore;
  let mockRecordingState: RecordingState;

  beforeEach(async () => {
    const db = await createSqlJsConnection();
    transport = new FakeUploadTransport();
    manifest = new ManifestStore(db);
    await manifest.runMigrations();

    // Mock RecordingService state — simulate after recording ended
    mockRecordingState = {
      status: 'idle',
      meetingId: null,
      currentChunkIndex: 0,
      chunksCommitted: 3,
      startedAt: '2024-01-01T00:00:00.000Z',
      totalPausedDurationMs: 0,
      lastResumedAt: null,
      totalDurationMs: 60000,
      timeline: [],
      storageAvailableBytes: 1000000000,
      storageTotalBytes: 1000000000,
      storageWarning: 'ok',
      health: {
        totalDurationMs: 60000,
        totalBytesWritten: 3072,
        storageAvailableBytes: 1000000000,
        storagePercentRemaining: 90,
        estimatedRemainingMinutes: 300,
      },
      error: null,
      pendingAction: null,
      lastCorrelationId: null,
    };

    const mockRecordingService = {
      getState: () => mockRecordingState,
      end: async () => {},
      subscribe: () => () => {},
      destroy: () => {},
      cancel: async () => {},
    } as unknown as RecordingService;

    requestor = new EndRequestor(transport, manifest, mockRecordingService);
  });

  it('requests end meeting successfully', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    const result = await requestor.requestEnd(meetingId);

    expect(result.meetingId).toBe(meetingId);
    expect(result.state).toBe('accepted');
    expect(result.serverState).toBe('finalizing');
  });

  it('returns pending state when server is unreachable', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';
    transport.injectNetworkError();

    const result = await requestor.requestEnd(meetingId);

    expect(result.meetingId).toBe(meetingId);
    expect(result.state).toBe('pending');
    expect(result.serverState).toBeNull();
  });

  it('idempotent end returns same result', async () => {
    const meetingId = '550e8400-e29b-41d4-a716-446655440000';

    const result1 = await requestor.requestEnd(meetingId);
    const result2 = await requestor.requestEnd(meetingId);

    expect(result1.state).toBe('accepted');
    expect(result2.state).toBe('accepted');
  });
});
