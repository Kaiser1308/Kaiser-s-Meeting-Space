import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepeatedTranscript, loadAudioFixture, validateAudioFixture, type AudioFixtureManifest } from './windows-audio-fixture.js';
import { compareTranscript, type QualityTranscriptSegment } from './windows-transcript-quality.js';
import {
  createIsolatedRunDirectories,
  launchPackagedElectronSession,
  parseWindowsTestDuration,
  resolvePackagedSidecarPath,
  type PackagedElectronSession,
  type WindowsTestDuration,
} from './windows-test-kit.js';
import { formatMeetingMarkdown } from '../markdown-export.js';
import { writePipelineEvidence, type WindowsPipelineEvidence } from './windows-pipeline-evidence.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultExePath = resolve(currentDir, '../../dist-packaged/win-unpacked/Kaiser\'s Meeting Space.exe');
const defaultFixtureRoot = resolve(currentDir, '../../test-fixtures/synthetic-meeting');

export interface SimulatorFullPipelineOptions {
  durationMs: number;
  exePath?: string;
  fixtureRoot?: string;
  modelPath?: string;
  modelId?: string;
  language?: 'vi' | 'en';
  artifactDir?: string;
  userDataDir?: string;
  platform?: NodeJS.Platform;
  launch?: (options: { exePath: string; artifactDir: string; userDataDir: string }) => Promise<PackagedElectronSession & { loadedTargetUrl: string }>;
}

export interface FullPipelineSummary extends WindowsPipelineEvidence {
  profile: 'simulator-full';
  capture?: { iterations: number; chunkCount: number; virtualTimeMs: number; simulatorResponses: number };
  storage?: { initialized: boolean; fixtureWritten: boolean; manifestEntries: number; orphans: number };
  finalize?: { stopped: boolean; resetIdle: boolean; noActiveSession: boolean };
  reopen?: { manifestReadable: boolean; entryCount: number };
  export?: { written: boolean; bytes: number; sha256: string };
  transcript?: { wer: number; cer: number; phraseCoverage: number; timestampCoverage: number; pass: boolean; failureCodes: string[] };
}

function durationLabelForMs(durationMs: number): WindowsTestDuration {
  for (const label of ['5m', '1h', '3h', '4h'] as const) if (parseWindowsTestDuration(label).durationMs === durationMs) return label;
  throw new Error('unsupported_windows_test_duration');
}

function blockedSummary(durationMs: number, failureCode: string, artifactDir?: string): FullPipelineSummary {
  const summary: FullPipelineSummary = { profile: 'simulator-full', duration: durationLabelForMs(durationMs), status: 'BLOCKED', failureCode, cleanup: { status: 'not_started' } };
  if (artifactDir) writePipelineEvidence(artifactDir, summary);
  return summary;
}

export function simulatorFullPrerequisiteFailure(options: SimulatorFullPipelineOptions): string | null {
  if (options.platform && options.platform !== 'win32') return 'windows_required';
  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath;
  if (!existsSync(exePath)) return 'packaged_executable_unavailable';
  if (!existsSync(resolvePackagedSidecarPath(exePath))) return 'packaged_sidecar_unavailable';
  const modelPath = options.modelPath ?? process.env.KMS_LOCAL_SPEECH_MODEL_PATH;
  if (!modelPath || !existsSync(modelPath)) return 'local_speech_model_missing';
  return null;
}

function hashFile(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

function getPayloadRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function getSegments(value: unknown): QualityTranscriptSegment[] {
  const payload = getPayloadRecord(value);
  const raw = Array.isArray(payload.segments) ? payload.segments : [];
  return raw.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => ({ startMs: Number(item.startMs ?? 0), endMs: Number(item.endMs ?? 0), text: String(item.text ?? ''), speaker: item.speaker ? String(item.speaker) : undefined }));
}

