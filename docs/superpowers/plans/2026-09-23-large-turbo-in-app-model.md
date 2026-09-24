# Large Turbo In-App Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Stay on the checked-out `master` branch; do not create a Git worktree. If subagents are selected, use Luna high and do not use Sol.

**Goal:** Add verified, user-initiated in-app model downloads for Large Turbo and the existing Small profiles, with Large as the persistent default for Vietnamese and English desktop local transcription.

**Architecture:** A versioned desktop model catalog defines immutable artifact URLs, sizes, hashes, languages and reviewed provenance. A main-process model manager downloads into app-private storage, resumes/cancels safely, verifies before atomic activation and exposes only typed model IDs/actions to the renderer. The current P13 native inference contract remains unchanged except for streaming model-file SHA-256 to avoid allocating a second full model-sized buffer.

**Tech Stack:** Electron 34 main/preload/React renderer, TypeScript, Node.js filesystem/HTTPS streams and crypto, Vitest, Rust `sha2` and `whisper-rs`, Windows packaged-app and synthetic-audio harnesses.

## Global Constraints

- Do not begin implementation unless direct P14 evidence and `docs/execution/PROGRESS.md` show P14 `VERIFIED`; current status is `IMPLEMENTED`. Do not start P14 qualification without separate user authorization.
- Large Turbo is the persisted preferred default for both supported languages; the meeting language remains explicitly `vi` or `en`.
- Keep existing Vietnamese multilingual Small and English-only Small profiles available as explicit user choices.
- Never auto-download at launch or during recording; download only after an explicit user action.
- Set the manager's `storageRoot` to Electron's app-private `userData/native-storage` (the same root passed to the native runtime); persist state there and model bytes under its `models/` child. The `NativeModelBinding.modelPath` is a catalog-derived path relative to `storageRoot`, never an absolute path. Renderer inputs are model IDs/actions, never arbitrary URLs or filesystem paths.
- The v1 catalog is embedded and immutable within the app; do not fetch a remote catalog or artifact URL supplied by the renderer. Catalog authenticity for distribution is covered by the P26-approved signed app/package chain; if the accepted signing/trust contract is unavailable, do not enable or distribute Large.
- Verify catalog provenance, exact byte length and SHA-256 before activation; retain previously verified artifacts and preferences on failure.
- Local transcription remains offline after installation. Missing/failed local models never create cloud work or silently switch models.
- Keep P13/P14 run, part, window, reconciliation, projection and immutable-source contracts unchanged.
- Capture keeps resource priority; bound/cancel inference and do not expose audio, transcript, credentials or model bytes in logs.
- Use only the committed synthetic fixture or other reviewed synthetic fixtures; never use real meeting content.
- Record quality/resource claims only from controlled tests; simulator duration is not equivalent-duration speech evaluation.
- P14 is the hard dependency; P28 is optional. This feature slice does not mark the full P28 phase `VERIFIED` or change P27 evidence.
- Inspect Git before each task, preserve user changes, stage only that task's files, run its narrow tests, run `gitnexus.detect_changes()` on staged changes, then commit it separately.
- For every failing or unexpected test, use systematic debugging to prove the root cause, add a regression assertion when feasible, and rerun the narrow test before proceeding.
- Do not create a worktree. Do not commit model binaries, secrets, signing keys, or test model bytes.
- Preserve the existing untracked `native/models/README.md`, local manifests, and model binaries; do not modify or stage them as part of this feature.

---

## Preflight Gate — Required Before Task 1

This is a stop gate, not permission to execute P14.

- Read `docs/execution/PROGRESS.md` and `docs/execution/evidence/P14/EVIDENCE.md` immediately before implementation. Continue only if both directly show P14 `VERIFIED` and identify its verification evidence. If not, stop without editing code and ask the owner to authorize a separate P14 qualification task.
- Execute this work only as the model-lifecycle slice of P28-T02/T03 after P28 preflight; create its required runtime run record and inherit the open qualification rows. Do not start another P28 task or promote P28's phase state from this slice.
- Before that P28 run, read `docs/execution/EXECUTION_PROTOCOL.md`, `PROGRESS.md`, the complete P28 packet and every authoritative document it names. The packet's legacy `native/kms-native/src/local_speech/` path does not match this checkout; use the existing `native/crates/kms-native/src/local_speech/` path and record that compatible move in the runtime run record.
- Obtain independent provenance/license review for the exact quantized artifact before enabling it in the downloadable catalog. The reviewed Large artifact is pinned to Hugging Face repository commit `98aa99a0a9db05ae2342309f5096248665f7cba3`, filename `ggml-large-v3-turbo-q5_0.bin`, length `574041195`, SHA-256 `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`. Do not invent `reviewedBy` or `reviewedAt`; if the independent review record is absent, stop before enabling this profile.
- Confirm the P26-approved signed-package trust contract that authenticates the embedded catalog. Do not invent a signing algorithm, trust root, or private key. If no accepted contract exists, implement/test only with synthetic fixtures and leave production catalog activation disabled.
- Resolve the exact HTTPS redirect chain for the pinned Large artifact URL. Freeze only the exact HTTPS origins observed/approved in the catalog transport allowlist; reject wildcard hosts, HTTP downgrade and changed/unreviewed redirect origins. Never log a full redirect URL or signed query string.
- Confirm the two existing Small artifacts at the same pinned revision match their current local manifest hashes before adding download URLs. A changed digest requires a new reviewed catalog entry, not an implicit update.
- Before setting the Large resource estimate, run one controlled Large/Small comparison on the same committed synthetic WAV and the same supported Windows host; record peak memory, wall time and RTF. Use only already available, independently hash-verified local artifacts read-only; do not edit, move, stage, or delete files in `native/models/`. Task 7 may run one app-managed integration smoke per model to verify installed-file loading; compare its results with this baseline and do not repeat runs for tuning. If either artifact or a supported host is unavailable, leave the production Large profile disabled until separately authorized provisioning and measurement; do not invent an estimate.
- Public/distributable release remains blocked until the repository's P26 signing gate and P28-T08 model/catalog security review are satisfied. This plan does not implement P26.

