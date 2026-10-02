import { describe, expect, it } from 'vitest';
import { parseWindowsTestDuration, parseWindowsTestProfile } from './windows-test-kit.js';
import {
  runOnlineHeadsetFullPipeline,
  runPhysicalFullPipeline,
} from './windows-physical-full-pipeline-runner.js';
import { runPhysicalRecording } from './windows-physical-recording-runner.js';
import { runSimulatorFullPipeline } from './windows-simulator-full-pipeline-runner.js';

const profile = process.env.KMS_WINDOWS_TEST_PROFILE;
const duration = process.env.KMS_WINDOWS_TEST_DURATION;

describe('Windows audio pipeline dispatcher', () => {
  it('invokes exactly the selected profile runner', async (context) => {
    if (!profile && !duration) {
      context.skip('Windows pipeline selector environment is not set.');
      return;
    }
    if (!profile || !duration) throw new Error('windows_test_selector_incomplete');

    const selectedProfile = parseWindowsTestProfile(profile);
    const durationMs = parseWindowsTestDuration(duration).durationMs;
    const common = {
      durationMs,
      exePath: process.env.KMS_PACKAGED_EXE,
      fixtureRoot: process.env.KMS_WINDOWS_FIXTURE_ROOT,
      artifactDir: process.env.KMS_WINDOWS_ARTIFACT_DIR,
      userDataDir: process.env.KMS_WINDOWS_USER_DATA_DIR,
      allowRealAudio: process.env.KMS_ALLOW_REAL_AUDIO === '1',
      micDeviceId: process.env.KMS_MIC_DEVICE_ID,
      systemAudioDeviceId: process.env.KMS_SYSTEM_DEVICE_ID,
    };
    const summary = selectedProfile === 'simulator-full'
      ? await runSimulatorFullPipeline(common)
      : selectedProfile === 'physical-recording'
        ? await runPhysicalRecording(common)
        : selectedProfile === 'online-headset-full'
          ? await runOnlineHeadsetFullPipeline(common)
        : await runPhysicalFullPipeline(common);
    process.stdout.write(`${JSON.stringify({ profile: selectedProfile, duration, status: summary.status, failureCode: summary.failureCode ?? null })}\n`);
    expect(summary.status, summary.failureCode ?? 'windows_pipeline_not_passed').toBe('PASS');
  }, 14_400_000 + 120_000);
});
