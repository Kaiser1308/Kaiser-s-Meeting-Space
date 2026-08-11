import type {
  MinutesVersion,
  GenerateMinutesInput,
  MinutesSection,
  TranscriptSegment,
} from '@kms/domain';

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  generateDetailedMinutes(input: GenerateMinutesInput): Promise<MinutesVersion>;
  healthcheck(): Promise<{ ok: boolean; message?: string }>;
}

export interface AiProviderConfig {
  provider: 'mock' | 'openai-compatible';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function evidence(segment: TranscriptSegment): import('@kms/domain').EvidenceRef[] {
  return [{ segmentId: segment.id, startMs: segment.startMs, endMs: segment.endMs }];
}

export class MockAiProvider implements AiProvider {
  readonly id = 'mock';
  readonly model = 'deterministic-development';

  async healthcheck() {
    return { ok: true };
  }

  async generateDetailedMinutes(input: GenerateMinutesInput): Promise<MinutesVersion> {
    const sections: MinutesSection[] = input.transcript.map((segment) => ({
      id: `section-${segment.id}`,
      heading: segment.speakerId,
      content: segment.text,
      evidence: evidence(segment),
    }));
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      documentId: `${input.meeting.id}-doc`,
      version: 1,
      template: input.template,
      detailLevel: input.detailLevel ?? 'detailed',
      outputLanguage: input.outputLanguage,
      transcriptProjection: 'current',
      isComplete: true,
      provider: this.id,
      model: this.model,
      creatorId: 'system',
      createdAt: now,
      sections,
      decisions: [],
      openQuestions: [],
      actionItems: [],
    };
  }
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'openai-compatible';
  readonly model: string;
  constructor(
    private readonly config: Required<Pick<AiProviderConfig, 'apiKey' | 'baseUrl' | 'model'>>,
  ) {
    this.model = config.model;
  }

  async healthcheck() {
    return { ok: Boolean(this.config.apiKey && this.config.baseUrl && this.config.model) };
  }

  async generateDetailedMinutes(input: GenerateMinutesInput): Promise<MinutesVersion> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Create exhaustive meeting minutes. Never omit transcript content. Every claim must cite segmentId, startMs, and endMs. Mark uncertain facts as needs_confirmation. Return JSON matching MinutesVersion.',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI provider failed with status ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI provider returned no content');
    const parsed = JSON.parse(content) as MinutesVersion;
    return {
      ...parsed,
      id: crypto.randomUUID(),
      documentId: `${input.meeting.id}-doc`,
      provider: this.id,
      model: this.model,
      creatorId: 'system',
      createdAt: new Date().toISOString(),
    };
  }
}

export function createAiProvider(config: AiProviderConfig): AiProvider {
  if (config.provider === 'mock') return new MockAiProvider();
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new Error(
      'AI_API_KEY, AI_BASE_URL and AI_MODEL are required for openai-compatible provider',
    );
  }
  return new OpenAiCompatibleProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });
}

export * from './core/registry.js';
export * from './validation/structured.js';
export * from './validation/citations.js';
export * from './core/contracts.js';
export { DeterministicGenerativeProvider } from './adapters/deterministic-mock.js';
