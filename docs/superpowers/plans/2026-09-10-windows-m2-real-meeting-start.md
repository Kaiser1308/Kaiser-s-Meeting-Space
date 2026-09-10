# Windows M2: Real Local Meeting Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Windows desktop renderer create and start an owner-scoped local meeting through the existing API, then pass the returned UUID to native physical capture without falsely showing recording on failure.

**Architecture:** Keep the API, database, Electron main process, preload boundary, and `NativeSupervisor` unchanged. A small renderer-only API client validates the fixed local API responses and creates separate idempotency keys for `POST /v1/meetings` and `POST /v1/meetings/:id/start`. A pure start-workflow function coordinates create, start, local storage initialization, and native capture; `App` supplies UI state and renders only safe operational errors.

**Tech Stack:** Electron 34, React 19, TypeScript 5.9, Vitest, existing `@kms/domain` schemas, Fastify local API at `http://127.0.0.1:4310`, PostgreSQL local-auth mode, existing `NativeBridgeClient`.

## Global Constraints

- Scope is the approved Windows offline-first M2 milestone only; do not start M3 recording finalization, M4 transcription, M5 library/export, mobile, cloud providers, OIDC, schema, or API-route work.
- Preserve the existing API contract: `POST /v1/meetings` and `POST /v1/meetings/:meetingId/start` both require distinct valid `Idempotency-Key` headers.
- M2 uses local policy only: `live: 'off'`, `final: 'local'`, `cloudCheckScope: 'off'`, `cloudConsent: 'not_required'`; it must not request cloud consent or provider credentials.
- The real physical path must execute API create → API start → native `storage_init` → native `capture_start`; only then may UI state become `recording`.
- The UUID returned by the create response is the only physical-capture meeting ID. Retain `active-session` only in pre-existing simulator/recovery paths until their own milestones redesign them.
- Never log meeting title, server response body, transcript/audio content, authorization, or credentials. UI errors are fixed safe messages selected from a closed error-code set.
- Before editing `App`, `handleStartMeeting`, or `NativeBridgeClient` consumers, run GitNexus impact and report its blast radius. The Luna research audit found LOW risk for `App`, `handleStartMeeting`, `NativeBridgeClient.send`, and `MeetingService.startMeeting`; no HIGH/CRITICAL warning exists.

---

## Current File Structure

- `apps/desktop/src/main.tsx` — current renderer. Its physical start path still sends `meetingId: 'active-session'`; it has no HTTP client or API error state.
- `apps/desktop/src/meeting-api.ts` — new, renderer-only local API contract adapter. It owns request construction, idempotency headers, response validation, and safe failures.
- `apps/desktop/src/meeting-api.test.ts` — new unit tests for exact HTTP method, URL, headers, request payload, UUID propagation, response validation, and safe failures.
- `apps/desktop/src/start-meeting-workflow.ts` — new pure orchestration unit. It owns operation order and has no React state or DOM access.
- `apps/desktop/src/start-meeting-workflow.test.ts` — new unit tests covering the successful and each failed operation boundary.
- `apps/desktop/src/main.tsx` — integrate the workflow, title input, current meeting ID, and safe status presentation. Do not edit Electron main/preload/native/API files.
- `apps/api/src/modules/meetings/{dto,meeting-service}.test.ts` — unchanged neighboring regressions that prove the consumed local API contract.

---

### Task 1: Build a validated, local-only renderer meeting API adapter

**Files:**

- Create: `apps/desktop/src/meeting-api.ts`
- Create: `apps/desktop/src/meeting-api.test.ts`
- Regression: `apps/api/src/modules/meetings/dto.test.ts`
- Regression: `apps/api/src/modules/meetings/meeting-service.test.ts`

**Interfaces:**

- Consumes: API `CreateMeetingBodySchema`, `CreateMeetingResponseSchema`, and `StartMeetingResponseSchema` contract from `apps/api/src/modules/meetings/dto.ts`; domain `MeetingIdSchema` and `TranscriptionPolicyV1Schema`.
- Produces: `createLocalMeeting(input): Promise<CreatedMeeting>`, `startLocalMeeting(meetingId): Promise<StartedMeeting>`, and `MeetingApiError` with a closed safe `code` union.

