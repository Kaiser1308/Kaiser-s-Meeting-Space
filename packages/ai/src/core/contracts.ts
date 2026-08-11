export interface GenerativeRequest {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly model: string;
  readonly schemaVersion: string;
  readonly promptVersion: string;
  readonly input: unknown;
  readonly maxOutputTokens: number;
  readonly signal?: AbortSignal;
}
export interface ProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicrounits: number;
}
export interface GenerativeResult {
  readonly output: unknown;
  readonly usage: ProviderUsage;
  readonly providerId: string;
  readonly model: string;
}
export interface GenerativeProvider {
  readonly id: string;
  generate(request: GenerativeRequest): Promise<GenerativeResult>;
  cancel(requestId: string): Promise<void>;
  healthcheck(): Promise<{ ok: boolean }>;
}
export class ProviderSafeError extends Error {
  constructor(
    readonly code:
      'timeout' | 'rate_limited' | 'malformed' | 'cancelled' | 'unavailable' | 'oversized',
  ) {
    super(code);
    this.name = 'ProviderSafeError';
  }
}
