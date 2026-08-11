import { validateAiJobPolicy, type AiJobRequest } from './policy.js';
export interface AiJobProvider {
  generate(request: {
    ownerId: string;
    meetingId: string;
    model: string;
    schemaVersion: string;
    promptVersion: string;
    input: unknown;
    maxOutputTokens: number;
  }): Promise<{ output: unknown; usage: { costMicrounits: number } }>;
}
export async function runAiJob(
  request: AiJobRequest,
  provider: AiJobProvider,
  signal?: AbortSignal,
) {
  validateAiJobPolicy(request);
  if (signal?.aborted) throw new Error('cancelled');
  const result = await provider.generate({
    ownerId: request.ownerId,
    meetingId: request.meetingId,
    model: request.model,
    schemaVersion: request.schemaVersion,
    promptVersion: request.promptVersion,
    input: request.input,
    maxOutputTokens: 0,
  });
  if (result.usage.costMicrounits > request.budgetMicrounits) throw new Error('AI budget exceeded');
  return {
    ...result,
    ownerId: request.ownerId,
    meetingId: request.meetingId,
    projectionVersion: request.projectionVersion,
    completenessVersion: request.completenessVersion,
    idempotencyKey: request.idempotencyKey,
    sourceMutated: false,
  };
}
