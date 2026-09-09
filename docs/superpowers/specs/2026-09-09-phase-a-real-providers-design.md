# Phase A: Wire Real Providers — Design Spec

**Date:** 2026-09-09
**Status:** Superseded — do not execute

> **Superseded on 2026-09-09:** The owner selected the Windows desktop,
> offline-first MVP. This document is retained as historical context only.
> Do not configure providers, add cloud dependencies, or execute its tasks.
> Use [`2026-09-09-windows-offline-mvp-roadmap.md`](2026-09-09-windows-offline-mvp-roadmap.md)
> instead.
**Goal:** Make Kaiser's Meeting Space functional with real cloud providers (Gemini for AI minutes, Deepgram for speech-to-text) and a local auth bypass for personal use — without compiling the Rust native runtime.

## Context

The project has a complete architecture with mock/deterministic adapters for every provider. All domain contracts, database schema, API routes, and desktop UI are implemented. The gap is that every provider is configured to use mocks: `AI_PROVIDER=mock`, `DEEPGRAM_API_KEY=` (empty), and `OIDC_ISSUER_URL=` (empty).

This spec covers wiring real providers so the pipeline works end-to-end, even with simulated audio input (real audio capture comes in Phase B via Rust native runtime compilation).

## Scope

### In scope
- Local auth bypass (`AUTH_MODE=local`) — no OIDC provider needed
- Gemini AI provider via OpenAI-compatible endpoint — real minutes generation
- Deepgram API key configuration — real speech token brokering
- Worker `minutes_generation` job handler — real async minutes via Gemini
- End-to-end verification with simulated audio

### Out of scope
- Rust native runtime compilation (Phase B)
- Real audio capture via WASAPI (Phase B)
- Translation provider wiring (skipped by user)
- DOCX/PDF export improvements (deferred)
- OIDC identity provider setup (not needed for personal use)

## Architecture

No new packages or services. All changes are wiring/configuration within existing code:

```
Desktop (simulated mode)
  → API (auth bypass + real Gemini + real Deepgram tokens)
    → Worker (real minutes_generation handler)
      → Gemini API (generates structured minutes)
    → PostgreSQL (stores meetings, transcripts, minutes)
    → Redis (BullMQ job queue)
    → MinIO (audio chunk storage)
```

## Component Design

### 1. Auth Bypass (`AUTH_MODE=local`)

**Env var:** `AUTH_MODE=local` (default: `oidc`)

When `AUTH_MODE=local`:
- API middleware injects a static user identity on every request:
  - `userId`: `local-dev-user`
  - `email`: `dev@localhost`
  - No token verification performed
- Desktop app skips the OIDC login flow and proceeds directly to the main UI
- All meetings are owned by `local-dev-user`
- The ownership/authorization model still functions (fail-closed for any other user)

**Files:**
- `apps/api/src/app.ts` — auth mode switch in middleware setup
- `apps/api/src/middleware/` — new `local-auth.ts` middleware or modify existing auth middleware
- `.env` — add `AUTH_MODE=local`
- `apps/desktop/src/auth/auth-client.ts` — detect local mode, skip login

**Leverages:** `packages/auth/src/fixtures/local-issuer.ts` has a complete synthetic OIDC issuer if we need token generation for any downstream code that expects a real JWT.

### 2. Gemini AI Provider Configuration

**Pure configuration — no adapter code changes.**

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=<gemini-api-key>
AI_MODEL=gemini-2.0-flash
```

The existing `OpenAiCompatibleProvider` in `packages/ai/src/index.ts`:
- Sends POST to `${baseUrl}/chat/completions`
- Uses `Authorization: Bearer <key>`
- Requests `response_format: { type: 'json_object' }`
- Parses structured minutes output

**Risk:** Gemini's OpenAI-compatible endpoint may return different error codes or response shapes. The adapter's error handling should be tested and adjusted if needed.

### 3. Deepgram Speech Configuration

**Pure configuration — no code changes.**

```env
SPEECH_PROVIDER=deepgram
DEEPGRAM_API_KEY=<deepgram-api-key>
```

Existing real code:
- `packages/speech/src/deepgram/live-adapter.ts` — WebSocket client to `wss://api.deepgram.com/v1/listen`
- `apps/api/src/modules/speech/routes.ts` — `POST /v1/meetings/:id/speech-sessions` mints scoped Deepgram tokens via `https://api.deepgram.com/v1/auth/grant`

Deepgram transcription activates once real audio is available (Phase B).

### 4. Worker Minutes Generation Handler

**Replace mock `processJob()` for `minutes_generation` with real Gemini call.**

Current mock in `apps/worker/`:
```typescript
// Synthetic progress loop → { handler: "deterministic-mock" }
```

Real handler:
1. Receive job with meeting ID
2. Load transcript segments from PostgreSQL
3. Call `AiProvider.generateDetailedMinutes(transcript)` using the configured Gemini adapter
4. Store the resulting `DetailedMinutesDraftV1` in PostgreSQL
5. Return real structured output (sections, action items, decisions, citations)

**Files:**
- `apps/worker/src/` — replace/extend `processJob()` with real handler dispatch
- May need to import and instantiate `createAiProvider()` from `packages/ai`

### 5. End-to-End Verification

**Test flow:**
1. `docker compose up -d` (PostgreSQL + Redis + MinIO)
2. `pnpm dev:api` (API server with auth bypass + real providers)
3. `pnpm dev:desktop` (Electron in simulated mode)
4. Use simulator to generate transcript segments
5. Trigger "Generate Minutes" → API dispatches to worker → Gemini generates real minutes
6. Verify structured minutes appear in desktop UI with real AI-generated content

**Success criteria:**
- API health endpoint returns `{ ok: true, ai: { ok: true } }`
- `POST /v1/minutes/generate` with sample transcript returns real Gemini output
- Worker processes `minutes_generation` job with real Gemini call
- Desktop UI displays AI-generated minutes (not mock `[section]` brackets)

## Environment Variables Summary

```env
# Auth
AUTH_MODE=local

# AI (Gemini via OpenAI-compatible)
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=<gemini-key>
AI_MODEL=gemini-2.0-flash

# Speech
SPEECH_PROVIDER=deepgram
DEEPGRAM_API_KEY=<deepgram-key>

# Existing (already configured)
DATABASE_URL=postgresql://localhost:5432/kms
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=kms-dev
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
```

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Gemini OpenAI-compatible endpoint returns unexpected response format | Test with sample request first; add response normalization if needed |
| Auth bypass leaks into production | Guard with `NODE_ENV=development` check alongside `AUTH_MODE=local` |
| Worker job handler fails on real provider errors | Leverage existing retry/timeout infrastructure in BullMQ worker |
| Deepgram token grant endpoint requires specific scopes | Use the existing `createDeepgramGrant` which is already implemented for the correct scopes |
