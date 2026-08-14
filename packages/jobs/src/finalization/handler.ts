import { FinalRunPlanV1Schema, type FinalRunPlanV1 } from '@kms/domain';

export interface FinalizationRunProvider {
  runLocal(plan: FinalRunPlanV1, signal?: AbortSignal): Promise<{ partsCompleted: number; outputHash: string }>;
  runCloud(plan: FinalRunPlanV1, signal?: AbortSignal): Promise<{ partsCompleted: number; outputHash: string }>;
}

export interface FinalizationJobRequest {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly plan: FinalRunPlanV1;
  readonly idempotencyKey: string;
}

export function validateFinalizationJob(request: FinalizationJobRequest): void {
  if (!request.ownerId || !request.meetingId || !request.idempotencyKey) {
    throw new Error('owner, meeting, and idempotency are required');
  }
  FinalRunPlanV1Schema.parse(request.plan);
}

export async function runFinalizationJob(
  request: FinalizationJobRequest,
  provider: FinalizationRunProvider,
  signal?: AbortSignal,
) {
  validateFinalizationJob(request);
  if (signal?.aborted) throw new Error('cancelled');
  const result =
    request.plan.primaryAction === 'cloud'
      ? await provider.runCloud(request.plan, signal)
      : await provider.runLocal(request.plan, signal);
  return {
    ...result,
    ownerId: request.ownerId,
    meetingId: request.meetingId,
    idempotencyKey: request.idempotencyKey,
    sourceMutated: false,
  };
}
