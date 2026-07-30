import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { MeetingIdSchema, MeetingLanguageSchema } from '@kms/domain';
import { z } from 'zod';
import { createDeepgramGrant } from './deepgram-grant.js';

const DEEPGRAM_MODEL = 'nova-3';

const SpeechSessionBodySchema = z
  .object({
    language: MeetingLanguageSchema,
    sourceId: z.string().min(1),
    diarization: z.boolean().optional(),
  })
  .strict();

export interface SpeechSessionAuthorization {
  readonly language: 'vi' | 'en';
  readonly sourceIds: readonly string[];
  readonly liveCloudConsented: boolean;
}

export interface SpeechSessionAuthorizer {
  authorize(input: {
    readonly ownerId: string;
    readonly meetingId: string;
    readonly language: 'vi' | 'en';
    readonly sourceId: string;
  }): Promise<SpeechSessionAuthorization | null>;
}

export interface SpeechSessionRouteOptions {
  readonly createGrant?: () => ReturnType<typeof createDeepgramGrant>;
  readonly authorize?: SpeechSessionAuthorizer['authorize'];
}

const speechRoutesPlugin: FastifyPluginAsync<SpeechSessionRouteOptions> = async (app, options) => {
  const createGrant =
    options.createGrant ?? (() => createDeepgramGrant(process.env.DEEPGRAM_API_KEY));
  const authorize = options.authorize ?? (async () => null);

  app.post<{
    Params: { id: string };
    Body: unknown;
  }>('/v1/meetings/:id/speech-sessions', async (request, reply) => {
    const ownerCtx = request.authenticatedOwnerContext;

    if (!ownerCtx?.ownerId) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Owner context required',
          requestId: request.id,
        },
      });
    }

    const meetingId = MeetingIdSchema.safeParse(request.params.id);
    const body = SpeechSessionBodySchema.safeParse(request.body);
    if (!meetingId.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid speech session request',
          requestId: request.id,
        },
      });
    }

    let authorization: SpeechSessionAuthorization | null;
    try {
      authorization = await authorize({
        ownerId: ownerCtx.ownerId,
        meetingId: meetingId.data,
        language: body.data.language,
        sourceId: body.data.sourceId,
      });
    } catch {
      return reply.code(503).send({
        error: {
          code: 'SPEECH_AUTHORIZATION_UNAVAILABLE',
          message: 'Speech authorization is unavailable',
          requestId: request.id,
        },
      });
    }

    if (!authorization) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Meeting not found',
          requestId: request.id,
        },
      });
    }

    if (
      authorization.language !== body.data.language ||
      !authorization.sourceIds.includes(body.data.sourceId)
    ) {
      return reply.code(409).send({
        error: {
          code: 'SPEECH_SESSION_NOT_ALLOWED',
          message: 'Speech session is not allowed for this source',
          requestId: request.id,
        },
      });
    }

    if (!authorization.liveCloudConsented) {
      return reply.code(409).send({
        error: {
          code: 'SPEECH_CLOUD_CONSENT_REQUIRED',
          message: 'Cloud speech consent is required',
          requestId: request.id,
        },
      });
    }

    let grant: Awaited<ReturnType<typeof createDeepgramGrant>>;
    try {
      grant = await createGrant();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deepgram unavailable';
      const statusCode = message === 'Deepgram is not configured' ? 503 : 502;
      return reply.code(statusCode).send({
        error: {
          code:
            statusCode === 503 ? 'SPEECH_PROVIDER_NOT_CONFIGURED' : 'SPEECH_PROVIDER_UNAVAILABLE',
          message,
          requestId: request.id,
        },
      });
    }

    const expiresAt = new Date(Date.now() + grant.expiresIn * 1000).toISOString();

    return reply.code(201).send({
      token: grant.accessToken,
      meetingId: meetingId.data,
      provider: 'deepgram' as const,
      expiresAt,
      config: {
        language: body.data.language,
        diarization: !!body.data.diarization,
        model: DEEPGRAM_MODEL,
      },
    } satisfies {
      token: string;
      meetingId: string;
      provider: 'deepgram';
      expiresAt: string;
      config: { language: string; diarization: boolean; model: string };
    });
  });
};

export const speechRoutes = fp(speechRoutesPlugin);
