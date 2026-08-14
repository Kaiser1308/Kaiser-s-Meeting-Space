import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createAiProvider } from '@kms/ai';
import { createJwtVerifier, createOidcConfig, type JwtVerificationResult } from '@kms/auth';
import { createClient } from '@kms/database';
import type { GenerateMinutesInput } from '@kms/domain';
import { loadStorageConfig, S3ObjectStore } from '@kms/storage';
import { apiConventions } from './conventions/index.js';
import { bearerAuth, type TokenVerifier } from './plugins/bearer-auth.js';
import { createDatabaseIdentityPersistence } from './modules/identity/database-identity-persistence.js';
import {
  IdentityResolver,
  type IdentityPersistence,
} from './modules/identity/identity-resolver.js';
import { jobRoutes } from './modules/jobs/index.js';
import { audioRoutes } from './modules/audio/index.js';
import { meetingRoutes } from './modules/meetings/index.js';
import { finalizationRoutes } from './modules/finalization/index.js';
import { speechRoutes } from './modules/speech/index.js';
import { MeetingSpeechAuthorizer } from './modules/speech/meeting-speech-authorizer.js';

const databaseUrl = process.env.DATABASE_URL;
const dbClient = databaseUrl ? createClient(databaseUrl) : null;

// Storage is optional for health/minutes-only development, but routes that
// depend on it must never be registered with an unconfigured client. Keeping
// this decision at composition time makes the runtime boundary explicit and
// prevents handlers from accidentally reaching for process.env.
const objectStore = (() => {
  try {
    return new S3ObjectStore(loadStorageConfig(process.env));
  } catch {
    return null;
  }
})();
const speechAuthorizer = dbClient ? new MeetingSpeechAuthorizer(dbClient.db) : null;

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
    await protectedRoutes.register(meetingRoutes, {
      db: dbClient.db,
      objectStore: objectStore ?? undefined,
    });
    await protectedRoutes.register(finalizationRoutes, { db: dbClient.db });
    if (objectStore) {
      await protectedRoutes.register(audioRoutes, {
        db: dbClient.db,
        objectStore,
      });
    }
  }

  await protectedRoutes.register(speechRoutes, {
    authorize: speechAuthorizer?.authorize.bind(speechAuthorizer),
  });

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
