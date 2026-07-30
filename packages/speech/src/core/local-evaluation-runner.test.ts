import { describe, expect, it } from 'vitest';
import {
  FrozenCorpusEntrySchema,
  evaluateLocalCorpus,
  type LocalSpeechEvaluationRuntime,
} from './local-evaluation-runner.js';

const baseEntry = {
  id: 'clean-en-01',
  language: 'en' as const,
  condition: 'clean' as const,
  audioPath: 'audio/clean-en-01.wav',
  audioSha256: 'a'.repeat(64),
  provenance: 'synthetic' as const,
  referenceTranscript: 'Good morning everyone',
  audioDurationMs: 2_000,
};

describe('local evaluation runner', () => {
  it('requires an allowlisted relative audio path, checksum, and provenance', () => {
    expect(() => FrozenCorpusEntrySchema.parse(baseEntry)).not.toThrow();
    expect(() => FrozenCorpusEntrySchema.parse({ ...baseEntry, audioPath: '../secret.wav' })).toThrow();
    expect(() => FrozenCorpusEntrySchema.parse({ ...baseEntry, audioSha256: 'bad' })).toThrow();
    expect(() => FrozenCorpusEntrySchema.parse({ ...baseEntry, provenance: undefined })).toThrow();
  });

  it('rejects simulated native output instead of producing a passing report', async () => {
    const runtime: LocalSpeechEvaluationRuntime = {
      transcribe: async () => ({
        transcript: 'Good morning everyone',
        isSimulated: true,
        elapsedMs: 100,
        segments: [{ startMs: 0, endMs: 1_900 }],
      }),
    };

    await expect(evaluateLocalCorpus(runtime, [baseEntry], { resolveAudio: async () => ({
      sha256: baseEntry.audioSha256,
      durationMs: baseEntry.audioDurationMs,
    }) })).rejects.toMatchObject({ code: 'simulated_output' });
  });

  it('returns content-free aggregate metrics for verified real output', async () => {
    const runtime: LocalSpeechEvaluationRuntime = {
      transcribe: async () => ({
        transcript: 'Good morning everyone',
        isSimulated: false,
        elapsedMs: 500,
        segments: [{ startMs: 0, endMs: 1_900 }],
      }),
    };

    const report = await evaluateLocalCorpus(runtime, [baseEntry], { resolveAudio: async () => ({
      sha256: baseEntry.audioSha256,
      durationMs: baseEntry.audioDurationMs,
    }) });

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toMatchObject({ id: baseEntry.id, wer: 0, localRtf: 0.25 });
    expect(JSON.stringify(report)).not.toContain(baseEntry.referenceTranscript);
    expect(report.pass).toBe(true);
  });
});
