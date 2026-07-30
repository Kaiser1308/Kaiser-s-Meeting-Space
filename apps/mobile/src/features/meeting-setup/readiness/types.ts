export type BlockingIssueCategory =
  'microphone_permission' | 'audio_source_invalid' | 'storage_insufficient';

export type DelayedWarningCategory =
  | 'api_network_unreachable'
  | 'cloud_provider_unavailable'
  | 'desktop_absent' // waiting_for_desktop
  | 'local_model_unavailable' // waiting_for_model
  | 'translation_unavailable';

export interface BlockingIssue {
  category: BlockingIssueCategory;
  detail?: string;
  remediationKey: string;
}

export interface DelayedWarning {
  category: DelayedWarningCategory;
  waitingStateLabel:
    'waiting_for_desktop' | 'waiting_for_model' | 'provider_unavailable' | 'offline';
  detail?: string;
}

export interface ReadinessResult {
  blocking: BlockingIssue[];
  delayed: DelayedWarning[];
  checkedAt: number;
  sequence: number;
}

export interface ReadinessInput {
  policy: import('@kms/domain').TranscriptionPolicyV1;
  mode: import('@kms/domain').MeetingMode | null;
  captureSources: Array<'mic' | 'system'>;
}

export interface ReadinessPort {
  check(input: ReadinessInput): Promise<ReadinessResult>;
  cancel(): Promise<void>;
}
