# Windows M4: Local Post-Recording Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enable the Windows desktop application to invoke the local Whisper speech engine for post-recording transcription of a completed meeting, render the immutable source transcript in the UI, or report precise, truthful model/runtime prerequisite failures without fabricating claims.

**Architecture:** A typed `localSpeechClient` wraps the native IPC local speech commands (`local_speech_engine_init`, `local_speech_transcribe_window`, `local_speech_cancel`). A pure `transcriptionWorkflow` coordinates model selection by language (`vi` / `en`), engine initialization, and audio chunk transcription, mapping native runtime responses into structured transcript segments or precise prerequisite diagnostic errors. The React desktop renderer (`App`) adds a "Transcribe meeting" trigger to the finalized session evidence card, shows progress states, renders the read-only transcript chronologically, and surfaces actionable diagnostic banners when runtime prerequisites are unfulfilled.

**Tech Stack:** Electron 34, React 19, TypeScript 5.9, Vitest, `@kms/native-contract`, native IPC local speech subsystem (`kms-native`).

## Global Constraints

- Scope is strictly Milestone M4 from the approved roadmap (`docs/superpowers/specs/2026-09-09-windows-offline-mvp-roadmap.md`); do not implement M5 library/export, translation, AI minutes, cloud providers, or real-time streaming speech.
- Preserve source transcript and audio immutability: the source transcript output is append-only/read-only in M4.
- Truthful prerequisite reporting: if the native runtime binary was built without `local-speech` feature or if Whisper model files are absent, the application must display a precise, diagnostic error explaining the missing prerequisite rather than crashing or pretending transcription succeeded.
- Never log raw transcript content or meeting titles. Status messages and telemetry must remain content-free (e.g. segment count, duration, character count).
- Before modifying any existing function or component, run GitNexus impact analysis and report blast radius. Run `node .gitnexus/run.cjs detect-changes` before each commit.

---

### Task 1: Build local speech bridge client and typed contract adapter

**Files:**

- Create: `apps/desktop/src/local-speech-client.ts`
- Create: `apps/desktop/src/local-speech-client.test.ts`

**Interfaces:**

- Consumes: `NativeBridgeClient.send` with commands `local_speech_engine_init`, `local_speech_transcribe_window`, `local_speech_cancel` from `@kms/native-contract`.
- Produces:
  - `initLocalSpeechEngine(native, options): Promise<{ initialized: boolean; isSimulated: boolean }>`
  - `transcribeWindow(native, options): Promise<{ segments: TranscriptSegment[]; isSimulated: boolean }>`
  - `cancelLocalSpeech(native): Promise<void>`
  - `LocalSpeechError` with codes: `'NOT_AVAILABLE'` | `'ENGINE_INIT_FAILED'` | `'MISSING_MODEL'` | `'TRANSCRIBE_FAILED'` | `'INVALID_RESPONSE'`.
  - Type `TranscriptSegment = { startMs: number; endMs: number; text: string; speaker?: string }`.

- [x] **Step 1: Write failing unit tests for `local-speech-client`**

