import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDefaultModelId,
  LOCAL_MODEL_CATALOG,
  type LocalModelProfileV1,
} from '../local-speech-models.js';
import { generateExportFilename, type ExportableMeeting } from '../markdown-export.js';
import {
  buildRepeatedTranscript,
  loadAudioFixture,
  validateAudioFixture,
  type AudioFixtureManifest,
} from './windows-audio-fixture.js';
import { compareTranscript, type QualityTranscriptSegment } from './windows-transcript-quality.js';
import { createIsolatedRunDirectories, type PackagedElectronSession } from './windows-test-kit.js';
import {
  durationLabelForMs,
  physicalRecordingPrerequisiteFailure,
  runPhysicalRecording,
  type PhysicalCaptureContext,
  type PhysicalCaptureManifestEntry,
  type PhysicalCaptureSource,
  type PhysicalRecordingOptions,
  type PhysicalRecordingSummary,
} from './windows-physical-recording-runner.js';
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
const CAPTURE_DURATION_EARLY_TOLERANCE_MS = 2_000;
const CAPTURE_DURATION_LATE_TOLERANCE_MS = 10_000;
const MEETING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

export interface PhysicalFullPipelineOptions extends PhysicalRecordingOptions {
  modelPath?: string;
  modelSha256?: string;
  modelId?: string;
  language?: 'vi' | 'en';
}

export interface PhysicalFullPipelineSummary extends WindowsPipelineEvidence {
  profile: 'physical-full' | 'online-headset-full';
  recording?: PhysicalRecordingSummary;
  captureIntegrity?: { verified: boolean; microphoneChunks: number; sourceBytes: number };
  finalize?: { required: boolean; verified: boolean };
  localSpeech?: {
    initialized: boolean;
    simulated: boolean;
    chunksTranscribed: number;
    modelSha256: string;
  };
  transcript?: {
    wer: number;
    cer: number;
    phraseCoverage: number;
    timestampCoverage: number;
    pass: boolean;
    failureCodes: string[];
    decodedDurationMs: number;
    comparedDurationMs: number;
    partialTailIgnoredMs: number;
  };
  reopen?: { verified: boolean };
  export?: { verified: boolean; bytes: number; sha256: string };
}

export interface PhysicalFullAfterCaptureResult {
  captureIntegrity: { verified: true; microphoneChunks: number; sourceBytes: number };
  finalize: { required: true; verified: true };
  localSpeech: {
    initialized: true;
    simulated: false;
    chunksTranscribed: number;
    modelSha256: string;
  };
  transcript: {
    wer: number;
    cer: number;
    phraseCoverage: number;
    timestampCoverage: number;
    pass: boolean;
    failureCodes: string[];
    decodedDurationMs: number;
    comparedDurationMs: number;
    partialTailIgnoredMs: number;
  };
  reopen: { verified: true };
  export: { verified: true; bytes: number; sha256: string };
}