- [ ] **Step 1: Write the failing adapter tests**

Create `apps/desktop/src/meeting-api.test.ts` with a fetch double and deterministic UUID factory. Assert the create request and start request exactly:

```ts
const createdId = '550e8400-e29b-41d4-a716-446655440000';

it('creates then starts a local meeting with distinct idempotency keys', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse(201, { id: createdId, title: 'Weekly sync', language: 'en', mode: 'meeting_only', captureSources: ['mic', 'system'], state: 'draft', version: 1, createdAt: '2026-09-10T00:00:00.000Z' }))
    .mockResolvedValueOnce(jsonResponse(200, { meetingId: createdId, state: 'recording', startedAt: '2026-09-10T00:00:01.000Z', policyVersion: 1 }));
  const api = createMeetingApi({ fetch: fetchMock, newId: sequence('create-key-0001', 'start-key-00002') });

  const created = await api.createLocalMeeting({ title: 'Weekly sync', language: 'en', timezone: 'Asia/Ho_Chi_Minh' });
  const started = await api.startLocalMeeting(created.id);

  expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:4310/v1/meetings');
  expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('create-key-0001');
  expect(fetchMock.mock.calls[1][0]).toBe(`http://127.0.0.1:4310/v1/meetings/${createdId}/start`);
  expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe('start-key-00002');
  expect(started.meetingId).toBe(createdId);
});

it.each([401, 409, 500])('maps HTTP %s to a safe error without server text', async (status) => {
  const api = createMeetingApi({ fetch: vi.fn().mockResolvedValue(jsonResponse(status, { error: { message: 'private server detail' } })), newId: crypto.randomUUID });
  await expect(api.createLocalMeeting({ title: 'Weekly sync', language: 'en', timezone: 'Asia/Ho_Chi_Minh' })).rejects.toEqual(new MeetingApiError('API_UNAVAILABLE'));
});
```

- [ ] **Step 2: Run the narrow test and confirm it fails for the missing adapter**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts
```

Expected: failure because `./meeting-api.js` and its named exports do not exist. Do not accept a test-environment failure.

- [ ] **Step 3: Implement the minimal adapter**

Create `apps/desktop/src/meeting-api.ts`. Define the only error surface and local request policy:

```ts
export type MeetingApiErrorCode = 'API_UNAVAILABLE' | 'INVALID_RESPONSE';

export class MeetingApiError extends Error {
  constructor(readonly code: MeetingApiErrorCode) { super(code); }
}

export const LOCAL_POLICY = {
  version: 1, language: 'en', live: 'off', final: 'local', cloudCheckScope: 'off', cloudConsent: 'not_required',
} as const;
```

`createMeetingApi` must accept injected `fetch`, base URL, and UUID factory for tests; production defaults are `globalThis.fetch`, `http://127.0.0.1:4310`, and `crypto.randomUUID`. `createLocalMeeting` builds `{ title, language, mode: 'meeting_only', timezone, captureSources: ['mic', 'system'], speechMode: 'local', policy: { ...LOCAL_POLICY, language } }`, posts JSON, validates the 201 body with a local Zod schema matching the API response, and returns only typed fields. `startLocalMeeting` validates its UUID before forming the URL, posts no body, validates 200, and returns the typed start response. Convert every network/non-2xx exception to `MeetingApiError('API_UNAVAILABLE')`; convert successful but malformed payloads to `MeetingApiError('INVALID_RESPONSE')`. Do not read or render server-provided error text.

