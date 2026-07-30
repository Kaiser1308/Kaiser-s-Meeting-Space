import { DbError } from '@kms/database';
import { StorageError } from '@kms/storage';
import { ZodError } from 'zod';
import { ApiConventionError } from '../../conventions/errors.js';

export interface AudioApiError {
  readonly code:
    | 'AUDIO_CHUNK_CONFLICT'
    | 'RESOURCE_NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'STORAGE_OBJECT_NOT_FOUND'
    | 'STORAGE_CHECKSUM_MISMATCH'
    | 'STORAGE_UPLOAD_FAILED'
    | 'INTERNAL_ERROR';
  readonly statusCode: 400 | 404 | 409 | 500 | 502;
  readonly message: string;
}

export function mapAudioError(error: unknown): AudioApiError {
  if (error instanceof DbError) {
    if (error.category === 'conflict' || error.category === 'immutable_violation') {
      return {
        code: 'AUDIO_CHUNK_CONFLICT',
        statusCode: 409,
        message: 'Audio chunk conflicts with an existing record',
      };
    }
    if (error.category === 'not_found') {
      return { code: 'RESOURCE_NOT_FOUND', statusCode: 404, message: 'Resource not found' };
    }
  }
  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The request contains invalid data',
    };
  }
  if (error instanceof ApiConventionError) {
    return {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The request contains invalid data',
    };
  }
  if (error instanceof StorageError) {
    if (error.category === 'object_not_found') {
      return {
        code: 'STORAGE_OBJECT_NOT_FOUND',
        statusCode: 404,
        message: 'Storage object not found',
      };
    }
    if (error.category === 'checksum_mismatch') {
      return {
        code: 'STORAGE_CHECKSUM_MISMATCH',
        statusCode: 409,
        message: 'Storage object checksum mismatch',
      };
    }
    if (
      error.category === 'upload_failed' ||
      error.category === 'provider_error' ||
      error.category === 'access_denied'
    ) {
      return {
        code: 'STORAGE_UPLOAD_FAILED',
        statusCode: 502,
        message: 'Storage operation failed',
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'An unexpected internal error occurred',
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message: 'An unexpected internal error occurred',
  };
}
