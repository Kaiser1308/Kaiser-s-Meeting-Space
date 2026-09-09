import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAiProvider, OpenAiCompatibleProvider } from './index.js';
import { MinutesVersionSchema, type GenerateMinutesInput, type MeetingId } from '@kms/domain';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000' as MeetingId;

const baseInput: GenerateMinutesInput = {
  meeting: {
    id: MEETING_ID,
    ownerId: 'user-1',
    title: 'Sprint Planning',
    language: 'vi',
    mode: 'meeting_only',
    captureSources: ['mic'],
    speechMode: 'api',
    timezone: 'UTC',
    version: 1,
    createdAt: '2026-09-09T00:00:00.000Z',
  },
  transcript: [
    {
      id: 'seg-1',
      meetingId: MEETING_ID,
      sequence: 1,
      speakerId: 'Alice',
      language: 'vi',
      text: 'Chúng ta bắt đầu thảo luận về kế hoạch sprint mới.',
      startMs: 0,
      endMs: 4000,
      source: 'api',
      isGap: false,
      createdAt: '2026-09-09T00:00:04.000Z',
    },
  ],
  template: 'team',
  outputLanguage: 'vi',
  detailLevel: 'detailed',
};

describe('OpenAiCompatibleProvider config and healthcheck', () => {
  it('throws if missing required config for openai-compatible', () => {
    expect(() => createAiProvider({ provider: 'openai-compatible' })).toThrow(
      'AI_API_KEY, AI_BASE_URL and AI_MODEL are required for openai-compatible provider',
    );
    expect(() =>
      createAiProvider({
        provider: 'openai-compatible',
        apiKey: 'key',
      }),
    ).toThrow('AI_API_KEY, AI_BASE_URL and AI_MODEL are required for openai-compatible provider');
    expect(() =>
      createAiProvider({
        provider: 'openai-compatible',
        apiKey: 'key',
        baseUrl: 'https://example.com',
      }),
    ).toThrow('AI_API_KEY, AI_BASE_URL and AI_MODEL are required for openai-compatible provider');
  });

  it('healthcheck returns { ok: true } when config is valid', async () => {
    const provider = createAiProvider({
      provider: 'openai-compatible',
      apiKey: 'test-api-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: 'gemini-2.5-flash',
    });
    const result = await provider.healthcheck();
    expect(result).toEqual({ ok: true });
  });
});

describe('OpenAiCompatibleProvider.generateDetailedMinutes', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('generates a valid MinutesVersion with defaults when LLM returns partial JSON', async () => {
    const geminiResponsePayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              sections: [
                {
                  id: 'sec-1',
                  heading: 'Kế hoạch Sprint',
                  content: 'Thảo luận về các tính năng cần làm trong sprint tới.',
                  evidence: [
                    {
                      segmentId: 'seg-1',
                      startMs: 0,
                      endMs: 4000,
                    },
                  ],
                },
              ],
            }),
          },
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => geminiResponsePayload,
    });
    globalThis.fetch = fetchMock;

    const provider = new OpenAiCompatibleProvider({
      apiKey: 'test-gemini-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash',
    });

    const result = await provider.generateDetailedMinutes(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [calledUrl, calledInit] = call!;
    expect(calledUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(calledInit.method).toBe('POST');
    expect(calledInit.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer test-gemini-key',
    });

    const body = JSON.parse(calledInit.body);
    expect(body.model).toBe('gemini-2.5-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain(
      'Return valid JSON object with fields: template, detailLevel, outputLanguage, sections, decisions, openQuestions, actionItems.',
    );

    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.documentId).toBe(`${baseInput.meeting.id}-doc`);
    expect(result.version).toBe(1);
    expect(result.template).toBe('team');
    expect(result.detailLevel).toBe('detailed');
    expect(result.outputLanguage).toBe('vi');
    expect(result.transcriptProjection).toBe('current');
    expect(result.isComplete).toBe(true);
    expect(result.provider).toBe('openai-compatible');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.creatorId).toBe('system');
    expect(result.createdAt).toBeDefined();
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.heading).toBe('Kế hoạch Sprint');
    expect(result.decisions).toEqual([]);
    expect(result.openQuestions).toEqual([]);
    expect(result.actionItems).toEqual([]);

    const parseResult = MinutesVersionSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  it('preserves parsed values from LLM when provided', async () => {
    const fullGeminiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              version: 2,
              template: 'leadership',
              detailLevel: 'near_verbatim',
              outputLanguage: 'en',
              transcriptProjection: 'current',
              isComplete: true,
              sections: [
                {
                  id: 'sec-1',
                  heading: 'Summary',
                  content: 'High level summary.',
                  evidence: [],
                },
              ],
              decisions: [
                {
                  id: 'dec-1',
                  heading: 'Decision 1',
                  content: 'Approved architecture.',
                  evidence: [],
                },
              ],
              openQuestions: [
                {
                  id: 'q-1',
                  heading: 'Question 1',
                  content: 'Who handles migration?',
                  evidence: [],
                },
              ],
              actionItems: [
                {
                  id: 'act-1',
                  description: 'Setup repo',
                  status: 'open',
                  evidence: [],
                },
              ],
            }),
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fullGeminiResponse,
    });

    const provider = new OpenAiCompatibleProvider({
      apiKey: 'test-gemini-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: 'gemini-2.5-flash',
    });

    const result = await provider.generateDetailedMinutes(baseInput);

    expect(result.version).toBe(2);
    expect(result.template).toBe('leadership');
    expect(result.detailLevel).toBe('near_verbatim');
    expect(result.outputLanguage).toBe('en');
    expect(result.sections).toHaveLength(1);
    expect(result.decisions).toHaveLength(1);
    expect(result.openQuestions).toHaveLength(1);
    expect(result.actionItems).toHaveLength(1);

    const parseResult = MinutesVersionSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  it('throws error when fetch response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const provider = new OpenAiCompatibleProvider({
      apiKey: 'invalid-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash',
    });

    await expect(provider.generateDetailedMinutes(baseInput)).rejects.toThrow(
      'AI provider failed with status 401',
    );
  });

  it('throws error when AI provider returns empty content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    });

    const provider = new OpenAiCompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash',
    });

    await expect(provider.generateDetailedMinutes(baseInput)).rejects.toThrow(
      'AI provider returned no content',
    );
  });
});