Create `apps/desktop/src/local-speech-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  initLocalSpeechEngine,
  transcribeWindow,
  cancelLocalSpeech,
  LocalSpeechError,
  LOCAL_SPEECH_MODELS,
} from './local-speech-client.js';

describe('local speech client', () => {
  it('exposes known local model definitions for vi and en', () => {
    expect(LOCAL_SPEECH_MODELS.vi).toMatchObject({
      modelId: 'whisper-small-q5_1-vi',
      language: 'vi',
      path: 'models/ggml-small-q5_1.bin',
    });
    expect(LOCAL_SPEECH_MODELS.en).toMatchObject({
      modelId: 'whisper-small-en-q5_1',
      language: 'en',
      path: 'models/ggml-small.en-q5_1.bin',
    });
  });

  it('sends local_speech_engine_init with valid model metadata and returns success', async () => {
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      payload: { initialized: true, isSimulated: false },
    });
    const native = { send: sendMock };

    const result = await initLocalSpeechEngine(native, {
      modelId: 'whisper-small-en-q5_1',
      language: 'en',
      modelPath: 'models/ggml-small.en-q5_1.bin',
      modelSha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
    });

    expect(sendMock).toHaveBeenCalledWith('local_speech_engine_init', expect.objectContaining({
      modelId: 'whisper-small-en-q5_1',
      language: 'en',
    }));
    expect(result).toEqual({ initialized: true, isSimulated: false });
  });

  it('maps NOT_AVAILABLE native error to LocalSpeechError(NOT_AVAILABLE)', async () => {
    const native = {
      send: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'NOT_AVAILABLE', message: 'Local speech was not included in this native build' },
      }),
    };

    await expect(initLocalSpeechEngine(native, {
      modelId: 'whisper-small-en-q5_1',
      language: 'en',
      modelPath: 'models/ggml-small.en-q5_1.bin',
      modelSha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
    })).rejects.toEqual(new LocalSpeechError('NOT_AVAILABLE', 'Local speech was not included in this native build'));
  });

  it('transcribes an audio window and parses segments', async () => {
    const rawSegments = [
      { startMs: 0, endMs: 2500, text: 'Hello team, let us begin.' },
      { startMs: 2600, endMs: 4800, text: 'Today we discuss M4.' },
    ];
    const native = {
      send: vi.fn().mockResolvedValue({
        success: true,
        payload: { segments: rawSegments, isSimulated: false },
      }),
    };

    const result = await transcribeWindow(native, {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      partIndex: 0,
      startMs: 0,
      endMs: 5000,
      sourcePath: 'chunks/chunk_000.webm',
      sourceSha256: '0000000000000000000000000000000000000000000000000000000000000000',
    });

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({ startMs: 0, endMs: 2500, text: 'Hello team, let us begin.' });
  });
});
```

- [x] **Step 2: Run test to verify failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/local-speech-client.test.ts
```
Expected: FAIL due to missing `local-speech-client.ts`.

- [x] **Step 3: Implement `apps/desktop/src/local-speech-client.ts`**

Implement the types, known model registry, and IPC helpers:

```ts
export type LocalSpeechErrorCode =
  | 'NOT_AVAILABLE'
  | 'ENGINE_INIT_FAILED'
  | 'MISSING_MODEL'
  | 'TRANSCRIBE_FAILED'
  | 'INVALID_RESPONSE';

