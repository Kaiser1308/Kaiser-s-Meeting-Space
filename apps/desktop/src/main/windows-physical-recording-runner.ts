import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join as joinPath, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAudioFixture,
  validateAudioFixture,
  type AudioFixtureManifest,
} from './windows-audio-fixture.js';
import {
  assertHealthSampleCoverage,
  createIsolatedRunDirectories,
  getHealthSampleDeadline,
  launchPackagedElectronSession,
  parseWindowsTestDuration,
  resolvePackagedSidecarPath,
  type PackagedElectronSession,
  type WindowsTestDuration,
} from './windows-test-kit.js';
import {
  writePipelineEvidence,
  type WindowsPipelineEvidence,
} from './windows-pipeline-evidence.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultExePath = resolve(
  currentDir,
  "../../dist-packaged/win-unpacked/Kaiser's Meeting Space.exe",
);
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
  launch?: (options: {
    exePath: string;
    artifactDir: string;
    userDataDir: string;
  }) => Promise<PackagedElectronSession & { loadedTargetUrl: string }>;
  afterCapture?: (
    session: PackagedElectronSession,
    capture: PhysicalCaptureContext,
  ) => Promise<void>;
  platform?: NodeJS.Platform;
}

export interface PhysicalRecordingSummary extends WindowsPipelineEvidence {
  profile: 'physical-recording';
  route: 'speaker-to-mic' | 'loopback' | 'speaker-to-mic+loopback';
  fixtureId?: string;
  wavSha256?: string;
  micChunks?: number;
  systemChunks?: number;
  gapCount?: number;
  overflowCount?: number | null;
  driftSamples?: number;
  eventOverruns?: number;
  missingFrames?: number;
  captureIntegrity?: {
    verified: boolean;
    manifestEntries: number;
    totalBytes: number;
    orphanCount: number;
  };
}

export interface PhysicalCaptureManifestEntry {
  source: 'microphone' | 'system_audio';
  chunkIndex: number;
  filePath: string;
  sha256: string;
  byteLength: number;
}

export interface PhysicalCaptureContext {
  meetingId: string;
  fixture: AudioFixtureManifest;
  entries: PhysicalCaptureManifestEntry[];
  elapsedMs: number;
}

interface FinalizedMeetingSummary {
  meetingId: string;
  totalMicChunks: number;
  totalSysChunks: number;
  commitStatus: 'clean' | 'recovery_required';
}

type PhysicalCaptureSession = Pick<PackagedElectronSession, 'invokeNative'>;

const HEALTH_SAMPLE_INTERVAL_MS = 10_000;
const CAPTURE_STATE_POLL_INTERVAL_MS = 200;
const MIN_MIC_PEAK = 0.01;
const MEETING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function durationLabelForMs(durationMs: number): WindowsTestDuration {
  for (const label of ['5m', '1h', '3h', '4h'] as const) {
    if (parseWindowsTestDuration(label).durationMs === durationMs) return label;
  }
  throw new Error('unsupported_windows_test_duration');
}

function blockedSummary(
  durationMs: number,
  failureCode: string,
  artifactDir?: string,
): PhysicalRecordingSummary {
  const duration = durationLabelForMs(durationMs);
  const summary: PhysicalRecordingSummary = {
    profile: 'physical-recording',
    duration,
    status: 'BLOCKED',
    route: 'speaker-to-mic',
    failureCode,
    cleanup: { status: 'not_started' },
  };
  if (artifactDir) writePipelineEvidence(artifactDir, summary);
  return summary;
}

export function physicalRecordingPrerequisiteFailure(
  options: PhysicalRecordingOptions,
): string | null {
  if ((options.platform ?? process.platform) !== 'win32') return 'windows_required';
  if (options.allowRealAudio !== true || process.env.KMS_ALLOW_REAL_AUDIO !== '1')
    return 'real_audio_opt_in_required';
  if (!(options.micDeviceId ?? process.env.KMS_MIC_DEVICE_ID)?.trim()) return 'missing_mic_device';
  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath;
  if (!existsSync(exePath)) return 'packaged_executable_unavailable';
  if (!existsSync(resolvePackagedSidecarPath(exePath))) return 'packaged_sidecar_unavailable';
  return null;
}

