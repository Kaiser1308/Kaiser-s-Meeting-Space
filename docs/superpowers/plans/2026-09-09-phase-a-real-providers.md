# Phase A: Wire Real Providers Implementation Plan (Superseded — do not execute)

> **Superseded on 2026-09-09:** This cloud-provider plan conflicts with the
> approved Windows offline-first MVP. It is retained for historical context;
> do not configure credentials or perform its tasks. The active roadmap is
> [`../specs/2026-09-09-windows-offline-mvp-roadmap.md`](../specs/2026-09-09-windows-offline-mvp-roadmap.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kaiser's Meeting Space functional for personal local use with real Gemini AI minutes generation, Deepgram speech session brokering, a local development auth bypass, and worker minutes generation job dispatching.

**Architecture:** 
- Enable `AUTH_MODE=local` in `apps/api/src/plugins/bearer-auth.ts` and `apps/api/src/app.ts` to allow local requests without an OIDC identity provider while preserving the `AuthenticatedOwnerContext`.
- Configure `OpenAiCompatibleProvider` in `packages/ai` to connect to Google Gemini's OpenAI-compatible endpoint (`gemini-2.0-flash`), verifying response structure compatibility with `MinutesVersionSchema`.
- Configure Deepgram API credentials in `.env` and verify scoped token minting via `POST /v1/meetings/:id/speech-sessions`.
- Wire `minutes_generation` job dispatching in `apps/worker/src/worker.ts` so background jobs invoke `AiProvider.generateDetailedMinutes` rather than returning deterministic mock JSON.

**Tech Stack:** TypeScript, Fastify, BullMQ, PostgreSQL, Deepgram Live API, Google Gemini OpenAI-compatible REST API.

## Global Constraints

- Never commit secrets or actual API keys to git repositories.
- Keep audio/transcript immutable; minutes versions remain append-only.
- All code changes must pass TypeScript typecheck and linting (`pnpm typecheck`).
- Support Windows environment pathing and shell execution conventions.

---

### Task 1: Add Local Auth Bypass to API

**Files:**
- Modify: `apps/api/src/plugins/bearer-auth.ts:15-66`
- Modify: `apps/api/src/app.ts:80-90`
- Test: `apps/api/src/plugins/bearer-auth.test.ts`

**Interfaces:**
- Consumes: `AuthenticatedOwnerContext` from `apps/api/src/modules/identity/identity-resolver.ts`
- Produces: Seamless request authorization when `AUTH_MODE=local` or when Bearer token is `local-dev-token`

- [ ] **Step 1: Write the unit test for local auth bypass**

Create or update test in `apps/api/src/plugins/bearer-auth.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { bearerAuth } from './bearer-auth.js';

describe('bearerAuth with AUTH_MODE=local', () => {
  it('allows requests without Authorization header or with dummy token when authMode is local', async () => {
    const app = Fastify();
    await app.register(bearerAuth, {
      authMode: 'local',
      verifier: { verify: async () => ({ valid: false }) },
      identity: {
        resolve: async () => ({
          ownerId: '00000000-0000-0000-0000-000000000001',
          issuer: 'local',
          subject: 'local-dev-user',
        }),
      } as any,
    });

    app.get('/test-protected', async (request) => {
      return { ok: true, owner: request.authenticatedOwnerContext };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-protected',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
    expect(body.owner.subject).toBe('local-dev-user');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kms/api test bearer-auth.test.ts`
Expected: FAIL (argument `authMode` not accepted or auth fails)

- [ ] **Step 3: Implement local auth mode in `bearer-auth.ts` and `app.ts`**

Update `apps/api/src/plugins/bearer-auth.ts`:
Add `authMode?: 'oidc' | 'local'` to `BearerAuthOptions`.
In `bearerAuthPlugin`:
```typescript
if (options.authMode === 'local') {
  fastify.addHook('onRequest', async (request) => {
    request.authenticatedOwnerContext = await options.identity.resolve({
      issuer: 'local',
      subject: 'local-dev-user',
    });
  });
  return;
}
```

In `apps/api/src/app.ts`:
Pass `authMode: (process.env.AUTH_MODE === 'local' ? 'local' : 'oidc')` into `bearerAuth` registration options.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kms/api test bearer-auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/bearer-auth.ts apps/api/src/plugins/bearer-auth.test.ts apps/api/src/app.ts
git commit -m "feat(api): add local development auth bypass mode"
```

---

### Task 2: Configure and Verify Gemini AI Provider

**Files:**
- Modify: `.env`
- Modify: `packages/ai/src/index.ts:70-120`
- Test: `packages/ai/src/gemini.test.ts`

**Interfaces:**
- Consumes: `GenerateMinutesInput`, `MinutesVersion` from `@kms/domain`
- Produces: `OpenAiCompatibleProvider.generateDetailedMinutes` valid against Gemini's OpenAI compatibility layer

- [ ] **Step 1: Write integration test for Gemini / OpenAI-compatible minutes generation**

Create `packages/ai/src/gemini.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createAiProvider } from './index.js';
import type { GenerateMinutesInput } from '@kms/domain';

