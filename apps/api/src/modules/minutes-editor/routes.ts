import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '@kms/database';
import { requireIdempotencyKey } from '../../conventions/idempotency.js';
import { MinutesEditorService } from './minutes-editor-service.js';
import { SaveMinutesDocumentBodySchema, MinutesEditorVersionResponseSchema } from './dto.js';
import { mapMinutesEditorError } from './errors.js';

export interface MinutesEditorRoutesOptions {
  readonly db: Db;
}

const minutesEditorRoutesPlugin: FastifyPluginAsync<MinutesEditorRoutesOptions> = async (app, options) => {
  const service = new MinutesEditorService(options);
  type Params = { meetingId: string; documentId: string };

  app.post<{ Params: Params }>('/v1/meetings/:meetingId/editor/:documentId', async (request, reply) => {
    try {
      await requireIdempotencyKey(request);
      const body = SaveMinutesDocumentBodySchema.parse(request.body);
      const result = await service.save(
        request.authenticatedOwnerContext,
        request.params.meetingId,
        request.params.documentId,
        body.baseVersion,
        body.document,
      );
      return reply.code(201).send(MinutesEditorVersionResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapMinutesEditorError(error);
      return reply.code(mapped.statusCode).send({ error: { code: mapped.code, message: mapped.message, requestId: request.id } });
    }
  });

  app.get<{ Params: Params }>('/v1/meetings/:meetingId/editor/:documentId', async (request, reply) => {
    try {
      const result = await service.getCurrent(request.authenticatedOwnerContext, request.params.documentId);
      return reply.code(200).send(result);
    } catch (error) {
      const mapped = mapMinutesEditorError(error);
      return reply.code(mapped.statusCode).send({ error: { code: mapped.code, message: mapped.message, requestId: request.id } });
    }
  });

  app.get<{ Params: Params }>('/v1/meetings/:meetingId/editor/:documentId/history', async (request, reply) => {
    try {
      const result = await service.listVersions(request.authenticatedOwnerContext, request.params.documentId);
      return reply.code(200).send(result);
    } catch (error) {
      const mapped = mapMinutesEditorError(error);
      return reply.code(mapped.statusCode).send({ error: { code: mapped.code, message: mapped.message, requestId: request.id } });
    }
  });
};

export const minutesEditorRoutes = fp(minutesEditorRoutesPlugin);