- [ ] **Step 4: Rerun focused and API-contract regressions**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts
pnpm --filter @kms/api exec vitest run src/modules/meetings/dto.test.ts src/modules/meetings/meeting-service.test.ts
pnpm --filter @kms/desktop typecheck
```

Expected: all exit 0 with non-zero test counts. If API tests reveal a payload mismatch, correct only the desktop adapter to the already accepted API contract.

- [ ] **Step 5: Inspect and commit only Task 1**

Run:

```powershell
git diff --check
git diff -- apps/desktop/src/meeting-api.ts apps/desktop/src/meeting-api.test.ts
git add -- apps/desktop/src/meeting-api.ts apps/desktop/src/meeting-api.test.ts
git commit -m "feat(desktop): add local meeting API adapter"
```

Expected: only the two Task 1 files are staged; preserve all pre-existing untracked build artifacts.

---

### Task 2: Orchestrate API and native start with no false recording state

**Files:**

- Create: `apps/desktop/src/start-meeting-workflow.ts`
- Create: `apps/desktop/src/start-meeting-workflow.test.ts`
- Modify: `apps/desktop/src/main.tsx`

**Interfaces:**

- Consumes: `MeetingApi.createLocalMeeting`, `MeetingApi.startLocalMeeting`, and `NativeBridgeClient.send('storage_init' | 'capture_start', payload)`.
- Produces: `startPhysicalMeeting(deps, input): Promise<{ meetingId: string }>`; it resolves only after the native capture success response and otherwise rejects a safe `StartMeetingError`.

- [ ] **Step 1: Write failing workflow tests before UI integration**

Create `apps/desktop/src/start-meeting-workflow.test.ts` with mocked API/native dependencies. The success case must prove operation ordering and UUID forwarding:

```ts
it('starts physical capture with the UUID returned by the API', async () => {
  const meetingId = '550e8400-e29b-41d4-a716-446655440000';
  const calls: string[] = [];
  const result = await startPhysicalMeeting({
    api: { createLocalMeeting: vi.fn(async () => { calls.push('create'); return { id: meetingId }; }), startLocalMeeting: vi.fn(async () => { calls.push('start'); return { meetingId, state: 'recording' }; }) },
    native: { send: vi.fn(async (command, payload) => { calls.push(command); if (command === 'capture_start') expect(payload).toMatchObject({ meetingId }); return { success: true, payload: {} }; }) },
  }, { title: 'Weekly sync', language: 'en', timezone: 'Asia/Ho_Chi_Minh', micDeviceId: 'default', systemDeviceId: 'default' });

  expect(calls).toEqual(['create', 'start', 'storage_init', 'capture_start']);
  expect(result).toEqual({ meetingId });
});

it.each(['create', 'start', 'storage_init', 'capture_start'])('rejects safely when %s fails', async (failingStep) => {
  await expect(startWithFailure(failingStep)).rejects.toMatchObject({ code: 'START_FAILED' });
});
```

- [ ] **Step 2: Run the narrow workflow test and confirm the intended failure**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/start-meeting-workflow.test.ts
```

Expected: failure because `start-meeting-workflow.ts` does not exist. Do not begin editing `main.tsx` until this test reaches that failure.

- [ ] **Step 3: Implement the pure workflow and integrate it into `App`**

Create the workflow so every native response is checked for `success === true`; any thrown exception or false response throws `new StartMeetingError('START_FAILED')`. It must not call API end/rollback and must not claim an API rollback occurred when native startup fails.

In `apps/desktop/src/main.tsx`, add `meetingTitle`, `currentMeetingId`, and `startError` state. Add a required title input with a default such as `New meeting`; determine language exactly once via `navigator.language.startsWith('vi') ? 'vi' : 'en'` and timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'`. Replace only the physical branch of `handleStartMeeting` with:

```ts
const { meetingId } = await startPhysicalMeeting(dependencies, {
  title: meetingTitle.trim(),
  language,
  timezone,
  micDeviceId: selectedMicId,
  systemDeviceId: selectedSysId,
});
setCurrentMeetingId(meetingId);
setState('recording');
setStartError(null);
```

If title is empty, set `startError` to `Enter a meeting title.` without calling the API. On `MeetingApiError` or `StartMeetingError`, keep state `idle`, retain no new active meeting ID, and display one of `Local meeting service is unavailable.`, `Local meeting service returned an invalid response.`, or `Meeting started in the service but local capture did not start.` The simulator branch remains untouched and visibly labeled simulated.

