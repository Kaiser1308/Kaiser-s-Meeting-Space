import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAudioFixture, validateAudioFixture, type AudioFixtureManifest } from './windows-audio-fixture.js';
import {
  createIsolatedRunDirectories,
  launchPackagedElectronSession,
  parseWindowsTestDuration,
  resolvePackagedSidecarPath,
  type PackagedElectronSession,
  type WindowsTestDuration,
} from './windows-test-kit.js';
import { writePipelineEvidence, type WindowsPipelineEvidence } from './windows-pipeline-evidence.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultExePath = resolve(currentDir, '../../dist-packaged/win-unpacked/Kaiser\'s Meeting Space.exe');
const defaultFixtureRoot = resolve(currentDir, '../../test-fixtures/synthetic-meeting');

export interface PhysicalRecordingOptions {
  durationMs: number;
  exePath?: string;
  fixtureRoot?: string;
  allowRealAudio?: boolean;
  micDeviceId?: string;
  systemAudioDeviceId?: string;
  artifactDir?: string;
  userDataDir?: string;
  launch?: (options: { exePath: string; artifactDir: string; userDataDir: string }) => Promise<PackagedElectronSession & { loadedTargetUrl: string }>;
  platform?: NodeJS.Platform;
}

export interface PhysicalRecordingSummary extends WindowsPipelineEvidence {
  profile: 'physical-recording';
  route: 'speaker-to-mic' | 'loopback';
  fixtureId?: string;
  wavSha256?: string;
  micChunks?: number;
  systemChunks?: number;
  gapCount?: number;
  overflowCount?: number;
  driftSamples?: number;
}

export function durationLabelForMs(durationMs: number): WindowsTestDuration {
  for (const label of ['5m', '1h', '3h', '4h'] as const) {
    if (parseWindowsTestDuration(label).durationMs === durationMs) return label;
  }
  throw new Error('unsupported_windows_test_duration');
}

function blockedSummary(durationMs: number, failureCode: string, artifactDir?: string): PhysicalRecordingSummary {
  const duration = durationLabelForMs(durationMs);
  const summary: PhysicalRecordingSummary = {
    profile: 'physical-recording', duration, status: 'BLOCKED', route: 'speaker-to-mic', failureCode,
    cleanup: { status: 'not_started' },
  };
  if (artifactDir) writePipelineEvidence(artifactDir, summary);
  return summary;
}

export function physicalRecordingPrerequisiteFailure(options: PhysicalRecordingOptions): string | null {
  if (options.platform && options.platform !== 'win32') return 'windows_required';
  if (options.allowRealAudio !== true && process.env.KMS_ALLOW_REAL_AUDIO !== '1') return 'real_audio_opt_in_required';
  if (!(options.micDeviceId ?? process.env.KMS_MIC_DEVICE_ID)?.trim()) return 'missing_mic_device';
  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath;
  if (!existsSync(exePath)) return 'packaged_executable_unavailable';
  if (!existsSync(resolvePackagedSidecarPath(exePath))) return 'packaged_sidecar_unavailable';
  return null;
}

export function selectPhysicalCaptureExpression(): string {
  return `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === 'Physical Capture'); if (!button) return false; button.click(); return true; })()`;
}

export function setPhysicalDeviceExpression(micDeviceId: string, systemAudioDeviceId?: string): string {
  return `(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!element) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; if (!setter) return false; setter.call(element, value); element.dispatchEvent(new Event('change', { bubbles: true })); return true; }; return set('select.device-select:nth-of-type(1)', ${JSON.stringify(micDeviceId)}) && ${systemAudioDeviceId ? `set('select.device-select:nth-of-type(2)', ${JSON.stringify(systemAudioDeviceId)})` : 'true'}; })()`;
}