export interface RenderedTranscriptState {
  transcribing: boolean;
  transcribeButtonVisible: boolean;
  failure: string | null;
  durationMs: number | null;
  chunksTranscribed: number | null;
  segments: QualityTranscriptSegment[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeErrorCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(message) ? message : fallback;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function modelSettings(options: PhysicalFullPipelineOptions, language: 'vi' | 'en') {
  const config = LOCAL_MODEL_CATALOG.models[getDefaultModelId(language)];
  return {
    config,
    modelPath:
      options.modelPath ??
      process.env.KMS_LOCAL_SPEECH_MODEL_PATH ??
      resolve(currentDir, '../../../..', 'native', 'models', config.fileName),
    modelSha256:
      options.modelSha256 ?? process.env.KMS_LOCAL_SPEECH_MODEL_SHA256 ?? config.sha256,
    modelId: options.modelId ?? process.env.KMS_LOCAL_SPEECH_MODEL_ID ?? config.modelId,
  };
}

function stageAppLocalSpeechModel(
  sourcePath: string,
  userDataDir: string,
  config: LocalModelProfileV1,
): string {
  const storageRoot = resolve(userDataDir, 'native-storage');
  const stagedPath = resolve(storageRoot, config.relativePath);
  if (
    !stagedPath.startsWith(
      `${storageRoot}${process.platform === 'win32' ? '\\' : '/'}`,
    )
  ) {
    throw new Error('local_speech_model_path_invalid');
  }
  mkdirSync(dirname(stagedPath), { recursive: true });
  if (!existsSync(stagedPath)) copyFileSync(sourcePath, stagedPath);
  if (hashFile(stagedPath).toLowerCase() !== config.sha256.toLowerCase()) {
    throw new Error('local_speech_staged_model_hash_mismatch');
  }
  return stagedPath;
}

export function physicalFullPrerequisiteFailure(
  options: PhysicalFullPipelineOptions,
): string | null {
  const recordingFailure = physicalRecordingPrerequisiteFailure(options);
  if (recordingFailure) return recordingFailure;
  let fixture: AudioFixtureManifest;
  try {
    fixture = loadAudioFixture(options.fixtureRoot ?? defaultFixtureRoot);
    validateAudioFixture(fixture);
  } catch (error) {
    return safeErrorCode(error, 'fixture_unavailable');
  }
  const language = options.language ?? fixture.language;
  if (language !== fixture.language) return 'local_speech_language_mismatch';
  const { config: modelConfig, modelPath, modelSha256, modelId } =
    modelSettings(options, language);
  if (!modelPath || !existsSync(modelPath)) return 'local_speech_model_missing';
  try {
    if (!statSync(modelPath).isFile()) return 'local_speech_model_missing';
  } catch {
    return 'local_speech_model_missing';
  }
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(modelId)) return 'local_speech_model_id_invalid';
  if (modelId !== modelConfig.modelId) return 'local_speech_model_config_mismatch';
  if (!HASH_PATTERN.test(modelSha256))
    return 'local_speech_model_hash_invalid';
  try {
    if (
      modelSha256.toLowerCase() !== modelConfig.sha256.toLowerCase() ||
      hashFile(modelPath).toLowerCase() !== modelConfig.sha256.toLowerCase()
    )
      return 'local_speech_model_hash_mismatch';
  } catch {
    return 'local_speech_model_unreadable';
  }

  const exePath = options.exePath ?? process.env.KMS_PACKAGED_EXE ?? defaultExePath;
  if (!existsSync(resolve(dirname(exePath), 'resources', 'native', 'kms-native.exe')))
    return 'packaged_sidecar_unavailable';
  return null;
}

export function classifyPhysicalFullFailure(failureCode: string): 'BLOCKED' | 'FAIL' {
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
    'local_speech_model_missing',
    'local_speech_model_hash_invalid',
    'local_speech_model_hash_mismatch',
    'local_speech_model_unreadable',
    'local_speech_model_id_invalid',
    'local_speech_runtime_unavailable',
    'local_speech_runtime_prerequisite_unavailable',
    'local_speech_model_config_mismatch',
    'local_speech_language_mismatch',
  ]).has(failureCode)
    ? 'BLOCKED'
    : 'FAIL';
}

export function classifyPhysicalFullResult(input: {
  recordingPassed: boolean;
  captureVerified: boolean;
  finalizeVerified: boolean;
  localSpeechInitialized: boolean;
  localSpeechSimulated: boolean;
  transcriptPassed: boolean;
  reopenVerified: boolean;
  exportVerified: boolean;
  cleanupVerified: boolean;
}): 'PASS' | 'FAIL' {
  return input.recordingPassed &&
    input.captureVerified &&
    input.finalizeVerified &&
    input.localSpeechInitialized &&
    !input.localSpeechSimulated &&
    input.transcriptPassed &&
    input.reopenVerified &&
    input.exportVerified &&
    input.cleanupVerified
    ? 'PASS'
    : 'FAIL';
}

export function clickAppTranscribeExpression(): string {
  return `(() => { const button = document.querySelector('.btn-transcribe'); if (!(button instanceof HTMLButtonElement) || button.disabled || !button.textContent?.includes('Transcribe meeting (Local Whisper)')) return false; button.click(); return true; })()`;
}