## File Map

| Path | Responsibility |
| --- | --- |
| `apps/desktop/src/local-speech-models.ts` | Shared immutable catalog, model IDs, language compatibility and defaults. |
| `apps/desktop/src/main/local-model-manager.ts` | Main-process state machine, private paths, download/resume, verification, activation, preference persistence and removal. |
| `apps/desktop/src/main/local-model-ipc.ts` | Narrow sender-validated IPC handlers for model operations and progress. |
| `apps/desktop/src/local-model-channels.ts` | Electron-free fixed channel names shared by main IPC and preload. |
| `apps/desktop/src/main/ipc-handler.ts` | Resolve renderer-supplied model IDs into verified native path/hash only in the main process before forwarding local engine init. |
| `apps/desktop/src/main/preload.ts` | Typed `window.kmsModels` bridge; no Node or arbitrary-path API. |
| `apps/desktop/src/transcription-workflow.ts` | Resolve the persisted compatible model ID and request local initialization without sending a path or digest. |
| `apps/desktop/src/local-model-manager-panel.tsx` | Explicit model download, selection, progress, cancel and recovery UI. |
| `apps/desktop/src/main/main.ts` | Construct/register the main-process model manager after Electron is ready. |
| `apps/desktop/src/main.tsx` | Connect the model preference API to the existing post-recording workflow and mount the manager UI. |
| `native/crates/kms-native/src/local_speech/model.rs` | Streaming file hash before `WhisperContext` loads the model. |
| Focused `*.test.ts` / Rust tests | Catalog, fault matrix, IPC boundary, UI view state and streaming digest. |

## Task 1: Add the Versioned Desktop Model Catalog

**Files:**

- Create `apps/desktop/src/local-speech-models.ts`
- Create `apps/desktop/src/local-speech-models.test.ts`
- Modify `apps/desktop/src/local-speech-client.ts`
- Modify `apps/desktop/src/local-speech-client.test.ts`

**Interfaces:**

```ts
export type SpeechLanguage = 'vi' | 'en';
export type LocalModelId =
  | 'whisper-large-v3-turbo-q5_0'
  | 'whisper-small-q5_1-vi'
  | 'whisper-small-en-q5_1';

export interface LocalModelProfileV1 {
  modelId: LocalModelId;
  artifactVersion: string;
  fileName: string;
  relativePath: `models/${string}/${string}.bin`;
  languages: readonly SpeechLanguage[];
  engineType: 'whisper_cpp_compat';
  engineCompatibility: string;
  runtime: { platform: 'win32'; architecture: 'x64' };
  byteLength: number;
  sha256: string;
  sourceUrl: string;
  sourceRevision: string;
  licenseProvenance: { license: string; reviewedBy: string; reviewedAt: string };
  resourceEstimate: { minimumMemoryMb: number; maxConcurrentStreams: 1 };
}

export interface LocalModelCatalogV1 {
  version: 1;
  models: Record<LocalModelId, LocalModelProfileV1>;
}

export interface LocalModelRequestV1 {
  modelId: LocalModelId;
  language: SpeechLanguage;
}

export const LOCAL_MODEL_CATALOG: LocalModelCatalogV1;
export const LOCAL_MODEL_CATALOG_VERSION: 1;
export const LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS: readonly string[];
export function getDefaultModelId(language: SpeechLanguage): LocalModelId;
export function getCompatibleModel(id: LocalModelId, language: SpeechLanguage): LocalModelProfileV1;
```

- [ ] **Step 1: Add failing catalog tests** for the three known IDs, Large as default for both languages, explicit language compatibility, engine/runtime compatibility, immutable source revisions, HTTPS allowlist, byte lengths, reviewed provenance and current SHA-256 values. Large constants must match the preflight evidence exactly; do not add a fake review record.

```ts
it('selects Large Turbo by default for both explicit languages', () => {
  expect(getDefaultModelId('vi')).toBe('whisper-large-v3-turbo-q5_0');
  expect(getDefaultModelId('en')).toBe('whisper-large-v3-turbo-q5_0');
});

it('rejects an English-only profile for Vietnamese', () => {
  expect(() => getCompatibleModel('whisper-small-en-q5_1', 'vi')).toThrow(
    'MODEL_LANGUAGE_UNSUPPORTED',
  );
});

it('sends only model ID and language from renderer to native init', async () => {
  const native = { send: vi.fn().mockResolvedValue({ success: true, payload: { initialized: true } }) };
  await initLocalSpeechEngine(native, { modelId: 'whisper-large-v3-turbo-q5_0', language: 'vi' });
  expect(native.send).toHaveBeenCalledWith('local_speech_engine_init', {
    modelId: 'whisper-large-v3-turbo-q5_0',
    language: 'vi',
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails** because the catalog exports do not yet exist.

Run from repository root:

```powershell
pnpm --filter @kms/desktop exec vitest run src/local-speech-models.test.ts
```

- [ ] **Step 3: Implement the catalog, lookup functions, and ID-only init client.** Pin the Large artifact URL to `https://huggingface.co/ggerganov/whisper.cpp/resolve/98aa99a0a9db05ae2342309f5096248665f7cba3/ggml-large-v3-turbo-q5_0.bin`; pin each Small URL to an immutable repository revision after verifying the exact file exists there. Keep all model hashes/lengths in source; do not download a mutable `main` URL. Populate license review fields only from their independent review records. The catalog remains embedded in the signed app; do not add a remote catalog endpoint.