describe('OpenAiCompatibleProvider format test', () => {
  it('instantiates correctly and validates required options', () => {
    expect(() =>
      createAiProvider({
        provider: 'openai-compatible',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Update `.env` with Gemini credentials and OpenAI-compatible endpoint**

Set in `.env`:
```env
AUTH_MODE=local
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=<user_gemini_key>
AI_MODEL=gemini-2.0-flash
```

- [ ] **Step 3: Enhance `OpenAiCompatibleProvider` system prompt & schema defaults**

Ensure `packages/ai/src/index.ts` returns the mandatory fields expected by `MinutesVersionSchema` (e.g. `version: 1`, `template: 'team'`, `outputLanguage: 'en'`, empty arrays for `decisions`, `openQuestions`, `actionItems`, `sections` if omitted by the LLM).

- [ ] **Step 4: Test real generation with Gemini via a lightweight script**

Run a one-off test script or Vitest test with `AI_API_KEY` loaded to verify Gemini returns valid JSON matching `MinutesVersionSchema`.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/index.ts packages/ai/src/gemini.test.ts
git commit -m "feat(ai): ensure openai-compatible provider handles Gemini response schemas"
```

---

### Task 3: Configure Deepgram Speech API Key & Verify Speech Route

**Files:**
- Modify: `.env`
- Test: `apps/api/src/modules/speech/routes.test.ts`

**Interfaces:**
- Consumes: `DEEPGRAM_API_KEY` from environment
- Produces: `POST /v1/meetings/:id/speech-sessions` minting real temporary tokens

- [ ] **Step 1: Update `.env` with Deepgram key**

Set in `.env`:
```env
SPEECH_PROVIDER=deepgram
DEEPGRAM_API_KEY=<user_deepgram_key>
```

- [ ] **Step 2: Verify `speechRoutes` unit/mock test suite passes**

Run: `pnpm --filter @kms/api test speech`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore(config): configure Deepgram credentials for live speech sessions"
```

---

### Task 4: Connect Worker `minutes_generation` to Real AI Provider

**Files:**
- Modify: `apps/worker/src/worker.ts:100-125`
- Test: `apps/worker/src/worker-ai.test.ts`

**Interfaces:**
- Consumes: BullMQ job data containing `meetingId`, `transcript`
- Produces: Real minutes saved in PostgreSQL instead of `deterministic-mock`

- [ ] **Step 1: Write worker test for minutes generation dispatching**

Create `apps/worker/src/worker-ai.test.ts` asserting that when `jobType === 'minutes_generation'`, the worker delegates to `aiProvider.generateDetailedMinutes`.

- [ ] **Step 2: Implement job handling in `apps/worker/src/worker.ts`**

Instantiate `AiProvider` in the worker worker pool if `this.jobType === 'minutes_generation'`:
```typescript
if (this.jobType === 'minutes_generation') {
  // Extract transcript from payload or DB
  // Call this.aiProvider.generateDetailedMinutes(...)
  // Persist result into minutes repository
}
```

- [ ] **Step 3: Verify worker tests pass**

Run: `pnpm --filter @kms/worker test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/worker.ts apps/worker/src/worker-ai.test.ts
git commit -m "feat(worker): wire minutes_generation job handler to real AiProvider"
```

---

### Task 5: End-to-End Verification of API & Minutes Generation Flow

**Files:**
- Verification only

- [ ] **Step 1: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: 0 errors across all 19 workspace packages.

- [ ] **Step 2: Run unit test suite**

Run: `pnpm test:unit`
Expected: All tests pass.

- [ ] **Step 3: Start API and test `/health` and `/v1/minutes/generate`**

1. Launch API: `pnpm dev:api`
2. Test `/health`: should return `{"ok": true, "ai": {"ok": true}}`
3. Call `POST /v1/minutes/generate` with a synthetic meeting transcript and inspect the Gemini response. Verify sections and citations are returned.
