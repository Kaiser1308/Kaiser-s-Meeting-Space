import { useState } from 'react';

export type RecordingControllerState = 'idle' | 'recording' | 'paused' | 'stopping';

export function useRecordingController(): {
  state: RecordingControllerState;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
} {
  const [state, setState] = useState<RecordingControllerState>('idle');
  return {
    state,
    start: () => setState('recording'),
    pause: () => setState('paused'),
    resume: () => setState('recording'),
    stop: () => setState('stopping'),
  };
}