```ts
export function getDefaultModelId(_language: SpeechLanguage): LocalModelId {
  return 'whisper-large-v3-turbo-q5_0';
}

export function getCompatibleModel(
  id: LocalModelId,
  language: SpeechLanguage,
): LocalModelProfileV1 {
  const profile = LOCAL_MODEL_CATALOG.models[id];
  if (!profile.languages.includes(language)) throw new Error('MODEL_LANGUAGE_UNSUPPORTED');
  return profile;
}

export function isLocalModelId(value: unknown): value is LocalModelId {
  return typeof value === 'string' && Object.hasOwn(LOCAL_MODEL_CATALOG.models, value);
}

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return value === 'vi' || value === 'en';
}
```

Remove the fixed-small `LOCAL_SPEECH_MODELS` selection from `local-speech-client.ts`. Update `initLocalSpeechEngine` to send only the selected ID and explicit language; the main-process `IpcHandler` adds the path and digest from the verified catalog later in Task 4. Its options type is `LocalModelRequestV1 & { memoryBudgetMb?: number }`; do not include a path or digest. Map the main-process `MODEL_NOT_FOUND` safe error to the existing workflow `MODEL_NOT_FOUND` behavior.

- [ ] **Step 4: Run catalog and local-speech-client tests.**

```powershell
pnpm --filter @kms/desktop exec vitest run src/local-speech-models.test.ts src/local-speech-client.test.ts
```

- [ ] **Step 5: Check formatting/diff, stage only Task 1 source/test files, run GitNexus staged change detection, then commit.** Do not stage the existing untracked local-model README, manifests or model files.

```powershell
git add -- apps/desktop/src/local-speech-models.ts apps/desktop/src/local-speech-models.test.ts apps/desktop/src/local-speech-client.ts apps/desktop/src/local-speech-client.test.ts
git diff --cached --check
git commit -m "feat(desktop): add versioned local speech model catalog"
```

## Task 2: Add Persisted Model State and Safe Preferences

**Files:**

- Create `apps/desktop/src/main/local-model-manager.ts`
- Create `apps/desktop/src/main/local-model-manager.test.ts`
- Import catalog types from `apps/desktop/src/local-speech-models.ts`

**Interfaces:**

```ts
export type LocalModelState =
  | 'absent' | 'downloading' | 'paused' | 'verifying'
  | 'ready' | 'failed' | 'removing';

export type LocalModelErrorCode =
  | 'NETWORK' | 'DISK_SPACE' | 'INTEGRITY' | 'STORAGE' | 'CANCELLED'
  | 'CATALOG_INVALID' | 'UNSUPPORTED_RUNTIME' | 'MODEL_NOT_FOUND' | 'MODEL_LANGUAGE_UNSUPPORTED';

export class LocalModelError extends Error {
  constructor(readonly code: LocalModelErrorCode, message: string) {
    super(message);
    this.name = 'LocalModelError';
  }
}

export interface LocalModelSnapshot {
  modelId: LocalModelId;
  displayName: string;
  languages: readonly SpeechLanguage[];
  state: LocalModelState;
  downloadedBytes: number;
  byteLength: number;
  preferredFor: readonly SpeechLanguage[];
  errorCode?: LocalModelErrorCode;
}

export interface LocalModelManagerBaseOptions {
  // userData/native-storage; artifact files live below storageRoot/models.
  storageRoot: string;
  catalog: LocalModelCatalogV1;
  verifyCatalogAuthenticity(): Promise<boolean>;
  publish(snapshot: LocalModelSnapshot): void;
}

export interface LocalModelManagerStateApi {
  initialize(): Promise<void>;
  listModels(): Promise<readonly LocalModelSnapshot[]>;
  getPreferredModel(language: SpeechLanguage): Promise<LocalModelId>;
  setPreferredModel(language: SpeechLanguage, modelId: LocalModelId): Promise<void>;
  subscribe(listener: (snapshot: LocalModelSnapshot) => void): () => void;
}
```

Task 2 creates `LocalModelManager` implementing this state/preferences API.

- [ ] **Step 1: Write failing state and storage-boundary tests.** Cover unauthentic catalog rejection, initial `absent` states, Large default preferences for both languages, explicit Small preference persistence, language incompatibility, catalog-only path construction, and no network/filesystem access outside the app-private root.

Create a fresh temporary root per test and remove only that `mkdtemp` result in `afterEach`. Use a verifier spy and progress spy; do not copy model binaries or alter the existing untracked `native/models` content.

```ts
async function makeManagerForTest(verifyCatalogAuthenticity = async () => true) {
  const storageRoot = await mkdtemp(join(tmpdir(), 'kms-model-state-test-'));
  return {
    storageRoot,
    manager: new LocalModelManager({
      storageRoot,
      catalog: LOCAL_MODEL_CATALOG,
      verifyCatalogAuthenticity,
      publish: vi.fn(),
    }),
    cleanup: () => rm(storageRoot, { recursive: true, force: true }),
  };
}

it('defaults both language preferences to Large without downloading or activating it', async () => {
  const { manager, cleanup } = await makeManagerForTest();
  try {
    await manager.initialize();
    expect(await manager.getPreferredModel('vi')).toBe('whisper-large-v3-turbo-q5_0');
    expect(await manager.getPreferredModel('en')).toBe('whisper-large-v3-turbo-q5_0');
    expect((await manager.listModels()).find(x => x.modelId === 'whisper-large-v3-turbo-q5_0')?.state)
      .toBe('absent');
  } finally {
    await cleanup();
  }
});

it('fails closed when catalog authenticity cannot be established', async () => {
  const { manager, cleanup } = await makeManagerForTest(async () => false);
  try {
    await expect(manager.initialize()).rejects.toMatchObject({ code: 'CATALOG_INVALID' });
  } finally {
    await cleanup();
  }
});

it('persists an explicit compatible Small preference and rejects an incompatible language', async () => {
  const { storageRoot, manager, cleanup } = await makeManagerForTest();
  try {
    await manager.initialize();
    await manager.setPreferredModel('en', 'whisper-small-en-q5_1');
    const reopened = new LocalModelManager({
      storageRoot,
      catalog: LOCAL_MODEL_CATALOG,
      verifyCatalogAuthenticity: async () => true,
      publish: vi.fn(),
    });
    await reopened.initialize();
    expect(await reopened.getPreferredModel('en')).toBe('whisper-small-en-q5_1');
    await expect(reopened.setPreferredModel('vi', 'whisper-small-en-q5_1'))
      .rejects.toMatchObject({ code: 'MODEL_LANGUAGE_UNSUPPORTED' });
  } finally {
    await cleanup();
  }
});
```

