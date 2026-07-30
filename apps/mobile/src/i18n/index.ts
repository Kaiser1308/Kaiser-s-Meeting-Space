import { catalog as enCatalog } from './en';
import { catalog as viCatalog } from './vi';

export type Catalog = typeof enCatalog;
export type Locale = 'vi' | 'en';

export const LOCALES: Locale[] = ['vi', 'en'];
export const defaultLocale: Locale = 'vi';

export const catalogs: Record<Locale, Catalog> = {
  en: enCatalog,
  vi: viCatalog,
};

function getByKey(obj: Record<string, unknown>, key: string): string {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current === 'object' && current !== null && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
}

export function createTranslator(
  locale: Locale,
): (key: string, vars?: Record<string, string | number>) => string {
  const catalog = catalogs[locale];
  return (key: string, vars?: Record<string, string | number>): string => {
    let value = getByKey(catalog, key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  };
}
