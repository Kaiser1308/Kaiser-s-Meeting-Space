import { z } from 'zod';
import type { ClientAuth } from '../../../auth/auth-client';
import { AuthHttpClient, type AuthHttpConfig } from '../../sync/transport/auth-http';
import type { StartMeetingCommand } from './types';

const MeetingCreatedSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: z.enum(['vi', 'en']),
  mode: z.enum(['meeting_only', 'meeting_translate']),
  captureSources: z.array(z.enum(['mic', 'system'])),
  state: z.literal('draft'),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

const MeetingStartedSchema = z.object({
  meetingId: z.string().uuid(),
  state: z.literal('recording'),
  startedAt: z.string().datetime(),
  policyVersion: z.literal(1),
});

export type MeetingCreated = z.infer<typeof MeetingCreatedSchema>;
export type MeetingStarted = z.infer<typeof MeetingStartedSchema>;

export interface MeetingApiTransport {
  post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T>;
}

export interface MeetingApi {
  create(command: StartMeetingCommand): Promise<MeetingCreated>;
  start(meetingId: string, idempotencyKey: string): Promise<MeetingStarted>;
}

export class AuthenticatedMeetingApi implements MeetingApi {
  private readonly http: MeetingApiTransport;

  constructor(clientAuth: ClientAuth, config: AuthHttpConfig) {
    this.http = new AuthHttpClient(clientAuth, config);
  }

  async create(command: StartMeetingCommand): Promise<MeetingCreated> {
    const response = await this.http.post<unknown>(
      '/v1/meetings',
      {
        id: command.settings.id,
        title: command.settings.title,
        language: command.settings.language,
        mode: command.settings.mode,
        timezone: command.settings.timezone,
        captureSources: command.settings.captureSources,
        speechMode: command.settings.speechMode,
        policy: command.policy,
      },
      { 'Idempotency-Key': command.idempotencyKey },
    );
    return MeetingCreatedSchema.parse(response);
  }

  async start(meetingId: string, idempotencyKey: string): Promise<MeetingStarted> {
    const response = await this.http.post<unknown>(
      `/v1/meetings/${encodeURIComponent(meetingId)}/start`,
      {},
      { 'Idempotency-Key': `${idempotencyKey}:start` },
    );
    return MeetingStartedSchema.parse(response);
  }
}
