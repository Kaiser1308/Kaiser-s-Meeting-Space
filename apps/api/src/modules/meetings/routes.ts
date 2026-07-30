import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '@kms/database';
import type { ObjectStore } from '@kms/storage';
import { requireIdempotencyKey } from '../../conventions/idempotency.js';
import { MeetingService } from './meeting-service.js';
import {
  MeetingListQuerySchema,
  EndMeetingResponseSchema,
  CreateMeetingBodySchema,
  CreateMeetingResponseSchema,
  StartMeetingResponseSchema,
} from './dto.js';
import { mapMeetingError } from './errors.js';

export interface MeetingRoutesOptions {
  readonly db: Db;
  readonly objectStore?: ObjectStore;
}

const meetingRoutesPlugin: FastifyPluginAsync<MeetingRoutesOptions> = async (app, options) => {
  const service = new MeetingService(options);

  app.post('/v1/meetings', async (request, reply) => {
    try {
      await requireIdempotencyKey(request);
      const body = CreateMeetingBodySchema.parse(request.body);
      const result = await service.createMeeting(
        request.authenticatedOwnerContext,
        body,
        request.headers['idempotency-key'] as string,
      );
      return reply.code(201).send(CreateMeetingResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapMeetingError(error);
      return reply.code(mapped.statusCode).send({
        error: { code: mapped.code, message: mapped.message, requestId: request.id },
      });
    }
  });

  app.post<{ Params: { meetingId: string } }>(
    '/v1/meetings/:meetingId/start',
    async (request, reply) => {
      try {
        await requireIdempotencyKey(request);
        const result = await service.startMeeting(
          request.authenticatedOwnerContext,
          request.params.meetingId,
          request.headers['idempotency-key'] as string,
        );
        return reply.code(200).send(StartMeetingResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapMeetingError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );

  // ── GET /v1/meetings — paginated library ──

  app.get('/v1/meetings', async (request, reply) => {
    try {
      const query = MeetingListQuerySchema.parse(request.query);
      const result = await service.listMeetings(request.authenticatedOwnerContext, query);
      return reply.code(200).send(result);
    } catch (error) {
      const mapped = mapMeetingError(error);
      return reply.code(mapped.statusCode).send({
        error: { code: mapped.code, message: mapped.message, requestId: request.id },
      });
    }
  });

  // ── GET /v1/meetings/:meetingId — meeting detail ──

  app.get<{ Params: { meetingId: string } }>('/v1/meetings/:meetingId', async (request, reply) => {
    try {
      const result = await service.getMeeting(
        request.authenticatedOwnerContext,
        request.params.meetingId,
      );
      return reply.code(200).send(result);
    } catch (error) {
      const mapped = mapMeetingError(error);
      return reply.code(mapped.statusCode).send({
        error: { code: mapped.code, message: mapped.message, requestId: request.id },
      });
    }
  });

  // ── POST /v1/meetings/:meetingId/end — finalize meeting ──

  app.post<{ Params: { meetingId: string } }>(
    '/v1/meetings/:meetingId/end',
    async (request, reply) => {
      try {
        await requireIdempotencyKey(request);
        const result = await service.endMeeting(
          request.authenticatedOwnerContext,
          request.params.meetingId,
        );
        const parsed = EndMeetingResponseSchema.parse(result);
        return reply.code(200).send(parsed);
      } catch (error) {
        const mapped = mapMeetingError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );

  // ── POST /v1/meetings/:meetingId/audio/playback-url — signed playback URL ──

  app.post<{ Params: { meetingId: string }; Body: unknown }>(
    '/v1/meetings/:meetingId/audio/playback-url',
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as { source?: string; chunkIndex?: number };
        const source = (body.source as 'mic' | 'system') ?? 'mic';
        const result = await service.getPlaybackUrl(
          request.authenticatedOwnerContext,
          request.params.meetingId,
          source,
          body.chunkIndex,
        );
        return reply.code(200).send(result);
      } catch (error) {
        const mapped = mapMeetingError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, requestId: request.id },
        });
      }
    },
  );
};

export const meetingRoutes = fp(meetingRoutesPlugin);