- [ ] **Step 2: Run the state-manager tests and confirm the new API tests fail** because the manager exports do not yet exist.

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/local-model-manager.test.ts
```

- [ ] **Step 3: Implement catalog validation, initialization/recovery of `local-model-state-v1.json`, and preferences.** Validate every persisted ID/language against the signed embedded catalog; seed both language preferences to Large only when no saved preference exists. Derive all paths from the app-private root and catalog profiles; reject traversal, symlink/reparse escape, unsupported runtime and malformed state. Keep initialization network-free and fail model actions closed if catalog authenticity cannot be established.

```ts
export async function resolveCatalogPath(
  storageRoot: string,
  profile: LocalModelProfileV1,
): Promise<string>;
```

`resolveCatalogPath` returns the absolute on-disk path for manager I/O. `resolveVerifiedModel` returns only the catalog's safe path relative to `storageRoot`, because the native runtime independently joins it to the same `native-storage` root.

- [ ] **Step 4: Verify state/preferences tests, typecheck and formatting.**

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/local-model-manager.test.ts
pnpm --filter @kms/desktop typecheck
```

- [ ] **Step 5: Stage only Task 2 files, run GitNexus staged change detection, and commit.**

```powershell
git add -- apps/desktop/src/main/local-model-manager.ts apps/desktop/src/main/local-model-manager.test.ts
git diff --cached --check
git commit -m "feat(desktop): persist safe local model preferences"
```

## Task 3: Add Resumable Downloads and Verified Atomic Activation

**Files:**

- Modify `apps/desktop/src/main/local-model-manager.ts`
- Modify `apps/desktop/src/main/local-model-manager.test.ts`
- Import `Readable` from `node:stream`, plus `LocalModelProfileV1` and `LocalModelRequestV1` from the catalog module

**Interfaces added to Task 2:**

```ts
export interface ArtifactTransport {
  stream(input: {
    profile: LocalModelProfileV1;
    offset: number;
    validator?: { etag?: string; lastModified?: string };
    signal: AbortSignal;
  }): Promise<{
    body: Readable;
    status: number;
    contentRange?: string;
    etag?: string;
    lastModified?: string;
  }>;
}

export interface NativeModelBinding extends LocalModelRequestV1 {
  // Catalog-derived path relative to userData/native-storage, as expected by the native runtime.
  modelPath: `models/${string}/${string}.bin`;
  modelSha256: string;
}

export interface LocalModelManagerOptions extends LocalModelManagerBaseOptions {
  transport: ArtifactTransport;
  getAvailableBytes(path: string): Promise<number>;
}

export interface LocalModelManagerDownloadApi extends LocalModelManagerStateApi {
  resolveVerifiedModel(modelId: LocalModelId, language: SpeechLanguage): Promise<NativeModelBinding>;
  download(modelId: LocalModelId): Promise<void>;
  pause(modelId: LocalModelId): Promise<void>;
  resume(modelId: LocalModelId): Promise<void>;
  cancel(modelId: LocalModelId): Promise<void>;
  remove(modelId: LocalModelId): Promise<void>;
}
```

Extend `LocalModelManager` to implement `LocalModelManagerDownloadApi`. Same-ID download calls coalesce to one transfer; distinct transfers reserve required disk space before starting.

- [ ] **Step 1: Write failing transfer/lifecycle tests** for explicit download, progress, resume with valid `Content-Range`, restart when range is ignored, pause, cancel cleanup, timeout/offline recovery, low disk, truncated body, wrong length/hash, rejected redirect, concurrent calls, crash at each verification/activation boundary, preservation of an already verified Small profile and confirmed removal. Extend the temporary-root test fixture from Task 2 with a controlled transport that returns tiny synthetic bytes only.

```ts
it('keeps a verified Small usable when the explicit Large download has the wrong digest', async () => {
  await manager.initialize();
  // Test-only tiny catalog entries: Small has a matching digest; Large has the
  // same expected byte length as the fixture but a deliberately wrong digest.
  await manager.setPreferredModel('vi', 'whisper-small-q5_1-vi');
  await manager.download('whisper-small-q5_1-vi');
  await manager.setPreferredModel('vi', 'whisper-large-v3-turbo-q5_0');
  await expect(manager.download('whisper-large-v3-turbo-q5_0'))
    .rejects.toMatchObject({ code: 'INTEGRITY' });
  expect((await manager.listModels()).find(x => x.modelId === 'whisper-small-q5_1-vi')?.state)
    .toBe('ready');
  await expect(manager.resolveVerifiedModel('whisper-small-q5_1-vi', 'vi'))
    .resolves.toMatchObject({ modelId: 'whisper-small-q5_1-vi' });
});
```
- [ ] **Step 2: Run the focused manager suite and record the expected failing signatures.**

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/local-model-manager.test.ts
```

- [ ] **Step 3: Extend the manager with injected HTTPS transport and disk-space accounting.** Production transport uses only the exact pinned URL and `LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS` established in preflight; validate every redirect, reject downgrade/unreviewed hosts, and log only safe host/error codes. Write `.partial` files inside `storageRoot/models/<modelId>/` and persist offset plus ETag/Last-Modified metadata atomically.
- [ ] **Step 4: Implement streamed resume, pause and cancel.** Send `Range` and `If-Range` validators, validate `Content-Range`, restart safely when validators/ranges do not match, retain a valid partial on pause/interruption, and remove only that model's partial+metadata on explicit cancel. Never buffer the artifact in memory.
- [ ] **Step 5: Verify and activate atomically.** Recompute SHA-256 incrementally, compare exact length/hash and catalog authenticity, then rename to the profile's catalog-pinned `relativePath` (versioned as `models/<modelId>/<sha256>.bin`) and atomically update state. Never overwrite an older artifact; on any failure preserve previously verified artifacts and preferences. Refuse removal of a preferred model until the user selects a verified replacement.
- [ ] **Step 6: Run the full lifecycle matrix, typecheck and formatting; inspect diagnostics to confirm no response bodies, signed URLs or model bytes are exposed.**

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/local-model-manager.test.ts
pnpm --filter @kms/desktop typecheck
```