export function readRenderedTranscriptExpression(): string {
  return `(() => { const card = document.querySelector('[data-testid="source-transcript-card"]'); const status = Array.from(document.querySelectorAll('[role="status"]')).some((item) => item.textContent?.includes('Running local Whisper model inference')); const alert = document.querySelector('[role="alert"]')?.textContent?.trim() || null; const segments = Array.from(card?.querySelectorAll('.transcript-segment') || []).map((row) => ({ startMs: Number(row.getAttribute('data-start-ms')), endMs: Number(row.getAttribute('data-end-ms')), text: Array.from(row.querySelectorAll('span')).at(-1)?.textContent?.trim() || '' })); const duration = card?.getAttribute('data-duration-ms'); const chunks = card?.getAttribute('data-chunks-transcribed'); return { transcribing: status, transcribeButtonVisible: Boolean(document.querySelector('.btn-transcribe')), failure: alert, durationMs: duration === null || duration === '' ? null : Number(duration), chunksTranscribed: chunks === null || chunks === '' ? null : Number(chunks), segments }; })()`;
}

export function parseRenderedTranscriptState(value: unknown): RenderedTranscriptState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (
    typeof state.transcribing !== 'boolean' ||
    typeof state.transcribeButtonVisible !== 'boolean' ||
    !(state.failure === null || typeof state.failure === 'string') ||
    !Array.isArray(state.segments)
  ) {
    return null;
  }
  const durationMs = state.durationMs;
  const chunksTranscribed = state.chunksTranscribed;
  if (
    !(durationMs === null || (Number.isSafeInteger(durationMs) && Number(durationMs) > 0)) ||
    !(chunksTranscribed === null || (Number.isSafeInteger(chunksTranscribed) && Number(chunksTranscribed) >= 0))
  ) {
    return null;
  }
  const segments: QualityTranscriptSegment[] = [];
  for (const value of state.segments) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const segment = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(segment.startMs) ||
      !Number.isSafeInteger(segment.endMs) ||
      Number(segment.startMs) < 0 ||
      Number(segment.endMs) <= Number(segment.startMs) ||
      typeof segment.text !== 'string' ||
      segment.text.trim().length === 0
    ) {
      return null;
    }
    segments.push({
      startMs: Number(segment.startMs),
      endMs: Number(segment.endMs),
      text: segment.text.trim(),
    });
  }
  return {
    transcribing: state.transcribing,
    transcribeButtonVisible: state.transcribeButtonVisible,
    failure: state.failure as string | null,
    durationMs: durationMs as number | null,
    chunksTranscribed: chunksTranscribed as number | null,
    segments,
  };
}

function decodeBase64(value: unknown): Buffer | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  )
    return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}

export function verifyPhysicalFullSourceChunk(
  entry: PhysicalCaptureManifestEntry,
  response: { success: boolean; payload?: unknown },
): Buffer {
  const payload = record(response.payload);
  const sourceBytes = decodeBase64(payload.dataBase64);
  if (!response.success || !sourceBytes) throw new Error('capture_chunk_unreadable');
  if (sourceBytes.length !== entry.byteLength || payload.byteLength !== entry.byteLength)
    throw new Error('capture_chunk_byte_length_mismatch');
  if (sha256(sourceBytes).toLowerCase() !== entry.sha256.toLowerCase())
    throw new Error('capture_chunk_hash_mismatch');
  if (sourceBytes.length < 4 || sourceBytes.subarray(0, 4).toString('hex') !== '1a45dfa3')
    throw new Error('capture_chunk_webm_invalid');
  return sourceBytes;
}

function sourceEntries(
  capture: PhysicalCaptureContext,
  source: PhysicalCaptureSource,
): PhysicalCaptureManifestEntry[] {
  if (!MEETING_ID_PATTERN.test(capture.meetingId) || !Array.isArray(capture.entries))
    throw new Error('capture_manifest_invalid');
  const entries = capture.entries
    .filter((entry) => entry.source === source)
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
  if (entries.length === 0) throw new Error(`capture_${source}_chunks_missing`);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (
      entry.chunkIndex !== index ||
      entry.filePath !==
        `chunks/${capture.meetingId}_${source}_${String(index).padStart(3, '0')}.webm` ||
      !HASH_PATTERN.test(entry.sha256) ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength <= 0
    ) {
      throw new Error('capture_manifest_invalid');
    }
  }
  return entries;
}

