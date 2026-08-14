import type { OwnerContext } from '@kms/database';
import type { GenerateMinutesInput } from '@kms/domain';
import { AiError } from './errors.js';

export interface MinutesDispatchResult {
  readonly jobId: string;
  readonly meetingId: string;
}

export interface MinutesDispatcher {
  dispatch(
    ctx: OwnerContext,
    meetingId: string,
    idempotencyKey: string,
    input: GenerateMinutesInput,
  ): Promise<MinutesDispatchResult>;
}

export class MinutesService {
  constructor(private readonly dispatcher: MinutesDispatcher | null) {}

  async generateMinutes(
    ctx: OwnerContext,
    meetingId: string,
    idempotencyKey: string,
    input: GenerateMinutesInput,
  ): Promise<MinutesDispatchResult> {
    if (!this.dispatcher) {
      // P17 boundary: fail closed when no durable job dispatcher is configured.
      throw new AiError('SERVICE_UNAVAILABLE', 'Minutes dispatcher is not configured', 503);
    }
    return this.dispatcher.dispatch(ctx, meetingId, idempotencyKey, input);
  }
}
