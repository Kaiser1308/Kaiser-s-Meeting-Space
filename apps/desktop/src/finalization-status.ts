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

export interface FinalizationStatusViewModel {
  readonly meetingId: string;
  readonly state: FinalizationState;
  readonly primaryAction: FinalizationPrimaryAction;
  readonly version: number;
  readonly isComplete: boolean;
  readonly requiresAttention: boolean;
  readonly label: string;
}

const STATE_LABELS: Record<FinalizationState, string> = {
  finalizing: 'Finalizing…',
  processing: 'Processing…',
  partial_ready: 'Partially ready',
  ready: 'Ready',
  recovery_required: 'Recovery required',
};

export function mapFinalizationStatus(status: FinalizationStatus): FinalizationStatusViewModel {
  const isComplete = status.state === 'ready' || status.state === 'partial_ready';
  const requiresAttention =
    status.state === 'recovery_required' ||
    status.primaryAction === 'review_required' ||
    status.primaryAction === 'waiting_for_desktop' ||
    status.primaryAction === 'waiting_for_model';
  return {
    meetingId: status.meetingId,
    state: status.state,
    primaryAction: status.primaryAction,
    version: status.version,
    isComplete,
    requiresAttention,
    label: STATE_LABELS[status.state],
  };
}
