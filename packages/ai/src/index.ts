import type { DetailedMinutes, GenerateMinutesInput, MinutesSection, TranscriptSegment } from "@kms/domain";

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  generateDetailedMinutes(input: GenerateMinutesInput): Promise<DetailedMinutes>;
  healthcheck(): Promise<{ ok: boolean; message?: string }>;
}

export interface AiProviderConfig {
  provider: "mock" | "openai-compatible";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function evidence(segment: TranscriptSegment) {
  return [{ segmentId: segment.id, startMs: segment.startMs, endMs: segment.endMs }];
}

export class MockAiProvider implements AiProvider {
  readonly id = "mock";
  readonly model = "deterministic-development";

  async healthcheck() { return { ok: true }; }

  async generateDetailedMinutes(input: GenerateMinutesInput): Promise<DetailedMinutes> {
    const sections: MinutesSection[] = input.transcript.map((segment) => ({
      id: `section-${segment.id}`,
      heading: segment.speakerLabel,
      content: segment.text,
      evidence: evidence(segment),
    }));
    return {
      id: crypto.randomUUID(),
      meetingId: input.meeting.id,
      template: input.template,
      language: input.outputLanguage,
      title: input.meeting.title,
      sections,
      decisions: [],
      openQuestions: [],
      actionItems: [],
      provider: this.id,
      model: this.model,
      createdAt: new Date().toISOString(),
    };
  }
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = "openai-compatible";
  readonly model: string;
  constructor(private readonly config: Required<Pick<AiProviderConfig, "apiKey" | "baseUrl" | "model">>) {
    this.model = config.model;
  }

  async healthcheck() {
    return { ok: Boolean(this.config.apiKey && this.config.baseUrl && this.config.model) };
  }

  async generateDetailedMinutes(input: GenerateMinutesInput): Promise<DetailedMinutes> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "Create exhaustive meeting minutes. Never omit transcript content. Every claim must cite segmentId, startMs, and endMs. Mark uncertain facts as needs_confirmation. Return JSON matching DetailedMinutes.",
          },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI provider failed with status ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI provider returned no content");
    const parsed = JSON.parse(content) as DetailedMinutes;
    return { ...parsed, id: crypto.randomUUID(), meetingId: input.meeting.id, provider: this.id, model: this.model, createdAt: new Date().toISOString() };
  }
}

export function createAiProvider(config: AiProviderConfig): AiProvider {
  if (config.provider === "mock") return new MockAiProvider();
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new Error("AI_API_KEY, AI_BASE_URL and AI_MODEL are required for openai-compatible provider");
  }
  return new OpenAiCompatibleProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model });
}
