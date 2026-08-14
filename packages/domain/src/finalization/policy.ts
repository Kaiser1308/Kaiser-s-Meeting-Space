import type { MeetingState } from '../state/machine.js';
import type { TranscriptionPolicyV1 } from '../transcription/policy.js';

export type PrimaryFinalActionKind =
  | 'none'
  | 'local'
  | 'cloud'
  | 'waiting_for_desktop'
  | 'waiting_for_model'
  | 'review_required';

export type PrimaryFinalAction = Readonly<{ kind: PrimaryFinalActionKind }>;

export type PrimaryFinalActionInput = Readonly<{
  meetingState: MeetingState;
  policy: TranscriptionPolicyV1;
  desktopAvailable: boolean;
  localModelAvailable: boolean;
  cloudProviderAvailable: boolean;
}>;

export function decidePrimaryFinalAction(input: PrimaryFinalActionInput): PrimaryFinalAction {
  if (input.meetingState !== 'finalizing') {
    throw new Error('Primary final action requires meeting state finalizing');
  }

  if (input.policy.final === 'none') return { kind: 'none' };

  if (input.policy.final === 'cloud') {
    if (input.policy.cloudConsent !== 'granted') return { kind: 'review_required' };
    return input.cloudProviderAvailable ? { kind: 'cloud' } : { kind: 'waiting_for_model' };
  }

  if (!input.desktopAvailable) return { kind: 'waiting_for_desktop' };
  if (!input.localModelAvailable) return { kind: 'waiting_for_model' };
  return { kind: 'local' };
}
