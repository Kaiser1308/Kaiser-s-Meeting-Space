import { z } from 'zod';
import type { SpeechMode, MeetingLanguage } from '../meeting/schemas.js';

export type TranscriptionPolicyV1 = {
  version: 1;
  language: 'vi' | 'en';
  live: 'off' | 'cloud';
  final: 'none' | 'local' | 'cloud' | 'local_cloud_check';
  cloudCheckScope: 'off' | 'uncertain_ranges' | 'full';
  cloudConsent: 'not_required' | 'required' | 'granted';
};

export const DEFAULT_TRANSCRIPTION_POLICY: TranscriptionPolicyV1 = {
  version: 1,
  language: 'vi',
  live: 'off',
  final: 'local',
  cloudCheckScope: 'off',
  cloudConsent: 'not_required',
};

export function policyFromLegacySpeechMode(
  speechMode: SpeechMode,
  language: MeetingLanguage,
): TranscriptionPolicyV1 {
  switch (speechMode) {
    case 'api': // legacy cloud path
      return {
        version: 1,
        language,
        live: 'off',
        final: 'cloud',
        cloudCheckScope: 'off',
        // legacy cannot grant consent -> require fresh explicit consent
        cloudConsent: 'required',
      };
    case 'local': // legacy local path
      return {
        version: 1,
        language,
        live: 'off',
        final: 'local',
        cloudCheckScope: 'off',
        cloudConsent: 'not_required',
      };
  }
}

export const TranscriptionPolicyV1Schema = z
  .object({
    version: z.literal(1),
    language: z.enum(['vi', 'en']),
    live: z.enum(['off', 'cloud']),
    final: z.enum(['none', 'local', 'cloud', 'local_cloud_check']),
    cloudCheckScope: z.enum(['off', 'uncertain_ranges', 'full']),
    cloudConsent: z.enum(['not_required', 'required', 'granted']),
  })
  .strict()
  // Rule 1: final !== 'local_cloud_check' requires cloudCheckScope === 'off'
  .refine(
    (p) =>
      p.final !== 'local_cloud_check' || p.cloudCheckScope !== 'off'
        ? true
        : p.final !== 'local_cloud_check',
    { message: 'cloudCheckScope must be "off" when final is not "local_cloud_check"' },
  )
  .refine(
    (p) =>
      p.final === 'local_cloud_check' ? p.cloudCheckScope !== 'off' : p.cloudCheckScope === 'off',
    {
      message:
        'final "local_cloud_check" requires cloudCheckScope "uncertain_ranges" or "full"; any other final requires cloudCheckScope "off"',
    },
  )
  // Rule 3: any cloud path requires cloudConsent to be at least 'required' (i.e. not 'not_required')
  .refine(
    (p) =>
      p.live === 'cloud' || p.final === 'cloud' || p.cloudCheckScope !== 'off'
        ? p.cloudConsent !== 'not_required'
        : true,
    {
      message:
        'any cloud path (live=cloud, final=cloud, or cloudCheckScope!=off) requires cloudConsent "required" or "granted"',
    },
  );
