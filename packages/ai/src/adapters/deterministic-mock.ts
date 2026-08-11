import {
  ProviderSafeError,
  type GenerativeProvider,
  type GenerativeRequest,
  type GenerativeResult,
} from '../core/contracts.js';
export class DeterministicGenerativeProvider implements GenerativeProvider {
  readonly id = 'deterministic-mock';
  private readonly cancelled = new Set<string>();
  async generate(request: GenerativeRequest): Promise<GenerativeResult> {
    if (request.signal?.aborted || this.cancelled.has(request.ownerId + ':' + request.meetingId))
      throw new ProviderSafeError('cancelled');
    const encoded = JSON.stringify(request.input);
    if (encoded.length > 1_000_000) throw new ProviderSafeError('oversized');
    return {
      output: {
        schemaVersion: request.schemaVersion,
        promptVersion: request.promptVersion,
        inputHash: stableHash(encoded),
      },
      usage: { inputTokens: encoded.length, outputTokens: 3, costMicrounits: 0 },
      providerId: this.id,
      model: request.model,
    };
  }
  async cancel(requestId: string): Promise<void> {
    this.cancelled.add(requestId);
  }
  async healthcheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