export async function runSimulatorFullPipeline(options: SimulatorFullPipelineOptions): Promise<FullPipelineSummary> {
  const duration = durationLabelForMs(options.durationMs);
  const dirs = options.artifactDir && options.userDataDir ? null : createIsolatedRunDirectories('kms-windows-simulator-full');
  const artifactDir = options.artifactDir ?? dirs!.artifactDir;
  const userDataDir = options.userDataDir ?? dirs!.userDataDir;
  const prerequisite = simulatorFullPrerequisiteFailure(options);
  if (prerequisite) { const summary = blockedSummary(options.durationMs, prerequisite, artifactDir); dirs?.cleanup(); return summary; }

  let fixture: AudioFixtureManifest;
  try { fixture = loadAudioFixture(options.fixtureRoot ?? defaultFixtureRoot); validateAudioFixture(fixture); } catch (error) { const summary = blockedSummary(options.durationMs, error instanceof Error ? error.message : 'fixture_unavailable', artifactDir); dirs?.cleanup(); return summary; }
  const modelPath = options.modelPath ?? process.env.KMS_LOCAL_SPEECH_MODEL_PATH!;
  const modelSha256 = process.env.KMS_LOCAL_SPEECH_MODEL_SHA256 ?? hashFile(modelPath);
  const modelId = process.env.KMS_LOCAL_SPEECH_MODEL_ID ?? 'local-fixture-model';
  const language = options.language ?? 'en';
  const meetingId = `windows-simulator-${randomUUID()}`;
  const evidence: FullPipelineSummary = { profile: 'simulator-full', duration, status: 'FAIL', fixtureId: fixture.fixtureId, fixtureSha256: fixture.wavSha256, storage: { initialized: false, fixtureWritten: false, manifestEntries: 0, orphans: -1 }, finalize: { stopped: false, resetIdle: false, noActiveSession: false }, cleanup: { status: 'unknown' } };
  let session: (PackagedElectronSession & { loadedTargetUrl: string }) | null = null;
  const events: Record<string, unknown>[] = [];
  try {
    session = await (options.launch ?? launchPackagedElectronSession)({ exePath: options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath, artifactDir, userDataDir });
    const initialized = await session.invokeNative('storage_init');
    if (!initialized.success) throw new Error('storage_init_failed');
    evidence.storage!.initialized = true;
    const wavBytes = readFileSync(fixture.wavPath);
    const fixturePath = `fixtures/${fixture.fixtureId}.wav`;
    if (!(await session.invokeNative('storage_atomic_write', { path: fixturePath, dataBase64: wavBytes.toString('base64') })).success) throw new Error('fixture_materialization_failed');
    evidence.storage!.fixtureWritten = true;
    const modelBytes = readFileSync(modelPath);
    if (hashFile(modelPath) !== modelSha256.toLowerCase()) throw new Error('local_speech_model_hash_mismatch');
    if (!(await session.invokeNative('storage_atomic_write', { path: `models/${modelId}.bin`, dataBase64: modelBytes.toString('base64') })).success) throw new Error('model_materialization_failed');
    await session.invokeNative('manifest_init');
    if (!(await session.invokeNative('manifest_add_entry', { meetingId, source: 'synthetic-fixture', chunkIndex: 0, filePath: fixturePath, sha256: fixture.wavSha256, byteLength: wavBytes.length })).success) throw new Error('manifest_add_failed');
    evidence.storage!.manifestEntries = 1;
    if (!(await session.invokeNative('simulator_configure', { seed: 42, deviceCount: 2 })).success) throw new Error('simulator_configure_failed');
    if (!(await session.invokeNative('simulator_start_capture')).success) throw new Error('simulator_start_failed');
    const iterations = options.durationMs / 5_000;
    let chunkCount = 0;
    let virtualTimeMs = 0;
    const startedAt = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      const waitMs = startedAt + ((index + 1) * 5_000) - performance.now();
      if (waitMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs));
      const injected = await session.invokeNative('simulator_inject_event', { eventKind: 'chunk_ready', advanceMs: 5_000 });
      const injectedPayload = getPayloadRecord(injected.payload);
      virtualTimeMs = Number(injectedPayload.virtualTimeMs ?? 0);
      const state = await session.invokeNative('simulator_get_state');
      chunkCount = Number(getPayloadRecord(state.payload).chunkCount ?? 0);
      events.push({ elapsedMs: Math.round(performance.now() - startedAt), chunkCount, virtualTimeMs });
      if (virtualTimeMs !== (index + 1) * 5_000 || chunkCount !== index + 1) throw new Error('simulator_chunk_sequence_invalid');
    }
    evidence.capture = { iterations, chunkCount, virtualTimeMs, simulatorResponses: iterations + 3 };
    if (!(await session.invokeNative('simulator_stop_capture')).success) throw new Error('simulator_stop_failed');
    evidence.finalize!.stopped = true;
    if (!(await session.invokeNative('simulator_reset')).success) throw new Error('simulator_reset_failed');
    const reset = getPayloadRecord((await session.invokeNative('simulator_get_state')).payload);
    evidence.finalize!.resetIdle = String(reset.state ?? '').toLowerCase() === 'idle';
    evidence.finalize!.noActiveSession = reset.sessionId === null;
    if (!(await session.invokeNative('manifest_update_upload_status', { meetingId, source: 'synthetic-fixture', chunkIndex: 0, status: 'completed' })).success) throw new Error('manifest_finalize_failed');
    const listed = getPayloadRecord((await session.invokeNative('manifest_list_entries', { meetingId })).payload);
    const entries = Array.isArray(listed.entries) ? listed.entries : [];
    evidence.storage!.manifestEntries = entries.length;
    const orphans = getPayloadRecord((await session.invokeNative('manifest_get_orphans')).payload).orphans;
    evidence.storage!.orphans = Array.isArray(orphans) ? orphans.length : 0;
    evidence.reopen = { manifestReadable: entries.length === 1, entryCount: entries.length };
    const expected = buildRepeatedTranscript(fixture, fixture.durationMs);
    const initSpeech = await session.invokeNative('local_speech_engine_init', { modelId, language, modelPath: `models/${modelId}.bin`, modelSha256 });
    if (!initSpeech.success) throw new Error('local_speech_model_unavailable');
    const transcript = await session.invokeNative('local_speech_transcribe_window', { runId: meetingId, partIndex: 0, startMs: 0, endMs: fixture.durationMs, planHash: 'a'.repeat(64), sourcePath: fixturePath, sourceSha256: fixture.wavSha256 });
    if (!transcript.success) throw new Error('local_speech_transcription_failed');
    const quality = compareTranscript(getSegments(transcript.payload), expected.segments, { maxWer: fixture.maxWer, minPhraseCoverage: fixture.minPhraseCoverage });
    evidence.transcript = quality;
    const markdown = formatMeetingMarkdown({ id: meetingId, title: 'Synthetic meeting fixture', language: fixture.language, state: 'finalized', createdAt: new Date().toISOString(), endedAt: new Date().toISOString(), captureSources: ['mic', 'system'], timezone: 'UTC' }, getSegments(transcript.payload));
    const exportBytes = Buffer.from(markdown, 'utf8');
    const exportPath = resolve(artifactDir, 'synthetic-export.md');
    writeFileSync(exportPath, markdown, 'utf8');
    evidence.export = { written: existsSync(exportPath), bytes: exportBytes.length, sha256: hashFile(exportPath) };
    evidence.elapsedMs = Math.round(performance.now() - startedAt);
    evidence.status = quality.pass && evidence.finalize!.resetIdle && evidence.finalize!.noActiveSession && evidence.storage!.orphans === 0 ? 'PASS' : 'FAIL';
    writePipelineEvidence(artifactDir, evidence, [{ elapsedMs: evidence.elapsedMs, chunkCount }], events);
    return evidence;
  } catch (error) {
    evidence.failureCode = error instanceof Error ? error.message : 'simulator_full_pipeline_failed';
    writePipelineEvidence(artifactDir, evidence, [], events);
    return evidence;
  } finally {
    try { await session?.close(); evidence.cleanup = { status: 'clean' }; } catch { evidence.cleanup = { status: 'unknown' }; }
    writePipelineEvidence(artifactDir, evidence, [], events);
    dirs?.cleanup();
  }
}