- [ ] **Step 7: Stage only Task 3 files, run GitNexus staged change detection, and commit.**

```powershell
git add -- apps/desktop/src/main/local-model-manager.ts apps/desktop/src/main/local-model-manager.test.ts
git diff --cached --check
git commit -m "feat(desktop): add verified resumable model downloads"
```

## Task 4: Expose a Narrow, Sender-Validated Electron Bridge

**Files:**

- Create `apps/desktop/src/main/local-model-ipc.ts`
- Create `apps/desktop/src/main/local-model-ipc.test.ts`
- Create `apps/desktop/src/local-model-channels.ts`
- Create `apps/desktop/src/main/ipc-handler.test.ts`
- Modify `apps/desktop/src/main/ipc-handler.ts`
- Modify `apps/desktop/src/main/preload.ts`
- Modify `apps/desktop/src/main/preload.test.ts`
- Modify `apps/desktop/src/main/main.ts`
- Modify `apps/desktop/src/main/main.test.ts`
- Modify `apps/desktop/src/main/security.test.ts`

**Existing-symbol impact checked while planning:** `IpcHandler.handleRequest` is LOW risk, exact; one direct caller (`IpcHandler.register`), one affected bootstrap flow and the Main module. Re-run GitNexus impact immediately before the implementation edit; if the live result is HIGH/CRITICAL or its caller/flow set differs, stop and report before proceeding.

**Interface exposed to the renderer:**

```ts
export interface KmsModelsApi {
  listModels(): Promise<readonly LocalModelSnapshot[]>;
  getPreferredModel(language: SpeechLanguage): Promise<LocalModelId>;
  setPreferredModel(language: SpeechLanguage, modelId: LocalModelId): Promise<void>;
  download(modelId: LocalModelId): Promise<void>;
  pause(modelId: LocalModelId): Promise<void>;
  resume(modelId: LocalModelId): Promise<void>;
  cancel(modelId: LocalModelId): Promise<void>;
  remove(modelId: LocalModelId): Promise<void>;
  onProgress(callback: (snapshot: LocalModelSnapshot) => void): () => void;
}
```

- [ ] **Step 1: Add failing bridge tests** proving only fixed model-manager channels and catalog IDs are accepted; renderer cannot submit a URL, absolute/relative path, arbitrary host, or filesystem operation; non-main-window senders are denied; progress has a working unsubscribe. Add native IPC-handler tests proving `local_speech_engine_init` accepts only `modelId`/`language` from the renderer, resolves the verified catalog binding in main, and rejects renderer-supplied `modelPath`/`modelSha256`.

Capture the callback registered by `IpcHandler.register` with a mocked `ipcMain.handle`, and use a running supervisor spy plus a model-manager spy. The malicious-request test must assert rejection occurs before either manager resolution or native forwarding:

```ts
const request = {
  version: 1,
  correlationId: '550e8400-e29b-41d4-a716-446655440000',
  command: 'local_speech_engine_init',
  payload: {
    modelId: 'whisper-large-v3-turbo-q5_0',
    language: 'vi',
    modelPath: '../../outside.bin',
    modelSha256: '0'.repeat(64),
  },
};
await expect(registeredHandler({} as IpcMainInvokeEvent, request)).resolves.toMatchObject({
  success: false,
  error: { code: 'INVALID_MODEL_REQUEST' },
});
expect(modelManager.resolveVerifiedModel).not.toHaveBeenCalled();
expect(supervisor.send).not.toHaveBeenCalled();
```
- [ ] **Step 2: Run preload and model-IPC tests and confirm the new API tests fail.**

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/preload.test.ts src/main/local-model-ipc.test.ts src/main/ipc-handler.test.ts
```

- [ ] **Step 3: Implement `registerLocalModelIpc(ipcMain, manager, getMainWindow)`.** Each handler checks `event.sender` is the current main window, parses strict request schemas, accepts only `LocalModelId`/`SpeechLanguage`, and returns content-free safe errors. Progress events are emitted on one fixed channel.

```ts
// apps/desktop/src/local-model-channels.ts; this module imports no Electron APIs.
export const LOCAL_MODEL_CHANNELS = {
  list: 'kms-models:list', preferred: 'kms-models:preferred', preference: 'kms-models:preference',
  download: 'kms-models:download', pause: 'kms-models:pause', resume: 'kms-models:resume',
  cancel: 'kms-models:cancel', remove: 'kms-models:remove', progress: 'kms-models:progress',
} as const;
```

```ts
// apps/desktop/src/main/local-model-ipc.ts
export function registerLocalModelIpc(
  ipcMain: IpcMain,
  manager: LocalModelManager,
  getMainWindow: () => BrowserWindow | null,
): void;
```

- [ ] **Step 4: Bind the existing native init command in the main process.** Inject the manager into `IpcHandler`; for `local_speech_engine_init`, validate only the catalog ID and explicit language, require the artifact to be verified/present, then derive `modelPath` and `modelSha256` from `resolveVerifiedModel`. Reject requests containing renderer-supplied path/digest fields. Forward all other P13/P14 commands unchanged. Initialize the manager after `app.whenReady()` and before exposing renderer actions. A catalog/model-manager failure disables model actions with a safe error but must not block app startup or recording.

```ts
const modelId = request.payload.modelId;
const language = request.payload.language;
if ('modelPath' in request.payload || 'modelSha256' in request.payload) {
  return this.makeErrorResponse(request.correlationId, 'INVALID_MODEL_REQUEST', 'Invalid local model request', 'validation', request.command);
}
if (!isLocalModelId(modelId) || !isSpeechLanguage(language)) {
  return this.makeErrorResponse(request.correlationId, 'INVALID_MODEL_REQUEST', 'Invalid local model request', 'validation', request.command);
}
const binding = await this.modelManager.resolveVerifiedModel(modelId, language);
const nativeRequest = {
  ...request,
  payload: { ...request.payload, modelPath: binding.modelPath, modelSha256: binding.modelSha256 },
};
return this.supervisor.send(nativeRequest);
```

Catch `LocalModelError` at this boundary and return only its safe code with the fixed message `Selected local model is unavailable`; map unexpected failures to a generic safe storage error. Do not forward filesystem paths or raw exception text to the renderer.

- [ ] **Step 5: Extend preload with `window.kmsModels`.** Expose the typed methods directly; do not expose `ipcRenderer`, `fs`, `fetch`, arbitrary channel names, URLs or paths. Register fixed-channel handlers after `app.whenReady()` and before `mainWindow.loadURL()`.

```ts
import { LOCAL_MODEL_CHANNELS } from '../local-model-channels.js';

