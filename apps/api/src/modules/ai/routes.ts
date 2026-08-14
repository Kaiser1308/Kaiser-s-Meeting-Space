import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { GenerateMinutesInput } from '@kms/domain';
import { requireIdempotencyKey } from '../../conventions/idempotency.js';
import { MinutesService, type MinutesDispatcher } from './minutes-service.js';
import { MinutesDispatchResponseSchema } from './dto.js';
import { mapAiError } from './errors.js';

export interface AiRoutesOptions {
  readonly dispatcher: MinutesDispatcher | null;
}

const aiRoutesPlugin: FastifyPluginAsync<AiRoutesOptions> = async (app, options) => {
  const service = new MinutesService(options.dispatcher);

  app.post<{ Params: { meetingId: string }; Body: GenerateMinutesInput }>(
    '/v1/meetings/:meetingId/minutes',
    async (request, reply) => {
      try {
        await requireIdempotencyKey(request);
        const result = await service.generateMinutes(
          request.authenticatedOwnerContext,
          request.params.meetingId,
          request.headers['idempotency-key'] as string,
          request.body,
        );
        return reply.code(202).send(MinutesDispatchResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapAiError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );
};

export const aiRoutes = fp(aiRoutesPlugin);
