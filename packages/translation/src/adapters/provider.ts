import type { TranslationResultV1, TranslationInputV1 } from '../core/contracts.js';

export interface TranslationProvider {
  readonly id: string;
  translate(input: TranslationInputV1, options: { signal?: AbortSignal }): Promise<TranslationResultV1>;
  healthcheck(): Promise<{ ok: boolean }>;
}

export interface TranslationSecretResolver {
  resolve(providerId: string): Promise<string | null>;
}

export async function resolveRequiredSecret(
  resolver: TranslationSecretResolver,
  providerId: string,
): Promise<string> {
  const secret = await resolver.resolve(providerId);
  if (!secret) throw new Error('missing server secret for provider ' + providerId);
  return secret;
}
