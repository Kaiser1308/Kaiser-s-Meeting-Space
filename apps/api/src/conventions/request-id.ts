import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

const REQUEST_ID_PATTERN = /^req_[A-Za-z0-9-]{1,96}$/;

export const requestIdPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const supplied = request.headers['x-request-id'];
    const requestId =
      typeof supplied === 'string' && REQUEST_ID_PATTERN.test(supplied)
        ? supplied
        : `req_${randomUUID()}`;
    request.id = requestId;
    reply.header('x-request-id', requestId);
  });
});
