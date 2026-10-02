import { describe, expect, it, vi } from 'vitest';
import { transcribeMeeting, TranscriptionWorkflowError } from './transcription-workflow.js';
import { LocalSpeechError } from './local-speech-client.js';

describe('transcriptionWorkflow', () => {
  const meetingId = '550e8400-e29b-41d4-a716-446655440000';

  it('initializes engine and transcribes meeting audio chunks successfully for Vietnamese (vi)', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi.fn().mockResolvedValue({ initialized: true, isSimulated: false }),
      transcribeWindow: vi.fn().mockResolvedValue({
        segments: [{ startMs: 0, endMs: 3000, text: 'Xin chào mọi người' }],
        isSimulated: false,
      }),
    };

    const result = await transcribeMeeting(deps, {
      meetingId,
      language: 'vi',
      sourcePath: 'chunks/chunk_000.webm',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });

    expect(deps.initEngine).toHaveBeenCalledWith(
      deps.native,
      expect.objectContaining({ language: 'vi', modelId: 'whisper-large-v3-turbo-q5_0' }),
    );
    expect(result).toEqual({
      meetingId,
      language: 'vi',
      segments: [{ startMs: 0, endMs: 3000, text: 'Xin chào mọi người' }],
      isSimulated: false,
    });
  });

  it('initializes engine and transcribes meeting audio chunks successfully for English (en)', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi.fn().mockResolvedValue({ initialized: true, isSimulated: false }),
      transcribeWindow: vi.fn().mockResolvedValue({
        segments: [{ startMs: 0, endMs: 2500, text: 'Hello everyone' }],
        isSimulated: false,
      }),
    };

    const result = await transcribeMeeting(deps, {
      meetingId,
      language: 'en',
    });

    expect(deps.initEngine).toHaveBeenCalledWith(
      deps.native,
      expect.objectContaining({ language: 'en', modelId: 'whisper-small-en-q5_1' }),
    );
    expect(result).toEqual({
      meetingId,
      language: 'en',
      segments: [{ startMs: 0, endMs: 2500, text: 'Hello everyone' }],
      isSimulated: false,
    });
  });

  it('translates NOT_AVAILABLE into TranscriptionWorkflowError(RUNTIME_PREREQUISITE_MISSING)', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi
        .fn()
        .mockRejectedValue(
          new LocalSpeechError(
            'NOT_AVAILABLE',
            'Local speech was not included in this native build',
          ),
        ),
      transcribeWindow: vi.fn(),
    };

    await expect(
      transcribeMeeting(deps, {
        meetingId,
        language: 'en',
        sourcePath: 'chunks/chunk_000.webm',
        sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TranscriptionWorkflowError);
      const e = err as TranscriptionWorkflowError;
      expect(e.code).toBe('RUNTIME_PREREQUISITE_MISSING');
      expect(e.message).toContain(
        'Local speech runtime is not available in the current native build',
      );
      return true;
    });
  });

  it('translates MISSING_MODEL into TranscriptionWorkflowError(MODEL_NOT_FOUND)', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi
        .fn()
        .mockRejectedValue(new LocalSpeechError('MISSING_MODEL', 'Model file not found')),
      transcribeWindow: vi.fn(),
    };

    await expect(
      transcribeMeeting(deps, {
        meetingId,
        language: 'en',
        sourcePath: 'chunks/chunk_000.webm',
        sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TranscriptionWorkflowError);
      const e = err as TranscriptionWorkflowError;
      expect(e.code).toBe('MODEL_NOT_FOUND');
      expect(e.message).toContain('Local Whisper model file was not found');
      return true;
    });
  });

  it('translates other engine init errors into TranscriptionWorkflowError(ENGINE_INIT_FAILED)', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi
        .fn()
        .mockRejectedValue(new LocalSpeechError('ENGINE_INIT_FAILED', 'Out of memory')),
      transcribeWindow: vi.fn(),
    };

    await expect(
      transcribeMeeting(deps, {
        meetingId,
        language: 'vi',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TranscriptionWorkflowError);
      const e = err as TranscriptionWorkflowError;
      expect(e.code).toBe('ENGINE_INIT_FAILED');
      expect(e.message).toContain('Out of memory');
      return true;
    });
  });

  it('translates transcription failure into TranscriptionWorkflowError(TRANSCRIBE_FAILED)', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi.fn().mockResolvedValue({ initialized: true, isSimulated: false }),
      transcribeWindow: vi
        .fn()
        .mockRejectedValue(
          new LocalSpeechError('TRANSCRIBE_FAILED', 'Failed to decode audio file'),
        ),
    };

    await expect(
      transcribeMeeting(deps, {
        meetingId,
        language: 'en',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TranscriptionWorkflowError);
      const e = err as TranscriptionWorkflowError;
      expect(e.code).toBe('TRANSCRIBE_FAILED');
      expect(e.message).toContain('Failed to decode audio file');
      return true;
    });
  });

  it('translates empty meetingId into TranscriptionWorkflowError(INVALID_INPUT)', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi.fn(),
      transcribeWindow: vi.fn(),
    };

    await expect(
      transcribeMeeting(deps, {
        meetingId: '',
        language: 'en',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TranscriptionWorkflowError);
      const e = err as TranscriptionWorkflowError;
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.message).toContain('Meeting ID is required');
      return true;
    });
  });
});
