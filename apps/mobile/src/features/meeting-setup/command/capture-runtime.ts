export type CaptureRuntimeState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'error';

export interface CaptureRuntimeSnapshot {
  readonly state: CaptureRuntimeState;
  readonly meetingId: string | null;
}

export const INITIAL_CAPTURE_RUNTIME: CaptureRuntimeSnapshot = { state: 'idle', meetingId: null };

export function isCaptureActive(state: CaptureRuntimeState): boolean {
  return state === 'recording' || state === 'paused';
}

export function isCaptureTerminal(state: CaptureRuntimeState): boolean {
  return state === 'idle' || state === 'error';
}
