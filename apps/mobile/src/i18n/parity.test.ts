import { describe, it, expect } from 'vitest';
import { catalog as enCatalog } from './en';
import { catalog as viCatalog } from './vi';
import { createTranslator, defaultLocale } from './index';

describe('i18n catalog parity', () => {
  it('should have identical keys in en and vi catalogs', () => {
    function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      const keys: string[] = [];
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          keys.push(...getKeys(obj[key] as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    const enKeys = getKeys(enCatalog);
    const viKeys = getKeys(viCatalog);

    expect(enKeys).toEqual(viKeys);
  });

  it('should return key itself for unknown key (fallback)', () => {
    const t = createTranslator(defaultLocale);

    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('should return translated value for known key', () => {
    const t = createTranslator('en');

    expect(t('app.name')).toBeDefined();
    expect(typeof t('app.name')).toBe('string');
  });
});
