import { z } from 'zod';
import { computeWer, THRESHOLDS } from './evaluation.js';

const SHA256 = /^[a-f0-9]{64}$/i;

export const FrozenCorpusEntrySchema = z
  .object({
    id: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
    language: z.enum(['vi', 'en']),
    condition: z.enum(['clean', 'noisy']),
    audioPath: z
      .string()
      .min(1)
      .max(260)
      .refine((value) => !value.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(value))
      .refine((value) => !value.split(/[\\/]/).includes('..')),
    audioSha256: z.string().regex(SHA256),
    provenance: z.enum(['synthetic', 'consented']),
    referenceTranscript: z.string().min(1),
    audioDurationMs: z.number().int().positive(),
    timestampAnchors: z
      .array(z.object({ startMs: z.number().nonnegative(), endMs: z.number().positive() }).strict())
      .optional(),
  })
  .strict();

export type FrozenCorpusEntry = z.infer<typeof FrozenCorpusEntrySchema>;

export interface LocalSpeechEvaluationRuntime {
  transcribe(input: {
    audioPath: string;
    language: 'vi' | 'en';
    durationMs: number;
  }): Promise<{
    transcript: string;
    isSimulated: boolean;
    elapsedMs: number;
    segments: Array<{ startMs: number; endMs: number }>;
  }>;
}

export interface ResolvedAudio {
  sha256: string;
  durationMs: number;
}

export interface LocalEvaluationEntry {
  id: string;
  language: 'vi' | 'en';
  condition: 'clean' | 'noisy';
  wer: number;
  localRtf: number;
  timestampP95Ms: number | null;
  timestampBlocked: boolean;
}

export interface LocalEvaluationReport {
  version: 'p13-local-evaluation-v1';
  evaluatedAt: string;
  pass: boolean;
  entries: LocalEvaluationEntry[];
  thresholds: {
    wer: { clean: number; noisy: number };
    localRtf: number;
    timestampP95: number;
  };
}

export class LocalEvaluationError extends Error {
  constructor(
    public readonly code:
    | 'audio_hash_mismatch'
    | 'audio_duration_mismatch'
    | 'simulated_output'
    | 'invalid_runtime_output',
    message: string,
  ) {
    super(message);
    this.name = 'LocalEvaluationError';
  }
}

export async function evaluateLocalCorpus(
  runtime: LocalSpeechEvaluationRuntime,
  corpus: readonly FrozenCorpusEntry[],
  options: { resolveAudio: (entry: FrozenCorpusEntry) => Promise<ResolvedAudio> },
): Promise<LocalEvaluationReport> {
  const entries: LocalEvaluationEntry[] = [];

  for (const rawEntry of corpus) {
    const entry = FrozenCorpusEntrySchema.parse(rawEntry);
    const audio = await options.resolveAudio(entry);
    if (audio.sha256.toLowerCase() !== entry.audioSha256.toLowerCase()) {
      throw new LocalEvaluationError('audio_hash_mismatch', `Audio checksum mismatch for ${entry.id}`);
    }
    if (audio.durationMs !== entry.audioDurationMs) {
      throw new LocalEvaluationError('audio_duration_mismatch', `Audio duration mismatch for ${entry.id}`);
    }

    const result = await runtime.transcribe({
      audioPath: entry.audioPath,
      language: entry.language,
      durationMs: entry.audioDurationMs,
    });
    if (result.isSimulated) {
      throw new LocalEvaluationError('simulated_output', `Simulated output is not eligible for ${entry.id}`);
    }
    if (!Number.isFinite(result.elapsedMs) || result.elapsedMs < 0 || !Array.isArray(result.segments)) {
      throw new LocalEvaluationError('invalid_runtime_output', `Invalid runtime output for ${entry.id}`);
    }

    entries.push({
      id: entry.id,
      language: entry.language,
      condition: entry.condition,
      wer: computeWer(entry.referenceTranscript, result.transcript),
      localRtf: result.elapsedMs / entry.audioDurationMs,
      timestampP95Ms: entry.timestampAnchors ? timestampP95(entry.timestampAnchors, result.segments) : null,
      timestampBlocked: !entry.timestampAnchors,
    });
  }

  return {
    version: 'p13-local-evaluation-v1',
    evaluatedAt: new Date().toISOString(),
    pass: entries.every((entry) =>
      entry.wer <= THRESHOLDS.wer[entry.condition] &&
      entry.localRtf <= THRESHOLDS.localRtf &&
      (entry.timestampBlocked || (entry.timestampP95Ms ?? Infinity) <= THRESHOLDS.timestampP95),
    ),
    entries,
    thresholds: {
      wer: THRESHOLDS.wer,
      localRtf: THRESHOLDS.localRtf,
      timestampP95: THRESHOLDS.timestampP95,
    },
  };
}

function timestampP95(
  anchors: Array<{ startMs: number; endMs: number }>,
  segments: Array<{ startMs: number; endMs: number }>,
): number {
  const errors = anchors.map((anchor, index) => {
    const segment = segments[index];
    if (!segment) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(segment.startMs - anchor.startMs), Math.abs(segment.endMs - anchor.endMs));
  });
  errors.sort((a, b) => a - b);
  return errors[Math.min(errors.length - 1, Math.ceil(errors.length * 0.95) - 1)] ?? 0;
}
