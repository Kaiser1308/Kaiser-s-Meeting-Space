import { useEffect, useState } from 'react';

export type FinalizationState =
  | 'finalizing'
  | 'processing'
  | 'partial_ready'
  | 'ready'
  | 'recovery_required';

export type FinalizationPrimaryAction =
  | 'none'
  | 'local'
  | 'cloud'
  | 'waiting_for_desktop'
  | 'waiting_for_model'
  | 'review_required';

export interface FinalizationStatus {
  readonly meetingId: string;
  readonly state: FinalizationState;
  readonly primaryAction: FinalizationPrimaryAction;
  readonly version: number;
}

export interface FinalizationStatusSource {
  getStatus(meetingId: string): Promise<FinalizationStatus | null>;
}

/** True while the meeting still needs polling to reach a terminal state. */
export function shouldContinuePolling(status: FinalizationStatus | null): boolean {
  if (!status) return true;
  return status.state !== 'ready' && status.state !== 'partial_ready';
}

/**
 * Polls the finalization status for a meeting until it reaches a terminal
 * state (ready / partial_ready). Stops on error and exposes the error flag.
 */
export function useFinalizationStatus(
  meetingId: string,
  source: FinalizationStatusSource,
  pollMs = 3000,
): { status: FinalizationStatus | null; error: boolean } {
  const [status, setStatus] = useState<FinalizationStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const next = await source.getStatus(meetingId);
        if (cancelled) return;
        setStatus(next);
        setError(false);
        if (shouldContinuePolling(next)) {
          timer = setTimeout(poll, pollMs);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [meetingId, source, pollMs]);

  return { status, error };
}
