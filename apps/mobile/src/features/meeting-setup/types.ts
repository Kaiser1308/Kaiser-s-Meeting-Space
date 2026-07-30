import type { TranscriptionPolicyV1, MeetingLanguage, MeetingMode } from '@kms/domain';
import type { ReadinessResult } from './readiness/types';
import type { CloudConsentRecord } from './consent/types';

export type StartFlowStep =
  'title' | 'language' | 'mode' | 'source' | 'processing' | 'readiness' | 'consent' | 'start';

export interface StartFlowSuggestions {
  title?: string;
  mode?: MeetingMode;
  source?: Array<'mic' | 'system'>;
}

export interface StartFlowDraft {
  title: string;
  language: MeetingLanguage | null;
  mode: MeetingMode | null;
  captureSources: Array<'mic' | 'system'>;
  policy: TranscriptionPolicyV1;
}

export interface StartFlowState {
  currentStep: StartFlowStep;
  draft: StartFlowDraft;
  suggestions: StartFlowSuggestions;
  readiness: ReadinessResult | null;
  consent: CloudConsentRecord[];
  languageConfirmedThisMeeting: boolean;
}

export type StartFlowAction =
  | { type: 'forward' }
  | { type: 'back' }
  | { type: 'edit'; step: StartFlowStep }
  | { type: 'setField'; field: 'title' | 'language' | 'mode'; value: string }
  | { type: 'setSources'; sources: Array<'mic' | 'system'> }
  | { type: 'setPolicy'; policy: Partial<TranscriptionPolicyV1> }
  | { type: 'setReadiness'; readiness: ReadinessResult }
  | { type: 'grantConsent'; record: CloudConsentRecord }
  | { type: 'reset' }
  | { type: 'restore'; persisted: unknown };
