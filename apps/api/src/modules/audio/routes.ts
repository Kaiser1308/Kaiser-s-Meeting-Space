import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '@kms/database';
import type { ObjectStore } from '@kms/storage';
import { requireIdempotencyKey } from '../../conventions/idempotency.js';
import { AudioChunkService } from './audio-chunk-service.js';
import { ManifestService } from './manifest-service.js';
import { CompleteChunkRequestSchema, RegisterChunkRequestSchema } from './dto.js';
import { mapAudioError } from './errors.js';

export interface AudioRoutesOptions {
  readonly db: Db;
  readonly objectStore: ObjectStore;
  readonly now?: () => Date;
}

const audioRoutesPlugin: FastifyPluginAsync<AudioRoutesOptions> = async (app, options) => {
  const service = new AudioChunkService(options);
  const manifestService = new ManifestService(options);

  app.post<{ Params: { meetingId: string }; Body: unknown }>(
    '/v1/meetings/:meetingId/audio/chunks/register',
    async (request, reply) => {
      try {
        await requireIdempotencyKey(request);
        const body = RegisterChunkRequestSchema.parse(request.body);
        const idempotencyKey = request.headers['idempotency-key'];
        if (typeof idempotencyKey !== 'string') throw new Error('invalid_idempotency_key');
        const result = await service.registerChunk(request.authenticatedOwnerContext, {
          meetingId: request.params.meetingId,
          idempotencyKey,
          body,
        });
        return reply.code(200).send(result);
      } catch (error) {
        const mapped = mapAudioError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );
  app.post<{
    Params: { meetingId: string; source: 'mic' | 'system'; chunkIndex: string };
    Body: unknown;
  }>(
    '/v1/meetings/:meetingId/audio/chunks/:source/:chunkIndex/complete',
    async (request, reply) => {
      try {
        await requireIdempotencyKey(request);
        const body = CompleteChunkRequestSchema.parse(request.body);
        const idempotencyKey = request.headers['idempotency-key'];
        if (typeof idempotencyKey !== 'string') throw new Error('invalid_idempotency_key');
        const chunkId = `${request.params.meetingId}/${request.params.source}/${request.params.chunkIndex}`;
        const result = await service.completeChunk(request.authenticatedOwnerContext, {
          meetingId: request.params.meetingId,
          chunkId,
          idempotencyKey,
          body,
        });
        return reply.code(200).send(result);
      } catch (error) {
        const mapped = mapAudioError(error);
        return reply
          .code(mapped.statusCode)
          .send({ error: { code: mapped.code, message: mapped.message, requestId: request.id } });
      }
    },
  );
  app.get<{ Params: { meetingId: string } }>(
    '/v1/meetings/:meetingId/audio/manifest',
    async (request, reply) => {
      try {
        const result = await manifestService.getManifest(
          request.authenticatedOwnerContext,
          request.params.meetingId,
        );
        return reply.code(200).send(result);
      } catch (error) {
        const mapped = mapAudioError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );
};

export const audioRoutes = fp(audioRoutesPlugin);
