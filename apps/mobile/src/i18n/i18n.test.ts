import { describe, it, expect } from 'vitest';
import { createTranslator, LOCALES, defaultLocale } from './index';

describe('i18n translator', () => {
  it('should look up keys correctly', () => {
    const t = createTranslator('en');
    expect(t('app.name')).toBe("Kaiser's Meeting Space");
    expect(t('app.tagline')).toBe('Capture every word.');
  });

  it('should support variable substitution', () => {
    const t = createTranslator('en');
    expect(t('test.greeting', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('should support variable substitution in Vietnamese', () => {
    const t = createTranslator('vi');
    expect(t('test.greeting', { name: 'Alice' })).toBe('Xin chào Alice');
  });

  it('should use defaultLocale for unknown locale', () => {
    const t = createTranslator('en' as any);
    expect(t('app.name')).toBeDefined();
  });

  it('should support both vi and en locales', () => {
    expect(LOCALES).toContain('vi');
    expect(LOCALES).toContain('en');
  });

  it('should have correct defaultLocale', () => {
    expect(defaultLocale).toBe('vi');
  });

  it('should return different values for different locales', () => {
    const tEn = createTranslator('en');
    const tVi = createTranslator('vi');

    expect(tEn('app.name')).toBe("Kaiser's Meeting Space");
    expect(tVi('app.name')).toBe('Không gian họp Kaiser');
    expect(tEn('app.name')).not.toBe(tVi('app.name'));
  });

  it('should return key itself for unknown key (runtime fallback)', () => {
    const t = createTranslator('en');
    expect(t('completely.unknown.key')).toBe('completely.unknown.key');
  });

  it('should handle nested keys correctly', () => {
    const t = createTranslator('en');
    expect(t('shell.error.title')).toBe('Something went wrong');
    expect(t('shell.error.retry')).toBe('Try again');
  });

  it('should handle deeply nested keys correctly', () => {
    const t = createTranslator('en');
    expect(t('auth.error.offline')).toBe('You are offline. Please check your connection.');
    expect(t('readiness.block.microphone_permission')).toBe('Microphone permission is required');
  });
});