function subscribeModelProgress(callback: (snapshot: LocalModelSnapshot) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, snapshot: LocalModelSnapshot) => callback(snapshot);
  ipcRenderer.on(LOCAL_MODEL_CHANNELS.progress, handler);
  return () => ipcRenderer.removeListener(LOCAL_MODEL_CHANNELS.progress, handler);
}

contextBridge.exposeInMainWorld('kmsModels', {
  listModels: () => ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.list),
  getPreferredModel: (language: SpeechLanguage) => ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.preferred, { language }),
  setPreferredModel: (language: SpeechLanguage, modelId: LocalModelId) =>
    ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.preference, { language, modelId }),
  download: (modelId: LocalModelId) => ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.download, { modelId }),
  pause: (modelId: LocalModelId) => ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.pause, { modelId }),
  resume: (modelId: LocalModelId) => ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.resume, { modelId }),
  cancel: (modelId: LocalModelId) => ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.cancel, { modelId }),
  remove: (modelId: LocalModelId) => ipcRenderer.invoke(LOCAL_MODEL_CHANNELS.remove, { modelId }),
  onProgress: (callback: (snapshot: LocalModelSnapshot) => void) =>
    subscribeModelProgress(callback), // fixed progress channel; returns listener cleanup
});
```
- [ ] **Step 6: Update security assertions and run focused tests.**

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/preload.test.ts src/main/local-model-ipc.test.ts src/main/ipc-handler.test.ts src/main/security.test.ts src/main/main.test.ts
pnpm --filter @kms/desktop typecheck
```

- [ ] **Step 7: Stage only Task 4 files, run GitNexus staged change detection, and commit.**

```powershell
git add -- apps/desktop/src/local-model-channels.ts apps/desktop/src/main/local-model-ipc.ts apps/desktop/src/main/local-model-ipc.test.ts apps/desktop/src/main/ipc-handler.ts apps/desktop/src/main/ipc-handler.test.ts apps/desktop/src/main/preload.ts apps/desktop/src/main/preload.test.ts apps/desktop/src/main/main.ts apps/desktop/src/main/main.test.ts apps/desktop/src/main/security.test.ts
git diff --cached --check
git commit -m "feat(desktop): expose safe local model management IPC"
```

## Task 5: Wire Preferences, Transcription Selection and Model UI

**Files:**

- Create `apps/desktop/src/local-model-manager-panel.tsx`
- Create `apps/desktop/src/local-model-manager-view-model.ts`
- Create `apps/desktop/src/local-model-manager-view-model.test.ts`
- Modify `apps/desktop/src/transcription-workflow.ts`
- Modify `apps/desktop/src/transcription-workflow.test.ts`
- Modify `apps/desktop/src/main.tsx`
- Modify `apps/desktop/src/styles.css`
- Modify `apps/desktop/src/main.test.ts`

**Workflow interface:**

```ts
export interface TranscriptionWorkflowDependencies {
  native: NativeSender;
  resolveModel(language: SpeechLanguage): Promise<LocalModelId>;
  initEngine?: typeof initLocalSpeechEngine;
  transcribeWindow?: typeof transcribeWindow;
}
```

- [ ] **Step 1: Write failing workflow tests** for Large default in both languages, persisted explicit Small preference, incompatible profile rejection before native engine init, and missing/unverified Large returning `MODEL_NOT_FOUND` without sending any cloud command. Add a UI/startup test proving neither app launch nor recording requests a model download; only the explicit Download button does.

```ts
const native: NativeSender = { send: vi.fn().mockResolvedValue({ success: true, payload: {} }) };
const resolveModel = vi.fn().mockResolvedValue('whisper-large-v3-turbo-q5_0');
const initEngine = vi.fn().mockResolvedValue({ initialized: true, isSimulated: false });
const transcribeWindow = vi.fn().mockResolvedValue({ segments: [], isSimulated: false });
await transcribeMeeting(
  { native, resolveModel, initEngine, transcribeWindow },
  { meetingId: 'synthetic-1', language: 'vi' },
);
expect(resolveModel).toHaveBeenCalledWith('vi');
expect(initEngine).toHaveBeenCalledWith(native, expect.objectContaining({
  modelId: 'whisper-large-v3-turbo-q5_0',
  language: 'vi',
}));
```

- [ ] **Step 2: Run the focused workflow tests and confirm they fail** against the current fixed-Small mapping.

```powershell
pnpm --filter @kms/desktop exec vitest run src/transcription-workflow.test.ts
```

- [ ] **Step 3: Change transcription workflow to resolve the persisted model ID** for the requested explicit language and pass only that ID and language to native initialization. Resolve within the existing error-mapping `try` block so `MODEL_NOT_FOUND` remains a workflow error and no window-transcription call follows failed initialization. The main-process handler supplies path/digest from the verified catalog binding. Preserve `local_speech_transcribe_window` and transcript outputs unchanged.

