/**
 * Golden fixtures for cross-language IPC conformance testing.
 *
 * Both TS and Rust parsers must produce identical results for these fixtures.
 * Valid fixtures must parse successfully; invalid fixtures must be rejected.
 */

import type { NativeRequestV1, NativeResponseV1, NativeEventV1 } from '../envelope.js';

/** Valid request fixtures. */
export const VALID_REQUESTS: Array<{ name: string; json: string; expected: NativeRequestV1 }> = [
  {
    name: 'ping_request',
    json: JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      payload: {},
      cancel: false,
    }),
    expected: {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      payload: {},
      cancel: false,
    },
  },
  {
    name: 'get_version_request',
    json: JSON.stringify({
      version: 1,
      correlationId: '6ba7b810-9dad-41d4-80b5-fc53e1510000',
      command: 'get_version',
    }),
    expected: {
      version: 1,
      correlationId: '6ba7b810-9dad-41d4-80b5-fc53e1510000',
      command: 'get_version',
      payload: {},
      cancel: false,
    },
  },
  {
    name: 'storage_atomic_write_request',
    json: JSON.stringify({
      version: 1,
      correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      command: 'storage_atomic_write',
      payload: {
        path: 'chunks/chunk_000.webm',
        dataBase64: 'AAAA',
      },
      timeoutMs: 5000,
    }),
    expected: {
      version: 1,
      correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      command: 'storage_atomic_write',
      payload: {
        path: 'chunks/chunk_000.webm',
        dataBase64: 'AAAA',
      },
      timeoutMs: 5000,
      cancel: false,
    },
  },
  {
    name: 'simulator_configure_request',
    json: JSON.stringify({
      version: 1,
      correlationId: '8a0a4c6a-1234-4faa-b567-890abcdef012',
      command: 'simulator_configure',
      payload: {
        seed: 42,
        deviceCount: 2,
        chunkIntervalMs: 5000,
      },
      timeoutMs: 10000,
    }),
    expected: {
      version: 1,
      correlationId: '8a0a4c6a-1234-4faa-b567-890abcdef012',
      command: 'simulator_configure',
      payload: {
        seed: 42,
        deviceCount: 2,
        chunkIntervalMs: 5000,
      },
      timeoutMs: 10000,
      cancel: false,
    },
  },
  {
    name: 'cancel_request',
    json: JSON.stringify({
      version: 1,
      correlationId: '9b1b5d7b-2345-4ebb-a678-901bcdef0123',
      command: 'health_check',
      cancel: true,
    }),
    expected: {
      version: 1,
      correlationId: '9b1b5d7b-2345-4ebb-a678-901bcdef0123',
      command: 'health_check',
      payload: {},
      cancel: true,
    },
  },
  {
    name: 'local_speech_get_state_request',
    json: JSON.stringify({
      version: 1,
      correlationId: '880e8400-e29b-41d4-a716-446655440008',
      command: 'local_speech_get_state',
    }),
    expected: {
      version: 1,
      correlationId: '880e8400-e29b-41d4-a716-446655440008',
      command: 'local_speech_get_state',
      payload: {},
      cancel: false,
    },
  },
];

/** Valid response fixtures. */
export const VALID_RESPONSES: Array<{
  name: string;
  json: string;
  expected: NativeResponseV1;
}> = [
  {
    name: 'ping_response_success',
    json: JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      success: true,
      payload: { pong: true },
    }),
    expected: {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      success: true,
      payload: { pong: true },
    },
  },
  {
    name: 'health_check_response',
    json: JSON.stringify({
      version: 1,
      correlationId: '6ba7b810-9dad-41d4-80b5-fc53e1510000',
      command: 'health_check',
      success: true,
      payload: {
        status: 'healthy',
        uptimeMs: 12345,
        storageReady: true,
        simulatorActive: false,
      },
    }),
    expected: {
      version: 1,
      correlationId: '6ba7b810-9dad-41d4-80b5-fc53e1510000',
      command: 'health_check',
      success: true,
      payload: {
        status: 'healthy',
        uptimeMs: 12345,
        storageReady: true,
        simulatorActive: false,
      },
    },
  },
  {
    name: 'error_response',
    json: JSON.stringify({
      version: 1,
      correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      command: 'storage_atomic_write',
      success: false,
      payload: {},
      error: {
        code: 'DISK_FULL',
        message: 'Insufficient disk space for atomic write',
        category: 'storage',
        retryable: false,
      },
    }),
    expected: {
      version: 1,
      correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      command: 'storage_atomic_write',
      success: false,
      payload: {},
      error: {
        code: 'DISK_FULL',
        message: 'Insufficient disk space for atomic write',
        category: 'storage',
        retryable: false,
      },
    },
  },
];

