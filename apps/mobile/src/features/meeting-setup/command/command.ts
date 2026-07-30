import type { StartMeetingCommand } from './types';
import type { TranscriptionPolicyV1, MeetingSettings, MeetingLanguage } from '@kms/domain';
import {
  MeetingSettingsSchema,
  TranscriptionPolicyV1Schema,
  deriveTranslationTarget as deriveDomainTranslationTarget,
} from '@kms/domain';

export function deriveTranslationTarget(language: MeetingLanguage): MeetingLanguage {
  return deriveDomainTranslationTarget(language);
}

export function buildStartMeetingCommand(input: {
  settings: MeetingSettings;
  policy: TranscriptionPolicyV1;
  idempotencyKey: string;
}): StartMeetingCommand {
  // 1. Validations
  MeetingSettingsSchema.parse(input.settings);
  TranscriptionPolicyV1Schema.parse(input.policy);

  // 5. Must agree
  if (input.settings.language !== input.policy.language) {
    throw new Error('settings.language and policy.language must agree');
  }

  // 3 & 4
  const command: StartMeetingCommand = {
    settings: input.settings,
    policy: input.policy,
    idempotencyKey: input.idempotencyKey || 'invalid',
  };

  if (input.settings.mode === 'meeting_translate') {
    command.translationTarget = deriveTranslationTarget(input.settings.language);
  }

  if (command.idempotencyKey === 'invalid' || !command.idempotencyKey) {
    throw new Error('idempotencyKey is required');
  }

  return command;
}