```ts
try {
  const modelId = await deps.resolveModel(input.language);
  await initEngineFn(deps.native, { modelId, language: input.language });
} catch (error) {
  if (error instanceof LocalSpeechError && error.code === 'MISSING_MODEL') {
    throw new TranscriptionWorkflowError('MODEL_NOT_FOUND', error.message);
  }
  if (error instanceof LocalSpeechError && error.code === 'NOT_AVAILABLE') {
    throw new TranscriptionWorkflowError('RUNTIME_PREREQUISITE_MISSING', error.message);
  }
  throw new TranscriptionWorkflowError('ENGINE_INIT_FAILED', String(error));
}
```

- [ ] **Step 4: Add a pure view model and UI component.** Show each model's size, compatible language, state and required user action. Download starts only after a button press. Show progress, pause/resume/cancel, verification, errors and removal confirmation. If Large is absent, the user can explicitly pick an installed Small profile; never switch automatically.

```ts
export function getMissingModelAction(modelId: LocalModelId): {
  primary: 'download';
  fallback: 'explicit-installed-model-choice';
  cloudFallback: false;
};
```

- [ ] **Step 5: Mount the model panel and missing-model prompt** from the existing post-recording local-transcription surface. Recording controls remain independent and available while a model is absent/downloading. Add accessible labels, `role="status"` progress and `role="alert"` safe errors.

```tsx
<LocalModelManagerPanel
  models={modelSnapshots}
  onDownload={(modelId) => window.kmsModels.download(modelId)}
  onSelect={(language, modelId) => window.kmsModels.setPreferredModel(language, modelId)}
/>
```

Provide `transcribeMeeting` with `resolveModel: (language) => window.kmsModels.getPreferredModel(language)`; type the preload bridge in the renderer through a type-only `KmsModelsApi` import or a local `window` cast. Keep model source URLs and relative paths out of the renderer response.
- [ ] **Step 6: Test view-model behavior and update desktop assertions** for Large default, explicit Small selection, no silent fallback, and no download request until the user activates Download.

```ts
expect(getMissingModelAction('whisper-large-v3-turbo-q5_0')).toEqual({
  primary: 'download',
  fallback: 'explicit-installed-model-choice',
  cloudFallback: false,
});
```

- [ ] **Step 7: Run workflow/UI tests, desktop unit tests and typecheck.**

```powershell
pnpm --filter @kms/desktop exec vitest run src/transcription-workflow.test.ts src/local-model-manager-view-model.test.ts src/main.test.ts
pnpm --filter @kms/desktop typecheck
```

- [ ] **Step 8: Stage only Task 5 files, run GitNexus staged change detection, and commit.**

```powershell
git add -- apps/desktop/src/local-model-manager-panel.tsx apps/desktop/src/local-model-manager-view-model.ts apps/desktop/src/local-model-manager-view-model.test.ts apps/desktop/src/transcription-workflow.ts apps/desktop/src/transcription-workflow.test.ts apps/desktop/src/main.tsx apps/desktop/src/styles.css apps/desktop/src/main.test.ts
git diff --cached --check
git commit -m "feat(desktop): make Large Turbo the local speech default"
```

## Task 6: Hash Model Files Without a Second Full-Size RAM Buffer

**Blast radius checked before planning this change:** GitNexus resolved `WhisperModel::load` in `native/crates/kms-native/src/local_speech/model.rs` as `LOW` risk, exact; one direct caller (`LocalSpeechEngine::transcribe_window`), two affected local-speech execution flows, one module. Re-run impact immediately before editing; if it is HIGH/CRITICAL or the callers differ, stop and report before proceeding.

**Files:**

- Modify `native/crates/kms-native/src/local_speech/model.rs`

- [ ] **Step 1: Add failing streaming-hash unit tests** using a temporary file with known bytes and the SHA-256 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` for `abc`; include a missing-file error test.

```rust
#[test]
fn hashes_model_file_incrementally() {
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), b"abc").unwrap();
    assert_eq!(hash_model_file(file.path()).unwrap(),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}

#[test]
fn missing_model_file_returns_unavailable() {
    let directory = tempfile::tempdir().unwrap();
    assert!(matches!(hash_model_file(&directory.path().join("missing.bin")), Err(ModelError::Unavailable)));
}
```
- [ ] **Step 2: Run the narrow Rust test and confirm the helper/test is absent.**

Run from `native/`:

```powershell
cargo test -p kms-native --features local-speech local_speech::model::tests
```

- [ ] **Step 3: Re-run GitNexus impact** for the exact `load` function in `native/crates/kms-native/src/local_speech/model.rs`; record the direct caller, affected processes and risk in the task evidence.
- [ ] **Step 4: Replace `fs::read(path)` hashing with a 64 KiB streaming SHA-256 loop** using `File::open`, `Read::read`, and `Sha256::update`. Preserve checksum comparison, language validation, `WhisperContext::new_with_params`, and all current error semantics.

```rust
fn hash_model_file(path: &Path) -> Result<String, ModelError> {
    use std::io::Read;

    let mut file = std::fs::File::open(path).map_err(|_| ModelError::Unavailable)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|_| ModelError::Unavailable)?;
        if count == 0 { break; }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
