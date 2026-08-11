import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '@kms/database';
import { DbError } from '@kms/database';
import { requireIdempotencyKey } from '../../conventions/idempotency.js';
import { TranscriptReviewService, reviewErrorStatus } from './service.js';
import { ReviewCompareQuerySchema, ReviewRunListQuerySchema } from './dto.js';

export interface TranscriptReviewRoutesOptions {
  readonly db: Db;
}

const plugin: FastifyPluginAsync<TranscriptReviewRoutesOptions> = async (app, options) => {
  const service = new TranscriptReviewService(options.db);
  const guarded = async (request: any, reply: any, operation: () => Promise<unknown>) => {
    try {
      return reply.send(await operation());
    } catch (error) {
      const mapped = reviewErrorStatus(error);
      return reply
        .code(mapped.status)
        .send({ error: { code: mapped.code, message: mapped.message, requestId: request.id } });
    }
  };
  app.get<{ Params: { meetingId: string }; Querystring: { limit?: string; cursor?: string } }>(
    '/v1/meetings/:meetingId/transcript-runs',
    async (request, reply) =>
      guarded(request, reply, () => {
        const query = ReviewRunListQuerySchema.parse(request.query);
        return service.listRuns(
          request.authenticatedOwnerContext.ownerId,
          request.params.meetingId,
          query,
        );
      }),
  );
  app.get<{ Params: { meetingId: string; runId: string } }>(
    '/v1/meetings/:meetingId/transcript-runs/:runId',
    async (request, reply) =>
      guarded(request, reply, async () => {
        const result = await service.getRun(
          request.authenticatedOwnerContext.ownerId,
          request.params.meetingId,
          request.params.runId,
        );
        if (!result) throw new DbError('not_found');
        return result;
      }),
  );
  app.get<{ Params: { meetingId: string }; Querystring: { runIds: string } }>(
    '/v1/meetings/:meetingId/transcript-compare',
    async (request, reply) =>
      guarded(request, reply, () => {
        const query = ReviewCompareQuerySchema.parse(request.query);
        return service.compareRuns(
          request.authenticatedOwnerContext.ownerId,
          request.params.meetingId,
          query.runIds,
        );
      }),
  );
  app.post<{ Params: { meetingId: string }; Body: unknown }>(
    '/v1/meetings/:meetingId/transcript-decisions',
    async (request, reply) => {
      await requireIdempotencyKey(request);
      return guarded(request, reply, () =>
        service.decide(
          request.authenticatedOwnerContext.ownerId,
          request.params.meetingId,
          request.body,
          request.headers['idempotency-key'] as string,
        ),
      );
    },
  );
  app.post<{ Params: { meetingId: string }; Body: unknown }>(
    '/v1/meetings/:meetingId/transcript-revisions',
    async (request, reply) => {
      await requireIdempotencyKey(request);
      return guarded(request, reply, () =>
        service.revise(
          request.authenticatedOwnerContext.ownerId,
          request.params.meetingId,
          request.body,
          request.headers['idempotency-key'] as string,
        ),
      );
    },
  );
};

export const transcriptReviewRoutes = fp(plugin);
