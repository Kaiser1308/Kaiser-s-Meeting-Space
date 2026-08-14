import { serializeMinutesDocument, validateMinutesDocument, type MinutesDocumentV1 } from './schema.js';

/** Parse a serialized document string into a validated MinutesDocumentV1. */
export function parseMinutesDocument(serialized: string): MinutesDocumentV1 {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('invalid document JSON');
  }
  const result = validateMinutesDocument(value);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

/** Round-trip a document through JSON; throws on any invalid/unsafe content. */
export function roundTripMinutesDocument(document: MinutesDocumentV1): MinutesDocumentV1 {
  return parseMinutesDocument(serializeMinutesDocument(document));
}
