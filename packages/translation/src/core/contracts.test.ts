import { describe, it, expect } from 'vitest';
import {
  TranslationInputV1Schema,
  TranslationVersionV1Schema,
  TranslationResultV1Schema,
} from './contracts.js';
import { resolveTargetLanguage, isValidTranslationDirection } from './policy.js';

describe('TranslationInputV1Schema', () => {
  it('accepts a valid opposite-direction input', () => {
    const parsed = TranslationInputV1Schema.parse({
      version: 1,
      sourceSegmentId: 'seg-1',
      projectionVersion: 0,
      revision: 0,
      sourceTextHash: 'a'.repeat(64),
      sourceLanguage: 'vi',
      targetLanguage: 'en',
      idempotencyKey: 'k-1',
    });
    expect(parsed.targetLanguage).toBe('en');
  });

  it('rejects same-language input', () => {
    expect(() =>
      TranslationInputV1Schema.parse({
        version: 1,
        sourceSegmentId: 'seg-1',
        projectionVersion: 0,
        revision: 0,
        sourceTextHash: 'a'.repeat(64),
        sourceLanguage: 'vi',
        targetLanguage: 'vi',
        idempotencyKey: 'k-1',
      }),
    ).toThrow();
  });
});

describe('TranslationResultV1Schema', () => {
  it('requires provider/model/usage provenance', () => {
    const parsed = TranslationResultV1Schema.parse({
      translatedText: 'hello',
      provider: 'mock',
      model: 'mock-v1',
      usage: { costMicrounits: 0 },
    });
    expect(parsed.provider).toBe('mock');
  });
  it('rejects missing usage', () => {
    expect(() =>
      TranslationResultV1Schema.parse({ translatedText: 'hi', provider: 'p', model: 'm' }),
    ).toThrow();
  });
});

describe('policy helpers', () => {
  it('resolves the opposite language', () => {
    expect(resolveTargetLanguage('vi')).toBe('en');
    expect(resolveTargetLanguage('en')).toBe('vi');
  });
  it('rejects same/unknown direction', () => {
    expect(isValidTranslationDirection('vi', 'en')).toBe(true);
    expect(isValidTranslationDirection('vi', 'vi')).toBe(false);
    expect(isValidTranslationDirection('xx', 'en')).toBe(false);
  });
});