/** Valid event fixtures. */
export const VALID_EVENTS: Array<{ name: string; json: string; expected: NativeEventV1 }> = [
  {
    name: 'runtime_ready_event',
    json: JSON.stringify({
      version: 1,
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      eventType: 'runtime_ready',
      payload: {
        runtimeVersion: '0.1.0',
        protocolVersion: 1,
        pid: 12345,
      },
      timestamp: '2026-07-26T14:00:00.000Z',
    }),
    expected: {
      version: 1,
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      eventType: 'runtime_ready',
      payload: {
        runtimeVersion: '0.1.0',
        protocolVersion: 1,
        pid: 12345,
      },
      timestamp: '2026-07-26T14:00:00.000Z',
    },
  },
  {
    name: 'device_event_connected',
    json: JSON.stringify({
      version: 1,
      eventId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      eventType: 'device_event',
      payload: {
        deviceId: 'sim-mic-001',
        deviceName: 'Simulated Microphone',
        eventKind: 'connected',
        deviceType: 'microphone',
        isSimulated: true,
      },
      timestamp: '2026-07-26T14:00:01.000Z',
    }),
    expected: {
      version: 1,
      eventId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      eventType: 'device_event',
      payload: {
        deviceId: 'sim-mic-001',
        deviceName: 'Simulated Microphone',
        eventKind: 'connected',
        deviceType: 'microphone',
        isSimulated: true,
      },
      timestamp: '2026-07-26T14:00:01.000Z',
    },
  },
  {
    name: 'local_speech_event_started',
    json: JSON.stringify({
      version: 1,
      eventId: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      eventType: 'local_speech_event',
      payload: {
        runId: '550e8400-e29b-41d4-a716-446655440001',
        eventKind: 'started',
        isSimulated: true,
      },
      timestamp: '2026-07-27T10:00:00.000Z',
    }),
    expected: {
      version: 1,
      eventId: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      eventType: 'local_speech_event',
      payload: {
        runId: '550e8400-e29b-41d4-a716-446655440001',
        eventKind: 'started',
        isSimulated: true,
      },
      timestamp: '2026-07-27T10:00:00.000Z',
    },
  },
];

/** Invalid fixture descriptions. Each must be REJECTED by the parser. */
export const INVALID_MESSAGES: Array<{ name: string; json: string; expectedError: string }> = [
  {
    name: 'wrong_version',
    json: JSON.stringify({
      version: 99,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
    }),
    expectedError: 'Invalid request',
  },
  {
    name: 'unknown_command',
    json: JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'exec_shell',
    }),
    expectedError: 'Invalid request',
  },
  {
    name: 'invalid_correlation_id',
    json: JSON.stringify({
      version: 1,
      correlationId: 'not-a-uuid',
      command: 'ping',
    }),
    expectedError: 'Invalid request',
  },
  {
    name: 'extra_fields_rejected',
    json: JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      secretPayload: { password: 'hunter2' },
    }),
    expectedError: 'Invalid request',
  },
  {
    name: 'missing_version',
    json: JSON.stringify({
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
    }),
    expectedError: 'Invalid request',
  },
  {
    name: 'negative_timeout',
    json: JSON.stringify({
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      timeoutMs: -1000,
    }),
    expectedError: 'Invalid request',
  },
  {
    name: 'not_json',
    json: 'this is not json at all',
    expectedError: '', // JSON.parse will throw
  },
  {
    name: 'empty_string',
    json: '',
    expectedError: '',
  },
];
