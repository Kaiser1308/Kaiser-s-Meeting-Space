import type { FastifyRequest, FastifyReply } from 'fastify';
import { schema, type Db } from '@kms/database';
import { and, eq, gt } from 'drizzle-orm';

export async function handleMeetingSse(
  request: FastifyRequest<{ Params: { meetingId: string }; Headers: { 'last-event-id'?: string } }>,
  reply: FastifyReply,
  db: Db,
) {
  const meetingId = request.params.meetingId;
  const ownerCtx = request.authenticatedOwnerContext;
  const lastEventIdHeader = request.headers['last-event-id'];

  // 1. Validate cursor format if Last-Event-ID is provided
  let sequence: number | null = null;
  if (lastEventIdHeader) {
    sequence = parseInt(lastEventIdHeader, 10);
    if (isNaN(sequence)) {
      return reply.code(400).send({
        error: {
          code: 'EVENT_CURSOR_EXPIRED',
          message: 'Invalid SSE cursor format.',
          requestId: request.id,
          details: { recovery: 'RELOAD_SNAPSHOT' },
        },
      });
    }

    // Check for retention gap
    const [earliestEvent] = await db
      .select()
      .from(schema.outboxEvents)
      .where(
        and(
          eq(schema.outboxEvents.entityId, meetingId),
          eq(schema.outboxEvents.ownerId, ownerCtx.ownerId),
        ),
      )
      .orderBy(schema.outboxEvents.meetingEventSequence)
      .limit(1);

    if (earliestEvent && earliestEvent.meetingEventSequence! > sequence + 1) {
      return reply.code(400).send({
        error: {
          code: 'EVENT_CURSOR_EXPIRED',
          message:
            'Event stream cursor has expired or a gap was detected. Please reload from the current snapshot.',
          requestId: request.id,
          details: { recovery: 'RELOAD_SNAPSHOT' },
        },
      });
    }
  }

  // 2. Establish SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const heartbeat = setInterval(() => {
    reply.raw.write(': keep-alive\n\n');
  }, 15000);

  request.raw.on('close', () => {
    clearInterval(heartbeat);
  });

  // Replay missed events
  if (sequence !== null) {
    try {
      const events = await db
        .select()
        .from(schema.outboxEvents)
        .where(
          and(
            eq(schema.outboxEvents.entityId, meetingId),
            eq(schema.outboxEvents.ownerId, ownerCtx.ownerId),
            gt(schema.outboxEvents.meetingEventSequence, sequence),
          ),
        )
        .orderBy(schema.outboxEvents.meetingEventSequence);

      for (const event of events) {
        const payload = JSON.stringify(event.payload);
        const data = `id: ${event.meetingEventSequence}\nevent: ${event.eventType}\ndata: ${payload}\n\n`;

        const canWrite = reply.raw.write(data);
        if (!canWrite) {
          reply.raw.end();
          clearInterval(heartbeat);
          return;
        }
      }
    } catch (err) {
      clearInterval(heartbeat);
      throw err;
    }
  }
}
