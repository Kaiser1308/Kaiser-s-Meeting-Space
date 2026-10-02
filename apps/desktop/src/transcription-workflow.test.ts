import { describe, expect, it, vi } from 'vitest';
import { transcribeMeeting, TranscriptionWorkflowError } from './transcription-workflow.js';
import { LocalSpeechError } from './local-speech-client.js';

describe('transcriptionWorkflow', () => {
  const meetingId = '550e8400-e29b-41d4-a716-446655440000';
  const microphoneEntry = (chunkIndex: number) => ({
    source: 'microphone',
    chunkIndex,
    filePath: `chunks/${meetingId}_microphone_${String(chunkIndex).padStart(3, '0')}.webm`,
    sha256: `${chunkIndex + 1}`.repeat(64),
    byteLength: 256 + chunkIndex,
  });
  const systemAudioEntry = (chunkIndex: number) => ({
    source: 'system_audio',
    chunkIndex,
    filePath: `chunks/${meetingId}_system_audio_${String(chunkIndex).padStart(3, '0')}.webm`,
    sha256: `${chunkIndex + 7}`.repeat(64),
    byteLength: 512 + chunkIndex,
  });

  function makeDeps(entries = [microphoneEntry(0)]) {
    return {
      native: {
        send: vi.fn().mockResolvedValue({ success: true, payload: { entries } }),
      },
      resolveModel: vi.fn().mockResolvedValue('whisper-large-v3-turbo-q5_0'),
      initEngine: vi.fn().mockResolvedValue({ initialized: true, isSimulated: false }),
      transcribeWindow: vi.fn().mockResolvedValue({
        segments: [{ startMs: 0, endMs: 1_000, text: 'Hello everyone' }],
        durationMs: 5_000,
        chunksTranscribed: 1,
        isSimulated: false,
      }),
    };
  }

  it('initializes Vietnamese local speech and reads real microphone entries from the manifest', async () => {
    const deps = makeDeps();
    const result = await transcribeMeeting(deps, { meetingId, language: 'vi' });

    expect(deps.resolveModel).toHaveBeenCalledWith('vi');
    expect(deps.initEngine).toHaveBeenCalledWith(deps.native, {
      language: 'vi',
      modelId: 'whisper-large-v3-turbo-q5_0',
    });
    expect(deps.native.send).toHaveBeenCalledWith('manifest_list_entries', { meetingId });
    expect(deps.transcribeWindow).toHaveBeenCalledWith(deps.native, {
      runId: meetingId,
      partIndex: 0,
      startMs: 0,
      sourcePath: microphoneEntry(0).filePath,
      sourceSha256: microphoneEntry(0).sha256,
    });
    expect(result).toEqual({
      meetingId,
      language: 'vi',
      source: 'microphone',
      segments: [{ startMs: 0, endMs: 1_000, text: 'Hello everyone' }],
      durationMs: 5_000,
      chunksTranscribed: 1,
      isSimulated: false,
    });
  });

  it('orders microphone chunks, ignores system audio, and offsets each transcript by decoded duration', async () => {
    const systemEntry = {
      source: 'system_audio',
      chunkIndex: 0,
      filePath: `chunks/${meetingId}_system_audio_000.webm`,
      sha256: 'f'.repeat(64),
      byteLength: 400,
    };
    const entries = [microphoneEntry(1), systemEntry, microphoneEntry(0)];
    const deps = makeDeps(entries);
    deps.transcribeWindow
      .mockResolvedValueOnce({
        segments: [{ startMs: 100, endMs: 400, text: 'first chunk' }],
        durationMs: 900,
        isSimulated: false,
      })
      .mockResolvedValueOnce({
        segments: [{ startMs: 50, endMs: 250, text: 'second chunk' }],
        durationMs: 700,
        isSimulated: false,
      });

    const result = await transcribeMeeting(deps, { meetingId, language: 'en' });

    expect(deps.transcribeWindow).toHaveBeenNthCalledWith(1, deps.native, {
      runId: meetingId,
      partIndex: 0,
      startMs: 0,
      sourcePath: microphoneEntry(0).filePath,
      sourceSha256: microphoneEntry(0).sha256,
    });
    expect(deps.transcribeWindow).toHaveBeenNthCalledWith(2, deps.native, {
      runId: meetingId,
      partIndex: 1,
      startMs: 0,
      sourcePath: microphoneEntry(1).filePath,
      sourceSha256: microphoneEntry(1).sha256,
    });
    expect(result.segments).toEqual([
      { startMs: 100, endMs: 400, text: 'first chunk' },
      { startMs: 950, endMs: 1_150, text: 'second chunk' },
    ]);
    expect(result.durationMs).toBe(1_600);
    expect(result.chunksTranscribed).toBe(2);
  });

  it('transcribes only the selected system-audio chunks for an online meeting', async () => {
    const deps = makeDeps([microphoneEntry(0), systemAudioEntry(1), systemAudioEntry(0)]);
    deps.transcribeWindow
      .mockResolvedValueOnce({
        segments: [{ startMs: 0, endMs: 500, text: 'remote participant one' }],
        durationMs: 1_000,
        isSimulated: false,
      })
      .mockResolvedValueOnce({
        segments: [{ startMs: 0, endMs: 400, text: 'remote participant two' }],
        durationMs: 900,
        isSimulated: false,
      });

    const result = await transcribeMeeting(deps, {
      meetingId,
      language: 'en',
      source: 'system_audio',
    });

    expect(result).toMatchObject({ source: 'system_audio', chunksTranscribed: 2 });
    expect(deps.transcribeWindow).toHaveBeenNthCalledWith(1, deps.native, {
      runId: meetingId,
      partIndex: 0,
      startMs: 0,
      sourcePath: systemAudioEntry(0).filePath,
      sourceSha256: systemAudioEntry(0).sha256,
    });
    expect(deps.transcribeWindow).toHaveBeenNthCalledWith(2, deps.native, {
      runId: meetingId,
      partIndex: 1,
      startMs: 0,
      sourcePath: systemAudioEntry(1).filePath,
      sourceSha256: systemAudioEntry(1).sha256,
    });
  });

  it('fails closed when the selected system-audio source has no chunks', async () => {
    const deps = makeDeps([microphoneEntry(0)]);

    await expect(transcribeMeeting(deps, {
      meetingId,
      language: 'en',
      source: 'system_audio',
    })).rejects.toMatchObject({ code: 'TRANSCRIBE_FAILED' });
    expect(deps.transcribeWindow).not.toHaveBeenCalled();
  });

  it('does not start inference when microphone chunks are missing or have a gap', async () => {
    const deps = makeDeps([microphoneEntry(1)]);

    await expect(transcribeMeeting(deps, { meetingId, language: 'en' })).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
      message: expect.stringContaining('manifest'),
    });
    expect(deps.transcribeWindow).not.toHaveBeenCalled();
  });

  it('rejects a manifest path or checksum that does not match its finalized entry', async () => {
    const invalidEntry = { ...microphoneEntry(0), filePath: '../outside.webm' };
    const deps = makeDeps([invalidEntry]);

    await expect(transcribeMeeting(deps, { meetingId, language: 'en' })).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
    });
    expect(deps.transcribeWindow).not.toHaveBeenCalled();
  });

  it('rejects simulated inference and invalid duration instead of saving false evidence', async () => {
    const simulated = makeDeps();
    simulated.transcribeWindow.mockResolvedValueOnce({
      segments: [],
      durationMs: 5_000,
      isSimulated: true,
    });
    await expect(transcribeMeeting(simulated, { meetingId, language: 'en' })).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
    });

    const invalidDuration = makeDeps();
    invalidDuration.transcribeWindow.mockResolvedValueOnce({
      segments: [],
      durationMs: 0,
      isSimulated: false,
    });
    await expect(
      transcribeMeeting(invalidDuration, { meetingId, language: 'en' }),
    ).rejects.toMatchObject({ code: 'TRANSCRIBE_FAILED' });
  });

  it('rejects transcript timestamps that exceed the decoded source chunk duration', async () => {
    const deps = makeDeps();
    deps.transcribeWindow.mockResolvedValueOnce({
      segments: [{ startMs: 4_500, endMs: 5_100, text: 'past the end' }],
      durationMs: 5_000,
      isSimulated: false,
    });

    await expect(transcribeMeeting(deps, { meetingId, language: 'en' })).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
      message: expect.stringContaining('invalid transcript segment'),
    });
  });

  it('rejects zero-length transcript segments', async () => {
    const deps = makeDeps();
    deps.transcribeWindow.mockResolvedValueOnce({
      segments: [{ startMs: 1_000, endMs: 1_000, text: 'zero-length segment' }],
      durationMs: 5_000,
      isSimulated: false,
    });

    await expect(transcribeMeeting(deps, { meetingId, language: 'en' })).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
      message: expect.stringContaining('invalid transcript segment'),
    });
  });

  it('translates NOT_AVAILABLE and MISSING_MODEL during engine initialization', async () => {
    for (const [localError, workflowCode] of [
      [new LocalSpeechError('NOT_AVAILABLE', 'Local speech is unavailable'), 'RUNTIME_PREREQUISITE_MISSING'],
      [new LocalSpeechError('MISSING_MODEL', 'Model file not found'), 'MODEL_NOT_FOUND'],
    ] as const) {
      const deps = makeDeps();
      deps.initEngine.mockRejectedValueOnce(localError);
      await expect(transcribeMeeting(deps, { meetingId, language: 'en' })).rejects.toMatchObject({
        code: workflowCode,
      });
      expect(deps.native.send).not.toHaveBeenCalled();
    }
  });

  it('maps transcription failures and rejects a missing meeting ID', async () => {
    const failing = makeDeps();
    failing.transcribeWindow.mockRejectedValueOnce(
      new LocalSpeechError('TRANSCRIBE_FAILED', 'Failed to decode audio'),
    );
    await expect(transcribeMeeting(failing, { meetingId, language: 'en' })).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
      message: expect.stringContaining('Failed to decode audio'),
    });

    const invalid = makeDeps();
    await expect(transcribeMeeting(invalid, { meetingId: '', language: 'en' })).rejects.toBeInstanceOf(
      TranscriptionWorkflowError,
    );
  });
});
