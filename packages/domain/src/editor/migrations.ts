import { validateMinutesDocument, type MinutesDocumentV1 } from './schema.js';

/** Current schema version. */
export const CURRENT_EDITOR_SCHEMA_VERSION = 1 as const;

/**
 * Migrate a stored document to the current schema version. v1 is the only
 * version; a mismatched version is rejected rather than silently coerced.
 */
export function migrateMinutesDocument(value: unknown): MinutesDocumentV1 {
  const doc = value as Partial<MinutesDocumentV1>;
  if (doc.version !== CURRENT_EDITOR_SCHEMA_VERSION) {
    throw new Error('unsupported document version');
  }
  const result = validateMinutesDocument(value);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
