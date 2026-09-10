# Windows M3: Record and Stop with Recoverable Local Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the Windows desktop application to record audio from a selected physical microphone, monitor live capture health without leaking private data, stop the session via native IPC and local API, and display honest, recoverable local audio/manifest evidence.

**Architecture:** Extend the existing renderer-only `meetingApi` with a validated `endLocalMeeting` contract calling `POST /v1/meetings/:id/end`. A pure `endPhysicalMeeting` orchestration workflow coordinates stopping native capture (`capture_stop`), finalizing the meeting in the local API (`endLocalMeeting`), and querying manifest status. The React desktop renderer (`App`) binds the microphone selection, live capture health metrics (levels, gaps, drift), safe error states, and session completion evidence.

**Tech Stack:** Electron 34, React 19, TypeScript 5.9, Vitest, Fastify local API (`http://127.0.0.1:4310`), `@kms/native-contract`, WASAPI capture subsystem in `kms-native.exe`.

## Global Constraints

- Scope is strictly Milestone M3 from the approved roadmap (`docs/superpowers/specs/2026-09-09-windows-offline-mvp-roadmap.md`); do not implement M4 transcription, M5 export/library, cloud upload, OIDC, or database schema changes.
- Existing local API routes must be consumed without backend modification: `POST /v1/meetings/:meetingId/end` requires a valid `Idempotency-Key` header and valid meeting UUID.
- Never log audio samples, raw PCM/Opus frames, meeting titles, or transcript content. Logs and UI status must remain content-free (e.g., chunk counts, peak level percentage, gap count, duration).
- The end workflow must be honest about failure: if `capture_stop` indicates `recovery_required` or if the API call fails, the UI must present an honest, recoverable status rather than falsely reporting clean completion.
- Audio chunks and manifests generated on disk are immutable; do not delete or overwrite finalized chunks.
- Before modifying any existing function or component, run GitNexus impact analysis and report blast radius. Run `node .gitnexus/run.cjs detect-changes` before each commit.

---

### Task 1: Extend local meeting API adapter with end meeting endpoint

**Files:**

- Modify: `apps/desktop/src/meeting-api.ts`
- Test: `apps/desktop/src/meeting-api.test.ts`
- Regression: `apps/api/src/modules/meetings/dto.test.ts`

**Interfaces:**

- Consumes: `EndMeetingResponseSchema` contract (`meetingId: UUID`, `state: string`, `finalizedAt: string`) from API `apps/api/src/modules/meetings/dto.ts`; `MeetingIdSchema` from `@kms/domain`.
- Produces: `endLocalMeeting(meetingId: string): Promise<EndedMeeting>` on `MeetingApi`, where `EndedMeeting` is `{ meetingId: string; state: string; finalizedAt: string }`.

- [ ] **Step 1: Write failing unit tests for `endLocalMeeting`**

In `apps/desktop/src/meeting-api.test.ts`, add test cases asserting URL structure, `Idempotency-Key` header, JSON body, UUID validation, and safe error mapping:

```ts
it('ends a local meeting with distinct idempotency key and empty json body', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    jsonResponse(200, {
      meetingId: createdId,
      state: 'finalized',
      finalizedAt: '2026-09-10T01:00:00.000Z',
    }),
  );
  const api = createMeetingApi({ fetch: fetchMock, newId: () => 'end-key-00003' });

  const ended = await api.endLocalMeeting(createdId);

  expect(fetchMock.mock.calls[0]?.[0]).toBe(`http://127.0.0.1:4310/v1/meetings/${createdId}/end`);
  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'end-key-00003',
    },
    body: '{}',
  });
  expect(ended).toEqual({
    meetingId: createdId,
    state: 'finalized',
    finalizedAt: '2026-09-10T01:00:00.000Z',
  });
});

it('rejects endLocalMeeting when meetingId is not a valid UUID', async () => {
  const api = createMeetingApi({ fetch: vi.fn(), newId: () => 'end-key-00003' });
  await expect(api.endLocalMeeting('not-a-uuid')).rejects.toEqual(
    new MeetingApiError('INVALID_RESPONSE'),
  );
});

