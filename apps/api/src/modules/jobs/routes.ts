import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { JobsMetadataRepository, type Db } from '@kms/database';
import { handleMeetingSse } from './sse.js';

export interface JobRoutesOptions {
  readonly db: Db;
}

const jobRoutesPlugin: FastifyPluginAsync<JobRoutesOptions> = async (app, options) => {
  const jobsRepo = new JobsMetadataRepository();
  const db = options.db;

  app.get<{ Params: { meetingId: string }; Headers: { 'last-event-id'?: string } }>(
    '/v1/meetings/:meetingId/events',
    async (request, reply) => {
      await handleMeetingSse(request, reply, db);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/v1/jobs/:id',
    async (request, reply) => {
      const ownerCtx = request.authenticatedOwnerContext;
      const job = await jobsRepo.get(ownerCtx, db, request.params.id);
      if (!job) {
        return reply.code(404).send({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found or access denied',
            requestId: request.id,
          },
        });
      }
      return reply.code(200).send(job);
    }
  );

  app.post<{ Params: { id: string } }>(
    '/v1/jobs/:id/retry',
    async (request, reply) => {
      const ownerCtx = request.authenticatedOwnerContext;
      const freshJob = await jobsRepo.get(ownerCtx, db, request.params.id);
      if (!freshJob) {
        return reply.code(404).send({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found or access denied',
            requestId: request.id,
          },
        });
      }

      if (freshJob.state !== 'failed' && freshJob.state !== 'cancelled') {
        return reply.code(400).send({
          error: {
            code: 'JOB_INVALID_STATE',
            message: 'Only failed or cancelled jobs can be retried',
            requestId: request.id,
          },
        });
      }

      // Reset state to pending for retry
      const updated = await jobsRepo.markState(ownerCtx, db, request.params.id, 'pending');
      return reply.code(200).send(updated);
    }
  );

  app.post<{ Params: { id: string } }>(
    '/v1/jobs/:id/cancel',
    async (request, reply) => {
      const ownerCtx = request.authenticatedOwnerContext;
      const freshJob = await jobsRepo.get(ownerCtx, db, request.params.id);
      if (!freshJob) {
        return reply.code(404).send({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found or access denied',
            requestId: request.id,
          },
        });
      }

      if (freshJob.state === 'completed' || freshJob.state === 'failed') {
        return reply.code(400).send({
          error: {
            code: 'JOB_INVALID_STATE',
            message: 'Cannot cancel a terminal job',
            requestId: request.id,
          },
        });
      }

      const updated = await jobsRepo.markState(ownerCtx, db, request.params.id, 'cancelled');
      return reply.code(200).send(updated);
    }
  );
};

export const jobRoutes = fp(jobRoutesPlugin);
