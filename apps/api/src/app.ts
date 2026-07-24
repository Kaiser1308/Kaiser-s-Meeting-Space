import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createAiProvider } from '@kms/ai';
import { createJwtVerifier, createOidcConfig, type JwtVerificationResult } from '@kms/auth';
import { createClient } from '@kms/database';
import type { GenerateMinutesInput } from '@kms/domain';
import { apiConventions } from './conventions/index.js';
import { bearerAuth, type TokenVerifier } from './plugins/bearer-auth.js';
import { createDatabaseIdentityPersistence } from './modules/identity/database-identity-persistence.js';
import {
  IdentityResolver,
  type IdentityPersistence,
} from './modules/identity/identity-resolver.js';
import { jobRoutes } from './modules/jobs/index.js';

const databaseUrl = process.env.DATABASE_URL;
const dbClient = databaseUrl ? createClient(databaseUrl) : null;

export const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(apiConventions, { corsOrigin: process.env.CORS_ORIGIN });

function createTokenVerifier(): TokenVerifier {
  const rawIssuers = process.env.OIDC_ISSUERS_JSON;
  if (!rawIssuers) {
    return { verify: async () => ({ valid: false }) };
  }

  const config = createOidcConfig({ issuers: JSON.parse(rawIssuers) });
  const verifier = createJwtVerifier(config);
  return {
    async verify({ token }) {
      const result: JwtVerificationResult = await verifier.verify({ token });
      return { valid: result.valid, issuer: result.issuer, subject: result.subject };
    },
  };
}

function createIdentityResolver(): IdentityResolver {
  if (!databaseUrl) {
    const failClosed: IdentityPersistence = {
      async upsert() {
        throw new Error('DATABASE_URL is required for authenticated requests');
      },
    };
    return new IdentityResolver(failClosed);
  }
  return new IdentityResolver(createDatabaseIdentityPersistence(createClient(databaseUrl).db));
}

const provider = createAiProvider({
  provider: process.env.AI_PROVIDER === 'openai-compatible' ? 'openai-compatible' : 'mock',
  apiKey: process.env.AI_API_KEY,
  baseUrl: process.env.AI_BASE_URL,
  model: process.env.AI_MODEL,
});

app.get('/health', async () => ({ ok: true, ai: await provider.healthcheck() }));

await app.register(async (protectedRoutes) => {
  await protectedRoutes.register(bearerAuth, {
    verifier: createTokenVerifier(),
    identity: createIdentityResolver(),
  });

  if (dbClient) {
    await protectedRoutes.register(jobRoutes, { db: dbClient.db });
  }

  protectedRoutes.post<{ Body: GenerateMinutesInput }>(
    '/v1/minutes/generate',
    async (request, reply) => {
      if (!request.body.transcript.length)
        return reply.code(400).send({ error: 'Transcript is required' });
      const ordered = [...request.body.transcript].sort((a, b) => a.sequence - b.sequence);
      return provider.generateDetailedMinutes({
        ...request.body,
        transcript: ordered,
        detailLevel: request.body.detailLevel ?? 'detailed',
      });
    },
  );
});
