# AI and Speech Provider Architecture

**Status:** Draft target architecture  
**Owner:** AI Platform Engineering  
**Last reviewed:** 2026-07-21

## 1. Responsibilities

**Speech AI** handles language-specific transcription, timestamps, punctuation, confidence, diarization when supported and optional translation. **Generative AI** operates after the meeting to create detailed evidence-linked minutes and reviewable rewrite proposals. It never writes source audio/transcript records.

## 2. Speech contract

```ts
interface SpeechProvider {
  capabilities(): SpeechCapabilities;
  startSession(input: {
    meetingId: string;
    language: "vi" | "en";
    diarization: boolean;
    translationTarget?: "vi" | "en";
  }): Promise<SpeechSession>;
  transcribeFile(input: FileTranscriptionInput): Promise<TranscriptionResult>;
  healthcheck(): Promise<ProviderHealth>;
}
```

Events normalize to interim segment, final segment, speaker update, usage and safe error. Provider payloads stay inside adapters.

- Deepgram is the API realtime/diarization default.
- A Whisper-compatible local engine is optional after API capture stabilizes.
- Unsupported local diarization is declared, never silently approximated.

## 3. Generative contract

```ts
interface GenerativeProvider {
  capabilities(): GenerativeCapabilities;
  generateDetailedMinutes(input: MinutesInput): Promise<UnknownStructuredOutput>;
  proposeSectionRewrite(input: RewriteInput): Promise<UnknownStructuredOutput>;
  healthcheck(): Promise<ProviderHealth>;
}
```

Planned adapters: OpenAI-compatible, OpenAI, Anthropic, Gemini, Azure OpenAI and local Ollama-compatible endpoints.

## 4. Routing policy

Routing considers task, structured-output capability, language, privacy policy, model allowlist, context size, health and user preference.

- Account default is used unless another configured provider is explicitly selected.
- Automatic cross-provider fallback is off by default because it changes cost/data processor.
- Same-provider retry uses bounded exponential backoff.
- Cross-provider retry creates a new job/version with explicit metadata.
- Provider/model is recorded for every derived artifact.

## 5. Validation and grounding

1. Build input from meeting metadata and ordered transcript segments.
2. Chunk only when required; preserve segment boundaries and overlap metadata.
3. Request schema-constrained output at low creativity.
4. Validate JSON structure and enumerations.
5. Validate every evidence reference against meeting, segment and timestamp.
6. Mark unsupported owner/deadline/decision as `needs_confirmation`.
7. Check transcript-topic coverage; never claim completeness after failed chunks.
8. Store provider, model, prompt/schema versions and transcript projection.

Invalid output can be repaired/retried within a fixed limit. Parsing alone is not acceptance.

## 6. Prompt governance and evaluation

- Prompts are versioned and reviewed like code.
- Instructions require exhaustive minutes, no silent omission and evidence for material claims.
- Consented/synthetic Vietnamese and English evaluation sets cover meetings and edge cases.
- Model/prompt changes run coverage, evidence, hallucination, action-item and formatting regression tests.
- Production supports controlled rollout and rollback by model/prompt version.

## 7. Privacy, credentials and cost

- Keys remain in server secret storage and are redacted from logs/errors.
- Users are informed before content is sent to a newly configured third party.
- Provider retention/training terms are reviewed before enablement.
- Local providers never fall back to cloud unless enabled.
- Estimate tokens/cost before optional work; enforce concurrency and budget limits.
- Usage records contain units/provider/model/job IDs, not transcript content.
