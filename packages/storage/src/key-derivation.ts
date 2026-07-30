import type { AudioSource } from '@kms/domain';
import { StorageError } from './errors.js';

export type StorageKey = string & { readonly __brand: 'StorageKey' };

const OWNER_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CANONICAL_KEY_REGEX =
  /^audio\/[A-Za-z0-9_-]{1,128}\/[0-9a-fA-F-]{36}\/(mic|system)\/\d+\.webm$/;

const MAX_CHUNK_INDEX = 1_000_000;
const DERIVABLE_SOURCES = new Set<AudioSource>(['mic', 'system']);

export function deriveStorageKey(
  ownerId: string,
  meetingId: string,
  source: AudioSource,
  chunkIndex: number,
): StorageKey {
  if (typeof ownerId !== 'string') {
    throw new StorageError('invalid_key');
  }
  const normalizedOwnerId = ownerId.normalize('NFC');
  if (!OWNER_ID_REGEX.test(normalizedOwnerId)) {
    throw new StorageError('invalid_key');
  }

  if (typeof meetingId !== 'string' || !UUID_REGEX.test(meetingId)) {
    throw new StorageError('invalid_key');
  }

  if (!DERIVABLE_SOURCES.has(source)) {
    throw new StorageError('invalid_key');
  }

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > MAX_CHUNK_INDEX) {
    throw new StorageError('invalid_key');
  }

  const key = `audio/${normalizedOwnerId}/${meetingId}/${source}/${chunkIndex}.webm`;
  if (!CANONICAL_KEY_REGEX.test(key)) {
    throw new StorageError('invalid_key');
  }
  return key as StorageKey;
}

export function isStorageKey(value: unknown): value is StorageKey {
  return typeof value === 'string' && CANONICAL_KEY_REGEX.test(value);
}
