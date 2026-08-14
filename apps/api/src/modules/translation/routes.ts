import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '@kms/database';
import { requireIdempotencyKey } from '../../conventions/idempotency.js';
import { TranslationService } from './translation-service.js';
import { TranslateBodySchema, TranslationVersionResponseSchema } from './dto.js';
import { mapTranslationError } from './errors.js';

export interface TranslationRoutesOptions {
  readonly db: Db;
}

const translationRoutesPlugin: FastifyPluginAsync<TranslationRoutesOptions> = async (app, options) => {
  const service = new TranslationService(options);

  app.post<{ Params: { meetingId: string } }>(
    '/v1/meetings/:meetingId/translations',
    async (request, reply) => {
      try {
        await requireIdempotencyKey(request);
        const body = TranslateBodySchema.parse(request.body);
        const result = await service.translate(request.authenticatedOwnerContext, request.params.meetingId, body);
        return reply.code(201).send(TranslationVersionResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapTranslationError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );

  app.get<{ Params: { meetingId: string } }>(
    '/v1/meetings/:meetingId/translations',
    async (request, reply) => {
      try {
        const result = await service.listVersions(request.authenticatedOwnerContext, request.params.meetingId);
        return reply.code(200).send(result.map((v) => TranslationVersionResponseSchema.parse(v)));
      } catch (error) {
        const mapped = mapTranslationError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );
};

export const translationRoutes = fp(translationRoutesPlugin);
