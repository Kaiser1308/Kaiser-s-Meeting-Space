import { describe, it, expect } from 'vitest';
import { recordingReducer } from './recording-reducer.js';
import { INITIAL_RECORDING_STATE } from './types.js';
import type { RecordingState } from './types.js';

describe('recordingReducer', () => {
  it('starts in idle state', () => {
    expect(INITIAL_RECORDING_STATE.status).toBe('idle');
  });

  // ── CONFIGURE ──

  describe('CONFIGURE', () => {
    it('transitions idle → configuring', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, {
        type: 'CONFIGURE',
        meetingId: 'meeting-1',
        storageDirectory: '/tmp',
      });
      expect(s.status).toBe('configuring');
      expect(s.meetingId).toBe('meeting-1');
    });

    it('rejects CONFIGURE from recording state', () => {
      const recording: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
      const s = recordingReducer(recording, {
        type: 'CONFIGURE',
        meetingId: 'm',
        storageDirectory: '/tmp',
      });
      expect(s.status).toBe('recording'); // unchanged
    });
  });

  describe('CONFIGURE_OK', () => {
    it('transitions configuring → idle (ready for start)', () => {
      const cfg: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'configuring' };
      const s = recordingReducer(cfg, { type: 'CONFIGURE_OK' });
      expect(s.status).toBe('idle');
    });
  });

  describe('CONFIGURE_ERROR', () => {
    it('transitions configuring → error', () => {
      const cfg: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'configuring' };
      const s = recordingReducer(cfg, { type: 'CONFIGURE_ERROR', error: 'denied' });
      expect(s.status).toBe('error');
      expect(s.error).toBe('denied');
    });
  });

  // ── START ──

  describe('START', () => {
    it('transitions idle → recording', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, { type: 'START' });
      expect(s.status).toBe('recording');
    });

    it('transitions error → recording', () => {
      const err: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'error' };
      const s = recordingReducer(err, { type: 'START' });
      expect(s.status).toBe('recording');
    });

    it('rejects START from recording', () => {
      const rec: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
      const s = recordingReducer(rec, { type: 'START' });
      expect(s.status).toBe('recording');
    });
  });

  describe('START_OK', () => {
    it('sets startedAt and resets counters', () => {
      const rec: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
      const s = recordingReducer(rec, {
        type: 'START_OK',
        startedAt: '2026-01-01T00:00:00.000Z',
        monotonicNow: 1000,
      });
      expect(s.status).toBe('recording');
      expect(s.startedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(s.lastResumedAt).toBe(1000);
      expect(s.currentChunkIndex).toBe(0);
      expect(s.chunksCommitted).toBe(0);
      expect(s.totalDurationMs).toBe(0);
    });
  });

  // ── PAUSE ──

  describe('PAUSE', () => {
    it('sets pendingAction', () => {
      const rec: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
      const s = recordingReducer(rec, { type: 'PAUSE' });
      expect(s.pendingAction).toBe('pause');
      expect(s.status).toBe('recording'); // still recording until PAUSE_OK
    });

    it('rejects PAUSE from idle', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, { type: 'PAUSE' });
      expect(s.status).toBe('idle');
    });

    it('rejects PAUSE from paused', () => {
      const paused: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'paused' };
      const s = recordingReducer(paused, { type: 'PAUSE' });
      expect(s.status).toBe('paused');
    });
  });

  describe('PAUSE_OK', () => {
    it('transitions recording → paused with timeline entry', () => {
      const rec: RecordingState = {
        ...INITIAL_RECORDING_STATE,
        status: 'recording',
        lastResumedAt: 1000,
        totalDurationMs: 5000,
        pendingAction: 'pause',
      };
      const s = recordingReducer(rec, { type: 'PAUSE_OK', pauseStart: 6000 });
      expect(s.status).toBe('paused');
      expect(s.pendingAction).toBeNull();
      expect(s.timeline).toHaveLength(1);
      expect(s.timeline[0].type).toBe('pause');
      expect(s.timeline[0].durationMs).toBe(5000); // 6000 - 1000
    });
  });

  // ── RESUME ──

  describe('RESUME', () => {
    it('sets pendingAction from paused', () => {
      const paused: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'paused' };
      const s = recordingReducer(paused, { type: 'RESUME' });
      expect(s.pendingAction).toBe('resume');
    });

    it('rejects RESUME from recording', () => {
      const rec: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
      const s = recordingReducer(rec, { type: 'RESUME' });
      expect(s.status).toBe('recording');
    });
  });

  describe('RESUME_OK', () => {
    it('transitions paused → recording', () => {
      const paused: RecordingState = {
        ...INITIAL_RECORDING_STATE,
        status: 'paused',
        pendingAction: 'resume',
      };
      const s = recordingReducer(paused, { type: 'RESUME_OK', resumedAt: 7000 });
      expect(s.status).toBe('recording');
      expect(s.pendingAction).toBeNull();
      expect(s.lastResumedAt).toBe(7000);
    });
  });

  // ── END / STOP ──

  describe('END', () => {
    it('transitions recording → stopping', () => {
      const rec: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
      const s = recordingReducer(rec, { type: 'END' });
      expect(s.status).toBe('stopping');
      expect(s.pendingAction).toBe('stop');
    });

    it('transitions paused → stopping', () => {
      const paused: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'paused' };
      const s = recordingReducer(paused, { type: 'END' });
      expect(s.status).toBe('stopping');
    });

    it('rejects END from idle', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, { type: 'END' });
      expect(s.status).toBe('idle');
    });
  });

  // ── CHUNK_COMMITTED ──

  describe('CHUNK_COMMITTED', () => {
    it('updates counters during recording', () => {
      const rec: RecordingState = {
        ...INITIAL_RECORDING_STATE,
        status: 'recording',
      };
      const s = recordingReducer(rec, {
        type: 'CHUNK_COMMITTED',
        chunk: {
          type: 'chunk',
          meetingId: 'm1',
          chunkIndex: 0,
          filePath: '/tmp/chunk.webm',
          sha256: '0'.repeat(64),
          byteLength: 48000,
          wallClockStart: '2026-01-01T00:00:00.000Z',
          wallClockEnd: '2026-01-01T00:00:05.000Z',
          monotonicStart: 1000,
          monotonicEnd: 6000,
          durationMs: 5000,
          sampleRate: 48000,
          channels: 1,
          codec: 'opus',
          container: 'webm',
        },
      });
      expect(s.chunksCommitted).toBe(1);
      expect(s.currentChunkIndex).toBe(1);
      expect(s.totalDurationMs).toBe(5000);
      expect(s.health.totalBytesWritten).toBe(48000);
    });

    it('rejects CHUNK_COMMITTED from idle', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, {
        type: 'CHUNK_COMMITTED',
        chunk: {
          type: 'chunk',
          meetingId: 'm1',
          chunkIndex: 0,
          filePath: '/tmp/chunk.webm',
          sha256: '0'.repeat(64),
          byteLength: 48000,
          wallClockStart: '2026-01-01T00:00:00.000Z',
          wallClockEnd: '2026-01-01T00:00:05.000Z',
          monotonicStart: 1000,
          monotonicEnd: 6000,
          durationMs: 5000,
          sampleRate: 48000,
          channels: 1,
          codec: 'opus',
          container: 'webm',
        },
      });
      expect(s.chunksCommitted).toBe(0); // unchanged
    });
  });

  // ── FINALIZE ──

  describe('FINALIZE_OK', () => {
    it('transitions finalizing → idle', () => {
      const fin: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'finalizing' };
      const s = recordingReducer(fin, { type: 'FINALIZE_OK' });
      expect(s.status).toBe('idle');
      expect(s.pendingAction).toBeNull();
    });
  });

  // ── INTERRUPT ──

  describe('INTERRUPT', () => {
    it('pauses recording on interrupt', () => {
      const rec: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
      const s = recordingReducer(rec, {
        type: 'INTERRUPT',
        event: { type: 'interrupt', cause: 'phone_call', action: 'pause' },
      });
      expect(s.status).toBe('paused');
      expect(s.timeline).toHaveLength(1);
      expect(s.timeline[0].type).toBe('gap');
    });
  });

  // ── STORAGE_UPDATE ──

  describe('STORAGE_UPDATE', () => {
    it('sets warning at 10%', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, {
        type: 'STORAGE_UPDATE',
        availableBytes: 10,
        totalBytes: 100,
      });
      expect(s.storageWarning).toBe('warning');
      expect(s.health.storagePercentRemaining).toBe(10);
    });

    it('sets critical at 5%', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, {
        type: 'STORAGE_UPDATE',
        availableBytes: 5,
        totalBytes: 100,
      });
      expect(s.storageWarning).toBe('critical');
    });

    it('estimates remaining time', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, {
        type: 'STORAGE_UPDATE',
        availableBytes: 720_000 * 60, // 60 minutes worth
        totalBytes: 1_000_000_000,
      });
      expect(s.health.estimatedRemainingMinutes).toBe(60);
    });
  });

  // ── RECOVERY_TIMEOUT ──

  describe('RECOVERY_TIMEOUT', () => {
    it('transitions stopping → finalizing with error', () => {
      const stopping: RecordingState = {
        ...INITIAL_RECORDING_STATE,
        status: 'stopping',
        pendingAction: 'stop',
      };
      const s = recordingReducer(stopping, { type: 'RECOVERY_TIMEOUT' });
      expect(s.status).toBe('finalizing');
      expect(s.error).toContain('timeout');
    });

    it('rejects from non-stopping state', () => {
      const s = recordingReducer(INITIAL_RECORDING_STATE, { type: 'RECOVERY_TIMEOUT' });
      expect(s.status).toBe('idle');
    });
  });

  // ── RESET ──

  describe('RESET', () => {
    it('resets to initial state from any state', () => {
      const rec: RecordingState = {
        ...INITIAL_RECORDING_STATE,
        status: 'recording',
        chunksCommitted: 5,
        totalDurationMs: 60000,
      };
      const s = recordingReducer(rec, { type: 'RESET' });
      expect(s.status).toBe('idle');
      expect(s.chunksCommitted).toBe(0);
      expect(s.totalDurationMs).toBe(0);
    });
  });

  // ── Full lifecycle test ──

  it('completes full lifecycle: idle → configuring → idle → recording → paused → recording → stopping → finalizing → idle', () => {
    let s = INITIAL_RECORDING_STATE;

    // configure
    s = recordingReducer(s, { type: 'CONFIGURE', meetingId: 'm1', storageDirectory: '/tmp' });
    expect(s.status).toBe('configuring');
    s = recordingReducer(s, { type: 'CONFIGURE_OK' });
    expect(s.status).toBe('idle');

    // start
    s = recordingReducer(s, { type: 'START' });
    s = recordingReducer(s, {
      type: 'START_OK',
      startedAt: new Date().toISOString(),
      monotonicNow: 1000,
    });
    expect(s.status).toBe('recording');

    // chunk committed during recording
    s = recordingReducer(s, {
      type: 'CHUNK_COMMITTED',
      chunk: {
        type: 'chunk',
        meetingId: 'm1',
        chunkIndex: 0,
        filePath: '/tmp/chunk.webm',
        sha256: '0'.repeat(64),
        byteLength: 48000,
        wallClockStart: '2026-01-01T00:00:00.000Z',
        wallClockEnd: '2026-01-01T00:00:05.000Z',
        monotonicStart: 1000,
        monotonicEnd: 6000,
        durationMs: 5000,
        sampleRate: 48000,
        channels: 1,
        codec: 'opus',
        container: 'webm',
      },
    });
    expect(s.chunksCommitted).toBe(1);

    // pause
    s = recordingReducer(s, { type: 'PAUSE' });
    s = recordingReducer(s, { type: 'PAUSE_OK', pauseStart: 6000 });
    expect(s.status).toBe('paused');

    // resume
    s = recordingReducer(s, { type: 'RESUME' });
    s = recordingReducer(s, { type: 'RESUME_OK', resumedAt: 12000 });
    expect(s.status).toBe('recording');

    // end
    s = recordingReducer(s, { type: 'END' });
    expect(s.status).toBe('stopping');

    // final chunk on stop
    s = recordingReducer(s, {
      type: 'CHUNK_COMMITTED',
      chunk: {
        type: 'chunk',
        meetingId: 'm1',
        chunkIndex: 1,
        filePath: '/tmp/chunk2.webm',
        sha256: '0'.repeat(64),
        byteLength: 48000,
        wallClockStart: '2026-01-01T00:00:10.000Z',
        wallClockEnd: '2026-01-01T00:00:15.000Z',
        monotonicStart: 6000,
        monotonicEnd: 11000,
        durationMs: 5000,
        sampleRate: 48000,
        channels: 1,
        codec: 'opus',
        container: 'webm',
      },
    });
    expect(s.chunksCommitted).toBe(2);

    // finalize
    s = recordingReducer(s, { type: 'FINALIZE_OK' });
    expect(s.status).toBe('idle');
  });

  // ── Idempotency (invalid transitions rejected) ──

  it('rejects pause when already paused', () => {
    const paused: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'paused' };
    const s = recordingReducer(paused, { type: 'PAUSE' });
    expect(s.status).toBe('paused');
  });

  it('rejects end when idle', () => {
    const s = recordingReducer(INITIAL_RECORDING_STATE, { type: 'END' });
    expect(s.status).toBe('idle');
  });

  it('rejects configure when not idle', () => {
    const rec: RecordingState = { ...INITIAL_RECORDING_STATE, status: 'recording' };
    const s = recordingReducer(rec, {
      type: 'CONFIGURE',
      meetingId: 'm',
      storageDirectory: '/tmp',
    });
    expect(s.status).toBe('recording');
  });
});
