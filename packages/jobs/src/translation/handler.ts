export interface TranslationProvider {
  translate(request: {
    ownerId: string;
    meetingId: string;
    sourceLanguage: 'vi' | 'en';
    targetLanguage: 'vi' | 'en';
    sourceHash: string;
  }): Promise<{ translatedText: string; usage: { costMicrounits: number } }>;
}

export interface TranslationJobRequest {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly sourceLanguage: 'vi' | 'en';
  readonly targetLanguage: 'vi' | 'en';
  readonly sourceHash: string;
  readonly idempotencyKey: string;
  readonly budgetMicrounits: number;
}

export function validateTranslationJob(request: TranslationJobRequest): void {
  if (!request.ownerId || !request.meetingId || !request.idempotencyKey) {
    throw new Error('owner, meeting, and idempotency are required');
  }
  if (!request.sourceHash) throw new Error('source hash is required');
  if (request.sourceLanguage === request.targetLanguage) {
    throw new Error('source and target language must differ');
  }
  if (request.budgetMicrounits < 0) throw new Error('budget must be nonnegative');
}

export async function runTranslationJob(
  request: TranslationJobRequest,
  provider: TranslationProvider,
  signal?: AbortSignal,
) {
  validateTranslationJob(request);
  if (signal?.aborted) throw new Error('cancelled');
  const result = await provider.translate({
    ownerId: request.ownerId,
    meetingId: request.meetingId,
    sourceLanguage: request.sourceLanguage,
    targetLanguage: request.targetLanguage,
    sourceHash: request.sourceHash,
  });
  if (result.usage.costMicrounits > request.budgetMicrounits) throw new Error('translation budget exceeded');
  return {
    ...result,
    ownerId: request.ownerId,
    meetingId: request.meetingId,
    targetLanguage: request.targetLanguage,
    idempotencyKey: request.idempotencyKey,
    sourceMutated: false,
  };
}