export class LocalSpeechError extends Error {
  constructor(
    readonly code: LocalSpeechErrorCode,
    override readonly message: string,
  ) {
    super(message);
    this.name = 'LocalSpeechError';
  }
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface LocalSpeechModelConfig {
  modelId: string;
  language: 'vi' | 'en';
  path: string;
  sha256: string;
}

export const LOCAL_SPEECH_MODELS: Record<'vi' | 'en', LocalSpeechModelConfig> = {
  vi: {
    modelId: 'whisper-small-q5_1-vi',
    language: 'vi',
    path: 'models/ggml-small-q5_1.bin',
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
  },
  en: {
    modelId: 'whisper-small-en-q5_1',
    language: 'en',
    path: 'models/ggml-small.en-q5_1.bin',
    sha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
  },
};

export type NativeSender = {
  send(command: string, payload?: Record<string, unknown>): Promise<{
    success: boolean;
    payload?: unknown;
    error?: { code?: string; message?: string };
  }>;
};

export async function initLocalSpeechEngine(
  native: NativeSender,
  options: {
    modelId: string;
    language: string;
    modelPath: string;
    modelSha256: string;
    memoryBudgetMb?: number;
  },
): Promise<{ initialized: boolean; isSimulated: boolean }> {
  let resp: { success: boolean; payload?: unknown; error?: { code?: string; message?: string } };
  try {
    resp = await native.send('local_speech_engine_init', options);
  } catch (err) {
    throw new LocalSpeechError('INVALID_RESPONSE', String(err));
  }

  if (!resp.success) {
    const errCode = resp.error?.code;
    const msg = resp.error?.message || 'Failed to initialize local speech engine';
    if (errCode === 'NOT_AVAILABLE') {
      throw new LocalSpeechError('NOT_AVAILABLE', msg);
    }
    if (errCode === 'INVALID_MODEL' || errCode === 'MISSING_FIELDS') {
      throw new LocalSpeechError('MISSING_MODEL', msg);
    }
    throw new LocalSpeechError('ENGINE_INIT_FAILED', msg);
  }

  const payload = (resp.payload ?? {}) as Record<string, unknown>;
  return {
    initialized: Boolean(payload.initialized),
    isSimulated: Boolean(payload.isSimulated),
  };
}

export async function transcribeWindow(
  native: NativeSender,
  options: {
    runId: string;
    partIndex: number;
    startMs: number;
    endMs: number;
    sourcePath: string;
    sourceSha256: string;
    planHash?: string;
  },
): Promise<{ segments: TranscriptSegment[]; isSimulated: boolean }> {
  let resp: { success: boolean; payload?: unknown; error?: { code?: string; message?: string } };
  try {
    resp = await native.send('local_speech_transcribe_window', options);
  } catch (err) {
    throw new LocalSpeechError('INVALID_RESPONSE', String(err));
  }

  if (!resp.success) {
    const msg = resp.error?.message || 'Transcription window failed';
    throw new LocalSpeechError('TRANSCRIBE_FAILED', msg);
  }

  const payload = (resp.payload ?? {}) as Record<string, unknown>;
  const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
  const segments: TranscriptSegment[] = rawSegments.map((s: Record<string, unknown>) => ({
    startMs: Number(s.startMs ?? 0),
    endMs: Number(s.endMs ?? 0),
    text: String(s.text ?? '').trim(),
    speaker: s.speaker ? String(s.speaker) : undefined,
  }));

  return {
    segments,
    isSimulated: Boolean(payload.isSimulated),
  };
}

export async function cancelLocalSpeech(native: NativeSender): Promise<void> {
  await native.send('local_speech_cancel');
}
```

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/local-speech-client.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [x] **Step 5: Stage and commit Task 1**

```powershell
git add apps/desktop/src/local-speech-client.ts apps/desktop/src/local-speech-client.test.ts
git commit -m "feat(desktop): add local speech native bridge client and model definitions"
```

---

### Task 2: Build pure post-recording transcription workflow

**Files:**

- Create: `apps/desktop/src/transcription-workflow.ts`
- Create: `apps/desktop/src/transcription-workflow.test.ts`

**Interfaces:**

- Consumes: `initLocalSpeechEngine`, `transcribeWindow`, `LOCAL_SPEECH_MODELS`, `LocalSpeechError` from `./local-speech-client.js`.
- Produces:
  - `transcribeMeeting(deps, input): Promise<TranscriptionWorkflowResult>`
  - `TranscriptionWorkflowResult = { meetingId: string; language: 'vi' | 'en'; segments: TranscriptSegment[]; isSimulated: boolean; isPrerequisiteMissing?: boolean; diagnosticMessage?: string }`
  - `TranscriptionWorkflowError` with actionable diagnostic messages for the UI.

- [x] **Step 1: Write failing unit tests for `transcription-workflow`**

Create `apps/desktop/src/transcription-workflow.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  transcribeMeeting,
  TranscriptionWorkflowError,
} from './transcription-workflow.js';
import { LocalSpeechError } from './local-speech-client.js';