export interface PhysicalCaptureGapSummary {
  gapCount: number;
  overflowCount: number;
  missingFrames: number;
}

export function readPhysicalCaptureGapSummary(
  userDataDir: string,
  meetingId: string,
): PhysicalCaptureGapSummary {
  if (!MEETING_ID_PATTERN.test(meetingId)) throw new Error('capture_meeting_id_invalid');
  const databasePath = joinPath(userDataDir, 'native-storage', 'manifest.db');
  if (!existsSync(databasePath)) throw new Error('capture_manifest_database_unavailable');
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database
      .prepare(
        `
      SELECT COUNT(*) AS gap_count,
        COALESCE(SUM(CASE WHEN reason LIKE 'CAPTURE_OVERFLOW%' THEN 1 ELSE 0 END), 0) AS overflow_count,
        COALESCE(SUM(MAX(0, end_frame - start_frame)), 0) AS missing_frames
      FROM capture_gaps WHERE meeting_id = ?
    `,
      )
      .get(meetingId) as Record<string, number | bigint> | undefined;
    if (!row) throw new Error('capture_gap_query_failed');
    return {
      gapCount: Number(row.gap_count),
      overflowCount: Number(row.overflow_count),
      missingFrames: Number(row.missing_frames),
    };
  } catch {
    throw new Error('capture_gap_query_failed');
  } finally {
    database.close();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asEntries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item)),
      )
    : [];
}

function expectedChunkPath(meetingId: string, source: string, chunkIndex: number): string {
  return `chunks/${meetingId}_${source}_${String(chunkIndex).padStart(3, '0')}.webm`;
}

