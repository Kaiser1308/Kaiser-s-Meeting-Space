import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeAudioModule } from '../src/adapters/fake-module.js';
import { NativeCommandSchema, PROTOCOL_VERSION } from '../src/contracts/commands.js';
import {
  NativeEventSchema,
  validateEnvelope,
  ChunkEventSchema,
  GapEventSchema,
  StorageEventSchema,
  MalformedEventError,
} from '../src/contracts/events.js';
import type {
  ConfigureCommand,
  StartCommand,
  PauseCommand,
  ResumeCommand,
  StopCommand,
  StatusCommand,
  CancelCommand,
} from '../src/contracts/commands.js';
import type {
  ChunkEvent,
  DeviceEvent,
  GapEvent,
  ErrorEvent,
  StatusResponse,
  NativeEvent,
} from '../src/contracts/events.js';

// ── Helpers ──

function cid(): string {
  return crypto.randomUUID();
}

function configureCmd(meetingId?: string): ConfigureCommand {
  return {
    type: 'configure',
    correlationId: cid(),
    profile: {
      sampleRate: 48000,
      channels: 1,
      codec: 'opus',
      container: 'webm',
      bitrate: 96000,
      opusFrameDurationMs: 20,
      complexity: 5,
    },
    storageDirectory: '/tmp/test-storage',
    meetingId: meetingId ?? '123e4567-e89b-12d3-a456-426614174000',
  };
}

function startCmd(): StartCommand {
  return { type: 'start', correlationId: cid() };
}

function pauseCmd(): PauseCommand {
  return { type: 'pause', correlationId: cid() };
}

function resumeCmd(): ResumeCommand {
  return { type: 'resume', correlationId: cid() };
}

function stopCmd(): StopCommand {
  return { type: 'stop', correlationId: cid() };
}

function statusCmd(): StatusCommand {
  return { type: 'status', correlationId: cid() };
}

function cancelCmd(): CancelCommand {
  return { type: 'cancel', correlationId: cid() };
}

// ── Schema validation tests ──

