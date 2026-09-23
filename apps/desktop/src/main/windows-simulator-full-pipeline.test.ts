import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeLocalSpeechModel, simulatorFullPrerequisiteFailure, runSimulatorFullPipeline } from './windows-simulator-full-pipeline-runner.js';

describe('Windows simulated full pipeline profile', () => {
  it('blocks when the local speech model is not available', () => {
    expect(simulatorFullPrerequisiteFailure({ durationMs: 300_000, platform: 'win32', modelPath: 'missing-model.bin', exePath: 'missing.exe' })).toBe('packaged_executable_unavailable');
  });

  it('returns BLOCKED instead of substituting a transcript provider', async () => {
    const result = await runSimulatorFullPipeline({ durationMs: 300_000, platform: 'win32', exePath: 'missing.exe' });
    expect(result.status).toBe('BLOCKED');
    expect(result.failureCode).toBe('packaged_executable_unavailable');
  });

  it('materializes a local model into private storage without Base64 IPC', () => {
    const root = mkdtempSync(join(tmpdir(), 'kms-model-materialization-'));
    try {
      const sourcePath = join(root, 'source-model.bin');
      writeFileSync(sourcePath, Buffer.from([0, 1, 2, 3, 255]));
      const targetPath = materializeLocalSpeechModel(sourcePath, 'whisper-large-v3-turbo-q5_0', root);

      expect(targetPath).toBe(join(root, 'native-storage', 'models', 'whisper-large-v3-turbo-q5_0.bin'));
      expect(readFileSync(targetPath)).toEqual(readFileSync(sourcePath));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unsafe model identifiers before filesystem materialization', () => {
    expect(() => materializeLocalSpeechModel('model.bin', '../escape', 'C:\\tmp\\kms-run')).toThrow('invalid_local_speech_model_id');
  });
});