export async function verifyPhysicalCaptureArtifacts(
  session: PhysicalCaptureSession,
  meetingId: string,
  finalized: Pick<FinalizedMeetingSummary, 'totalMicChunks' | 'totalSysChunks' | 'commitStatus'>,
): Promise<{
  entries: PhysicalCaptureManifestEntry[];
  chunkCount: number;
  totalBytes: number;
  orphanCount: number;
}> {
  if (!MEETING_ID_PATTERN.test(meetingId)) throw new Error('capture_meeting_id_invalid');
  if (finalized.commitStatus !== 'clean') throw new Error('capture_finalize_not_clean');
  if (
    !Number.isSafeInteger(finalized.totalMicChunks) ||
    finalized.totalMicChunks <= 0 ||
    !Number.isSafeInteger(finalized.totalSysChunks) ||
    finalized.totalSysChunks < 0
  ) {
    throw new Error('capture_finalize_chunk_counts_invalid');
  }

  const listed = await session.invokeNative('manifest_list_entries', { meetingId }, false);
  const manifestEntries = asEntries(asRecord(listed.payload).entries);
  if (
    !listed.success ||
    manifestEntries.length !== finalized.totalMicChunks + finalized.totalSysChunks
  ) {
    throw new Error('capture_manifest_count_mismatch');
  }

  const counts = { microphone: 0, system_audio: 0 };
  const entries: PhysicalCaptureManifestEntry[] = [];
  let totalBytes = 0;
  const ordered = [...manifestEntries].sort((left, right) => {
    const sourceOrder = String(left.source).localeCompare(String(right.source));
    return sourceOrder || Number(left.chunkIndex) - Number(right.chunkIndex);
  });
  for (const raw of ordered) {
    const source = raw.source;
    const chunkIndex = raw.chunkIndex;
    const filePath = raw.filePath;
    const expectedHash = raw.sha256;
    const byteLength = raw.byteLength;
    if (
      (source !== 'microphone' && source !== 'system_audio') ||
      !Number.isSafeInteger(chunkIndex) ||
      (chunkIndex as number) < 0 ||
      typeof filePath !== 'string' ||
      typeof expectedHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(expectedHash) ||
      !Number.isSafeInteger(byteLength) ||
      (byteLength as number) <= 0 ||
      raw.meetingId !== meetingId
    ) {
      throw new Error('capture_manifest_entry_invalid');
    }
    const index = chunkIndex as number;
    if (index !== counts[source] || filePath !== expectedChunkPath(meetingId, source, index)) {
      throw new Error('capture_chunk_sequence_invalid');
    }

    const read = await session.invokeNative('storage_read', { path: filePath }, false);
    const readPayload = asRecord(read.payload);
    const encoded = readPayload.dataBase64;
    if (
      !read.success ||
      typeof encoded !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    ) {
      throw new Error('capture_chunk_unreadable');
    }
    const bytes = Buffer.from(encoded, 'base64');
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== byteLength || readPayload.byteLength !== byteLength)
      throw new Error('capture_chunk_byte_length_mismatch');
    if (hash.toLowerCase() !== expectedHash.toLowerCase())
      throw new Error('capture_chunk_hash_mismatch');
    if (bytes.length < 4 || bytes.subarray(0, 4).toString('hex') !== '1a45dfa3')
      throw new Error('capture_chunk_webm_invalid');

    counts[source] += 1;
    totalBytes += bytes.length;
    entries.push({ source, chunkIndex: index, filePath, sha256: hash, byteLength: bytes.length });
  }
  if (
    counts.microphone !== finalized.totalMicChunks ||
    counts.system_audio !== finalized.totalSysChunks
  ) {
    throw new Error('capture_manifest_count_mismatch');
  }

  const orphanResponse = await session.invokeNative('manifest_get_orphans', {}, false);
  const orphans = asRecord(orphanResponse.payload).orphans;
  if (!orphanResponse.success || !Array.isArray(orphans) || orphans.length !== 0)
    throw new Error('capture_orphan_files_found');
  return { entries, chunkCount: entries.length, totalBytes, orphanCount: 0 };
}

export function classifyPhysicalRecordingResult(input: {
  elapsedMs: number;
  durationMs: number;
  integrityVerified: boolean;
  healthSamples: number;
  expectedHealthSamples: number;
  cleanFinalize: boolean;
  gapCount: number;
  overflowCount: number;
}): 'PASS' | 'FAIL' {
  return input.elapsedMs >= input.durationMs &&
    input.integrityVerified &&
    input.healthSamples === input.expectedHealthSamples &&
    input.cleanFinalize &&
    input.gapCount === 0 &&
    input.overflowCount === 0
    ? 'PASS'
    : 'FAIL';
}

export function classifyPhysicalRecordingFailure(failureCode: string): 'BLOCKED' | 'FAIL' {
  return new Set([
    'windows_required',
    'real_audio_opt_in_required',
    'missing_mic_device',
    'packaged_executable_unavailable',
    'packaged_sidecar_unavailable',
    'selected_mic_device_unavailable',
    'selected_system_device_unavailable',
    'fixture_manifest_missing',
    'fixture_manifest_invalid',
    'fixture_wav_missing',
    'fixture_transcript_missing',
    'fixture_wav_invalid',
    'fixture_wav_hash_mismatch',
    'fixture_transcript_hash_mismatch',
    'fixture_transcript_invalid',
    'fixture_path_invalid',
    'fixture_playback_unavailable',
  ]).has(failureCode)
    ? 'BLOCKED'
    : 'FAIL';
}

export function finalizePhysicalRecordingSummary(
  summary: PhysicalRecordingSummary,
): PhysicalRecordingSummary {
  if (summary.status === 'PASS' && summary.cleanup?.status !== 'clean') {
    summary.status = 'FAIL';
    summary.failureCode = 'cleanup_unverified';
  }
  return summary;
}

