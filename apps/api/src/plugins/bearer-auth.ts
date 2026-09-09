import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  IdentityResolutionError,
  IdentityResolver,
  type AuthenticatedOwnerContext,
} from '../modules/identity/identity-resolver.js';

export interface VerifiedToken {
  readonly valid: boolean;
  readonly issuer?: string;
  readonly subject?: string;
}

export interface TokenVerifier {
  verify(options: { token: string }): Promise<VerifiedToken>;
}

export interface BearerAuthOptions {
  readonly verifier: TokenVerifier;
  readonly identity: IdentityResolver;
  readonly authMode?: 'oidc' | 'local';
}

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedOwnerContext: AuthenticatedOwnerContext;
  }
}

const bearerAuthPlugin: FastifyPluginAsync<BearerAuthOptions> = async (fastify, options) => {
  fastify.decorateRequest(
    'authenticatedOwnerContext',
    null as unknown as AuthenticatedOwnerContext,
  );
  fastify.addHook('onRequest', async (request, reply) => {
    if (options.authMode === 'local') {
      try {
        request.authenticatedOwnerContext = await options.identity.resolve({
          issuer: 'local',
          subject: 'local-dev-user',
        });
      } catch (error) {
        if (error instanceof IdentityResolutionError) {
          return reply.code(401).send({ error: 'UNAUTHENTICATED' });
        }
        return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      }
      return;
    }

    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string' ? /^Bearer ([^\s]+)$/.exec(authorization) : null;
    if (!match) return reply.code(401).send({ error: 'UNAUTHENTICATED' });

    let verified: VerifiedToken;
    try {
      verified = await options.verifier.verify({ token: match[1]! });
    } catch {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }
    if (!verified.valid || !verified.issuer || !verified.subject) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }

    try {
      request.authenticatedOwnerContext = await options.identity.resolve({
        issuer: verified.issuer,
        subject: verified.subject,
      });
    } catch (error) {
      if (error instanceof IdentityResolutionError) {
        return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      }
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }
  });
};

export const bearerAuth = fp(bearerAuthPlugin);
