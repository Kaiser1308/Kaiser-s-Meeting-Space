import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAudioFixture, validateAudioFixture } from './windows-audio-fixture.js';
import { resolvePackagedSidecarPath } from './windows-test-kit.js';
import { durationLabelForMs, runPhysicalRecording, physicalRecordingPrerequisiteFailure, type PhysicalRecordingOptions, type PhysicalRecordingSummary } from './windows-physical-recording-runner.js';
import { writePipelineEvidence, type WindowsPipelineEvidence } from './windows-pipeline-evidence.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultExePath = resolve(currentDir, '../../dist-packaged/win-unpacked/Kaiser\'s Meeting Space.exe');
const defaultFixtureRoot = resolve(currentDir, '../../test-fixtures/synthetic-meeting');

export interface PhysicalFullPipelineOptions extends PhysicalRecordingOptions {
  modelPath?: string;
  modelSha256?: string;
}

export interface PhysicalFullPipelineSummary extends WindowsPipelineEvidence {
  profile: 'physical-full';
  recording?: PhysicalRecordingSummary;
  finalize?: { required: boolean; verified: boolean };
  transcript?: { available: boolean; failureCodes: string[] };
  export?: { verified: boolean };
}

export function physicalFullPrerequisiteFailure(options: PhysicalFullPipelineOptions): string | null {
  const recordingFailure = physicalRecordingPrerequisiteFailure(options);
  if (recordingFailure) return recordingFailure;
  const fixtureRoot = options.fixtureRoot ?? defaultFixtureRoot;
  try { validateAudioFixture(loadAudioFixture(fixtureRoot)); } catch (error) { return error instanceof Error ? error.message : 'fixture_unavailable'; }
  const modelPath = options.modelPath ?? process.env.KMS_LOCAL_SPEECH_MODEL_PATH;
  if (!modelPath || !existsSync(modelPath)) return 'local_speech_model_missing';
  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath;
  if (!existsSync(resolvePackagedSidecarPath(exePath))) return 'packaged_sidecar_unavailable';
  return null;
}

export async function runPhysicalFullPipeline(options: PhysicalFullPipelineOptions): Promise<PhysicalFullPipelineSummary> {
  const artifactDir = options.artifactDir;
  const failure = physicalFullPrerequisiteFailure(options);
  if (failure) {
    const summary: PhysicalFullPipelineSummary = { profile: 'physical-full', duration: durationLabelForMs(options.durationMs), status: 'BLOCKED', route: 'speaker-to-mic', failureCode: failure, cleanup: { status: 'not_started' } };
    if (artifactDir) writePipelineEvidence(artifactDir, summary);
    return summary;
  }

  const recording = await runPhysicalRecording(options);
  if (recording.status !== 'PASS') {
    const summary: PhysicalFullPipelineSummary = {
      profile: 'physical-full', duration: recording.duration, status: recording.status, route: recording.route,
      fixtureId: recording.fixtureId, fixtureSha256: recording.wavSha256, recording,
      failureCode: recording.failureCode ?? 'physical_recording_not_passed', cleanup: recording.cleanup,
    };
    if (artifactDir) writePipelineEvidence(artifactDir, summary);
    return summary;
  }

  const summary: PhysicalFullPipelineSummary = {
    profile: 'physical-full', duration: recording.duration, status: 'BLOCKED', route: recording.route, recording,
    fixtureId: recording.fixtureId, fixtureSha256: recording.wavSha256, failureCode: 'captured_source_reader_missing',
    finalize: { required: true, verified: false }, transcript: { available: false, failureCodes: ['captured_source_reader_missing'] }, export: { verified: false }, cleanup: recording.cleanup,
  };
  if (artifactDir) writePipelineEvidence(artifactDir, summary);
  return summary;
}
