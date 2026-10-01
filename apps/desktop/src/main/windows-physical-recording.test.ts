import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyPhysicalRecordingResult,
  classifyPhysicalRecordingFailure,
  parseFinalizedMeetingSummary,
  physicalRecordingPrerequisiteFailure,
  readPhysicalCaptureGapSummary,
  finalizePhysicalRecordingSummary,
  verifyPhysicalCaptureArtifacts,
  runPhysicalRecording,
  waitForPhysicalCaptureStarted,
  resolveFixturePlaybackScriptPath,
  writePhysicalRecordingFailureEvidence,
  setPhysicalDeviceExpression,
  resolvePhysicalCapturePolicy,
  classifyPhysicalSourceHealth,
  waitForPhysicalCaptureSelector,
  shouldContinuePhysicalCapturePolling,
  hasRequiredCaptureGap,
} from './windows-physical-recording-runner.js';

const webmChunk = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00]);
const webmHash = createHash('sha256').update(webmChunk).digest('hex');

afterEach(() => vi.unstubAllEnvs());

function createCaptureSession(
  bytes = webmChunk,
  entryOverrides: Record<string, unknown> = {},
  orphans: string[] = [],
) {
  const entry = {
    meetingId: '58afed39-744a-49ca-9f14-984bc4e70d25',
    source: 'microphone',
    chunkIndex: 0,
    filePath: 'chunks/58afed39-744a-49ca-9f14-984bc4e70d25_microphone_000.webm',
    sha256: webmHash,
    byteLength: webmChunk.length,
    ...entryOverrides,
  };
  return {
    invokeNative: async (command: string) => {
      if (command === 'manifest_list_entries')
        return { success: true, payload: { entries: [entry] } };
      if (command === 'manifest_get_orphans') return { success: true, payload: { orphans } };
      if (command === 'storage_read')
        return {
          success: true,
          payload: { dataBase64: bytes.toString('base64'), byteLength: bytes.length },
        };
      throw new Error(`unexpected_command:${command}`);
    },
  };
}

