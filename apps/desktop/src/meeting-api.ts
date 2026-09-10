import { MeetingIdSchema, TranscriptionPolicyV1Schema } from '@kms/domain';

export type MeetingApiErrorCode = 'API_UNAVAILABLE' | 'INVALID_RESPONSE';

export class MeetingApiError extends Error {
  constructor(readonly code: MeetingApiErrorCode) {
    super(code);
    this.name = 'MeetingApiError';
  }
}

export const LOCAL_POLICY = {
  version: 1,
  language: 'en',
  live: 'off',
  final: 'local',
  cloudCheckScope: 'off',
  cloudConsent: 'not_required',
} as const;

export type CreatedMeeting = {
  id: string;
  title: string;
  language: 'vi' | 'en';
  mode: 'meeting_only';
  captureSources: Array<'mic' | 'system'>;
  state: 'draft';
  version: number;
  createdAt: string;
};
export type StartedMeeting = {
  meetingId: string;
  state: 'recording';
  startedAt: string;
  policyVersion: 1;
};
export type CreateLocalMeetingInput = {
  title: string;
  language: 'vi' | 'en';
  timezone: string;
};

type FetchLike = typeof globalThis.fetch;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RFC3339_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z$/;

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = RFC3339_DATETIME_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  // Unlike Date.UTC, setUTCFullYear preserves years 0000–0099.
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseCreatedMeeting(value: unknown): CreatedMeeting | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  const sources = body.captureSources;
  if (
    !MeetingIdSchema.safeParse(body.id).success ||
    typeof body.title !== 'string' ||
    (body.language !== 'vi' && body.language !== 'en') ||
    body.mode !== 'meeting_only' ||
    !Array.isArray(sources) ||
    sources.some((source) => source !== 'mic' && source !== 'system') ||
    body.state !== 'draft' ||
    typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version <= 0 ||
    !isDateTime(body.createdAt)
  ) return undefined;
  return {
    id: body.id as string,
    title: body.title,
    language: body.language,
    mode: 'meeting_only',
    captureSources: sources as Array<'mic' | 'system'>,
    state: 'draft',
    version: body.version,
    createdAt: body.createdAt,
  };
}

function parseStartedMeeting(value: unknown): StartedMeeting | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  if (!MeetingIdSchema.safeParse(body.meetingId).success || body.state !== 'recording' || !isDateTime(body.startedAt) || body.policyVersion !== 1) {
    return undefined;
  }
  return { meetingId: body.meetingId as string, state: 'recording', startedAt: body.startedAt, policyVersion: 1 };
}

export function createMeetingApi(options: {
  fetch?: FetchLike;
  baseUrl?: string;
  newId?: () => string;
} = {}) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? 'http://127.0.0.1:4310';
  const newId = options.newId ?? (() => crypto.randomUUID());

  function newIdempotencyKey(): string {
    let key: string;
    try {
      key = newId();
    } catch {
      throw new MeetingApiError('INVALID_RESPONSE');
    }
    if (typeof key !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new MeetingApiError('INVALID_RESPONSE');
    }
    return key;
  }

  async function request<T>(
    path: string,
    init: RequestInit,
    parse: (body: unknown) => T | undefined,
    expectedStatus: number,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, init);
    } catch {
      try {
        response = await fetcher(`${baseUrl}${path}`, init);
      } catch {
        throw new MeetingApiError('API_UNAVAILABLE');
      }
    }

    if (!response.ok) {
      throw new MeetingApiError('API_UNAVAILABLE');
    }
    if (response.status !== expectedStatus) {
      throw new MeetingApiError('INVALID_RESPONSE');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MeetingApiError('INVALID_RESPONSE');
    }
    const parsed = parse(body);
    if (parsed === undefined) {
      throw new MeetingApiError('INVALID_RESPONSE');
    }
    return parsed;
  }

  return {
    async createLocalMeeting(input: CreateLocalMeetingInput): Promise<CreatedMeeting> {
      const policy = TranscriptionPolicyV1Schema.parse({ ...LOCAL_POLICY, language: input.language });
      const idempotencyKey = newIdempotencyKey();
      return request(
        '/v1/meetings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            title: input.title,
            language: input.language,
            mode: 'meeting_only',
            timezone: input.timezone,
            captureSources: ['mic', 'system'],
            speechMode: 'local',
            policy,
          }),
        },
        parseCreatedMeeting,
        201,
      );
    },

    startLocalMeeting(meetingId: string): Promise<StartedMeeting> {
      const parsedId = MeetingIdSchema.safeParse(meetingId);
      if (!parsedId.success) {
        return Promise.reject(new MeetingApiError('INVALID_RESPONSE'));
      }
      let idempotencyKey: string;
      try {
        idempotencyKey = newIdempotencyKey();
      } catch (error) {
        return Promise.reject(error);
      }
      return request(
        `/v1/meetings/${encodeURIComponent(parsedId.data)}/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        },
        parseStartedMeeting,
        200,
      );
    },
  };
}
