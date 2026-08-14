import { describe, it, expect } from 'vitest';
import { INITIAL_CAPTURE_RUNTIME, isCaptureActive, isCaptureTerminal } from './capture-runtime.js';

describe('capture runtime state', () => {
  it('starts idle', () => {
    expect(INITIAL_CAPTURE_RUNTIME.state).toBe('idle');
    expect(INITIAL_CAPTURE_RUNTIME.meetingId).toBeNull();
  });
  it('distinguishes active from terminal states', () => {
    expect(isCaptureActive('recording')).toBe(true);
    expect(isCaptureActive('paused')).toBe(true);
    expect(isCaptureActive('idle')).toBe(false);
    expect(isCaptureTerminal('idle')).toBe(true);
    expect(isCaptureTerminal('error')).toBe(true);
    expect(isCaptureTerminal('recording')).toBe(false);
  });
});
