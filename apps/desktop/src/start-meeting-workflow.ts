import { MeetingApiError, type CreateLocalMeetingInput } from './meeting-api.js';

export class StartMeetingError extends Error {
  constructor(readonly code: 'START_FAILED') {
    super(code);
    this.name = 'StartMeetingError';
  }
}

export type PhysicalMeetingInput = CreateLocalMeetingInput & {
  micDeviceId: string;
  systemDeviceId: string;
};

export type StartMeetingDependencies = {
  api: {
    createLocalMeeting(input: CreateLocalMeetingInput): Promise<{ id: string }>;
    startLocalMeeting(meetingId: string): Promise<{ meetingId: string }>;
  };
  native: {
    send(
      command: 'storage_init' | 'capture_start',
      payload?: Record<string, unknown>,
    ): Promise<{ success: boolean }>;
  };
};

/** Runs the physical start boundary; callers may show recording only after this resolves. */
export async function startPhysicalMeeting(
  deps: StartMeetingDependencies,
  input: PhysicalMeetingInput,
): Promise<{ meetingId: string }> {
  let created: { id: string };
  let started: { meetingId: string };
  try {
    created = await deps.api.createLocalMeeting({
      title: input.title,
      language: input.language,
      timezone: input.timezone,
    });
    started = await deps.api.startLocalMeeting(created.id);
  } catch (error) {
    if (error instanceof MeetingApiError) throw error;
    throw new StartMeetingError('START_FAILED');
  }

  try {
    if (started.meetingId !== created.id) throw new Error('meeting identity mismatch');

    const storage = await deps.native.send('storage_init');
    if (!storage.success) throw new Error('storage initialization failed');

    const capture = await deps.native.send('capture_start', {
      meetingId: created.id,
      micDeviceId: input.micDeviceId,
      systemDeviceId: input.systemDeviceId,
    });
    if (!capture.success) throw new Error('capture start failed');

    return { meetingId: created.id };
  } catch {
    throw new StartMeetingError('START_FAILED');
  }
}
