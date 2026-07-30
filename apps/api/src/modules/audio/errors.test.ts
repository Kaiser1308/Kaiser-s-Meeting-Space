import { DbError } from '@kms/database';
import { StorageError } from '@kms/storage';
import { describe, expect, it } from 'vitest';
import { RegisterChunkRequestSchema } from './dto.js';
import { mapAudioError } from './errors.js';

describe('mapAudioError', () => {
  it('maps registration conflicts to AUDIO_CHUNK_CONFLICT', () => {
    expect(mapAudioError(new DbError('conflict'))).toMatchObject({
      code: 'AUDIO_CHUNK_CONFLICT',
      statusCode: 409,
    });
  });

  it('maps owner-indistinguishable misses to RESOURCE_NOT_FOUND', () => {
    expect(mapAudioError(new DbError('not_found'))).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('maps validation failures without exposing input', () => {
    let failure: unknown;
    try {
      RegisterChunkRequestSchema.parse({ secretKey: 'must-not-leak' });
    } catch (error) {
      failure = error;
    }

    expect(mapAudioError(failure)).toEqual({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The request contains invalid data',
    });
  });

  it('normalizes unsafe storage failures to a content-free internal error', () => {
    const mapped = mapAudioError(
      new StorageError('invalid_key', new Error('audio/owner/meeting/mic/0.webm')),
    );
    expect(mapped).toEqual({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'An unexpected internal error occurred',
    });
    expect(JSON.stringify(mapped)).not.toContain('audio/owner');
  });
});
