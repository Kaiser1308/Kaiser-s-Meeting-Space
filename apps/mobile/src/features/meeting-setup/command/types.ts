import type { MeetingSettings, TranscriptionPolicyV1, MeetingLanguage } from '@kms/domain';

export interface StartMeetingCommand {
  settings: MeetingSettings;
  policy: TranscriptionPolicyV1;
  idempotencyKey: string;
  translationTarget?: MeetingLanguage;
}