export function selectPhysicalCaptureExpression(): string {
  return `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === 'Physical Capture'); if (!button) return false; button.click(); return true; })()`;
}

export function setPhysicalDeviceExpression(
  micDeviceId: string,
  systemAudioDeviceId?: string,
): string {
  return `(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!element) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; if (!setter) return false; setter.call(element, value); element.dispatchEvent(new Event('change', { bubbles: true })); return true; }; return set('select.device-select:nth-of-type(1)', ${JSON.stringify(micDeviceId)}) && ${systemAudioDeviceId ? `set('select.device-select:nth-of-type(2)', ${JSON.stringify(systemAudioDeviceId)})` : 'true'}; })()`;
}

export function fillPhysicalTitleExpression(): string {
  return `(() => { const input = document.querySelector('#meeting-title'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (!input || !setter) return false; setter.call(input, 'Synthetic physical recording harness'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
}

export function readFinalizedMeetingExpression(): string {
  return `(() => { const card = document.querySelector('[data-testid="session-evidence-card"]'); if (!card) return null; const fields = {}; for (const row of card.querySelectorAll('.evidence-row')) { const label = row.querySelector('small')?.textContent?.trim(); const value = row.querySelector('strong')?.textContent?.trim(); if (label && value) fields[label] = value; } return { meetingId: fields['Meeting ID (UUID)'], totalMicChunks: Number(fields['Mic Chunks count']), totalSysChunks: Number(fields['Sys Chunks count']), commitStatus: fields['Commit Status'] }; })()`;
}

export function parseFinalizedMeetingSummary(value: unknown): FinalizedMeetingSummary | null {
  const summary = asRecord(value);
  if (
    typeof summary.meetingId !== 'string' ||
    !MEETING_ID_PATTERN.test(summary.meetingId) ||
    !Number.isSafeInteger(summary.totalMicChunks) ||
    !Number.isSafeInteger(summary.totalSysChunks) ||
    (summary.commitStatus !== 'clean' && summary.commitStatus !== 'recovery_required')
  )
    return null;
  return {
    meetingId: summary.meetingId,
    totalMicChunks: summary.totalMicChunks as number,
    totalSysChunks: summary.totalSysChunks as number,
    commitStatus: summary.commitStatus,
  };
}

async function playFixture(
  fixture: AudioFixtureManifest,
  durationMs: number,
): Promise<ChildProcess> {
  const script = resolve(currentDir, '../../../scripts/windows/play-audio-fixture.ps1');
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-AudioPath',
      fixture.wavPath,
      '-DurationMs',
      String(durationMs),
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', () => reject(new Error('fixture_playback_unavailable')));
    child.once('spawn', () => resolvePromise());
  });
  return child;
}

function stopPlayback(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill();
  } catch {
    /* best effort */
  }
}

function devicesFromPayload(
  payload: unknown,
): Array<{ deviceId: string; deviceType: string; isConnected?: boolean }> {
  return Array.isArray(payload)
    ? payload.filter(
        (item): item is { deviceId: string; deviceType: string; isConnected?: boolean } =>
          Boolean(
            item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).deviceId === 'string' &&
            typeof (item as Record<string, unknown>).deviceType === 'string',
          ),
      )
    : [];
}

export async function runPhysicalRecording(
  options: PhysicalRecordingOptions,
): Promise<PhysicalRecordingSummary> {
  const duration = durationLabelForMs(options.durationMs);
  const dirs =
    options.artifactDir && options.userDataDir
      ? null
      : createIsolatedRunDirectories('kms-windows-physical');
  const artifactDir = options.artifactDir ?? dirs!.artifactDir;
  const userDataDir = options.userDataDir ?? dirs!.userDataDir;
  const prerequisite = physicalRecordingPrerequisiteFailure(options);
  if (prerequisite) {
    const summary = blockedSummary(options.durationMs, prerequisite, artifactDir);
    dirs?.cleanup();
    return summary;
  }

  let fixture: AudioFixtureManifest;
  try {
    fixture = loadAudioFixture(options.fixtureRoot ?? defaultFixtureRoot);
    validateAudioFixture(fixture);
  } catch (error) {
    const summary = blockedSummary(
      options.durationMs,
      error instanceof Error ? error.message : 'fixture_unavailable',
      artifactDir,
    );
    dirs?.cleanup();
    return summary;
  }
  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath;
  const micDeviceId = options.micDeviceId ?? process.env.KMS_MIC_DEVICE_ID!;
  const systemAudioDeviceId = options.systemAudioDeviceId ?? process.env.KMS_SYSTEM_DEVICE_ID;
  const evidence: PhysicalRecordingSummary = {
    profile: 'physical-recording',
    duration,
    status: 'FAIL',
    route: systemAudioDeviceId ? 'speaker-to-mic+loopback' : 'speaker-to-mic',
    fixtureId: fixture.fixtureId,
    wavSha256: fixture.wavSha256,
    cleanup: { status: 'unknown' },
  };
  let session: (PackagedElectronSession & { loadedTargetUrl: string }) | null = null;
  let playback: ChildProcess | null = null;
  try {
    session = await (options.launch ?? launchPackagedElectronSession)({
      exePath,
      artifactDir,
      userDataDir,
    });
    const deviceResponse = await session.invokeNative('device_enumerate');
    const devices = devicesFromPayload(deviceResponse.payload);
    if (
      !devices.some(
        (device) =>
          device.deviceId === micDeviceId &&
          device.deviceType === 'microphone' &&
          device.isConnected !== false,
      )
    )
      throw new Error('selected_mic_device_unavailable');
    if (
      systemAudioDeviceId &&
      !devices.some(
        (device) =>
          device.deviceId === systemAudioDeviceId &&
          device.deviceType === 'system_audio' &&
          device.isConnected !== false,
      )
    )
      throw new Error('selected_system_device_unavailable');
    evidence.deviceLabels = systemAudioDeviceId ? ['microphone', 'system-audio'] : ['microphone'];
    if ((await session.evaluate(selectPhysicalCaptureExpression())) !== true)
      throw new Error('physical_selector_unavailable');
    if (
      (await session.evaluate(setPhysicalDeviceExpression(micDeviceId, systemAudioDeviceId))) !==
      true
    )
      throw new Error('physical_device_selector_unavailable');
    if ((await session.evaluate(fillPhysicalTitleExpression())) !== true)
      throw new Error('synthetic_title_input_unavailable');
    if (
      (await session.evaluate(
        `(() => { const button = document.querySelector('button.record'); if (button?.textContent?.trim() !== 'Start meeting') return false; button.click(); return true; })()`,
      )) !== true
    )
      throw new Error('physical_start_button_unavailable');
    await session.pollRenderer(
      () => session!.invokeNative('capture_get_state', {}, false),
      (value) => Boolean((value as { success?: boolean }).success),
      15_000,
    );
    playback = await playFixture(fixture, options.durationMs);
    const startedAt = performance.now();
    let nextSampleAt = HEALTH_SAMPLE_INTERVAL_MS;
    const samples: Record<string, unknown>[] = [];
    const sampledBoundaries: number[] = [];
    let micPeak = 0;
    let lastMicGapCount = 0;
    let lastSystemGapCount = 0;
    let maxDriftSamples = 0;
    let eventOverruns = 0;
    while (performance.now() - startedAt < options.durationMs) {
      const elapsedBeforeWait = performance.now() - startedAt;
      await new Promise((resolvePromise) =>
        setTimeout(
          resolvePromise,
          Math.min(
            CAPTURE_STATE_POLL_INTERVAL_MS,
            Math.max(1, options.durationMs - elapsedBeforeWait),
          ),
        ),
      );
      const elapsedMs = Math.round(performance.now() - startedAt);
      const stateResponse = await session.invokeNative('capture_get_state', {}, false);
      if (!stateResponse.success) throw new Error('capture_health_unavailable');
      const state = asRecord(stateResponse.payload);
      const mic = asRecord(state.mic);
      const system = asRecord(state.sys);
      const sampleMicPeak = Number(mic.peak);
      lastMicGapCount = Number(mic.gapCount);
      lastSystemGapCount = Number(system.gapCount);
      const sampleDriftSamples = Number(state.driftSamples);
      maxDriftSamples = Math.max(maxDriftSamples, Math.abs(sampleDriftSamples));
      if (
        ![
          sampleMicPeak,
          lastMicGapCount,
          lastSystemGapCount,
          sampleDriftSamples,
          maxDriftSamples,
        ].every(Number.isFinite)
      )
        throw new Error('capture_health_payload_invalid');
      micPeak = Math.max(micPeak, sampleMicPeak);
      if (elapsedMs >= nextSampleAt) {
        const sampleDeadline = getHealthSampleDeadline(nextSampleAt, elapsedMs);
        if (sampleDeadline.missed || sampleDeadline.scheduledElapsedMs === null)
          throw new Error('health_sample_missed');
        const healthResponse = await session.invokeNative('health_check', {}, false);
        if (!healthResponse.success) throw new Error('capture_health_unavailable');
        const health = asRecord(healthResponse.payload);
        if (health.status !== 'healthy' || health.storageReady !== true)
          throw new Error('native_health_unavailable');
        eventOverruns = Math.max(eventOverruns, Number(health.eventOverruns));
        const processSample = session.sampleProcessTree(sampleDeadline.scheduledElapsedMs);
        if (!processSample.treeQuerySucceeded || !processSample.alive)
          throw new Error('process_health_unavailable');
        sampledBoundaries.push(sampleDeadline.scheduledElapsedMs);
        samples.push({
          elapsedMs,
          scheduledElapsedMs: sampleDeadline.scheduledElapsedMs,
          micPeak: sampleMicPeak,
          micGapCount: lastMicGapCount,
          systemGapCount: lastSystemGapCount,
          driftSamples: sampleDriftSamples,
          eventOverruns: Number(health.eventOverruns),
          processAlive: processSample.alive,
          processTreeQuerySucceeded: processSample.treeQuerySucceeded,
          privateWorkingSetBytes: processSample.privateWorkingSetBytes,
          cpuSeconds: processSample.cpuSeconds,
          childProcessCount: processSample.childPids.length,
        });
        evidence.healthSamples = samples.length;
        nextSampleAt += HEALTH_SAMPLE_INTERVAL_MS;
      }
      if (playback.exitCode !== null) {
        if (elapsedMs < options.durationMs) throw new Error('fixture_playback_stopped_early');
        if (playback.exitCode !== 0) throw new Error('fixture_playback_failed');
      }
    }
    stopPlayback(playback);
    playback = null;
    assertHealthSampleCoverage(sampledBoundaries, options.durationMs, HEALTH_SAMPLE_INTERVAL_MS);
    if (eventOverruns !== 0) throw new Error('native_event_overrun');
    if (lastMicGapCount + lastSystemGapCount !== 0) throw new Error('capture_gap_detected');
    if (micPeak < MIN_MIC_PEAK) throw new Error('microphone_signal_missing');
    if (
      (await session.evaluate(
        `(() => { const button = document.querySelector('button.record'); if (button?.textContent?.trim() !== 'End meeting') return false; button.click(); return true; })()`,
      )) !== true
    )
      throw new Error('physical_stop_button_unavailable');
    const finalizedValue = await session.pollRenderer(
      readFinalizedMeetingExpression(),
      (value) => parseFinalizedMeetingSummary(value) !== null,
      30_000,
    );
    const finalized = parseFinalizedMeetingSummary(finalizedValue);
    if (!finalized) throw new Error('meeting_finalize_unavailable');
    if (finalized.commitStatus !== 'clean') throw new Error('capture_finalize_not_clean');
    const captureStoppedAt = performance.now();
    const finalHealthResponse = await session.invokeNative('health_check', {}, false);
    const finalHealth = asRecord(finalHealthResponse.payload);
    if (
      !finalHealthResponse.success ||
      finalHealth.status !== 'healthy' ||
      finalHealth.storageReady !== true
    )
      throw new Error('native_health_unavailable');
    eventOverruns = Number(finalHealth.eventOverruns);
    if (!Number.isSafeInteger(eventOverruns) || eventOverruns < 0)
      throw new Error('capture_health_payload_invalid');
    const gapSummary = readPhysicalCaptureGapSummary(userDataDir, finalized.meetingId);
    evidence.gapCount = gapSummary.gapCount;
    evidence.overflowCount = gapSummary.overflowCount;
    evidence.missingFrames = gapSummary.missingFrames;
    evidence.eventOverruns = eventOverruns;
    if (gapSummary.gapCount !== 0 || lastMicGapCount + lastSystemGapCount !== 0)
      throw new Error('capture_gap_detected');
    if (gapSummary.overflowCount !== 0) throw new Error('capture_overflow_detected');
    if (eventOverruns !== 0) throw new Error('native_event_overrun');
    const captureIntegrity = await verifyPhysicalCaptureArtifacts(
      session,
      finalized.meetingId,
      finalized,
    );
    if (session.diagnostics.rendererErrors.length > 0) throw new Error('renderer_error_detected');
    if (session.diagnostics.commandErrors.length > 0)
      throw new Error('native_command_error_detected');
    evidence.micChunks = finalized.totalMicChunks;
    evidence.systemChunks = finalized.totalSysChunks;
    evidence.chunkCount = captureIntegrity.chunkCount;
    evidence.driftSamples = maxDriftSamples;
    evidence.captureIntegrity = {
      verified: true,
      manifestEntries: captureIntegrity.chunkCount,
      totalBytes: captureIntegrity.totalBytes,
      orphanCount: captureIntegrity.orphanCount,
    };
    evidence.elapsedMs = Math.round(captureStoppedAt - startedAt);
    evidence.status = classifyPhysicalRecordingResult({
      elapsedMs: evidence.elapsedMs,
      durationMs: options.durationMs,
      integrityVerified: evidence.captureIntegrity.verified,
      healthSamples: sampledBoundaries.length,
      expectedHealthSamples: options.durationMs / HEALTH_SAMPLE_INTERVAL_MS,
      cleanFinalize: finalized.commitStatus === 'clean',
      gapCount: gapSummary.gapCount,
      overflowCount: gapSummary.overflowCount,
    });
    evidence.cleanup = { status: 'pending' };
    writePipelineEvidence(artifactDir, evidence, samples);
    if (evidence.status === 'PASS') {
      await options.afterCapture?.(session, {
        meetingId: finalized.meetingId,
        fixture,
        entries: captureIntegrity.entries,
        elapsedMs: evidence.elapsedMs,
      });
    }
    return evidence;
  } catch (error) {
    evidence.failureCode = error instanceof Error ? error.message : 'physical_recording_failed';
    evidence.status = classifyPhysicalRecordingFailure(evidence.failureCode);
    writePipelineEvidence(artifactDir, evidence);
    return evidence;
  } finally {
    stopPlayback(playback);
    try {
      await session?.close();
      evidence.cleanup = { status: 'clean' };
    } catch {
      evidence.cleanup = { status: 'unknown' };
    }
    try {
      dirs?.cleanup();
    } catch {
      evidence.cleanup = { status: 'unknown' };
    }
    finalizePhysicalRecordingSummary(evidence);
    writePipelineEvidence(artifactDir, evidence);
  }
}
