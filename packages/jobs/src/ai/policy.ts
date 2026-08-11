export interface AiJobRequest {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly projectionVersion: number;
  readonly completenessVersion: number;
  readonly providerId: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly idempotencyKey: string;
  readonly budgetMicrounits: number;
  readonly estimatedCostMicrounits: number;
  readonly input: unknown;
}
export function validateAiJobPolicy(request: AiJobRequest): void {
  if (!request.ownerId || !request.meetingId || !request.idempotencyKey)
    throw new Error('owner, meeting, and idempotency are required');
  if (request.projectionVersion < 0 || request.completenessVersion < 0)
    throw new Error('pinned versions must be nonnegative');
  if (request.budgetMicrounits < 0 || request.estimatedCostMicrounits > request.budgetMicrounits)
    throw new Error('AI budget exceeded');
}
