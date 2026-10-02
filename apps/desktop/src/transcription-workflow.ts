import {
  initLocalSpeechEngine,
  transcribeWindow,
  LocalSpeechError,
  type TranscriptSegment,
  type NativeSender,
} from './local-speech-client.js';
import type { LocalModelId } from './local-speech-models.js';

export type { TranscriptSegment };
export type TranscriptSource = 'microphone' | 'system_audio';

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
  source?: TranscriptSource;
}

export interface TranscriptionWorkflowDependencies {
  native: NativeSender;
  resolveModel(language: 'vi' | 'en'): Promise<LocalModelId>;
  initEngine?: typeof initLocalSpeechEngine;
  transcribeWindow?: typeof transcribeWindow;
}

export interface TranscriptionWorkflowResult {
  meetingId: string;
  language: 'vi' | 'en';
  source: TranscriptSource;
  segments: TranscriptSegment[];
  durationMs: number;
  chunksTranscribed: number;
  isSimulated: boolean;
}

interface CaptureManifestEntry {
  source: string;
  chunkIndex: number;
  filePath: string;
  sha256: string;
  byteLength: number;
}

const MEETING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HASH_PATTERN = /^[a-f0-9]{64}$/iu;

function readSourceEntries(
  value: unknown,
  meetingId: string,
  source: TranscriptSource,
): CaptureManifestEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Capture manifest response is invalid');
  const entries = (value as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) throw new Error('Capture manifest entries are unavailable');
  const selected = entries.filter(
    (entry): entry is CaptureManifestEntry =>
      Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)) &&
      (entry as Record<string, unknown>).source === source,
  );
  selected.sort((left, right) => left.chunkIndex - right.chunkIndex);
  if (selected.length === 0) throw new Error(`Capture manifest has no ${source} chunks`);

  for (let index = 0; index < selected.length; index += 1) {
    const entry = selected[index]!;
    if (
      entry.chunkIndex !== index ||
      entry.filePath !==
        `chunks/${meetingId}_${source}_${String(index).padStart(3, '0')}.webm` ||
      !HASH_PATTERN.test(entry.sha256) ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength <= 0
    ) {
      throw new Error(`Capture manifest ${source} entries are invalid`);
    }
  }
  return selected;
}

export async function transcribeMeeting(
  deps: TranscriptionWorkflowDependencies,
  input: TranscriptionMeetingInput,
): Promise<TranscriptionWorkflowResult> {
  if (!input?.meetingId || !MEETING_ID_PATTERN.test(input.meetingId)) {
    throw new TranscriptionWorkflowError(
      'INVALID_INPUT',
      'Meeting ID is required for transcription',
    );
  }

  const initEngineFn = deps.initEngine ?? initLocalSpeechEngine;
  const transcribeWindowFn = deps.transcribeWindow ?? transcribeWindow;
  const source = input.source ?? 'microphone';

  try {
    const modelId = await deps.resolveModel(input.language);
    const initialized = await initEngineFn(deps.native, {
      modelId,
      language: input.language,
    });
    if (!initialized.initialized || initialized.isSimulated) {
      throw new TranscriptionWorkflowError(
        'ENGINE_INIT_FAILED',
        'Local speech engine did not initialize as a real inference engine',
      );
    }
  } catch (error) {
    if (error instanceof TranscriptionWorkflowError) throw error;
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
          'Selected local model is unavailable. Download it before transcription.',
        );
      }
      throw new TranscriptionWorkflowError('ENGINE_INIT_FAILED', error.message);
    }
    throw new TranscriptionWorkflowError('ENGINE_INIT_FAILED', String(error));
  }

  try {
    const manifest = await deps.native.send('manifest_list_entries', {
      meetingId: input.meetingId,
    });
    if (!manifest.success) {
      throw new Error(manifest.error?.message || 'Capture manifest could not be loaded');
    }
    const entries = readSourceEntries(manifest.payload, input.meetingId, source);
    const segments: TranscriptSegment[] = [];
    let offsetMs = 0;

    for (const entry of entries) {
      const result = await transcribeWindowFn(deps.native, {
        runId: input.meetingId,
        partIndex: entry.chunkIndex,
        startMs: 0,
        sourcePath: entry.filePath,
        sourceSha256: entry.sha256,
      });
      if (result.isSimulated) throw new Error('Local speech returned simulated transcript output');
      if (!Number.isSafeInteger(result.durationMs) || result.durationMs <= 0) {
        throw new Error('Local speech returned an invalid source duration');
      }
      const nextOffsetMs = offsetMs + result.durationMs;
      if (!Number.isSafeInteger(nextOffsetMs)) throw new Error('Transcription duration overflow');
      for (const segment of result.segments) {
        if (
          !Number.isSafeInteger(segment.startMs) ||
          !Number.isSafeInteger(segment.endMs) ||
          segment.startMs < 0 ||
          segment.endMs <= segment.startMs ||
          segment.endMs > result.durationMs ||
          !segment.text
        ) {
          throw new Error('Local speech returned an invalid transcript segment');
        }
        segments.push({
          ...segment,
          startMs: segment.startMs + offsetMs,
          endMs: segment.endMs + offsetMs,
        });
      }
      offsetMs = nextOffsetMs;
    }

    return {
      meetingId: input.meetingId,
      language: input.language,
      source,
      segments,
      durationMs: offsetMs,
      chunksTranscribed: entries.length,
      isSimulated: false,
    };
  } catch (error) {
    if (error instanceof LocalSpeechError) {
      throw new TranscriptionWorkflowError('TRANSCRIBE_FAILED', error.message);
    }
    throw new TranscriptionWorkflowError('TRANSCRIBE_FAILED', String(error));
  }
}
