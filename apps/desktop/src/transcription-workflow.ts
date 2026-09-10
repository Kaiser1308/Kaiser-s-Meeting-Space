import {
  initLocalSpeechEngine,
  transcribeWindow,
  LOCAL_SPEECH_MODELS,
  LocalSpeechError,
  type TranscriptSegment,
  type NativeSender,
} from './local-speech-client.js';

export type TranscriptionWorkflowErrorCode =
  | 'RUNTIME_PREREQUISITE_MISSING'
  | 'MODEL_NOT_FOUND'
  | 'ENGINE_INIT_FAILED'
  | 'TRANSCRIBE_FAILED'
  | 'INVALID_INPUT';

export class TranscriptionWorkflowError extends Error {
  constructor(
    readonly code: TranscriptionWorkflowErrorCode,
    override readonly message: string,
  ) {
    super(message);
    this.name = 'TranscriptionWorkflowError';
  }
}

export interface TranscriptionMeetingInput {
  meetingId: string;
  language: 'vi' | 'en';
  sourcePath?: string;
  sourceSha256?: string;
  durationMs?: number;
}

export interface TranscriptionWorkflowDependencies {
  native: NativeSender;
  initEngine?: typeof initLocalSpeechEngine;
  transcribeWindow?: typeof transcribeWindow;
}

export interface TranscriptionWorkflowResult {
  meetingId: string;
  language: 'vi' | 'en';
  segments: TranscriptSegment[];
  isSimulated: boolean;
}

export async function transcribeMeeting(
  deps: TranscriptionWorkflowDependencies,
  input: TranscriptionMeetingInput,
): Promise<TranscriptionWorkflowResult> {
  if (!input?.meetingId) {
    throw new TranscriptionWorkflowError(
      'INVALID_INPUT',
      'Meeting ID is required for transcription',
    );
  }

  const initEngineFn = deps.initEngine ?? initLocalSpeechEngine;
  const transcribeWindowFn = deps.transcribeWindow ?? transcribeWindow;

  const modelConfig = LOCAL_SPEECH_MODELS[input.language] ?? LOCAL_SPEECH_MODELS.en;

  try {
    await initEngineFn(deps.native, {
      modelId: modelConfig.modelId,
      language: input.language,
      modelPath: modelConfig.path,
      modelSha256: modelConfig.sha256,
    });
  } catch (error) {
    if (error instanceof LocalSpeechError) {
      if (error.code === 'NOT_AVAILABLE') {
        throw new TranscriptionWorkflowError(
          'RUNTIME_PREREQUISITE_MISSING',
          'Local speech runtime is not available in the current native build (requires MSVC whisper.cpp C++ toolchain).',
        );
      }
      if (error.code === 'MISSING_MODEL') {
        throw new TranscriptionWorkflowError(
          'MODEL_NOT_FOUND',
          `Local Whisper model file was not found at ${modelConfig.path}. Please ensure models are installed.`,
        );
      }
      throw new TranscriptionWorkflowError('ENGINE_INIT_FAILED', error.message);
    }
    throw new TranscriptionWorkflowError('ENGINE_INIT_FAILED', String(error));
  }

  const sourcePath = input.sourcePath || 'chunks/chunk_000.webm';
  const sourceSha256 =
    input.sourceSha256 || '0000000000000000000000000000000000000000000000000000000000000000';
  const durationMs = input.durationMs ?? 30000;

  try {
    const result = await transcribeWindowFn(deps.native, {
      runId: input.meetingId,
      partIndex: 0,
      startMs: 0,
      endMs: durationMs,
      sourcePath,
      sourceSha256,
    });

    return {
      meetingId: input.meetingId,
      language: input.language,
      segments: result.segments,
      isSimulated: result.isSimulated,
    };
  } catch (error) {
    if (error instanceof LocalSpeechError) {
      throw new TranscriptionWorkflowError('TRANSCRIBE_FAILED', error.message);
    }
    throw new TranscriptionWorkflowError('TRANSCRIBE_FAILED', String(error));
  }
}
