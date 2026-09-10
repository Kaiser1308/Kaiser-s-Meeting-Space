export type EndMeetingErrorCode = 'CAPTURE_STOP_FAILED' | 'API_END_FAILED';

export class EndMeetingError extends Error {
  readonly code: EndMeetingErrorCode;

  constructor(code: EndMeetingErrorCode) {
    super(code);
    this.code = code;
    this.name = 'EndMeetingError';
  }
}

export type EndPhysicalMeetingInput = {
  meetingId: string;
};

export type EndMeetingDependencies = {
  api: {
    endLocalMeeting(
      meetingId: string,
    ): Promise<{ meetingId: string; state: string; finalizedAt: string }>;
  };
  native: {
    send(
      command: 'capture_stop' | 'manifest_list_entries',
      payload?: Record<string, unknown>,
    ): Promise<{
      success: boolean;
      payload?: unknown;
      error?: { code?: string; message?: string };
    }>;
  };
};

export type EndPhysicalMeetingResult = {
  meetingId: string;
  totalMicChunks: number;
  totalSysChunks: number;
  commitStatus: 'clean' | 'recovery_required';
  finalizedAt: string;
};

export async function endPhysicalMeeting(
  deps: EndMeetingDependencies,
  input: EndPhysicalMeetingInput,
): Promise<EndPhysicalMeetingResult> {
  let stopResp: {
    success: boolean;
    payload?: unknown;
    error?: { code?: string; message?: string };
  };

  try {
    stopResp = await deps.native.send('capture_stop');
  } catch {
    throw new EndMeetingError('CAPTURE_STOP_FAILED');
  }

  if (!stopResp || !stopResp.success) {
    throw new EndMeetingError('CAPTURE_STOP_FAILED');
  }

  const payload =
    stopResp.payload && typeof stopResp.payload === 'object'
      ? (stopResp.payload as Record<string, unknown>)
      : {};

  const totalMicChunks = typeof payload.totalMicChunks === 'number' ? payload.totalMicChunks : 0;
  const totalSysChunks = typeof payload.totalSysChunks === 'number' ? payload.totalSysChunks : 0;
  const commitStatus: 'clean' | 'recovery_required' =
    payload.commitStatus === 'recovery_required' ? 'recovery_required' : 'clean';

  let endedApiResult: { meetingId: string; state: string; finalizedAt: string };
  try {
    endedApiResult = await deps.api.endLocalMeeting(input.meetingId);
  } catch {
    throw new EndMeetingError('API_END_FAILED');
  }

  return {
    meetingId: input.meetingId,
    totalMicChunks,
    totalSysChunks,
    commitStatus,
    finalizedAt: endedApiResult.finalizedAt,
  };
}
