export interface ProviderCapability {
  readonly providerId: string;
  readonly model: string;
  readonly healthy: boolean;
  readonly deprecated: boolean;
  readonly structuredOutput: boolean;
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
  readonly residency: 'local' | 'regional' | 'global';
  readonly trainingDisclosure: 'no-training' | 'training-allowed';
  readonly retention: 'none' | 'bounded' | 'provider-default';
  readonly costMicrounitsPer1k: number;
}
export interface ProviderSelectionRequest {
  readonly providerId: string;
  readonly model: string;
  readonly requireStructured: boolean;
  readonly maxContextTokens: number;
}
export class ProviderRegistry {
  private readonly capabilities: ReadonlyMap<string, ProviderCapability>;
  constructor(capabilities: readonly ProviderCapability[]) {
    this.capabilities = new Map(
      capabilities.map((capability) => [
        `${capability.providerId}:${capability.model}`,
        Object.freeze({ ...capability }),
      ]),
    );
  }
  get(providerId: string, model: string): ProviderCapability | undefined {
    return this.capabilities.get(`${providerId}:${model}`);
  }
}
export function selectProvider(
  registry: ProviderRegistry,
  request: ProviderSelectionRequest,
): ProviderCapability {
  const capability = registry.get(request.providerId, request.model);
  if (!capability) throw new Error('provider/model is not configured');
  if (!capability.healthy || capability.deprecated)
    throw new Error('provider/model is unavailable');
  if (request.requireStructured && !capability.structuredOutput)
    throw new Error('structured output is unsupported');
  if (request.maxContextTokens > capability.maxContextTokens)
    throw new Error('context limit exceeded');
  return capability;
}
