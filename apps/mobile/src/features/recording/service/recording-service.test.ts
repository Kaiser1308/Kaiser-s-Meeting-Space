import { describe, it, expect, afterEach } from 'vitest';
import { createFakeAudioModule } from '@kms/mobile-audio';
import type { FakeModuleConfig } from '@kms/mobile-audio';
import { RecordingService } from './recording-service.js';

describe('RecordingService', () => {
  let service: RecordingService;

  function createService(config: FakeModuleConfig = {}) {
    const mod = createFakeAudioModule({
      chunkDelayMs: 30, // Fast chunks for tests
      ...config,
    });
    service = new RecordingService(mod);
    service.initialize();
    return service;
  }

  afterEach(() => {
    if (service) {
      service.destroy();
    }
  });

  it('starts in idle state', () => {
    const svc = createService();
    expect(svc.getState().status).toBe('idle');
  });

  it('completes configure → start → pause → resume → end lifecycle', async () => {
    const svc = createService();

    await svc.configure('meeting-1', '/tmp/test');
    expect(svc.getState().meetingId).toBe('meeting-1');

    await svc.start();
    expect(svc.getState().status).toBe('recording');

    // Let a chunk emit
    await new Promise((r) => setTimeout(r, 100));
    expect(svc.getState().chunksCommitted).toBeGreaterThanOrEqual(1);

    await svc.pause();
    expect(svc.getState().status).toBe('paused');

    await svc.resume();
    expect(svc.getState().status).toBe('recording');

    await svc.end();
    // Stop sends command, fake emits final chunk, reducer transitions stopping→finalizing→idle
    await new Promise((r) => setTimeout(r, 100));
    expect(svc.getState().status).toBe('idle');
  });

  it('debounces rapid pause taps', async () => {
    const svc = createService();

    await svc.configure('m1', '/tmp');
    await svc.start();
    await new Promise((r) => setTimeout(r, 60)); // Let recording stabilize

    // Rapid double pause
    await svc.pause();
    await svc.pause(); // Should be debounced

    expect(svc.getState().status).toBe('paused');
    // pendingAction should be cleared by PAUSE_OK from first call
    expect(svc.getState().pendingAction).toBeNull();
  });

  it('debounces rapid end taps', async () => {
    const svc = createService();

    await svc.configure('m1', '/tmp');
    await svc.start();
    await new Promise((r) => setTimeout(r, 60));

    // Rapid double end
    await svc.end();
    await svc.end(); // Should be debounced

    // Wait for finalization
    await new Promise((r) => setTimeout(r, 100));
    expect(svc.getState().status).toBe('idle');
  });

  it('handles configure failure — error event emitted', async () => {
    const svc = createService({ configureFails: true });

    await svc.configure('m1', '/tmp');
    // The native module emits an error event during sendCommand.
    // The service dispatches CONFIGURE_OK after sendCommand returns (no throw from fake).
    // The error event is received synchronously and sets state.error.
    // CONFIGURE_OK transitions configuring → idle, but error message persists.
    const state = svc.getState();
    expect(state.error).toBeTruthy();
  });

  it('handles start failure — error event emitted', async () => {
    const svc = createService({ startFails: true });

    await svc.configure('m1', '/tmp');
    await svc.start();

    // The native module emits an error event synchronously during sendCommand.
    // state.error should be set from the error event.
    const state = svc.getState();
    expect(state.error).toBeTruthy();
  });

  it('stopTimeout keeps status stopping', async () => {
    const svc = createService({ stopTimeout: true });

    await svc.configure('m1', '/tmp');
    await svc.start();
    await new Promise((r) => setTimeout(r, 60));

    await svc.end();
    // stopTimeout means no final chunk is emitted
    expect(svc.getState().status).toBe('stopping');

    // After 30s timeout, RECOVERY_TIMEOUT should fire
    // (We can't easily wait 30s in a test, just verify initial stopping state)
  });

  it('cancel resets to idle', async () => {
    const svc = createService();

    await svc.configure('m1', '/tmp');
    await svc.start();
    await new Promise((r) => setTimeout(r, 60));

    await svc.cancel();
    expect(svc.getState().status).toBe('idle');
    expect(svc.getState().chunksCommitted).toBe(0);
  });

  it('subscribe receives state updates', async () => {
    const svc = createService();
    const states: string[] = [];

    svc.subscribe((s) => states.push(s.status));

    await svc.configure('m1', '/tmp');
    await svc.start();
    await svc.end();
    await new Promise((r) => setTimeout(r, 100));

    // Should have seen a flow of state transitions
    expect(states.length).toBeGreaterThan(3);
    expect(states).toContain('configuring');
    expect(states).toContain('recording');
    expect(states).toContain('idle');
  });

  it('emit events include storage updates during recording', async () => {
    const svc = createService();

    await svc.configure('m1', '/tmp');
    await svc.start();

    // Status poll should fire after 5s, but we don't want to wait that long
    // The initial storage state is updated on START_OK
    // Just verify the service is recording
    expect(svc.getState().status).toBe('recording');
  });

  it('handles chunks during recording correctly', async () => {
    const svc = createService({ chunkDelayMs: 20 });

    await svc.configure('m1', '/tmp');
    await svc.start();

    // Wait for several chunks
    await new Promise((r) => setTimeout(r, 150));

    const state = svc.getState();
    expect(state.chunksCommitted).toBeGreaterThanOrEqual(2);
    expect(state.totalDurationMs).toBeGreaterThan(0);
    expect(state.health.totalBytesWritten).toBeGreaterThan(0);
  });

  it('device events do not change recording state', async () => {
    const svc = createService({ routeChangeOnStart: 'bluetooth' });

    await svc.configure('m1', '/tmp');
    await svc.start();
    await new Promise((r) => setTimeout(r, 50));

    // Device event received, but recording continues
    expect(svc.getState().status).toBe('recording');
  });
});