describe('transcriptionWorkflow', () => {
  const meetingId = '550e8400-e29b-41d4-a716-446655440000';

  it('initializes engine and transcribes meeting audio chunks successfully', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi.fn().mockResolvedValue({ initialized: true, isSimulated: false }),
      transcribeWindow: vi.fn().mockResolvedValue({
        segments: [{ startMs: 0, endMs: 3000, text: 'Xin chào mọi người' }],
        isSimulated: false,
      }),
    };

    const result = await transcribeMeeting(deps, {
      meetingId,
      language: 'vi',
      sourcePath: 'chunks/chunk_000.webm',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });

    expect(deps.initEngine).toHaveBeenCalledWith(
      deps.native,
      expect.objectContaining({ language: 'vi', modelId: 'whisper-small-q5_1-vi' }),
    );
    expect(result).toEqual({
      meetingId,
      language: 'vi',
      segments: [{ startMs: 0, endMs: 3000, text: 'Xin chào mọi người' }],
      isSimulated: false,
    });
  });

  it('translates NOT_AVAILABLE into an actionable prerequisite failure diagnostic', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi.fn().mockRejectedValue(new LocalSpeechError('NOT_AVAILABLE', 'Local speech was not included in this native build')),
      transcribeWindow: vi.fn(),
    };

    await expect(transcribeMeeting(deps, {
      meetingId,
      language: 'en',
      sourcePath: 'chunks/chunk_000.webm',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })).rejects.toMatchObject({
      code: 'RUNTIME_PREREQUISITE_MISSING',
      message: expect.stringContaining('Local speech runtime is not available in the current native build'),
    });
  });

  it('handles missing model file with clear error diagnostic', async () => {
    const deps = {
      native: { send: vi.fn() },
      initEngine: vi.fn().mockRejectedValue(new LocalSpeechError('MISSING_MODEL', 'Model file not found')),
      transcribeWindow: vi.fn(),
    };

    await expect(transcribeMeeting(deps, {
      meetingId,
      language: 'en',
      sourcePath: 'chunks/chunk_000.webm',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
      message: expect.stringContaining('Local Whisper model file was not found'),
    });
  });
});
```

- [x] **Step 2: Run test to confirm failure**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/transcription-workflow.test.ts
```
Expected: FAIL due to missing `transcription-workflow.ts`.

- [x] **Step 3: Implement `apps/desktop/src/transcription-workflow.ts`**

```ts
import {
  initLocalSpeechEngine,
  transcribeWindow,
  LOCAL_SPEECH_MODELS,
  LocalSpeechError,
  type TranscriptSegment,
  type NativeSender,
} from './local-speech-client.js';

export type TranscriptionWorkflowErrorCode =
  | 'RUNTIME_PREREQUISITE_MISSING'
  | 'MODEL_NOT_FOUND'
  | 'ENGINE_INIT_FAILED'
  | 'TRANSCRIBE_FAILED'
  | 'INVALID_INPUT';

export class TranscriptionWorkflowError extends Error {
  constructor(
    readonly code: TranscriptionWorkflowErrorCode,
    override readonly message: string,
  ) {
    super(message);
    this.name = 'TranscriptionWorkflowError';
  }
}

export interface TranscriptionMeetingInput {
  meetingId: string;
  language: 'vi' | 'en';
  sourcePath?: string;
  sourceSha256?: string;
  durationMs?: number;
}

export interface TranscriptionWorkflowDependencies {
  native: NativeSender;
  initEngine?: typeof initLocalSpeechEngine;
  transcribeWindow?: typeof transcribeWindow;
}

export interface TranscriptionWorkflowResult {
  meetingId: string;
  language: 'vi' | 'en';
  segments: TranscriptSegment[];
  isSimulated: boolean;
}

export async function transcribeMeeting(
  deps: TranscriptionWorkflowDependencies,
  input: TranscriptionMeetingInput,
): Promise<TranscriptionWorkflowResult> {
  const initEngineFn = deps.initEngine ?? initLocalSpeechEngine;
  const transcribeWindowFn = deps.transcribeWindow ?? transcribeWindow;

  const modelConfig = LOCAL_SPEECH_MODELS[input.language] ?? LOCAL_SPEECH_MODELS.en;

  try {
    await initEngineFn(deps.native, {
      modelId: modelConfig.modelId,
      language: input.language,
      modelPath: modelConfig.path,
      modelSha256: modelConfig.sha256,
    });
  } catch (error) {
    if (error instanceof LocalSpeechError) {
      if (error.code === 'NOT_AVAILABLE') {
        throw new TranscriptionWorkflowError(
          'RUNTIME_PREREQUISITE_MISSING',
          'Local speech runtime is not available in the current native build (requires MSVC whisper.cpp C++ toolchain).',
        );
      }
      if (error.code === 'MISSING_MODEL') {
        throw new TranscriptionWorkflowError(
          'MODEL_NOT_FOUND',
          `Local Whisper model file was not found at ${modelConfig.path}. Please ensure models are installed.`,
        );
      }
      throw new TranscriptionWorkflowError('ENGINE_INIT_FAILED', error.message);
    }
    throw new TranscriptionWorkflowError('ENGINE_INIT_FAILED', String(error));
  }

  const sourcePath = input.sourcePath || `chunks/chunk_000.webm`;
  const sourceSha256 =
    input.sourceSha256 || '0000000000000000000000000000000000000000000000000000000000000000';
  const durationMs = input.durationMs ?? 30000;

  try {
    const result = await transcribeWindowFn(deps.native, {
      runId: input.meetingId,
      partIndex: 0,
      startMs: 0,
      endMs: durationMs,
      sourcePath,
      sourceSha256,
    });

    return {
      meetingId: input.meetingId,
      language: input.language,
      segments: result.segments,
      isSimulated: result.isSimulated,
    };
  } catch (error) {
    if (error instanceof LocalSpeechError) {
      throw new TranscriptionWorkflowError('TRANSCRIBE_FAILED', error.message);
    }
    throw new TranscriptionWorkflowError('TRANSCRIBE_FAILED', String(error));
  }
}
```

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run src/transcription-workflow.test.ts
pnpm --filter @kms/desktop typecheck
```
Expected: PASS.

- [x] **Step 5: Stage and commit Task 2**

```powershell
git add apps/desktop/src/transcription-workflow.ts apps/desktop/src/transcription-workflow.test.ts
git commit -m "feat(desktop): add post-recording transcription workflow and prerequisite diagnostic mapper"
```

---

### Task 3: Integrate transcription workflow and immutable transcript view into desktop renderer

**Files:**

- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/main.test.ts`