export function readTranscriptSourceSelectionExpression(source: PhysicalCaptureSource): string {
  return `(() => { const element = document.querySelector('[data-testid="transcript-source-select"]'); if (!(element instanceof HTMLSelectElement)) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; if (!setter) return false; setter.call(element, ${JSON.stringify(source)}); element.dispatchEvent(new Event('change', { bubbles: true })); return element.value === ${JSON.stringify(source)}; })()`;
}

async function reopenAndExportWithPackagedApp(
  session: PackagedElectronSession,
  capture: PhysicalCaptureContext,
  artifactDir: string,
  segments: QualityTranscriptSegment[],
): Promise<{ bytes: number; sha256: string }> {
  await session.cdp.command('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: resolve(artifactDir),
  });
  let exportPath: string | null = null;
  let exportCreated = false;
  let result: { bytes: number; sha256: string } | null = null;
  let operationFailure: unknown;
  try {
    const switched = await session.evaluate(
      `(() => { const button = Array.from(document.querySelectorAll('.tab-btn')).find((item) => item.textContent?.trim() === 'Library'); if (!button) return false; button.click(); return true; })()`,
    );
    if (switched !== true) throw new Error('library_view_unavailable');
    await session.pollRenderer(
      `(() => { const items = Array.from(document.querySelectorAll('[data-testid="library-meeting-item"]')); return items.some((item) => item.innerText.includes(${JSON.stringify(capture.meetingId)})); })()`,
      (value) => value === true,
      30_000,
    );
    const opened = await session.evaluate(
      `(() => { const item = Array.from(document.querySelectorAll('[data-testid="library-meeting-item"]')).find((candidate) => candidate.innerText.includes(${JSON.stringify(capture.meetingId)})); const button = item?.querySelector('[data-testid="open-meeting-btn"]'); if (!button) return false; button.click(); return true; })()`,
    );
    if (opened !== true) throw new Error('finalized_meeting_reopen_failed');
    const reopened = (await session.pollRenderer(
      `(() => { const card = document.querySelector('[data-testid="selected-meeting-card"]'); if (!card) return null; const id = card.querySelector('code')?.textContent?.trim() || ''; const stateRow = Array.from(card.querySelectorAll('div')).find((item) => item.textContent?.includes('State:')); return { id, text: card.innerText, state: stateRow?.innerText || '' }; })()`,
      (value) =>
        Boolean(
          value && typeof value === 'object' && (value as { id?: string }).id === capture.meetingId,
        ),
      15_000,
    )) as { id: string; text: string; state: string };
    if (!reopened.state.toLowerCase().includes('finalized'))
      throw new Error('reopened_meeting_not_finalized');
    const reopenedTranscript = await session.pollRenderer(
      readRenderedTranscriptExpression(),
      (value) => {
        const state = parseRenderedTranscriptState(value);
        return Boolean(state && state.segments.length === segments.length);
      },
      15_000,
    );
    const reopenedState = parseRenderedTranscriptState(reopenedTranscript);
    if (
      !reopenedState ||
      reopenedState.segments.some(
        (segment, index) =>
          segment.startMs !== segments[index]?.startMs ||
          segment.endMs !== segments[index]?.endMs ||
          segment.text !== segments[index]?.text,
      )
    ) {
      throw new Error('reopened_transcript_mismatch');
    }

    const title = await session.evaluate(
      `(() => document.querySelector('[data-testid="selected-meeting-card"] h3')?.textContent?.trim() || '')`,
    );
    if (typeof title !== 'string' || title.length === 0)
      throw new Error('reopened_meeting_title_missing');
    const exportMeeting: ExportableMeeting = {
      id: capture.meetingId,
      title,
      language: capture.fixture.language,
      state: 'finalized',
      createdAt: '',
      captureSources: ['mic'],
      timezone: 'UTC',
    };
    const filename = generateExportFilename(exportMeeting);
    exportPath = join(artifactDir, filename);
    if (existsSync(exportPath)) throw new Error('markdown_export_filename_collision');
    const exportClicked = await session.evaluate(
      `(() => { const card = document.querySelector('[data-testid="selected-meeting-card"]'); const button = card?.querySelector('[data-testid="export-markdown-btn"]'); if (!button) return false; button.click(); return true; })()`,
    );
    if (exportClicked !== true) throw new Error('markdown_export_button_unavailable');
    await session.pollRenderer(
      'document.body.innerText',
      (value) => typeof value === 'string' && value.includes(`Exported ${filename} successfully.`),
      20_000,
    );
    const startedAt = performance.now();
    while (performance.now() - startedAt < 30_000) {
      if (existsSync(exportPath)) {
        exportCreated = true;
        const content = readFileSync(exportPath);
        const text = content.toString('utf8');
        if (
          text.includes(`# ${title}`) &&
          text.includes(capture.meetingId) &&
          text.includes('## Source Transcript') &&
          segments.every((segment) => text.includes(segment.text))
        ) {
          result = { bytes: content.length, sha256: sha256(content) };
          break;
        }
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    if (!result) throw new Error('markdown_export_artifact_unavailable');
  } catch (error) {
    operationFailure = error;
  }

  let cleanupFailed = false;
  if (exportCreated && exportPath) {
    try {
      rmSync(exportPath);
      if (existsSync(exportPath)) cleanupFailed = true;
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed)
    throw new Error('generated_artifact_cleanup_failed', { cause: operationFailure });
  if (operationFailure) throw operationFailure;
  if (!result) throw new Error('markdown_export_artifact_unavailable');
  return result;
}

export async function runPhysicalFullAfterCapture(
  options: PhysicalFullPipelineOptions & { artifactDir: string; userDataDir: string },
  session: PackagedElectronSession,
  capture: PhysicalCaptureContext,
  transcriptSource: PhysicalCaptureSource = 'microphone',
): Promise<PhysicalFullAfterCaptureResult> {
  let fixture: AudioFixtureManifest;
  try {
    fixture = capture.fixture;
    validateAudioFixture(fixture);
  } catch {
    throw new Error('fixture_unavailable');
  }
  const entries = sourceEntries(capture, transcriptSource);
  const language = options.language ?? fixture.language;
  if (language !== fixture.language) throw new Error('local_speech_language_mismatch');
  const { config: modelConfig, modelPath, modelSha256, modelId } =
    modelSettings(options, language);
  if (!existsSync(modelPath)) throw new Error('local_speech_model_missing');
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(modelId)) throw new Error('local_speech_model_id_invalid');
  if (modelId !== modelConfig.modelId) throw new Error('local_speech_model_config_mismatch');
  if (
    !HASH_PATTERN.test(modelSha256) ||
    modelSha256.toLowerCase() !== modelConfig.sha256.toLowerCase()
  ) {
    throw new Error('local_speech_model_hash_mismatch');
  }
  let verifiedModelHash: string;
  try {
    verifiedModelHash = hashFile(modelPath);
  } catch {
    throw new Error('local_speech_model_unreadable');
  }
  if (verifiedModelHash.toLowerCase() !== modelConfig.sha256.toLowerCase()) {
    throw new Error('local_speech_model_hash_mismatch');
  }

  try {
    stageAppLocalSpeechModel(modelPath, options.userDataDir, modelConfig);
  } catch (error) {
    throw new Error('local_speech_model_materialization_failed', { cause: error });
  }

  if ((await session.evaluate(readTranscriptSourceSelectionExpression(transcriptSource))) !== true)
    throw new Error('app_transcript_source_unavailable');
  const clicked = await session.evaluate(clickAppTranscribeExpression());
  if (clicked !== true) throw new Error('app_transcribe_button_unavailable');
  const transcriptTimeoutMs = Math.max(30 * 60_000, options.durationMs * 2);
  const rawTranscriptState = await session.pollRenderer(
    readRenderedTranscriptExpression(),
    (value) => {
      const state = parseRenderedTranscriptState(value);
      return Boolean(
        state &&
          !state.transcribing &&
          (state.failure !== null || state.segments.length > 0 || !state.transcribeButtonVisible),
      );
    },
    transcriptTimeoutMs,
  );
  const transcriptState = parseRenderedTranscriptState(rawTranscriptState);
  if (!transcriptState) throw new Error('app_transcript_state_invalid');
  if (transcriptState.failure) {
    session.writeEvidence('transcript-failure', {
      source: transcriptSource,
      failure: transcriptState.failure,
      chunksTranscribed: transcriptState.chunksTranscribed,
      segmentCount: transcriptState.segments.length,
    });
    throw new Error('app_transcription_failed');
  }
  if (transcriptState.segments.length === 0) throw new Error('app_transcript_empty');
  if (
    transcriptState.durationMs === null ||
    transcriptState.chunksTranscribed !== entries.length
  ) {
    throw new Error('app_transcript_source_coverage_invalid');
  }
  const transcript = transcriptState.segments;
  const decodedDurationMs = transcriptState.durationMs;
  const chunksTranscribed = transcriptState.chunksTranscribed;
  if (
    decodedDurationMs < options.durationMs - CAPTURE_DURATION_EARLY_TOLERANCE_MS ||
    decodedDurationMs > options.durationMs + CAPTURE_DURATION_LATE_TOLERANCE_MS
  ) {
    throw new Error('captured_audio_duration_mismatch');
  }

  if (
    decodedDurationMs < options.durationMs - CAPTURE_DURATION_EARLY_TOLERANCE_MS ||
    decodedDurationMs > options.durationMs + CAPTURE_DURATION_LATE_TOLERANCE_MS
  ) {
    throw new Error('captured_audio_duration_mismatch');
  }
  const completedCycles = Math.floor(decodedDurationMs / fixture.durationMs);
  if (completedCycles < 1) throw new Error('captured_audio_duration_below_fixture_cycle');
  const comparedDurationMs = completedCycles * fixture.durationMs;
  const expected = buildRepeatedTranscript(fixture, comparedDurationMs);
  const completeCycleTranscript = transcript.filter(
    (segment) => segment.endMs <= comparedDurationMs,
  );
  const quality = compareTranscript(completeCycleTranscript, expected.segments, {
    maxWer: fixture.maxWer,
    minPhraseCoverage: fixture.minPhraseCoverage,
  });
  const transcriptEvidence = {
    ...quality,
    decodedDurationMs,
    comparedDurationMs,
    partialTailIgnoredMs: decodedDurationMs - comparedDurationMs,
  };

  const exportResult = await reopenAndExportWithPackagedApp(
    session,
    capture,
    options.artifactDir,
    transcript,
  );
  return {
    captureIntegrity: {
      verified: true,
      microphoneChunks: entries.length,
      sourceBytes: entries.reduce((total, entry) => total + entry.byteLength, 0),
    },
    finalize: { required: true, verified: true },
    localSpeech: {
      initialized: true,
      simulated: false,
      chunksTranscribed,
      modelSha256: verifiedModelHash,
    },
    transcript: transcriptEvidence,
    reopen: { verified: true },
    export: { verified: true, ...exportResult },
  };
}

function blockedSummary(
  durationMs: number,
  failureCode: string,
  artifactDir: string,
  profile: PhysicalFullPipelineSummary['profile'],
): PhysicalFullPipelineSummary {
  const summary: PhysicalFullPipelineSummary = {
    profile,
    duration: durationLabelForMs(durationMs),
    status: 'BLOCKED',
    route: 'speaker-to-mic',
    failureCode,
    cleanup: { status: 'not_started' },
  };
  writePipelineEvidence(artifactDir, summary);
  return summary;
}

export function physicalRecordingEvidenceDir(artifactDir: string): string {
  return join(artifactDir, 'recording');
}

async function runPhysicalFullPipelineForSource(
  options: PhysicalFullPipelineOptions,
  config: {
    profile: PhysicalFullPipelineSummary['profile'];
    transcriptSource: PhysicalCaptureSource;
    requiredSources?: readonly PhysicalCaptureSource[];
    requireMicrophoneSignal?: boolean;
  },
): Promise<PhysicalFullPipelineSummary> {
  const dirs =
    options.artifactDir && options.userDataDir
      ? null
      : createIsolatedRunDirectories('kms-windows-physical-full');
  const artifactDir = options.artifactDir ?? dirs!.artifactDir;
  const userDataDir = options.userDataDir ?? dirs!.userDataDir;
  const fullOptions: PhysicalFullPipelineOptions & { artifactDir: string; userDataDir: string } = {
    ...options,
    requiredSources: config.requiredSources,
    requireMicrophoneSignal: config.requireMicrophoneSignal,
    artifactDir,
    userDataDir,
  };
  const prerequisite = physicalFullPrerequisiteFailure(fullOptions);
  if (prerequisite) {
    const summary = blockedSummary(options.durationMs, prerequisite, artifactDir, config.profile);
    try {
      dirs?.cleanup();
    } catch {
      summary.cleanup = { status: 'unknown' };
    }
    return summary;
  }

  const afterCaptureResult: { value: PhysicalFullAfterCaptureResult | null } = { value: null };
  let afterCaptureFailure: string | null = null;
  let recording: PhysicalRecordingSummary;
  try {
    recording = await runPhysicalRecording({
      ...fullOptions,
      artifactDir: physicalRecordingEvidenceDir(artifactDir),
      afterCapture: async (session, capture) => {
        try {
          afterCaptureResult.value = await runPhysicalFullAfterCapture(
            fullOptions,
            session,
            capture,
            config.transcriptSource,
          );
        } catch (error) {
          afterCaptureFailure = safeErrorCode(error, 'physical_full_pipeline_failed');
        }
      },
    });
  } catch (error) {
    recording = {
      profile: 'physical-recording',
      duration: durationLabelForMs(options.durationMs),
      status: 'FAIL',
      route: options.systemAudioDeviceId ? 'speaker-to-mic+loopback' : 'speaker-to-mic',
      failureCode: safeErrorCode(error, 'physical_recording_failed'),
      cleanup: { status: 'unknown' },
    };
  }

  let cleanupVerified = recording.cleanup?.status === 'clean';
  if (dirs) {
    try {
      dirs.cleanup();
      if (existsSync(userDataDir)) cleanupVerified = false;
    } catch {
      cleanupVerified = false;
    }
  }

  const summary: PhysicalFullPipelineSummary = {
    profile: config.profile,
    duration: recording.duration,
    status: recording.status,
    route: recording.route,
    fixtureId: recording.fixtureId,
    fixtureSha256: recording.wavSha256,
    recording,
    elapsedMs: recording.elapsedMs,
    chunkCount: recording.chunkCount,
    healthSamples: recording.healthSamples,
    cleanup: {
      status: cleanupVerified ? 'clean' : 'unknown',
      userDataRemoved: dirs ? !existsSync(userDataDir) : false,
    },
  };
  if (recording.status !== 'PASS') {
    summary.failureCode = recording.failureCode ?? 'physical_recording_not_passed';
  } else if (afterCaptureFailure) {
    summary.status = classifyPhysicalFullFailure(afterCaptureFailure);
    summary.failureCode = afterCaptureFailure;
  } else if (!afterCaptureResult.value) {
    summary.status = 'FAIL';
    summary.failureCode = 'physical_full_stage_not_reached';
  } else {
    const afterCapture = afterCaptureResult.value;
    Object.assign(summary, afterCapture);
    summary.status = classifyPhysicalFullResult({
      recordingPassed: recording.status === 'PASS',
      captureVerified: afterCapture.captureIntegrity.verified,
      finalizeVerified: afterCapture.finalize.verified,
      localSpeechInitialized: afterCapture.localSpeech.initialized,
      localSpeechSimulated: afterCapture.localSpeech.simulated,
      transcriptPassed: afterCapture.transcript.pass,
      reopenVerified: afterCapture.reopen.verified,
      exportVerified: afterCapture.export.verified,
      cleanupVerified,
    });
    if (summary.status !== 'PASS')
      summary.failureCode =
        afterCapture.transcript.failureCodes[0] ?? 'physical_full_acceptance_failed';
  }
  if (!cleanupVerified) {
    summary.status = 'FAIL';
    summary.failureCode = 'cleanup_unverified';
  }
  writePipelineEvidence(artifactDir, summary);
  return summary;
}

export async function runPhysicalFullPipeline(
  options: PhysicalFullPipelineOptions,
): Promise<PhysicalFullPipelineSummary> {
  return runPhysicalFullPipelineForSource(options, {
    profile: 'physical-full',
    transcriptSource: 'microphone',
  });
}

export async function runOnlineHeadsetFullPipeline(
  options: PhysicalFullPipelineOptions,
): Promise<PhysicalFullPipelineSummary> {
  return runPhysicalFullPipelineForSource(options, {
    profile: 'online-headset-full',
    transcriptSource: 'system_audio',
    requiredSources: ['microphone', 'system_audio'],
    requireMicrophoneSignal: false,
  });
}