it.each([401, 404, 409, 500])('maps HTTP %s on endLocalMeeting to API_UNAVAILABLE', async (status) => {
  const api = createMeetingApi({
    fetch: vi.fn().mockResolvedValue(jsonResponse(status, { error: { message: 'server error' } })),
    newId: () => 'end-key-00003',
  });
  await expect(api.endLocalMeeting(createdId)).rejects.toEqual(
    new MeetingApiError('API_UNAVAILABLE'),
  );
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts
```
Expected: FAIL due to `endLocalMeeting` not being defined on `MeetingApi`.

- [ ] **Step 3: Implement `endLocalMeeting` in `meeting-api.ts`**

In `apps/desktop/src/meeting-api.ts`:
1. Define type `EndedMeeting`:
   ```ts
   export type EndedMeeting = {
     meetingId: string;
     state: string;
     finalizedAt: string;
   };
   ```
2. Implement parser `parseEndedMeeting(value: unknown): EndedMeeting | undefined`:
   ```ts
   function parseEndedMeeting(value: unknown): EndedMeeting | undefined {
     if (!value || typeof value !== 'object') return undefined;
     const body = value as Record<string, unknown>;
     if (
       !MeetingIdSchema.safeParse(body.meetingId).success ||
       typeof body.state !== 'string' ||
       !isDateTime(body.finalizedAt)
     ) {
       return undefined;
     }
     return {
       meetingId: body.meetingId as string,
       state: body.state,
       finalizedAt: body.finalizedAt,
     };
   }
   ```
3. Add method to `createMeetingApi` return object:
   ```ts
   endLocalMeeting(meetingId: string): Promise<EndedMeeting> {
     const parsedId = MeetingIdSchema.safeParse(meetingId);
     if (!parsedId.success) {
       return Promise.reject(new MeetingApiError('INVALID_RESPONSE'));
     }
     let idempotencyKey: string;
     try {
       idempotencyKey = newIdempotencyKey();
     } catch (error) {
       return Promise.reject(error);
     }
     return request(
       `/v1/meetings/${encodeURIComponent(parsedId.data)}/end`,
       {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Idempotency-Key': idempotencyKey,
         },
         body: '{}',
       },
       parseEndedMeeting,
       200,
     );
   }
   ```

- [ ] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/meeting-api.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS (all tests pass, typecheck exits 0).

- [ ] **Step 5: Stage and commit Task 1**

```powershell
git add apps/desktop/src/meeting-api.ts apps/desktop/src/meeting-api.test.ts
git commit -m "feat(desktop): add endLocalMeeting to meeting API adapter"
```

---

### Task 2: Build pure end-meeting orchestration workflow with honest recovery states

**Files:**

- Create: `apps/desktop/src/end-meeting-workflow.ts`
- Create: `apps/desktop/src/end-meeting-workflow.test.ts`

**Interfaces:**

- Consumes:
  - `deps.api.endLocalMeeting(meetingId)`: Promise resolving `{ meetingId, state, finalizedAt }`.
  - `deps.native.send('capture_stop')`: Promise resolving `{ success: boolean; payload?: { totalMicChunks: number; totalSysChunks: number; commitStatus?: string }; error?: { code?: string; message?: string } }`.
  - `deps.native.send('manifest_list_entries', { meetingId })`: Optional manifest entry check for verification.
- Produces:
  - `endPhysicalMeeting(deps, input): Promise<EndPhysicalMeetingResult>`
  - `EndMeetingError` with codes: `'CAPTURE_STOP_FAILED'` | `'API_END_FAILED'`.

- [ ] **Step 1: Write failing unit tests for `endPhysicalMeeting`**

Create `apps/desktop/src/end-meeting-workflow.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { endPhysicalMeeting, EndMeetingError } from './end-meeting-workflow.js';
import { MeetingApiError } from './meeting-api.js';

describe('endPhysicalMeeting workflow', () => {
  const meetingId = '550e8400-e29b-41d4-a716-446655440000';

  it('stops native capture then ends API meeting in order', async () => {
    const callOrder: string[] = [];
    const deps = {
      api: {
        endLocalMeeting: vi.fn(async (id: string) => {
          callOrder.push('api_end');
          return { meetingId: id, state: 'finalized', finalizedAt: '2026-09-10T01:00:00.000Z' };
        }),
      },
      native: {
        send: vi.fn(async (cmd: string) => {
          callOrder.push(cmd);
          if (cmd === 'capture_stop') {
            return {
              success: true,
              payload: { totalMicChunks: 5, totalSysChunks: 0, commitStatus: 'clean' },
            };
          }
          return { success: true, payload: {} };
        }),
      },
    };

    const result = await endPhysicalMeeting(deps, { meetingId });

    expect(callOrder).toEqual(['capture_stop', 'api_end']);
    expect(result).toEqual({
      meetingId,
      totalMicChunks: 5,
      totalSysChunks: 0,
      commitStatus: 'clean',
      finalizedAt: '2026-09-10T01:00:00.000Z',
    });
  });

  it('reports recovery_required when native capture commit status requires recovery', async () => {
    const deps = {
      api: {
        endLocalMeeting: vi.fn(async (id: string) => ({
          meetingId: id,
          state: 'finalized',
          finalizedAt: '2026-09-10T01:00:00.000Z',
        })),
      },
      native: {
        send: vi.fn(async (cmd: string) => {
          if (cmd === 'capture_stop') {
            return {
              success: true,
              payload: { totalMicChunks: 3, totalSysChunks: 0, commitStatus: 'recovery_required' },
            };
          }
          return { success: true, payload: {} };
        }),
      },
    };

    const result = await endPhysicalMeeting(deps, { meetingId });
    expect(result.commitStatus).toBe('recovery_required');
  });

  it('rejects with CAPTURE_STOP_FAILED when native capture_stop fails', async () => {
    const deps = {
      api: { endLocalMeeting: vi.fn() },
      native: {
        send: vi.fn(async () => ({ success: false, error: { message: 'Stream stopped' } })),
      },
    };

    await expect(endPhysicalMeeting(deps, { meetingId })).rejects.toEqual(
      new EndMeetingError('CAPTURE_STOP_FAILED'),
    );
    expect(deps.api.endLocalMeeting).not.toHaveBeenCalled();
  });

  it('rejects with API_END_FAILED when native stop succeeds but API end fails', async () => {
    const deps = {
      api: {
        endLocalMeeting: vi.fn().mockRejectedValue(new MeetingApiError('API_UNAVAILABLE')),
      },
      native: {
        send: vi.fn(async () => ({
          success: true,
          payload: { totalMicChunks: 2, totalSysChunks: 0, commitStatus: 'clean' },
        })),
      },
    };

    await expect(endPhysicalMeeting(deps, { meetingId })).rejects.toEqual(
      new EndMeetingError('API_END_FAILED'),
    );
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/end-meeting-workflow.test.ts
```
Expected: FAIL because `end-meeting-workflow.ts` does not exist.

- [ ] **Step 3: Implement `end-meeting-workflow.ts`**

Create `apps/desktop/src/end-meeting-workflow.ts`:
```ts
import { MeetingApiError } from './meeting-api.js';

export type EndMeetingErrorCode = 'CAPTURE_STOP_FAILED' | 'API_END_FAILED';

export class EndMeetingError extends Error {
  constructor(readonly code: EndMeetingErrorCode) {
    super(code);
    this.name = 'EndMeetingError';
  }
}

export type EndPhysicalMeetingInput = {
  meetingId: string;
};

export type EndMeetingDependencies = {
  api: {
    endLocalMeeting(meetingId: string): Promise<{ meetingId: string; state: string; finalizedAt: string }>;
  };
  native: {
    send(
      command: 'capture_stop' | 'manifest_list_entries',
      payload?: Record<string, unknown>,
    ): Promise<{
      success: boolean;
      payload?: unknown;
      error?: { code?: string; message?: string };
    }>;
  };
};

export type EndPhysicalMeetingResult = {
  meetingId: string;
  totalMicChunks: number;
  totalSysChunks: number;
  commitStatus: 'clean' | 'recovery_required';
  finalizedAt: string;
};

export async function endPhysicalMeeting(
  deps: EndMeetingDependencies,
  input: EndPhysicalMeetingInput,
): Promise<EndPhysicalMeetingResult> {
  let stopResp: {
    success: boolean;
    payload?: unknown;
    error?: { code?: string; message?: string };
  };

  try {
    stopResp = await deps.native.send('capture_stop');
  } catch {
    throw new EndMeetingError('CAPTURE_STOP_FAILED');
  }

  if (!stopResp.success) {
    throw new EndMeetingError('CAPTURE_STOP_FAILED');
  }

  const payload = (stopResp.payload ?? {}) as Record<string, unknown>;
  const totalMicChunks = typeof payload.totalMicChunks === 'number' ? payload.totalMicChunks : 0;
  const totalSysChunks = typeof payload.totalSysChunks === 'number' ? payload.totalSysChunks : 0;
  const commitStatus: 'clean' | 'recovery_required' =
    payload.commitStatus === 'recovery_required' ? 'recovery_required' : 'clean';

  let endedApiResult: { meetingId: string; state: string; finalizedAt: string };
  try {
    endedApiResult = await deps.api.endLocalMeeting(input.meetingId);
  } catch (error) {
    if (error instanceof MeetingApiError) {
      throw new EndMeetingError('API_END_FAILED');
    }
    throw new EndMeetingError('API_END_FAILED');
  }

  return {
    meetingId: input.meetingId,
    totalMicChunks,
    totalSysChunks,
    commitStatus,
    finalizedAt: endedApiResult.finalizedAt,
  };
}
```

- [ ] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/end-meeting-workflow.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [ ] **Step 5: Stage and commit Task 2**

```powershell
git add apps/desktop/src/end-meeting-workflow.ts apps/desktop/src/end-meeting-workflow.test.ts
git commit -m "feat(desktop): add pure end meeting orchestration workflow"
```

---

### Task 3: Integrate end meeting workflow, capture health indicators, and local evidence summary into desktop renderer

**Files:**

- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/main/main.test.ts`

**Interfaces:**

- Consumes: `endPhysicalMeeting` from `./end-meeting-workflow.js`, `meetingApi.endLocalMeeting`, live metrics from `capture_get_state`.
- Produces: UI state updates for `lastSessionSummary`, `stopError`, microphone selection binding, and real meeting UUID recovery check.

- [ ] **Step 1: Check GitNexus impact analysis before editing `App` and `handleEndMeeting`**

Run:
```powershell
node .gitnexus/run.cjs impact handleEndMeeting -r Kaiser-s-Meeting-Space
```
Confirm blast radius risk is LOW.

- [ ] **Step 2: Update `main.tsx` to wire `endPhysicalMeeting` and show capture health and completion evidence**

In `apps/desktop/src/main.tsx`:
1. Import `endPhysicalMeeting, EndMeetingError` from `./end-meeting-workflow.js`.
2. Add state for completion summary and stop error:
   ```ts
   const [stopError, setStopError] = useState<string | null>(null);
   const [lastSessionSummary, setLastSessionSummary] = useState<{
     meetingId: string;
     totalMicChunks: number;
     totalSysChunks: number;
     commitStatus: string;
     finalizedAt: string;
   } | null>(null);
   ```
3. Update `handleEndMeeting` to use `endPhysicalMeeting` when `captureType === 'physical'`:
   ```ts
   if (captureType === 'physical') {
     if (!currentMeetingId) {
       log('Cannot end meeting: no active meeting ID.');
       setState('idle');
       return;
     }
     log('Stopping physical capture and finalizing meeting...');
     const result = await endPhysicalMeeting(
       { api: meetingApi, native: nativeClient },
       { meetingId: currentMeetingId },
     );
     setState('idle');
     setCurrentMeetingId(null);
     setStopError(null);
     setLastSessionSummary(result);
     log(
       `Meeting finalized: ${result.meetingId}. Mic Chunks: ${result.totalMicChunks}, Status: ${result.commitStatus}`,
     );
     checkRecoveryInbox();
   }
   ```
4. Handle errors gracefully:
   ```ts
   catch (err) {
     if (err instanceof EndMeetingError) {
       setStopError(
         err.code === 'CAPTURE_STOP_FAILED'
           ? 'Capture stopped with an error. Audio data is preserved locally.'
           : 'Local capture stopped, but meeting finalization failed in the API.',
       );
     } else {
       setStopError('An error occurred while ending the meeting.');
     }
     log(`Failed to end meeting: ${err}`);
     setState('idle');
   }
   ```
5. Render capture health indicator during recording (Mic level bar, gap count badge, duration elapsed counter).
6. Render the session completion evidence card when `lastSessionSummary` is present (showing meeting UUID, chunk counts, commit status, and finalized timestamp without any private audio content).

- [ ] **Step 3: Run unit tests and typecheck**

Run:
```powershell
pnpm --filter @kms/desktop test:unit
pnpm --filter @kms/desktop typecheck
```
Expected: PASS (all tests pass, typecheck exits 0).

- [ ] **Step 4: Stage and commit Task 3**

```powershell
git add apps/desktop/src/main.tsx apps/desktop/src/main/main.test.ts
git commit -m "feat(desktop): integrate physical end meeting workflow and capture evidence UI"
```

---

### Task 4: Qualify end-to-end M3 capture, stop, and local evidence smoke

**Files:**

- Test: `apps/desktop/src/meeting-api.test.ts`, `apps/desktop/src/end-meeting-workflow.test.ts`, `apps/desktop/src/start-meeting-workflow.test.ts`, `apps/desktop/src/main/main.test.ts`, `apps/desktop/src/main/security.test.ts`.

- [ ] **Step 1: Run the complete automated M3 gate**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/api exec vitest run src/modules/meetings/dto.test.ts src/modules/meetings/meeting-service.test.ts
```
Expected: Every test passes with non-zero counts; typecheck exits 0.

- [ ] **Step 2: Run bounded manual smoke test with real physical mic**

Run:
```powershell
pnpm --filter @kms/desktop dev
```
1. Verify physical microphone enumeration lists available Windows audio devices.
2. Select an active microphone.
3. Enter title "M3 Smoke Meeting" and click **Start meeting**.
4. Confirm state transitions to `recording`, level meter responds to speech, and meeting UUID is displayed.
5. Record for ~5 seconds.
6. Click **Stop meeting**.
7. Confirm:
   - State returns to `idle`.
   - Local API `POST /v1/meetings/:id/end` responds 200.
   - UI displays honest completion summary with `totalMicChunks >= 1` and `commitStatus: clean`.
   - No audio or transcript content appears in logs.

- [ ] **Step 3: Run GitNexus change detection and final review**

Run:
```powershell
node .gitnexus/run.cjs detect-changes --repo Kaiser-s-Meeting-Space
git status --short
```
Expected: No unexpected symbols or processes affected outside the desktop client.

---

## Plan Self-Review

- **Spec coverage:** Covers selecting physical microphone, recording with live health monitoring, stopping physical capture, calling the local meeting end API, retaining local evidence, honest recoverable states, and zero private data leakage.
- **Scope discipline:** No cloud upload, no transcription (M4), no export (M5), no packaging (M6).
- **Type consistency:** `EndedMeeting` matches `EndMeetingResponseSchema`; `EndPhysicalMeetingResult` explicitly specifies `meetingId`, chunk counts, `commitStatus`, and `finalizedAt`.