- [ ] **Step 4: Rerun focused tests and desktop regression**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts src/start-meeting-workflow.test.ts src/main/main.test.ts src/main/security.test.ts src/main/supervisor.test.ts
pnpm --filter @kms/desktop typecheck
```

Expected: each suite has non-zero tests and both commands exit 0. If the app module is difficult to test directly, retain orchestration coverage in the pure workflow test instead of adding a new browser/E2E framework.

- [ ] **Step 5: Inspect scope and commit only Task 2**

Run:

```powershell
git diff --check
git diff -- apps/desktop/src/start-meeting-workflow.ts apps/desktop/src/start-meeting-workflow.test.ts apps/desktop/src/main.tsx
git add -- apps/desktop/src/start-meeting-workflow.ts apps/desktop/src/start-meeting-workflow.test.ts apps/desktop/src/main.tsx
git commit -m "feat(desktop): start physical capture with real meeting UUID"
```

Expected: no API, native, preload, schema, package, or unrelated generated file is staged.

---

### Task 3: Qualify the real local API boundary and visible M2 flow

**Files:**

- Modify: none unless an automated M2 test exposes an in-scope defect.
- Test: `apps/desktop/src/meeting-api.test.ts`, `apps/desktop/src/start-meeting-workflow.test.ts`, existing desktop main/security/supervisor suites, and API meeting suites.

**Interfaces:**

- Consumes: the completed Task 1 adapter and Task 2 workflow, existing local API configured with `AUTH_MODE=local`, PostgreSQL, and M1 native sidecar.
- Produces: direct M2 smoke evidence only; no new product contract or phase lifecycle claim.

- [ ] **Step 1: Run the complete automated M2 gate**

Run:

```powershell
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts src/start-meeting-workflow.test.ts src/main/main.test.ts src/main/security.test.ts src/main/supervisor.test.ts
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/api exec vitest run src/modules/meetings/dto.test.ts src/modules/meetings/meeting-service.test.ts
```

Expected: every command exits 0 and Vitest reports non-zero test counts. Investigate failures from the narrow test upward; do not hide failures using retries or broad test exclusions.

- [ ] **Step 2: Prepare the real local prerequisites without inventing a substitute**

Start PostgreSQL and the API with a real local owner, then confirm the health endpoint/process is listening on the configured loopback origin. Use actual local configuration; do not place credentials in source or logs.

```powershell
$env:AUTH_MODE='local'
$env:API_PORT='4310'
pnpm --filter @kms/api dev
```

Expected: the local API is reachable at `http://127.0.0.1:4310`. If PostgreSQL or local identity setup is unavailable, record that as the specific manual-gate blocker; mocks do not satisfy this step.

- [ ] **Step 3: Perform the bounded M2 visible smoke**

Run:

```powershell
pnpm --filter @kms/desktop dev
```

With the M1 sidecar built and the local API running, enter a non-sensitive title, select the physical capture option, and press **Start meeting** once. Verify the API has actually returned create `201` then start `200`, the capture request receives that UUID, and the visible UI becomes recording only after those calls succeed. If the API or sidecar fails, verify a safe error remains visible and state stays idle. Do not record audio, press End, test transcription, or claim a real capture result in M2.

- [ ] **Step 4: Perform the final scope review and handoff**

Run:

```powershell
node .gitnexus/run.cjs detect-changes --scope compare --base-ref HEAD~2 --repo Kaiser-s-Meeting-Space --branch master
git status --short
```

Expected: affected paths are the adapter, pure workflow, focused tests, and renderer integration only. Use a separate reviewer to verify the call order, distinct idempotency keys, UUID forwarding, safe error behavior, no altered security boundary, and no M3 work. Record M2 outcome in its milestone handoff; do not update `docs/execution/PROGRESS.md`, `STATUS.md`, or historical phase evidence unless their own gate rules are directly met.

## Plan Self-Review

- **Spec coverage:** Task 1 consumes real existing create/start API contracts; Task 2 propagates its UUID into native capture and preserves truthful failure; Task 3 proves the bounded visible local flow. These cover every M2 acceptance condition in the approved roadmap.
- **Scope:** No API route/schema, lifecycle end, audio recovery, transcription, provider, mobile, packaging, or release work is included.
- **Type consistency:** `CreatedMeeting.id`, `StartedMeeting.meetingId`, and `startPhysicalMeeting(...): Promise<{ meetingId: string }>` use the same validated UUID across all tasks.
- **Failure behavior:** create/start/network/malformed/native failures are covered without exposing server detail or setting recording state incorrectly. The known API-start/native-capture split is disclosed rather than silently rolled back.