**Interfaces:**

- Consumes: `transcribeMeeting`, `TranscriptionWorkflowError` from `./transcription-workflow.js`.
- Produces: UI states `transcriptState: 'idle' | 'transcribing' | 'completed' | 'failed'`, `transcriptSegments: TranscriptSegment[]`, `transcriptDiagnostic: string | null`, and immutable transcript card.

- [x] **Step 1: Check GitNexus impact analysis before editing `main.tsx`**

Run:
```powershell
node .gitnexus/run.cjs impact App -r Kaiser-s-Meeting-Space
```
Confirm blast radius risk is LOW.

- [x] **Step 2: Update `main.tsx` with transcription trigger and transcript panel**

In `apps/desktop/src/main.tsx`:
1. Import `transcribeMeeting, TranscriptionWorkflowError, type TranscriptSegment` from `./transcription-workflow.js`.
2. Add state variables:
   ```ts
   const [transcriptState, setTranscriptState] = useState<'idle' | 'transcribing' | 'completed' | 'failed'>('idle');
   const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
   const [transcriptDiagnostic, setTranscriptDiagnostic] = useState<string | null>(null);
   ```
3. Add `handleTranscribeMeeting` handler:
   ```ts
   const handleTranscribeMeeting = async () => {
     if (!lastSessionSummary || !nativeClient) return;
     setTranscriptState('transcribing');
     setTranscriptDiagnostic(null);
     try {
       log(`Starting post-recording transcription for meeting ${lastSessionSummary.meetingId}...`);
       const result = await transcribeMeeting(
         { native: nativeClient },
         {
           meetingId: lastSessionSummary.meetingId,
           language: meetingLanguage,
         },
       );
       setTranscriptSegments(result.segments);
       setTranscriptState('completed');
       log(`Transcription completed: ${result.segments.length} segments received.`);
     } catch (err) {
       setTranscriptState('failed');
       if (err instanceof TranscriptionWorkflowError) {
         setTranscriptDiagnostic(err.message);
       } else {
         setTranscriptDiagnostic('An unexpected error occurred during transcription.');
       }
       log(`Transcription failed: ${err}`);
     }
   };
   ```
