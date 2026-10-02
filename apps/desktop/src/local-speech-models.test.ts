import { describe, expect, it } from 'vitest';
import {
  getCompatibleModel,
  getDefaultModelId,
  LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS,
  LOCAL_MODEL_CATALOG,
} from './local-speech-models.js';

describe('local speech model catalog', () => {
  it('selects verified Large Turbo as the explicit default for Vietnamese and English', () => {
    expect(getDefaultModelId('vi')).toBe('whisper-large-v3-turbo-q5_0');
    expect(getDefaultModelId('en')).toBe('whisper-large-v3-turbo-q5_0');
  });

  it('pins Large Turbo to its immutable artifact identity', () => {
    expect(LOCAL_MODEL_CATALOG.models['whisper-large-v3-turbo-q5_0']).toMatchObject({
      relativePath: 'models/whisper-large-v3-turbo-q5_0/ggml-large-v3-turbo-q5_0.bin',
      byteLength: 574_041_195,
      sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
      sourceRevision: '98aa99a0a9db05ae2342309f5096248665f7cba3',
      sourceUrl:
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/98aa99a0a9db05ae2342309f5096248665f7cba3/ggml-large-v3-turbo-q5_0.bin',
    });
    expect(LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS).toEqual(['https://huggingface.co']);
  });

  it('retains Small as an explicit compatible fallback without allowing English-only Small for Vietnamese', () => {
    expect(getCompatibleModel('whisper-small-q5_1-vi', 'vi').modelId).toBe(
      'whisper-small-q5_1-vi',
    );
    expect(() => getCompatibleModel('whisper-small-en-q5_1', 'vi')).toThrow(
      'MODEL_LANGUAGE_UNSUPPORTED',
    );
  });
});
