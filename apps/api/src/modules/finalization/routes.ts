import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '@kms/database';
import { requireIdempotencyKey } from '../../conventions/idempotency.js';
import { FinalizationService } from './finalization-service.js';
import { FinalizeMeetingBodySchema, FinalizationStatusResponseSchema } from './dto.js';
import { mapFinalizationError } from './errors.js';

export interface FinalizationRoutesOptions {
  readonly db: Db;
}

const finalizationRoutesPlugin: FastifyPluginAsync<FinalizationRoutesOptions> = async (app, options) => {
  const service = new FinalizationService(options);

  app.post<{ Params: { meetingId: string } }>(
    '/v1/meetings/:meetingId/finalization',
    async (request, reply) => {
      try {
        await requireIdempotencyKey(request);
        const body = FinalizeMeetingBodySchema.parse(request.body);
        const result = await service.finalize(request.authenticatedOwnerContext, request.params.meetingId, body);
        return reply.code(200).send(FinalizationStatusResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapFinalizationError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );

  app.get<{ Params: { meetingId: string } }>(
    '/v1/meetings/:meetingId/finalization',
    async (request, reply) => {
      try {
        const result = await service.getStatus(request.authenticatedOwnerContext, request.params.meetingId);
        return reply.code(200).send(FinalizationStatusResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapFinalizationError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );
};

export const finalizationRoutes = fp(finalizationRoutesPlugin);