```
- [ ] **Step 5: Run Rust formatting, focused test, and local-speech native suite.**

```powershell
cargo fmt --check
cargo test -p kms-native --features local-speech local_speech::model::tests
cargo test -p kms-native --features local-speech
```

- [ ] **Step 6: Stage only `model.rs`, run GitNexus staged change detection, and commit.**

```powershell
git add -- native/crates/kms-native/src/local_speech/model.rs
git diff --cached --check
git commit -m "perf(native): stream local model checksum reads"
```

## Task 7: Verify Integrated Model Flow and Run Controlled Synthetic Inference

**Files:**

- Create `apps/desktop/src/main/local-model-integration.test.ts` to exercise the real manager and native-init IPC binding together with an injected synthetic byte-stream transport and a tiny test catalog. This validates lifecycle integration; it does not claim a real model was downloaded or run.
- Use, but do not modify, `apps/desktop/test-fixtures/synthetic-meeting/synthetic-meeting.wav` and `expected-transcript.json`.
- Write direct evidence only under `docs/execution/evidence/P28/local-model-download/` after the corresponding test actually runs.

- [ ] **Step 1: Add the manager/native-init integration test** with an isolated temporary `userData` directory and a test-only catalog entry serving small synthetic bytes. Verify the real manager lifecycle API downloads, reports progress, verifies, activates and survives manager restart offline; then prove the native-init handler derives its path/hash from that verified entry and rejects renderer-supplied URLs or paths. Task 4 independently tests the fixed-channel manager IPC. This test does not claim Large inference.

Import `Readable`, `createHash`, the catalog/manager types, and Vitest. Create `temporaryUserData` with `mkdtemp`, set `storageRoot = join(temporaryUserData, 'native-storage')`, and clean only that returned temporary path in `finally`. Use an injected byte stream only for lifecycle testing; never pass these bytes to Whisper or label them as a model. The test fixture replaces one catalog profile's expected length/digest/path and invokes the same manager methods as production:

```ts
const artifact = Buffer.from('synthetic lifecycle fixture');
const modelId = 'whisper-small-q5_1-vi' as const;
const digest = createHash('sha256').update(artifact).digest('hex');
const testProfile = {
  ...LOCAL_MODEL_CATALOG.models[modelId],
  byteLength: artifact.length,
  sha256: digest,
  relativePath: `models/${modelId}/${digest}.bin` as const,
};
const testCatalog = {
  ...LOCAL_MODEL_CATALOG,
  models: { ...LOCAL_MODEL_CATALOG.models, [modelId]: testProfile },
};
const transport: ArtifactTransport = {
  stream: async () => ({ body: Readable.from([artifact]), status: 200 }),
};
const publish = vi.fn();
const manager = new LocalModelManager({
  storageRoot,
  catalog: testCatalog,
  transport,
  verifyCatalogAuthenticity: async () => true, // isolated synthetic catalog only
  getAvailableBytes: async () => Number.MAX_SAFE_INTEGER,
  publish,
});
await manager.initialize();
await manager.download(modelId);
expect(publish).toHaveBeenCalledWith(expect.objectContaining({ modelId, downloadedBytes: artifact.length }));
await expect(manager.resolveVerifiedModel(modelId, 'vi')).resolves.toMatchObject({
  modelId,
  modelPath: `models/${modelId}/${digest}.bin`,
  modelSha256: digest,
});
```

Pass a `local_speech_engine_init` request for that model through the `IpcHandler` test fixture from Task 4 and assert the supervisor receives exactly this resolved relative path/digest; assert no request is made to the catalog's production URL. Reopen the same `storageRoot` with a new manager whose transport throws on any request and prove the verified binding remains available offline.
- [ ] **Step 2: Run the focused integration test** and fix only failures in this feature.

```powershell
pnpm --filter @kms/desktop exec vitest run src/main/local-model-integration.test.ts
```

- [ ] **Step 3: Run a real Large-vs-Small inference smoke on the exact same committed synthetic WAV and supported Windows host used in preflight.** Use already verified app-managed models only; do not start an implicit download. Record model hashes, WER/CER, transcript-range coverage, wall time, real-time factor and peak process memory. If either model is not installed or the host is unsupported, record this measurement as `BLOCKED` without substituting synthetic model bytes. This short fixture is not P28-T07 qualification or an accuracy/speed claim.
- [ ] **Step 4: Run the focused regression set.**

```powershell
pnpm --filter @kms/desktop exec vitest run --exclude src/main/packaged-app.smoke.test.ts
pnpm --filter @kms/desktop typecheck
pnpm --filter @kms/native-contract test:unit
```

Replay the existing P13/P14 golden fixture suites using the focused commands recorded in `docs/execution/evidence/P13/EVIDENCE.md` and `docs/execution/evidence/P14/RUN-20260811-2059.md`; record exact command and non-zero test count in this slice's run record. Do not treat `pnpm verify` or a zero-test umbrella as fixture evidence.

Do not run `pnpm --filter @kms/desktop test:smoke` in this synthetic-only task: its current packaged test records real WASAPI audio. Run it only after separate explicit consent and a verified capture-safe test setup.

Run from `native/`:

```powershell
cargo test -p kms-native --features local-speech
```

- [ ] **Step 5: Record P28-T07 and T08 as separate unclosed phase gates.** P28-T07 needs fixed clean/noisy/long synthetic Vietnamese and English assets on supported hardware; P28-T08 needs independent artifact/provenance and signed-release review. Do not claim either gate from this short smoke, substitute real meeting content, or mark P28 `VERIFIED`.
- [ ] **Step 6: Complete an independent diff/security review.** Check model catalog revisions, hashes, licenses, redirects, path containment, crash recovery, content-free diagnostics, no cloud fallback and capture priority.
- [ ] **Step 7: Run `git diff --check`, verify test outputs and direct task evidence, run `gitnexus.detect_changes()` before committing, then commit only this task's integration test and direct evidence files.** Do not update `STATUS.md`, `TRACEABILITY.md`, `PROGRESS.md`, P27 evidence, or the aggregate P28 phase state from this feature slice.

## Completion Boundary

- Feature-level implementation is complete only after Tasks 1-7 and their narrow tests pass.
- Distribution/release remains blocked until P26 signing and independent P28-T07/T08 evidence pass.
- P14 is a prerequisite, not part of this implementation plan. If P14 is still not `VERIFIED`, do not execute Task 1 or later and request separate authorization to qualify P14.
- This desktop model-management slice does not implement P28 mobile local, local-live, audio-import or the rest of the P28 task packet, and cannot mark P28 `VERIFIED`.
