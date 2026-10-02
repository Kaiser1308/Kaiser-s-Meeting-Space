import { describe, expect, it, vi } from 'vitest';
import {
  initLocalSpeechEngine,
  transcribeWindow,
  cancelLocalSpeech,
  LocalSpeechError,
  LOCAL_SPEECH_MODELS,
} from './local-speech-client.js';

describe('local speech client', () => {
  it('exposes known local model definitions for vi and en', () => {
    expect(LOCAL_SPEECH_MODELS.vi).toMatchObject({
      modelId: 'whisper-large-v3-turbo-q5_0',
      language: 'vi',
      path: 'models/ggml-large-v3-turbo-q5_0.bin',
      sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    });
    expect(LOCAL_SPEECH_MODELS.en).toMatchObject({
      modelId: 'whisper-large-v3-turbo-q5_0',
      language: 'en',
      path: 'models/ggml-large-v3-turbo-q5_0.bin',
      sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    });
  });

  it('sends local_speech_engine_init with valid model metadata and returns success', async () => {
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      payload: { initialized: true, isSimulated: false },
    });
    const native = { send: sendMock };

    const result = await initLocalSpeechEngine(native, {
      modelId: 'whisper-small-en-q5_1',
      language: 'en',
      modelPath: 'models/ggml-small.en-q5_1.bin',
      modelSha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
      memoryBudgetMb: 2048,
    });

    expect(sendMock).toHaveBeenCalledWith(
      'local_speech_engine_init',
      expect.objectContaining({
        modelId: 'whisper-small-en-q5_1',
        language: 'en',
        modelPath: 'models/ggml-small.en-q5_1.bin',
        modelSha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
        memoryBudgetMb: 2048,
      }),
    );
    expect(result).toEqual({ initialized: true, isSimulated: false });
  });

  it('maps NOT_AVAILABLE native error to LocalSpeechError(NOT_AVAILABLE)', async () => {
    const native = {
      send: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: 'NOT_AVAILABLE',
          message: 'Local speech was not included in this native build',
        },
      }),
    };

    await expect(
      initLocalSpeechEngine(native, {
        modelId: 'whisper-small-en-q5_1',
        language: 'en',
        modelPath: 'models/ggml-small.en-q5_1.bin',
        modelSha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
      }),
    ).rejects.toEqual(
      new LocalSpeechError('NOT_AVAILABLE', 'Local speech was not included in this native build'),
    );
  });

  it('maps INVALID_MODEL / MISSING_FIELDS native error codes to LocalSpeechError(MISSING_MODEL)', async () => {
    const nativeInvalidModel = {
      send: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'INVALID_MODEL', message: 'Model file missing or invalid checksum' },
      }),
    };

    await expect(
      initLocalSpeechEngine(nativeInvalidModel, {
        modelId: 'whisper-small-en-q5_1',
        language: 'en',
        modelPath: 'models/ggml-small.en-q5_1.bin',
        modelSha256: 'invalid-sha',
      }),
    ).rejects.toEqual(
      new LocalSpeechError('MISSING_MODEL', 'Model file missing or invalid checksum'),
    );

    const nativeMissingFields = {
      send: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Required fields missing from payload' },
      }),
    };

    await expect(
      initLocalSpeechEngine(nativeMissingFields, {
        modelId: 'whisper-small-en-q5_1',
        language: 'en',
        modelPath: 'models/ggml-small.en-q5_1.bin',
        modelSha256: 'any',
      }),
    ).rejects.toEqual(
      new LocalSpeechError('MISSING_MODEL', 'Required fields missing from payload'),
    );
  });

  it('maps other native error to LocalSpeechError(ENGINE_INIT_FAILED)', async () => {
    const native = {
      send: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: 'Failed to allocate memory' },
      }),
    };

    await expect(
      initLocalSpeechEngine(native, {
        modelId: 'whisper-small-en-q5_1',
        language: 'en',
        modelPath: 'models/ggml-small.en-q5_1.bin',
        modelSha256: 'any',
      }),
    ).rejects.toEqual(new LocalSpeechError('ENGINE_INIT_FAILED', 'Failed to allocate memory'));
  });

  it('throws LocalSpeechError(INVALID_RESPONSE) if native.send throws during init', async () => {
    const native = {
      send: vi.fn().mockRejectedValue(new Error('IPC disconnected')),
    };

    await expect(
      initLocalSpeechEngine(native, {
        modelId: 'whisper-small-en-q5_1',
        language: 'en',
        modelPath: 'models/ggml-small.en-q5_1.bin',
        modelSha256: 'any',
      }),
    ).rejects.toEqual(new LocalSpeechError('INVALID_RESPONSE', 'Error: IPC disconnected'));
  });

  it('transcribes an audio window via local_speech_transcribe_window and parses TranscriptSegment array', async () => {
    const rawSegments = [
      { startMs: 0, endMs: 2500, text: 'Hello team, let us begin.' },
      { startMs: 2600, endMs: 4800, text: 'Today we discuss M4.', speaker: 'Speaker 1' },
    ];
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      payload: { segments: rawSegments, durationMs: 5_000, isSimulated: false },
    });
    const native = { send: sendMock };

    const result = await transcribeWindow(native, {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      partIndex: 0,
      startMs: 0,
      endMs: 5000,
      sourcePath: 'chunks/chunk_000.webm',
      sourceSha256: '0000000000000000000000000000000000000000000000000000000000000000',
    });

    expect(sendMock).toHaveBeenCalledWith('local_speech_transcribe_window', {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      partIndex: 0,
      startMs: 0,
      endMs: 5000,
      sourcePath: 'chunks/chunk_000.webm',
      sourceSha256: '0000000000000000000000000000000000000000000000000000000000000000',
    }, { timeoutMs: 300_000 });
    expect(result.isSimulated).toBe(false);
    expect(result.durationMs).toBe(5_000);
    expect(result.segments).toEqual([
      { startMs: 0, endMs: 2500, text: 'Hello team, let us begin.', speaker: undefined },
      { startMs: 2600, endMs: 4800, text: 'Today we discuss M4.', speaker: 'Speaker 1' },
    ]);
  });

  it('rejects a transcription response without a verified source duration', async () => {
    const native = {
      send: vi.fn().mockResolvedValue({
        success: true,
        payload: { segments: [], isSimulated: false },
      }),
    };

    await expect(
      transcribeWindow(native, {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        partIndex: 0,
        startMs: 0,
        sourcePath: 'chunks/550e8400-e29b-41d4-a716-446655440000_microphone_000.webm',
        sourceSha256: 'a'.repeat(64),
      }),
    ).rejects.toEqual(
      new LocalSpeechError('INVALID_RESPONSE', 'Transcription response duration is invalid'),
    );
  });

  it('maps transcription failure to LocalSpeechError(TRANSCRIBE_FAILED)', async () => {
    const native = {
      send: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Decoding chunk failed' },
      }),
    };

    await expect(
      transcribeWindow(native, {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        partIndex: 0,
        startMs: 0,
        endMs: 5000,
        sourcePath: 'chunks/chunk_000.webm',
        sourceSha256: '0000000000000000000000000000000000000000000000000000000000000000',
      }),
    ).rejects.toEqual(new LocalSpeechError('TRANSCRIBE_FAILED', 'Decoding chunk failed'));
  });

  it('throws LocalSpeechError(INVALID_RESPONSE) if native.send throws during transcribeWindow', async () => {
    const native = {
      send: vi.fn().mockRejectedValue(new Error('Process terminated')),
    };

    await expect(
      transcribeWindow(native, {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        partIndex: 0,
        startMs: 0,
        endMs: 5000,
        sourcePath: 'chunks/chunk_000.webm',
        sourceSha256: '0000000000000000000000000000000000000000000000000000000000000000',
      }),
    ).rejects.toEqual(new LocalSpeechError('INVALID_RESPONSE', 'Error: Process terminated'));
  });

  it('sends local_speech_cancel via cancelLocalSpeech', async () => {
    const sendMock = vi.fn().mockResolvedValue({ success: true, payload: { cancelled: true } });
    const native = { send: sendMock };

    await cancelLocalSpeech(native);

    expect(sendMock).toHaveBeenCalledWith('local_speech_cancel');
  });
});