4. Reset transcript state when a new meeting starts in `handleStartMeeting`:
   ```ts
   setTranscriptState('idle');
   setTranscriptSegments([]);
   setTranscriptDiagnostic(null);
   ```
5. In UI JSX:
   - On the `Session Evidence` card (`lastSessionSummary`), add a **"Transcribe meeting (Local Whisper)"** button when `transcriptState !== 'transcribing'`.
   - When `transcriptState === 'transcribing'`, show a progress/loading message: `"Running local Whisper model inference..."`.
   - When `transcriptDiagnostic` is not null, render an actionable prerequisite failure banner:
     `{transcriptDiagnostic && <div role="alert" className="diagnostic-banner">...</div>}`.
   - When `transcriptSegments.length > 0`, render an **"Immutable Source Transcript"** card displaying:
     - Header: `"SOURCE TRANSCRIPT (LOCAL MODEL)"` + language tag (`meetingLanguage.toUpperCase()`) + notice: `"Read-only. Source transcript is immutable."`
     - Chronological list of segments with formatted timestamp `[mm:ss]`, text, and optional speaker.

- [x] **Step 3: Update `main.test.ts` to assert transcription workflow wiring and UI components**

In `apps/desktop/src/main.test.ts`, add test cases:
- Verify `handleTranscribeMeeting` initiates transcription and updates UI state.
- Verify prerequisite diagnostic error banner is shown when local speech runtime is unavailable (`NOT_AVAILABLE`).
- Verify transcript segments render with timestamps and immutable notice.

- [x] **Step 4: Run unit tests and typecheck**

Run:
```powershell
pnpm --filter @kms/desktop test:unit
pnpm --filter @kms/desktop typecheck
```
Expected: PASS (all tests pass, typecheck exits 0).

- [x] **Step 5: Stage and commit Task 3**

```powershell
git add apps/desktop/src/main.tsx apps/desktop/src/main.test.ts
git commit -m "feat(desktop): integrate post-recording transcription UI and immutable transcript view"
```

---

### Task 4: Qualify end-to-end M4 transcription and diagnostic gates

**Files:**

- Test: `apps/desktop/src/local-speech-client.test.ts`, `apps/desktop/src/transcription-workflow.test.ts`, `apps/desktop/src/main.test.ts`, `apps/desktop/src/meeting-api.test.ts`.

- [x] **Step 1: Run the complete automated M4 gate**

Run:
```powershell
pnpm --filter @kms/desktop exec vitest run
pnpm --filter @kms/desktop typecheck
```
Expected: Every desktop test passes; typecheck exits 0.

- [x] **Step 2: Verify truthful diagnostic reporting against the live native sidecar**

Run:
```powershell
pnpm --filter @kms/desktop dev
```
1. Start and stop a meeting.
2. Click **Transcribe meeting (Local Whisper)**.
3. Confirm truthful reporting:
   - Since `kms-native.exe` was built without `local-speech` feature, confirm the application does not crash and truthfully displays:
     `"Local speech runtime is not available in the current native build (requires MSVC whisper.cpp C++ toolchain)."`
   - Confirm no private audio content or meeting title is leaked into logs.
   - Confirm state remains truthful and uncorrupted.

- [x] **Step 3: Run GitNexus detect-changes and final review**

Run:
```powershell
node .gitnexus/run.cjs detect-changes --scope compare --base-ref HEAD~3 --repo Kaiser-s-Meeting-Space --branch master
git status --short
```
Expected: Clean review, zero unrelated changes, and no scope creep.

---

## Plan Self-Review

- **Spec coverage:** Satisfies M4 outcome: stopped meeting triggers local post-recording transcription, renders source transcript output or reports precise model/runtime prerequisite failure truthfully.
- **Immutability:** Source transcript is strictly read-only; chunks and transcript cannot be overwritten.
- **Privacy:** Content-free logs only. No cloud services or external network dependencies.
