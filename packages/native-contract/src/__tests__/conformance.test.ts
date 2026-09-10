/**
 * IPC Contract conformance tests.
 *
 * Validates envelope parsing, command allowlist, size limits,
 * version negotiation, golden fixture conformance, and client behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseRequest,
  parseResponse,
  parseEvent,
  EnvelopeError,
  PROTOCOL_VERSION,
  MAX_ENVELOPE_BYTES,
  validateCommand,
  validateVersion,
} from '../envelope.js';
import { NATIVE_COMMANDS } from '../commands.js';
import { NATIVE_EVENT_TYPES, NativeEventTypeSchema } from '../events.js';
import {
  validateMessageSize,
  validatePayloadSize,
  validateCommandAllowlist,
  validateProtocolVersion,
  validateCorrelationId,
  generateCorrelationId,
  frameMessage,
  readFrameLength,
} from '../validation.js';
import { NativeBridgeClient, NATIVE_IPC_CHANNEL, type NativeIpcTransport } from '../client.js';
import {
  VALID_REQUESTS,
  VALID_RESPONSES,
  VALID_EVENTS,
  INVALID_MESSAGES,
} from '../fixtures/golden.js';

// ─── Golden Fixture Conformance ────────────────────────────────────────

describe('Golden fixture conformance', () => {
  describe('valid requests', () => {
    for (const fixture of VALID_REQUESTS) {
      it(`parses ${fixture.name}`, () => {
        const result = parseRequest(fixture.json);
        expect(result).toEqual(fixture.expected);
      });
    }
  });

  describe('valid responses', () => {
    for (const fixture of VALID_RESPONSES) {
      it(`parses ${fixture.name}`, () => {
        const result = parseResponse(fixture.json);
        expect(result).toEqual(fixture.expected);
      });
    }
  });

  describe('valid events', () => {
    for (const fixture of VALID_EVENTS) {
      it(`parses ${fixture.name}`, () => {
        const result = parseEvent(fixture.json);
        expect(result).toEqual(fixture.expected);
      });
    }
  });

  describe('invalid messages are rejected', () => {
    for (const fixture of INVALID_MESSAGES) {
      it(`rejects ${fixture.name}`, () => {
        expect(() => parseRequest(fixture.json)).toThrow();
      });
    }
  });
});

// ─── Envelope Parsing ──────────────────────────────────────────────────

describe('Envelope parsing', () => {
  it('rejects oversized messages', () => {
    const huge = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      payload: { data: 'x'.repeat(MAX_ENVELOPE_BYTES + 1) },
    });
    expect(() => parseRequest(huge)).toThrow(EnvelopeError);
    expect(() => parseRequest(huge)).toThrow('Envelope exceeds maximum size');
  });

  it('rejects wrong protocol version in request', () => {
    const json = JSON.stringify({
      version: 999,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
    });
    expect(() => parseRequest(json)).toThrow(EnvelopeError);
  });

  it('rejects unknown command in request', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'exec_arbitrary_shell_command',
    });
    expect(() => parseRequest(json)).toThrow(EnvelopeError);
  });

  it('rejects invalid UUID correlation ID', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: 'invalid-id',
      command: 'ping',
    });
    expect(() => parseRequest(json)).toThrow(EnvelopeError);
  });

  it('rejects extra fields (strict mode)', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      hackerField: 'evil',
    });
    expect(() => parseRequest(json)).toThrow(EnvelopeError);
  });

  it('applies defaults for optional fields', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
    });
    const result = parseRequest(json);
    expect(result.payload).toEqual({});
    expect(result.cancel).toBe(false);
    expect(result.timeoutMs).toBeUndefined();
  });

  it('rejects negative timeout', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      timeoutMs: -1000,
    });
    expect(() => parseRequest(json)).toThrow(EnvelopeError);
  });

  it('rejects timeout exceeding max (300s)', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      timeoutMs: 500000,
    });
    expect(() => parseRequest(json)).toThrow(EnvelopeError);
  });
});

// ─── Response Parsing ──────────────────────────────────────────────────

describe('Response parsing', () => {
  it('parses a device enumeration response with an array payload', () => {
    const result = parseResponse(
      JSON.stringify({
        version: 1,
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        command: 'device_enumerate',
        success: true,
        payload: [],
      }),
    );

    expect(result.payload).toEqual([]);
  });

  it('parses success response with error field absent', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      success: true,
      payload: { pong: true },
    });
    const result = parseResponse(json);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('parses error response with safe error', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'storage_atomic_write',
      success: false,
      error: {
        code: 'DISK_FULL',
        message: 'No space left',
        category: 'storage',
        retryable: false,
      },
    });
    const result = parseResponse(json);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('DISK_FULL');
  });

  it('parses a capture-category error emitted by the native runtime', () => {
    const result = parseResponse(
      JSON.stringify({
        version: 1,
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        command: 'capture_stop',
        success: false,
        error: {
          code: 'CAPTURE_STOP_FAILED',
          message: 'Capture stream stopped unexpectedly',
          category: 'capture',
          retryable: false,
        },
      }),
    );

    expect(result.error?.category).toBe('capture');
  });

  it('rejects response with extra error fields', () => {
    const json = JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      success: false,
      error: {
        code: 'ERR',
        message: 'test',
        category: 'runtime',
        retryable: false,
        filePath: '/secret/path',
      },
    });
    expect(() => parseResponse(json)).toThrow(EnvelopeError);
  });
});

// ─── Event Parsing ─────────────────────────────────────────────────────

describe('Event parsing', () => {
  it('parses runtime_ready event', () => {
    const json = JSON.stringify({
      version: 1,
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      eventType: 'runtime_ready',
      payload: {},
      timestamp: '2026-07-26T14:00:00.000Z',
    });
    const result = parseEvent(json);
    expect(result.eventType).toBe('runtime_ready');
  });

  it('rejects unknown event type', () => {
    const json = JSON.stringify({
      version: 1,
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      eventType: 'shell_command_executed',
      payload: {},
      timestamp: '2026-07-26T14:00:00.000Z',
    });
    expect(() => parseEvent(json)).toThrow(EnvelopeError);
  });
});

// ─── Command Allowlist ─────────────────────────────────────────────────

describe('Command allowlist', () => {
  it('has at least 10 commands', () => {
    expect(NATIVE_COMMANDS.length).toBeGreaterThanOrEqual(10);
  });

  it('validates known commands', () => {
    expect(validateCommand('ping')).toBe(true);
    expect(validateCommand('storage_atomic_write')).toBe(true);
    expect(validateCommand('simulator_configure')).toBe(true);
  });

  it('rejects unknown commands', () => {
    expect(validateCommand('exec_shell')).toBe(false);
    expect(validateCommand('rm_rf')).toBe(false);
    expect(validateCommand('')).toBe(false);
  });

  it('does not contain dangerous command patterns', () => {
    for (const cmd of NATIVE_COMMANDS) {
      expect(cmd).not.toMatch(/exec|shell|eval|spawn|fork|require/i);
    }
  });
});

// ─── Validation Utilities ──────────────────────────────────────────────

describe('Validation utilities', () => {
  it('validates message size', () => {
    expect(() => validateMessageSize('hello')).not.toThrow();
    expect(() => validateMessageSize('x'.repeat(MAX_ENVELOPE_BYTES + 1))).toThrow(EnvelopeError);
  });

  it('validates payload size', () => {
    expect(() => validatePayloadSize({ small: true })).not.toThrow();
  });

  it('validates command allowlist', () => {
    expect(validateCommandAllowlist('ping')).toBe('ping');
    expect(() => validateCommandAllowlist('exec_shell')).toThrow(EnvelopeError);
  });

  it('validates protocol version', () => {
    expect(() => validateProtocolVersion(PROTOCOL_VERSION)).not.toThrow();
    expect(() => validateProtocolVersion(99)).toThrow(EnvelopeError);
  });

  it('validates correlation ID format', () => {
    expect(() => validateCorrelationId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    expect(() => validateCorrelationId('bad-id')).toThrow(EnvelopeError);
  });

  it('generates valid correlation IDs', () => {
    const id = generateCorrelationId();
    expect(() => validateCorrelationId(id)).not.toThrow();
  });
});

// ─── Framing ───────────────────────────────────────────────────────────

describe('Message framing', () => {
  it('frames and reads back correctly', () => {
    const json = '{"test":true}';
    const framed = frameMessage(json);
    const length = readFrameLength(framed.subarray(0, 4));
    const payload = new TextDecoder().decode(framed.subarray(4, 4 + length));
    expect(payload).toBe(json);
  });

  it('reads 4-byte big-endian length', () => {
    const frame = frameMessage('AB');
    const length = readFrameLength(frame.subarray(0, 4));
    expect(length).toBe(2);
  });

  it('rejects short header', () => {
    expect(() => readFrameLength(new Uint8Array([0, 1]))).toThrow(EnvelopeError);
  });
});

// ─── Version Negotiation ───────────────────────────────────────────────

describe('Version negotiation', () => {
  it('current protocol version is 1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('validateVersion accepts current version', () => {
    expect(() => validateVersion(1)).not.toThrow();
  });

  it('validateVersion rejects future version', () => {
    expect(() => validateVersion(2)).toThrow(EnvelopeError);
  });

  it('validateVersion rejects version 0', () => {
    expect(() => validateVersion(0)).toThrow(EnvelopeError);
  });
});

// ─── NativeBridgeClient ────────────────────────────────────────────────

describe('NativeBridgeClient', () => {
  let transport: NativeIpcTransport;
  let client: NativeBridgeClient;

  beforeEach(() => {
    transport = {
      invoke: vi.fn(),
      on: vi.fn(() => () => {}),
    };
    client = new NativeBridgeClient(transport);
  });

  it('sends a ping command', async () => {
    const response = {
      version: 1,
      correlationId: 'will-be-overwritten',
      command: 'ping',
      success: true,
      payload: { pong: true },
    };
    vi.mocked(transport.invoke).mockImplementation(async (_channel, request) => ({
      ...response,
      correlationId: (request as { correlationId: string }).correlationId,
    }));

    const result = await client.ping();
    expect(result).toBe(true);
    expect(transport.invoke).toHaveBeenCalledWith(
      NATIVE_IPC_CHANNEL,
      expect.objectContaining({ command: 'ping', version: 1 }),
    );
  });

  it('validates response schema', async () => {
    vi.mocked(transport.invoke).mockResolvedValue({ garbage: true });
    await expect(client.send('ping')).rejects.toThrow(EnvelopeError);
  });

  it('detects correlation ID mismatch', async () => {
    vi.mocked(transport.invoke).mockResolvedValue({
      version: 1,
      correlationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      command: 'ping',
      success: true,
      payload: {},
    });
    await expect(client.send('ping')).rejects.toThrow('correlation ID mismatch');
  });

  it('subscribes to events', () => {
    const callback = vi.fn();
    const unsub = client.onEvent(callback);
    expect(transport.on).toHaveBeenCalledWith('kms-native-event', callback);
    expect(typeof unsub).toBe('function');
  });

  it('rejects commands not in allowlist', async () => {
    await expect(client.send('exec_shell' as never)).rejects.toThrow(EnvelopeError);
  });

  it('passes timeout option', async () => {
    vi.mocked(transport.invoke).mockImplementation(async (_channel, request) => ({
      version: 1,
      correlationId: (request as { correlationId: string }).correlationId,
      command: 'health_check',
      success: true,
      payload: {},
    }));

    await client.send('health_check', {}, { timeoutMs: 5000 });
    expect(transport.invoke).toHaveBeenCalledWith(
      NATIVE_IPC_CHANNEL,
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });
});

// ─── Event Types ───────────────────────────────────────────────────────

describe('Event types', () => {
  it('has all expected event types', () => {
    expect(NATIVE_EVENT_TYPES).toContain('runtime_ready');
    expect(NATIVE_EVENT_TYPES).toContain('device_event');
    expect(NATIVE_EVENT_TYPES).toContain('capture_event');
    expect(NATIVE_EVENT_TYPES).toContain('error');
  });

  it('schema rejects unknown event types', () => {
    const result = NativeEventTypeSchema.safeParse('admin_escalation');
    expect(result.success).toBe(false);
  });
});

// ─── P13 Local Speech Commands & Events ────────────────────────────────

describe('Local speech commands (P13)', () => {
  const SPEECH_COMMANDS = [
    'local_speech_manifest_load',
    'local_speech_engine_init',
    'local_speech_transcribe_window',
    'local_speech_cancel',
    'local_speech_get_state',
  ];

  it('all speech commands are in NATIVE_COMMANDS', () => {
    for (const cmd of SPEECH_COMMANDS) {
      expect(NATIVE_COMMANDS).toContain(cmd);
    }
  });

  it('all speech commands validate via validateCommand', () => {
    for (const cmd of SPEECH_COMMANDS) {
      expect(validateCommand(cmd)).toBe(true);
    }
  });

  it('rejects unknown speech command', () => {
    expect(validateCommand('local_speech_bogus')).toBe(false);
  });

  it('local_speech_event is in NATIVE_EVENT_TYPES', () => {
    expect(NATIVE_EVENT_TYPES).toContain('local_speech_event');
  });

  it('local_speech_event parses as valid NativeEventV1', () => {
    const event = {
      version: 1,
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      eventType: 'local_speech_event',
      payload: {
        runId: '550e8400-e29b-41d4-a716-446655440001',
        eventKind: 'started',
        isSimulated: true,
      },
      timestamp: '2026-07-27T10:00:00.000Z',
    };
    const parsed = parseEvent(JSON.stringify(event));
    expect(parsed.eventType).toBe('local_speech_event');
  });

  it('local_speech_get_state request parses as valid NativeRequestV1', () => {
    const req = {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440002',
      command: 'local_speech_get_state',
    };
    const parsed = parseRequest(JSON.stringify(req));
    expect(parsed.command).toBe('local_speech_get_state');
  });

  it('local_speech_engine_init request with manifest parses', () => {
    const req = {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440003',
      command: 'local_speech_engine_init',
      payload: {
        modelId: 'whisper-tiny-vi',
        language: 'vi',
        memoryBudgetMb: 512,
      },
    };
    const parsed = parseRequest(JSON.stringify(req));
    expect(parsed.command).toBe('local_speech_engine_init');
  });
});