export function fillPhysicalTitleExpression(): string {
  return `(() => { const input = document.querySelector('#meeting-title'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (!input || !setter) return false; setter.call(input, 'Synthetic physical recording harness'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
}

async function playFixture(fixture: AudioFixtureManifest, durationMs: number): Promise<ChildProcess> {
  const script = resolve(currentDir, '../../../scripts/windows/play-audio-fixture.ps1');
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-AudioPath', fixture.wavPath, '-DurationMs', String(durationMs)], { stdio: 'ignore', windowsHide: true });
  await new Promise<void>((resolvePromise, reject) => { child.once('error', reject); child.once('spawn', () => resolvePromise()); });
  return child;
}

function stopPlayback(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null) return;
  try { child.kill(); } catch { /* best effort */ }
}

function devicesFromPayload(payload: unknown): Array<{ deviceId: string; deviceType: string; isConnected?: boolean }> {
  return Array.isArray(payload) ? payload.filter((item): item is { deviceId: string; deviceType: string; isConnected?: boolean } => Boolean(item && typeof item === 'object' && typeof (item as Record<string, unknown>).deviceId === 'string' && typeof (item as Record<string, unknown>).deviceType === 'string')) : [];
}

export async function runPhysicalRecording(options: PhysicalRecordingOptions): Promise<PhysicalRecordingSummary> {
  const duration = durationLabelForMs(options.durationMs);
  const dirs = options.artifactDir && options.userDataDir ? null : createIsolatedRunDirectories('kms-windows-physical');
  const artifactDir = options.artifactDir ?? dirs!.artifactDir;
  const userDataDir = options.userDataDir ?? dirs!.userDataDir;
  const prerequisite = physicalRecordingPrerequisiteFailure(options);
  if (prerequisite) {
    const summary = blockedSummary(options.durationMs, prerequisite, artifactDir);
    dirs?.cleanup();
    return summary;
  }

  let fixture: AudioFixtureManifest;
  try { fixture = loadAudioFixture(options.fixtureRoot ?? defaultFixtureRoot); validateAudioFixture(fixture); } catch (error) {
    const summary = blockedSummary(options.durationMs, error instanceof Error ? error.message : 'fixture_unavailable', artifactDir);
    dirs?.cleanup();
    return summary;
  }
  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath;
  const micDeviceId = options.micDeviceId ?? process.env.KMS_MIC_DEVICE_ID!;
  const systemAudioDeviceId = options.systemAudioDeviceId ?? process.env.KMS_SYSTEM_DEVICE_ID;
  const evidence: PhysicalRecordingSummary = { profile: 'physical-recording', duration, status: 'FAIL', route: systemAudioDeviceId ? 'speaker-to-mic' : 'speaker-to-mic', fixtureId: fixture.fixtureId, wavSha256: fixture.wavSha256, cleanup: { status: 'unknown' } };
  let session: (PackagedElectronSession & { loadedTargetUrl: string }) | null = null;
  let playback: ChildProcess | null = null;
  try {
    session = await (options.launch ?? launchPackagedElectronSession)({ exePath, artifactDir, userDataDir });
    const deviceResponse = await session.invokeNative('device_enumerate');
    const devices = devicesFromPayload(deviceResponse.payload);
    if (!devices.some((device) => device.deviceId === micDeviceId && device.deviceType === 'microphone' && device.isConnected !== false)) throw new Error('selected_mic_device_unavailable');
    if (systemAudioDeviceId && !devices.some((device) => device.deviceId === systemAudioDeviceId && device.deviceType === 'system_audio' && device.isConnected !== false)) throw new Error('selected_system_device_unavailable');
    if (await session.evaluate(selectPhysicalCaptureExpression()) !== true) throw new Error('physical_selector_unavailable');
    if (await session.evaluate(setPhysicalDeviceExpression(micDeviceId, systemAudioDeviceId)) !== true) throw new Error('physical_device_selector_unavailable');
    if (await session.evaluate(fillPhysicalTitleExpression()) !== true) throw new Error('synthetic_title_input_unavailable');
    if (await session.evaluate(`(() => { document.querySelector('button.record')?.click(); return true; })()`) !== true) throw new Error('physical_start_button_unavailable');
    await session.pollRenderer(() => session!.invokeNative('capture_get_state', {}, false), (value) => Boolean((value as { success?: boolean }).success), 15_000);
    playback = await playFixture(fixture, options.durationMs);
    const startedAt = performance.now();
    let nextSampleAt = 10_000;
    const samples: Record<string, unknown>[] = [];
    while (performance.now() - startedAt < options.durationMs) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(1_000, Math.max(1, options.durationMs - (performance.now() - startedAt)))));
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (elapsedMs >= nextSampleAt) {
        const state = await session.invokeNative('capture_get_state', {}, false);
        if (!state.success) throw new Error('capture_health_unavailable');
        samples.push({ elapsedMs, state: state.payload });
        evidence.healthSamples = samples.length;
        nextSampleAt += 10_000;
      }
    }
    stopPlayback(playback); playback = null;
    await session.evaluate(`(() => { document.querySelector('button.record')?.click(); return true; })()`);
    evidence.elapsedMs = Math.round(performance.now() - startedAt);
    evidence.status = evidence.elapsedMs >= options.durationMs ? 'PASS' : 'FAIL';
    evidence.cleanup = { status: 'pending' };
    writePipelineEvidence(artifactDir, evidence, samples);
    return evidence;
  } catch (error) {
    evidence.status = 'FAIL'; evidence.failureCode = error instanceof Error ? error.message : 'physical_recording_failed';
    writePipelineEvidence(artifactDir, evidence);
    return evidence;
  } finally {
    stopPlayback(playback);
    try { await session?.close(); evidence.cleanup = { status: 'clean' }; } catch { evidence.cleanup = { status: 'unknown' }; }
    writePipelineEvidence(artifactDir, evidence);
    dirs?.cleanup();
  }
}
