import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAudioFixture } from './windows-audio-fixture.js';
import {
  classifyPhysicalFullResult,
  clickAppTranscribeExpression,
  parseRenderedTranscriptState,
  physicalFullPrerequisiteFailure,
  readRenderedTranscriptExpression,
  runPhysicalFullPipeline,
  physicalRecordingEvidenceDir,
  readTranscriptSourceSelectionExpression,
  runOnlineHeadsetFullPipeline,
  verifyPhysicalFullSourceChunk,
} from './windows-physical-full-pipeline-runner.js';
import { writePipelineEvidence } from './windows-pipeline-evidence.js';

const fixtureRoot = resolve(import.meta.dirname, '../../test-fixtures/synthetic-meeting');
const meetingId = '58afed39-744a-49ca-9f14-984bc4e70d25';
const sourceBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00]);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');

afterEach(() => vi.unstubAllEnvs());

function writePackagedPrerequisites(root: string, modelContents = 'local test model') {
  const exePath = join(root, 'Kaiser.exe');
  const modelPath = join(root, 'model.bin');
  mkdirSync(join(root, 'resources', 'native'), { recursive: true });
  writeFileSync(exePath, 'packaged app');
  writeFileSync(join(root, 'resources', 'native', 'kms-native.exe'), 'native sidecar');
  writeFileSync(modelPath, modelContents);
  return {
    exePath,
    modelPath,
    modelSha256: createHash('sha256').update(modelContents).digest('hex'),
  };
}

describe('Windows physical full pipeline profile', () => {
  it('selects system audio through the packaged app before a headset transcription', () => {
    const expression = readTranscriptSourceSelectionExpression('system_audio');
    expect(expression).toContain('transcript-source-select');
    expect(expression).toContain('system_audio');
    expect(typeof runOnlineHeadsetFullPipeline).toBe('function');
  });

  it('keeps recording health samples when full-pipeline summary is written', () => {
    const root = mkdtempSync(join(tmpdir(), 'kms-physical-full-evidence-'));
    try {
      const recordingDir = physicalRecordingEvidenceDir(root);
      writePipelineEvidence(recordingDir, {
        profile: 'physical-recording', duration: '5m', status: 'FAIL',
      }, [{ elapsedMs: 10_000, micGapCount: 2 }]);
      writePipelineEvidence(root, {
        profile: 'physical-full', duration: '5m', status: 'FAIL',
      });
      expect(readFileSync(join(recordingDir, 'metrics.ndjson'), 'utf8')).toContain('"micGapCount":2');
      expect(JSON.parse(readFileSync(join(root, 'summary.json'), 'utf8')).profile).toBe('physical-full');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks before capture when real audio is not explicitly enabled', () => {
    expect(
      physicalFullPrerequisiteFailure({
        durationMs: 300_000,
        platform: 'win32',
        allowRealAudio: false,
      }),
    ).toBe('real_audio_opt_in_required');
  });

  it('does not launch or claim a full pipeline pass when real audio opt-in is absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kms-physical-full-no-opt-in-'));
    const artifactDir = join(root, 'artifacts');
    mkdirSync(artifactDir);
    let launched = false;
    try {
      const result = await runPhysicalFullPipeline({
        durationMs: 300_000,
        platform: 'win32',
        allowRealAudio: false,
        artifactDir,
        userDataDir: join(root, 'user-data'),
        launch: async () => {
          launched = true;
          throw new Error('launch_must_not_be_called');
        },
      });
      expect(result.status).toBe('BLOCKED');
      expect(result.failureCode).toBe('real_audio_opt_in_required');
      expect(launched).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks before capture when the declared local model hash is wrong', () => {
    vi.stubEnv('KMS_ALLOW_REAL_AUDIO', '1');
    const root = mkdtempSync(join(tmpdir(), 'kms-physical-full-prereq-'));
    try {
      const prereqs = writePackagedPrerequisites(root);
      expect(
        physicalFullPrerequisiteFailure({
          durationMs: 300_000,
          platform: 'win32',
          allowRealAudio: true,
          micDeviceId: 'explicit-mic',
          ...prereqs,
          fixtureRoot,
          modelSha256: '0'.repeat(64),
        }),
      ).toBe('local_speech_model_hash_mismatch');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('drives and reads the app transcript UI without injecting transcript data', () => {
    expect(clickAppTranscribeExpression()).toContain("querySelector('.btn-transcribe')");
    expect(clickAppTranscribeExpression()).toContain('button.click()');
    const readExpression = readRenderedTranscriptExpression();
    expect(readExpression).toContain('data-start-ms');
    expect(readExpression).toContain('data-end-ms');
    expect(readExpression).not.toContain('localStorage.setItem');

    expect(
      parseRenderedTranscriptState({
        transcribing: false,
        transcribeButtonVisible: false,
        failure: null,
        durationMs: 5_000,
        chunksTranscribed: 1,
        segments: [{ startMs: 100, endMs: 900, text: 'Alpha approves the action.' }],
      }),
    ).toEqual({
      transcribing: false,
      transcribeButtonVisible: false,
      failure: null,
      durationMs: 5_000,
      chunksTranscribed: 1,
      segments: [{ startMs: 100, endMs: 900, text: 'Alpha approves the action.' }],
    });
    expect(
      parseRenderedTranscriptState({
        transcribing: false,
        transcribeButtonVisible: false,
        failure: null,
        durationMs: 5_000,
        chunksTranscribed: 1,
        segments: [{ startMs: 'bad', endMs: 900, text: 'invalid' }],
      }),
    ).toBeNull();
  });

  it('rejects a captured WebM whose bytes no longer match its finalized manifest', () => {
    const entry = {
      source: 'microphone' as const,
      chunkIndex: 0,
      filePath: `chunks/${meetingId}_microphone_000.webm`,
      sha256: sourceHash,
      byteLength: sourceBytes.length,
    };
    expect(() =>
      verifyPhysicalFullSourceChunk(entry, {
        success: true,
        payload: {
          dataBase64: Buffer.from('changed-source').toString('base64'),
          byteLength: sourceBytes.length,
        },
      }),
    ).toThrow('capture_chunk_byte_length_mismatch');
  });

  it('does not classify simulated inference, incomplete reopen/export, or unverified cleanup as PASS', () => {
    const fullEvidence = {
      recordingPassed: true,
      captureVerified: true,
      finalizeVerified: true,
      localSpeechInitialized: true,
      localSpeechSimulated: false,
      transcriptPassed: true,
      reopenVerified: true,
      exportVerified: true,
      cleanupVerified: true,
    };
    expect(classifyPhysicalFullResult({ ...fullEvidence, localSpeechSimulated: true })).toBe(
      'FAIL',
    );
    expect(classifyPhysicalFullResult({ ...fullEvidence, exportVerified: false })).toBe('FAIL');
    expect(classifyPhysicalFullResult({ ...fullEvidence, cleanupVerified: false })).toBe('FAIL');
    expect(classifyPhysicalFullResult(fullEvidence)).toBe('PASS');
  });

  it('validates the committed synthetic fixture used to drive real playback', () => {
    const fixture = loadAudioFixture(fixtureRoot);
    expect(fixture.fixtureId).toBe('synthetic-meeting-v1');
    expect(fixture.language).toBe('en');
  });
});
