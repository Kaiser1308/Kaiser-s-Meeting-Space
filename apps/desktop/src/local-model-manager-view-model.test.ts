import { describe, expect, it } from 'vitest';
import { getLocalModelAction } from './local-model-manager-view-model.js';

describe('local model manager view model', () => {
  it('offers an explicit download for an absent preferred Large model', () => {
    expect(getLocalModelAction({
      modelId: 'whisper-large-v3-turbo-q5_0',
      displayName: 'Whisper Large v3 Turbo (Q5_0)',
      languages: ['vi', 'en'],
      state: 'absent',
      downloadedBytes: 0,
      byteLength: 574_041_195,
      preferredFor: ['vi', 'en'],
    }, 'vi')).toEqual({ kind: 'download', label: 'Download' });
  });

  it('offers explicit selection only for a ready model compatible with the meeting language', () => {
    expect(getLocalModelAction({
      modelId: 'whisper-small-en-q5_1',
      displayName: 'Whisper Small English (Q5_1)',
      languages: ['en'],
      state: 'ready',
      downloadedBytes: 190_098_681,
      byteLength: 190_098_681,
      preferredFor: [],
    }, 'en')).toEqual({ kind: 'select', label: 'Use for English' });
  });

  it('shows progress state without offering a second download', () => {
    expect(getLocalModelAction({
      modelId: 'whisper-large-v3-turbo-q5_0',
      displayName: 'Whisper Large v3 Turbo (Q5_0)',
      languages: ['vi', 'en'],
      state: 'downloading',
      downloadedBytes: 64,
      byteLength: 100,
      preferredFor: ['vi', 'en'],
    }, 'vi')).toEqual({ kind: 'waiting', label: 'Downloading…' });
  });
});