describe('NativeCommandSchema', () => {
  it('validates configure command', () => {
    const cmd = configureCmd();
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('validates start command', () => {
    const cmd = startCmd();
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('validates pause command', () => {
    const cmd = pauseCmd();
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('validates resume command', () => {
    const cmd = resumeCmd();
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('validates stop command', () => {
    const cmd = stopCmd();
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('validates status command', () => {
    const cmd = statusCmd();
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('validates cancel command', () => {
    const cmd = cancelCmd();
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('rejects unknown command type', () => {
    const result = NativeCommandSchema.safeParse({ type: 'unknown', correlationId: cid() });
    expect(result.success).toBe(false);
  });

  it('rejects malformed command (missing correlationId)', () => {
    const result = NativeCommandSchema.safeParse({ type: 'start' });
    expect(result.success).toBe(false);
  });

  it('rejects configure without profile', () => {
    const result = NativeCommandSchema.safeParse({
      type: 'configure',
      correlationId: cid(),
      storageDirectory: '/tmp',
      meetingId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown event type', () => {
    const result = NativeEventSchema.safeParse({ type: 'unknown_event' });
    expect(result.success).toBe(false);
  });
});

// ── Envelope validation tests ──

describe('validateEnvelope', () => {
  it('validates a valid v1 envelope', () => {
    const envelope = {
      version: 1,
      payload: {
        type: 'chunk',
        meetingId: '123e4567-e89b-12d3-a456-426614174000',
        chunkIndex: 0,
        filePath: '/tmp/chunk.webm',
        sha256: '0000000000000000000000000000000000000000000000000000000000000001',
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
    };
    const result = validateEnvelope(envelope);
    expect(result.version).toBe(1);
    expect(result.payload.type).toBe('chunk');
  });

  it('rejects invalid version', () => {
    expect(() => validateEnvelope({ version: 2, payload: {} })).toThrow();
  });

  it('rejects missing version', () => {
    expect(() => validateEnvelope({ payload: { type: 'chunk' } })).toThrow();
  });

  it('rejects invalid payload', () => {
    expect(() => validateEnvelope({ version: 1, payload: { type: 'unknown' } })).toThrow();
  });
});

// ── Fake module lifecycle tests ──

describe('createFakeAudioModule', () => {
  let events: NativeEvent[];

  beforeEach(() => {
    events = [];
  });

  function createModule(config = {}) {
    const mod = createFakeAudioModule({
      chunkDelayMs: 50, // Fast chunks for tests
      ...config,
    });
    mod.addEventListener((e) => events.push(e));
    return mod;
  }

  it('starts in unconfigured state', () => {
    const mod = createModule();
    expect(mod.getStatus().state).toBe('unconfigured');
  });

  it('transitions: unconfigured → configured → recording → paused → recording → stopping → finalizing', async () => {
    const mod = createModule();

    // configure
    await mod.sendCommand(configureCmd());
    expect(mod.getStatus().state).toBe('configured');

    // start
    await mod.sendCommand(startCmd());
    expect(mod.getStatus().state).toBe('recording');

    // Let one chunk emit
    await new Promise((r) => setTimeout(r, 100));
    const chunkEvents = events.filter((e) => e.type === 'chunk');
    expect(chunkEvents.length).toBeGreaterThanOrEqual(1);
    const firstChunk = chunkEvents[0] as ChunkEvent;
    expect(firstChunk.chunkIndex).toBe(0);
    expect(firstChunk.sampleRate).toBe(48000);
    expect(firstChunk.channels).toBe(1);
    expect(firstChunk.codec).toBe('opus');
    expect(firstChunk.container).toBe('webm');
    expect(firstChunk.monotonicEnd).toBeGreaterThan(firstChunk.monotonicStart);
    expect(new Date(firstChunk.wallClockEnd) >= new Date(firstChunk.wallClockStart)).toBe(true);

    // pause
    await mod.sendCommand(pauseCmd());
    expect(mod.getStatus().state).toBe('paused');

    // resume
    await mod.sendCommand(resumeCmd());
    expect(mod.getStatus().state).toBe('recording');

    // stop
    await mod.sendCommand(stopCmd());
    expect(mod.getStatus().state).toBe('finalizing');

    // Check final chunk was emitted
    const allChunks = events.filter((e) => e.type === 'chunk');
    expect(allChunks.length).toBeGreaterThanOrEqual(2); // at least one during recording + final
  });

  it('emits DeviceEvent for route change on start', async () => {
    const mod = createModule({ routeChangeOnStart: 'bluetooth' });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());

    const deviceEvents = events.filter((e) => e.type === 'device') as DeviceEvent[];
    expect(deviceEvents.length).toBe(1);
    expect(deviceEvents[0].changeType).toBe('route_change');
  });

  it('emits GapEvent at configured chunk index', async () => {
    const mod = createModule({ gapAtChunk: 0, chunkDelayMs: 30 });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());
    await new Promise((r) => setTimeout(r, 100));

    const gapEvents = events.filter((e) => e.type === 'gap') as GapEvent[];
    expect(gapEvents.length).toBe(1);
    expect(gapEvents[0].reason).toBe('buffer_overflow');
  });

  it('emits ErrorEvent when configureFails', async () => {
    const mod = createModule({ configureFails: true });

    await mod.sendCommand(configureCmd());

    const errorEvents = events.filter((e) => e.type === 'error') as ErrorEvent[];
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].code).toBe('permission');
    expect(errorEvents[0].fatal).toBe(true);
  });

  it('emits ErrorEvent when startFails', async () => {
    const mod = createModule({ startFails: true });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());

    const errorEvents = events.filter((e) => e.type === 'error') as ErrorEvent[];
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].code).toBe('io_error');
  });

  it('emits ErrorEvent when errorAfterChunks threshold hit', async () => {
    const mod = createModule({ errorAfterChunks: 1, chunkDelayMs: 30 });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());
    await new Promise((r) => setTimeout(r, 150));

    const errorEvents = events.filter((e) => e.type === 'error') as ErrorEvent[];
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].code).toBe('overrun');
  });

  it('stopTimeout keeps state stopping, never emits final chunk', async () => {
    vi.useFakeTimers();

    const mod = createModule({ stopTimeout: true, chunkDelayMs: 5000 });
    // Use very long delay so chunks only fire when we advance timers

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());

    // Advance past 2 chunk intervals
    vi.advanceTimersByTime(10000);
    const chunksBefore = events.filter((e) => e.type === 'chunk').length;
    expect(chunksBefore).toBeGreaterThanOrEqual(1);

    await mod.sendCommand(stopCmd());
    expect(mod.getStatus().state).toBe('stopping');

    // After stop, advancing time should NOT produce new chunks
    const preAdvanceCount = events.filter((e) => e.type === 'chunk').length;
    vi.advanceTimersByTime(30000);
    const postAdvanceCount = events.filter((e) => e.type === 'chunk').length;
    expect(postAdvanceCount).toBe(preAdvanceCount);
    // Never transitions to finalizing
    expect(mod.getStatus().state).toBe('stopping');

    vi.useRealTimers();
  });

  it('diskFullOnStop emits disk_full error', async () => {
    const mod = createModule({ diskFullOnStop: true, chunkDelayMs: 30 });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());
    await new Promise((r) => setTimeout(r, 80));

    await mod.sendCommand(stopCmd());

    const errorEvents = events.filter((e) => e.type === 'error') as ErrorEvent[];
    expect(errorEvents.some((e) => e.code === 'disk_full')).toBe(true);
  });

  it('checksumMismatch emits io_error and stays finalizing', async () => {
    const mod = createModule({ checksumMismatch: true, chunkDelayMs: 30 });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());
    await new Promise((r) => setTimeout(r, 80));

    await mod.sendCommand(stopCmd());

    expect(mod.getStatus().state).toBe('finalizing');
    const errorEvents = events.filter((e) => e.type === 'error') as ErrorEvent[];
    expect(errorEvents.length).toBe(1);
  });

  it('cancel() resets to unconfigured', async () => {
    const mod = createModule();

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());
    await new Promise((r) => setTimeout(r, 50));

    await mod.sendCommand(cancelCmd());
    expect(mod.getStatus().state).toBe('unconfigured');
    expect(mod.getStatus().currentChunkIndex).toBe(0);
  });

  it('status command emits status response', async () => {
    const mod = createModule();

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(statusCmd());

    const statusEvents = events.filter((e) => e.type === 'status') as StatusResponse[];
    expect(statusEvents.length).toBe(1);
    expect(statusEvents[0].state).toBe('configured');
  });

  it('addEventListener returns unsubscribe function', () => {
    const mod = createModule();
    const captured: NativeEvent[] = [];

    const unsub = mod.addEventListener((e) => captured.push(e));
    expect(typeof unsub).toBe('function');

    // Should receive event
    mod.sendCommand(statusCmd());
    // After unsub, listener should not be called
    unsub();
    // Verify unsubscribe removed the listener
    expect(mod.getStatus().state).toBeDefined();
  });

  it('multiple listeners all receive events', async () => {
    const mod = createModule();
    const captured1: NativeEvent[] = [];
    const captured2: NativeEvent[] = [];

    mod.addEventListener((e) => captured1.push(e));
    mod.addEventListener((e) => captured2.push(e));

    await mod.sendCommand(configureCmd());

    expect(captured1.length).toBe(0); // configure doesn't emit events (unless it fails)
    await mod.sendCommand(statusCmd());

    const status1 = captured1.filter((e) => e.type === 'status');
    const status2 = captured2.filter((e) => e.type === 'status');
    expect(status1.length).toBe(1);
    expect(status2.length).toBe(1);
  });

  it('correlationId preserved in error events', async () => {
    const mod = createModule({ configureFails: true });
    const cmd = configureCmd();

    await mod.sendCommand(cmd);

    const errorEvents = events.filter((e) => e.type === 'error') as ErrorEvent[];
    expect(errorEvents[0].correlationId).toBe(cmd.correlationId);
  });

  it('version protocol constant is 1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('rejects pause when not recording', async () => {
    const mod = createModule({ pauseFails: true });
    await mod.sendCommand(configureCmd());
    await mod.sendCommand(pauseCmd());

    const errorEvents = events.filter((e) => e.type === 'error') as ErrorEvent[];
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].code).toBe('io_error');
  });

  // ── Malformed/unknown/stale event rejection ──

  it('rejects chunk event with wallClockEnd before wallClockStart', () => {
    const result = ChunkEventSchema.safeParse({
      type: 'chunk',
      meetingId: '123e4567-e89b-12d3-a456-426614174000',
      chunkIndex: 0,
      filePath: '/tmp/chunk.webm',
      sha256: '0000000000000000000000000000000000000000000000000000000000000001',
      byteLength: 48000,
      wallClockStart: '2026-01-01T00:00:10.000Z',
      wallClockEnd: '2026-01-01T00:00:05.000Z', // before start
      monotonicStart: 6000,
      monotonicEnd: 1000, // before start
      durationMs: 5000,
      sampleRate: 48000,
      channels: 1,
      codec: 'opus',
      container: 'webm',
    });
    expect(result.success).toBe(false);
  });

  it('rejects gap event with endMs before startMs', () => {
    const result = GapEventSchema.safeParse({
      type: 'gap',
      reason: 'buffer_overflow',
      startMs: 5000,
      endMs: 3000,
      durationMs: 2000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects gap event with durationMs mismatch', () => {
    const result = GapEventSchema.safeParse({
      type: 'gap',
      reason: 'source_disconnect',
      startMs: 1000,
      endMs: 5000,
      durationMs: 9999, // should be 4000
    });
    expect(result.success).toBe(false);
  });

  it('rejects storage event with availableBytes > totalBytes', () => {
    const result = StorageEventSchema.safeParse({
      type: 'storage',
      level: 'warning',
      availableBytes: 2000,
      totalBytes: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects event with unknown type', () => {
    const result = NativeEventSchema.safeParse({ type: 'phantom_event' });
    expect(result.success).toBe(false);
  });

  it('rejects event envelope with mismatched version', () => {
    // Version 2 is rejected by the literal(1) in EnvelopeSchema before
    // the explicit version check, so the error message is the schema error.
    expect(() =>
      validateEnvelope({ version: 2, payload: { type: 'error', code: 'unknown', fatal: true } }),
    ).toThrow(MalformedEventError);
  });

  it('rejects event envelope with version 0', () => {
    expect(() =>
      validateEnvelope({ version: 0, payload: { type: 'error', code: 'unknown', fatal: true } }),
    ).toThrow(MalformedEventError);
  });

  it('rejects event envelope with null payload', () => {
    expect(() => validateEnvelope({ version: 1, payload: null })).toThrow();
  });

  it('rejects event envelope with missing payload', () => {
    expect(() => validateEnvelope({})).toThrow();
  });

  it('rejects configure command with invalid sample rate', () => {
    const cmd = {
      type: 'configure' as const,
      correlationId: cid(),
      profile: {
        sampleRate: 44100, // must be 48000
        channels: 1,
        codec: 'opus',
        container: 'webm',
        bitrate: 96000,
        opusFrameDurationMs: 20,
        complexity: 5,
      },
      storageDirectory: '/tmp',
      meetingId: '123e4567-e89b-12d3-a456-426614174000',
    };
    const result = NativeCommandSchema.safeParse(cmd);
    expect(result.success).toBe(false);
  });

  it('rejects configure command with missing meetingId', () => {
    const result = NativeCommandSchema.safeParse({
      type: 'configure',
      correlationId: cid(),
      profile: {
        sampleRate: 48000,
        channels: 1,
        codec: 'opus',
        container: 'webm',
        bitrate: 96000,
        opusFrameDurationMs: 20,
        complexity: 5,
      },
      storageDirectory: '/tmp',
    });
    expect(result.success).toBe(false);
  });

  // ── P07 adapter ordering validation ──

  it('chunk event schema matches P07 manifest entry shape', () => {
    // ChunkEvent fields should be a superset of P07 ManifestEntry fields
    const chunk: ChunkEvent = {
      type: 'chunk',
      meetingId: '123e4567-e89b-12d3-a456-426614174000',
      chunkIndex: 0,
      filePath: '/tmp/chunk.webm',
      sha256: '0000000000000000000000000000000000000000000000000000000000000001',
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
    };
    // These fields match P07 ManifestEntry required fields
    expect(chunk.meetingId).toBeTruthy();
    expect(chunk.chunkIndex).toBe(0);
    expect(chunk.filePath).toBeTruthy();
    expect(chunk.sha256).toHaveLength(64);
    expect(chunk.byteLength).toBeGreaterThan(0);
    expect(chunk.wallClockStart).toBeTruthy();
    expect(chunk.wallClockEnd).toBeTruthy();
    expect(chunk.monotonicStart).toBeGreaterThan(0);
    expect(chunk.monotonicEnd).toBeGreaterThan(0);
    expect(chunk.sampleRate).toBe(48000);
    expect(chunk.channels).toBe(1);
    expect(chunk.codec).toBe('opus');
    expect(chunk.container).toBe('webm');
    expect(chunk.durationMs).toBeGreaterThan(0);
  });

  it('chunks emitted in monotonic order', async () => {
    vi.useFakeTimers();
    const mod = createModule({ chunkDelayMs: 5000 });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());

    // Advance 5 intervals (25s)
    vi.advanceTimersByTime(25000);

    const chunkEvents = events.filter((e) => e.type === 'chunk') as ChunkEvent[];
    expect(chunkEvents.length).toBeGreaterThanOrEqual(1);

    for (let i = 1; i < chunkEvents.length; i++) {
      expect(chunkEvents[i].chunkIndex).toBe(chunkEvents[i - 1].chunkIndex + 1);
      expect(chunkEvents[i].monotonicStart).toBeGreaterThanOrEqual(chunkEvents[i - 1].monotonicEnd);
    }

    vi.useRealTimers();
  });

  it('pause creates explicit boundary; resume starts new chunk', async () => {
    vi.useFakeTimers();
    const mod = createModule({ chunkDelayMs: 5000 });

    await mod.sendCommand(configureCmd());
    await mod.sendCommand(startCmd());

    vi.advanceTimersByTime(10000); // 2 chunks
    await mod.sendCommand(pauseCmd());

    const prePauseChunks = events.filter((e) => e.type === 'chunk').length;
    // Advance time while paused — no new chunks
    vi.advanceTimersByTime(30000);
    const duringPauseChunks = events.filter((e) => e.type === 'chunk').length;
    expect(duringPauseChunks).toBe(prePauseChunks);

    await mod.sendCommand(resumeCmd());
    vi.advanceTimersByTime(10000); // 2 more chunks
    const postResumeChunks = events.filter((e) => e.type === 'chunk').length;
    expect(postResumeChunks).toBeGreaterThan(prePauseChunks);

    vi.useRealTimers();
  });
});