describe('Windows physical recording profile', () => {
  it('requires system loopback signal while allowing a silent microphone for headset capture', () => {
    const policy = resolvePhysicalCapturePolicy({
      requiredSources: ['microphone', 'system_audio'],
      requireMicrophoneSignal: false,
    });
    expect(policy).toEqual({
      requiredSources: ['microphone', 'system_audio'],
      requireMicrophoneSignal: false,
      requireSystemAudioSignal: true,
    });
    expect(classifyPhysicalSourceHealth(policy, { micPeak: 0, systemPeak: 0.2 })).toBeNull();
    expect(classifyPhysicalSourceHealth(policy, { micPeak: 0, systemPeak: 0 })).toBe(
      'system_audio_signal_missing',
    );
  });

  it('clears the system-audio selector for a microphone-only run', () => {
    class FakeSelect {
      private selected = 'default';
      get value() { return this.selected; }
      set value(next: string) { this.selected = next; }
      dispatchEvent() { return true; }
    }
    const mic = new FakeSelect();
    const system = new FakeSelect();
    const document = {
      querySelector: (selector: string) =>
        selector.endsWith('(1)') ? mic : selector.endsWith('(2)') ? system : null,
    };

    expect(runInNewContext(setPhysicalDeviceExpression('mic-1'), {
      document,
      HTMLSelectElement: FakeSelect,
      Event: class {},
    })).toBe(true);
    expect(mic.value).toBe('mic-1');
    expect(system.value).toBe('');
  });

  it('preserves sanitized health samples and live gap counts when capture fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'kms-physical-failure-evidence-'));
    const evidence = {
      profile: 'physical-recording' as const,
      duration: '5m' as const,
      status: 'FAIL' as const,
      route: 'speaker-to-mic' as const,
    };
    try {
      writePhysicalRecordingFailureEvidence(root, evidence, [
        { elapsedMs: 10_000, micGapCount: 0, systemGapCount: 0, micPeak: 0.002, systemPeak: 0.1 },
        { elapsedMs: 20_000, micGapCount: 2, systemGapCount: 0, micPeak: 0.004, systemPeak: 0.3 },
      ]);
      expect(evidence).toMatchObject({
        liveMicGapCount: 2,
        liveSystemGapCount: 0,
        liveMicPeak: 0.004,
        liveSystemPeak: 0.3,
      });
      expect(readFileSync(join(root, 'metrics.ndjson'), 'utf8').trim().split('\n')).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves the executable playback script from the repository root', () => {
    expect(existsSync(resolveFixturePlaybackScriptPath())).toBe(true);
  });

  it('waits for the real recording UI before querying native capture state', async () => {
    let recordingReady = false;
    let uiPolls = 0;
    const nativeCommands: string[] = [];
    const session = {
      pollRenderer: async (expression: string, predicate: (value: boolean) => boolean) => {
        expect(expression).toContain('End meeting');
        for (const visible of [false, false, true]) {
          uiPolls += 1;
          if (predicate(visible)) {
            recordingReady = true;
            return visible;
          }
        }
        throw new Error('recording_ui_never_ready');
      },
      invokeNative: async (command: string) => {
        nativeCommands.push(command);
        if (!recordingReady) throw new Error('NOT_CAPTURING');
        return { success: true, payload: { state: 'recording' } };
      },
    };

    await waitForPhysicalCaptureStarted(session as unknown as Parameters<typeof waitForPhysicalCaptureStarted>[0]);

    expect(uiPolls).toBe(3);
    expect(nativeCommands).toEqual(['capture_get_state']);
  });

  it('waits for the physical selector to render before selecting capture mode', async () => {
    let attempts = 0;
    const session = {
      pollRenderer: async (expression: string, predicate: (value: boolean) => boolean) => {
        expect(expression).toContain('Physical Capture');
        for (const visible of [false, true]) {
          attempts += 1;
          if (predicate(visible)) return visible;
        }
        throw new Error('physical_selector_never_ready');
      },
    };

    await waitForPhysicalCaptureSelector(
      session as unknown as Parameters<typeof waitForPhysicalCaptureSelector>[0],
    );

    expect(attempts).toBe(2);
  });

  it('keeps polling through the final required health-sample boundary', () => {
    expect(shouldContinuePhysicalCapturePolling(300_000, 300_000, 300_000)).toBe(true);
    expect(shouldContinuePhysicalCapturePolling(300_001, 300_000, 310_000)).toBe(false);
  });

  it('uses finalized source gaps rather than derived timeline counters for integrity', () => {
    expect(
      hasRequiredCaptureGap({
        gapCount: 0,
        overflowCount: 0,
        missingFrames: 0,
        diagnosticCount: 12,
      }),
    ).toBe(false);
    expect(
      hasRequiredCaptureGap({
        gapCount: 0,
        overflowCount: 0,
        missingFrames: 480,
        diagnosticCount: 0,
      }),
    ).toBe(true);
    expect(
      hasRequiredCaptureGap({
        gapCount: 0,
        overflowCount: 1,
        missingFrames: 0,
        diagnosticCount: 0,
      }),
    ).toBe(true);
  });

  it('blocks before launch without explicit real-audio opt-in', () => {
    expect(
      physicalRecordingPrerequisiteFailure({
        durationMs: 300_000,
        platform: 'win32',
        allowRealAudio: false,
      }),
    ).toBe('real_audio_opt_in_required');
  });

  it('does not let a caller option bypass the required environment opt-in', () => {
    vi.stubEnv('KMS_ALLOW_REAL_AUDIO', '0');
    expect(
      physicalRecordingPrerequisiteFailure({
        durationMs: 300_000,
        platform: 'win32',
        allowRealAudio: true,
        micDeviceId: 'explicit-mic',
      }),
    ).toBe('real_audio_opt_in_required');
  });

  it('blocks before launch without an explicit microphone device', () => {
    vi.stubEnv('KMS_ALLOW_REAL_AUDIO', '1');
    expect(
      physicalRecordingPrerequisiteFailure({
        durationMs: 300_000,
        platform: 'win32',
        allowRealAudio: true,
        micDeviceId: ' ',
      }),
    ).toBe('missing_mic_device');
  });

  it('returns a sanitized BLOCKED result when physical prerequisites are absent', async () => {
    const result = await runPhysicalRecording({
      durationMs: 300_000,
      platform: 'win32',
      allowRealAudio: false,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.failureCode).toBe('real_audio_opt_in_required');
  });

  it('blocks on non-Windows hosts even when the caller omits a platform override', () => {
    expect(
      physicalRecordingPrerequisiteFailure({
        durationMs: 300_000,
        platform: 'linux',
        allowRealAudio: true,
        micDeviceId: 'explicit-mic',
      }),
    ).toBe('windows_required');
  });

  it('does not pass a full-duration run unless durable capture integrity was verified', () => {
    expect(
      classifyPhysicalRecordingResult({
        elapsedMs: 300_000,
        durationMs: 300_000,
        integrityVerified: false,
        healthSamples: 30,
        expectedHealthSamples: 30,
        cleanFinalize: true,
        gapCount: 0,
        overflowCount: 0,
      }),
    ).toBe('FAIL');
    expect(
      classifyPhysicalRecordingResult({
        elapsedMs: 300_000,
        durationMs: 300_000,
        integrityVerified: true,
        healthSamples: 30,
        expectedHealthSamples: 30,
        cleanFinalize: true,
        gapCount: 1,
        overflowCount: 1,
      }),
    ).toBe('FAIL');
  });

  it('downgrades a provisional PASS when cleanup cannot be verified', () => {
    const summary = {
      profile: 'physical-recording' as const,
      duration: '5m' as const,
      status: 'PASS' as const,
      route: 'speaker-to-mic' as const,
      cleanup: { status: 'unknown' },
    };
    expect(finalizePhysicalRecordingSummary(summary).status).toBe('FAIL');
  });

  it('reads durable gap and overflow totals from the finalized SQLite manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'kms-capture-gap-summary-'));
    const storageDir = join(root, 'native-storage');
    mkdirSync(storageDir);
    const db = new DatabaseSync(join(storageDir, 'manifest.db'));
    db.exec(
      'CREATE TABLE capture_gaps (meeting_id TEXT, source TEXT, start_frame INTEGER, end_frame INTEGER, reason TEXT)',
    );
    db.prepare('INSERT INTO capture_gaps VALUES (?, ?, ?, ?, ?)').run(
      '58afed39-744a-49ca-9f14-984bc4e70d25',
      'microphone',
      10,
      58,
      'CAPTURE_OVERFLOW:buffer',
    );
    db.prepare('INSERT INTO capture_gaps VALUES (?, ?, ?, ?, ?)').run(
      '58afed39-744a-49ca-9f14-984bc4e70d25',
      'microphone',
      58,
      70,
      'device_discontinuity',
    );
    db.prepare('INSERT INTO capture_gaps VALUES (?, ?, ?, ?, ?)').run(
      '58afed39-744a-49ca-9f14-984bc4e70d25',
      'system_audio',
      70,
      70,
      'CAPTURE_FLAG:data_discontinuity',
    );
    db.close();
    try {
      expect(readPhysicalCaptureGapSummary(root, '58afed39-744a-49ca-9f14-984bc4e70d25')).toEqual({
        gapCount: 2,
        overflowCount: 1,
        missingFrames: 60,
        diagnosticCount: 0,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies a selected device that is unavailable before capture as BLOCKED', () => {
    expect(classifyPhysicalRecordingFailure('selected_mic_device_unavailable')).toBe('BLOCKED');
    expect(classifyPhysicalRecordingFailure('capture_chunk_hash_mismatch')).toBe('FAIL');
  });

  it('accepts only a well-formed finalized meeting summary from the app', () => {
    expect(
      parseFinalizedMeetingSummary({
        meetingId: '58afed39-744a-49ca-9f14-984bc4e70d25',
        totalMicChunks: 2,
        totalSysChunks: 0,
        commitStatus: 'clean',
      }),
    ).toEqual({
      meetingId: '58afed39-744a-49ca-9f14-984bc4e70d25',
      totalMicChunks: 2,
      totalSysChunks: 0,
      commitStatus: 'clean',
    });
    expect(
      parseFinalizedMeetingSummary({
        meetingId: 'not-a-uuid',
        totalMicChunks: 0,
        totalSysChunks: 0,
        commitStatus: 'clean',
      }),
    ).toBeNull();
  });

  it('verifies committed WebM source bytes against manifest count, byte length, and SHA-256', async () => {
    const result = await verifyPhysicalCaptureArtifacts(
      createCaptureSession(),
      '58afed39-744a-49ca-9f14-984bc4e70d25',
      { totalMicChunks: 1, totalSysChunks: 0, commitStatus: 'clean' },
    );

    expect(result.entries).toEqual([
      {
        source: 'microphone',
        chunkIndex: 0,
        filePath: 'chunks/58afed39-744a-49ca-9f14-984bc4e70d25_microphone_000.webm',
        sha256: webmHash,
        byteLength: webmChunk.length,
      },
    ]);
    expect(result.chunkCount).toBe(1);
    expect(result.totalBytes).toBe(webmChunk.length);
    expect(result.orphanCount).toBe(0);
  });

  it('fails integrity verification when a stored chunk differs from its manifest hash', async () => {
    await expect(
      verifyPhysicalCaptureArtifacts(
        createCaptureSession(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x82, 0x00])),
        '58afed39-744a-49ca-9f14-984bc4e70d25',
        { totalMicChunks: 1, totalSysChunks: 0, commitStatus: 'clean' },
      ),
    ).rejects.toThrow('capture_chunk_hash_mismatch');
  });

  it('fails closed when finalized chunk counts do not match the native manifest', async () => {
    await expect(
      verifyPhysicalCaptureArtifacts(
        createCaptureSession(),
        '58afed39-744a-49ca-9f14-984bc4e70d25',
        { totalMicChunks: 2, totalSysChunks: 0, commitStatus: 'clean' },
      ),
    ).rejects.toThrow('capture_manifest_count_mismatch');
  });

  it('fails closed when an unmanifested audio chunk remains after finalization', async () => {
    await expect(
      verifyPhysicalCaptureArtifacts(
        createCaptureSession(webmChunk, {}, ['untracked.webm']),
        '58afed39-744a-49ca-9f14-984bc4e70d25',
        { totalMicChunks: 1, totalSysChunks: 0, commitStatus: 'clean' },
      ),
    ).rejects.toThrow('capture_orphan_files_found');
  });
});
