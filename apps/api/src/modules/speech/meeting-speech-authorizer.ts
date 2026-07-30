import { and, eq } from 'drizzle-orm';
import type { Db } from '@kms/database';
import { schema } from '@kms/database';
import { policyFromLegacySpeechMode, TranscriptionPolicyV1Schema } from '@kms/domain';
import type { SpeechSessionAuthorization, SpeechSessionAuthorizer } from './routes.js';

const { meetingCaptureSources, meetings } = schema;

export interface SpeechAuthorizationInput {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly language: 'vi' | 'en';
  readonly sourceId: string;
}

/**
 * Converts the persisted meeting fields into the narrow authorization result
 * consumed by the broker. Legacy `speechMode=api` is deliberately not treated
 * as live consent: it requires a fresh explicit grant that this migration-safe
 * adapter cannot invent.
 */
export function buildSpeechSessionAuthorization(input: {
  readonly language: 'vi' | 'en';
  readonly speechMode: 'api' | 'local';
  readonly sourceIds: readonly string[];
  readonly policy?: import('@kms/domain').TranscriptionPolicyV1;
}): SpeechSessionAuthorization {
  const policy = input.policy ?? policyFromLegacySpeechMode(input.speechMode, input.language);
  if (policy.language !== input.language) {
    return {
      language: input.language,
      sourceIds: input.sourceIds,
      liveCloudConsented: false,
    };
  }
  return {
    language: input.language,
    sourceIds: input.sourceIds,
    liveCloudConsented: policy.live === 'cloud' && policy.cloudConsent === 'granted',
  };
}

export class MeetingSpeechAuthorizer implements SpeechSessionAuthorizer {
  constructor(private readonly db: Db) {}

  async authorize(input: SpeechAuthorizationInput): Promise<SpeechSessionAuthorization | null> {
    const [meeting] = await this.db
      .select({
        language: meetings.language,
        speechMode: meetings.speechMode,
        transcriptionPolicy: meetings.transcriptionPolicy,
      })
      .from(meetings)
      .where(and(eq(meetings.id, input.meetingId), eq(meetings.ownerId, input.ownerId)))
      .limit(1);

    if (!meeting || meeting.language !== input.language) return null;

    const sources = await this.db
      .select({ source: meetingCaptureSources.source })
      .from(meetingCaptureSources)
      .where(eq(meetingCaptureSources.meetingId, input.meetingId));

    const persistedPolicy = TranscriptionPolicyV1Schema.safeParse(meeting.transcriptionPolicy);
    if (meeting.transcriptionPolicy != null && !persistedPolicy.success) return null;
    return buildSpeechSessionAuthorization({
      language: meeting.language,
      speechMode: meeting.speechMode,
      sourceIds: sources.map(({ source }) => source),
      policy: persistedPolicy.success ? persistedPolicy.data : undefined,
    });
  }
}
