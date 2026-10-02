export type LocalSpeechErrorCode =
  | 'NOT_AVAILABLE'
  | 'ENGINE_INIT_FAILED'
  | 'MISSING_MODEL'
  | 'TRANSCRIBE_FAILED'
  | 'INVALID_RESPONSE';

export class LocalSpeechError extends Error {
  constructor(
    readonly code: LocalSpeechErrorCode,
    override readonly message: string,
  ) {
    super(message);
    this.name = 'LocalSpeechError';
  }
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export type NativeSender = {
  send(
    command: string,
    payload?: Record<string, unknown>,
    options?: { timeoutMs?: number; cancel?: boolean },
  ): Promise<{
    success: boolean;
    payload?: unknown;
    error?: { code?: string; message?: string };
  }>;
};

export async function initLocalSpeechEngine(
  native: NativeSender,
  options: {
    modelId: LocalModelId;
    language: SpeechLanguage;
    memoryBudgetMb?: number;
  },
): Promise<{ initialized: boolean; isSimulated: boolean }> {
  let resp: { success: boolean; payload?: unknown; error?: { code?: string; message?: string } };
  try {
    resp = await native.send('local_speech_engine_init', options);
  } catch (err) {
    throw new LocalSpeechError('INVALID_RESPONSE', String(err));
  }

  if (!resp.success) {
    const errCode = resp.error?.code;
    const msg = resp.error?.message || 'Failed to initialize local speech engine';
    if (errCode === 'NOT_AVAILABLE') {
      throw new LocalSpeechError('NOT_AVAILABLE', msg);
    }
    if (errCode === 'INVALID_MODEL' || errCode === 'MISSING_FIELDS' || errCode === 'MODEL_NOT_FOUND') {
      throw new LocalSpeechError('MISSING_MODEL', msg);
    }
    throw new LocalSpeechError('ENGINE_INIT_FAILED', msg);
  }

  const payload = (resp.payload ?? {}) as Record<string, unknown>;
  return {
    initialized: Boolean(payload.initialized),
    isSimulated: Boolean(payload.isSimulated),
  };
}

export async function transcribeWindow(
  native: NativeSender,
  options: {
    runId: string;
    partIndex: number;
    startMs: number;
    endMs?: number;
    sourcePath: string;
    sourceSha256: string;
    planHash?: string;
  },
): Promise<{ segments: TranscriptSegment[]; durationMs: number; isSimulated: boolean }> {
  let resp: { success: boolean; payload?: unknown; error?: { code?: string; message?: string } };
  try {
    resp = await native.send('local_speech_transcribe_window', options, { timeoutMs: 300_000 });
  } catch (err) {
    throw new LocalSpeechError('INVALID_RESPONSE', String(err));
  }

  if (!resp.success) {
    const msg = resp.error?.message || 'Transcription window failed';
    throw new LocalSpeechError('TRANSCRIBE_FAILED', msg);
  }

  const payload = (resp.payload ?? {}) as Record<string, unknown>;
  const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
  const durationMs = Number(payload.durationMs);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new LocalSpeechError('INVALID_RESPONSE', 'Transcription response duration is invalid');
  }
  const segments: TranscriptSegment[] = rawSegments.map((s: Record<string, unknown>) => ({
    startMs: Number(s.startMs ?? 0),
    endMs: Number(s.endMs ?? 0),
    text: String(s.text ?? '').trim(),
    speaker: s.speaker ? String(s.speaker) : undefined,
  }));

  return {
    segments,
    durationMs,
    isSimulated: Boolean(payload.isSimulated),
  };
}

export async function cancelLocalSpeech(native: NativeSender): Promise<void> {
  await native.send('local_speech_cancel');
}
import type { LocalModelId, SpeechLanguage } from './local-speech-models.js';
