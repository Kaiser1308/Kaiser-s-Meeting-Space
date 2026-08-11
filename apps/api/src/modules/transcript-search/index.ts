import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { TranscriptSearchQuerySchema } from '@kms/domain';
import { DbError, TranscriptSearchRepository, type Db } from '@kms/database';

export interface TranscriptSearchRoutesOptions {
  readonly db: Db;
}

const parseBoolean = (value: string | undefined) =>
  value === undefined ? undefined : z.enum(['true', 'false']).parse(value) === 'true';

const plugin: FastifyPluginAsync<TranscriptSearchRoutesOptions> = async (app, { db }) => {
  const repository = new TranscriptSearchRepository();
  app.get<{ Params: { meetingId: string }; Querystring: Record<string, string | undefined> }>(
    '/v1/meetings/:meetingId/transcript-search',
    async (request, reply) => {
      const query = request.query;
      const parsed = TranscriptSearchQuerySchema.parse({
        ownerId: request.authenticatedOwnerContext.ownerId,
        meetingId: request.params.meetingId,
        text: query.text,
        speakerId: query.speakerId,
        startMs: query.startMs === undefined ? undefined : Number(query.startMs),
        endMs: query.endMs === undefined ? undefined : Number(query.endMs),
        confidenceBelow:
          query.confidenceBelow === undefined ? undefined : Number(query.confidenceBelow),
        isGap: parseBoolean(query.isGap),
        disagreement: parseBoolean(query.disagreement),
        bookmarked: parseBoolean(query.bookmarked),
        locality: query.locality as 'local' | 'cloud' | 'source' | undefined,
        revised: parseBoolean(query.revised),
        targetLanguage: query.targetLanguage,
        cursor: query.cursor,
        limit: query.limit === undefined ? undefined : Number(query.limit),
      });
      return reply.send(await repository.search({ ownerId: parsed.ownerId }, db, parsed));
    },
  );

  app.post<{ Params: { meetingId: string; segmentId: string } }>(
    '/v1/meetings/:meetingId/transcript-search/:segmentId/bookmark',
    async (request, reply) => {
      const id = request.headers['idempotency-key'];
      if (typeof id !== 'string' || id.length === 0)
        return reply.code(400).send({ error: 'idempotency-key required' });
      try {
        await repository.addBookmark(request.authenticatedOwnerContext, db, {
          id,
          meetingId: request.params.meetingId,
          segmentId: request.params.segmentId,
        });
      } catch (error) {
        if (error instanceof DbError && error.category === 'not_found')
          return reply.code(404).send({ error: 'not found' });
        if (error instanceof DbError && error.category === 'conflict')
          return reply.code(409).send({ error: 'bookmark conflict' });
        throw error;
      }
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { meetingId: string; segmentId: string } }>(
    '/v1/meetings/:meetingId/transcript-search/:segmentId/bookmark',
    async (request, reply) => {
      try {
        await repository.removeBookmark(
          request.authenticatedOwnerContext,
          db,
          request.params.meetingId,
          request.params.segmentId,
        );
      } catch (error) {
        if (error instanceof DbError && error.category === 'not_found')
          return reply.code(404).send({ error: 'not found' });
        throw error;
      }
      return reply.code(204).send();
    },
  );
};

export const transcriptSearchRoutes = fp(plugin);
