# Runbook: Windows Offline Personal Installation & Verification

This runbook guides the repository owner through a repeatable personal build, installation, execution, and verification of **Kaiser's Meeting Space** on Windows.

---

## 1. Overview & Architectural Scope

- **Platform:** Windows 10 / 11 (x64)
- **Deployment Model:** Single-node personal workstation installation
- **Offline Invariants:**
  - Zero external network dependencies: No cloud STT providers, no telemetry, no cloud analytics.
  - Native runtime supervisor manages the local Rust sidecar (`kms-native.exe`) via versioned, length-prefixed IPC envelopes.
  - Recording pipeline commits raw audio chunks to local storage; source recordings and transcripts are immutable.
  - Completed meetings and transcripts persist locally across application restarts.

---

## 2. Prerequisites & Environment Setup

Ensure the following tools are installed and available in `PATH`:

| Tool | Minimum Version | Verification Command |
| :--- | :--- | :--- |
| **Windows OS** | Windows 10 / 11 64-bit | `cmd /c ver` |
| **Node.js** | v24.x LTS (ESM enabled) | `node -v` |
| **pnpm** | v10.x (isolated store) | `pnpm -v` |
| **Rust / Cargo** | 1.80+ (MSVC toolchain) | `cargo --version` |
| **Docker Desktop** | Latest (WSL2 backend) | `docker --version` |

---

## 3. Build & Packaging Procedure

Execute all commands from the repository root (`C:\Users\thien\Documents\Project\Kaiser's Meeting Space`):

### Step 1: Build the Rust Native Sidecar

Compile the high-performance audio capture and supervisor sidecar binary in release mode:

```powershell
cargo build --release -p kms-native
```

Verify binary creation:
```powershell
Test-Path "native/target/release/kms-native.exe"
# Expected: True
```

### Step 2: Install Workspace Dependencies

Install dependencies across the monorepo workspace:

```powershell
pnpm install
```

### Step 3: Build & Package the Desktop Electron Application

Execute the unified build pipeline. This typechecks TypeScript, builds the React renderer with Vite, compiles the Electron main/preload scripts, and packages the standalone distribution bundle:

```powershell
pnpm --filter @kms/desktop build:electron
```

The output distribution directory is created at:
`apps/desktop/dist-packaged/win-unpacked/`

Key packaged artifacts:
- Application Executable: `apps/desktop/dist-packaged/win-unpacked/Kaiser's Meeting Space.exe`
- Embedded Native Sidecar: `apps/desktop/dist-packaged/win-unpacked/resources/native/kms-native.exe`

---

## 4. Running the Application

### Option A: Running from Packaged Standalone Artifact (Recommended for End Users)

Launch the packaged executable directly:

```powershell
& "apps\desktop\dist-packaged\win-unpacked\Kaiser's Meeting Space.exe"
```

### Option B: Running in Development Mode

Run the local Vite development server with hot-reload and Electron shell:

```powershell
pnpm --filter @kms/desktop dev
```

---

## 5. End-to-End M1–M6 Offline Verification Workflow

Follow this smoke-test procedure to verify full milestone compliance (M1 through M6):

| Milestone | Checkpoint | Verification Procedure | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **M1: Truthful Boot** | Native Supervisor Lifecycle | Launch application and inspect top banner. | Status shows `Supervisor: healthy` with active uptime. Physical audio devices (microphone/system) are enumerated. |
| **M2: Meeting Start** | Local API Integration | Click **Start meeting**. | Meeting state switches to `recording`. A valid RFC4122 UUID is assigned and logged. |
| **M3: Record & Stop** | Local Audio Durability | Speak into the microphone for 5–10 seconds, then click **End meeting**. | Capture health meters show live mic level. Stopping commits local chunks and displays the **Session Evidence Card** (UUID, Chunk Counts, `commitStatus: clean`, Finalized At). |
| **M4: Post-recording Transcript** | Truthful Local Speech Engine | On the Session Evidence Card, click **Transcribe meeting (Local Whisper)**. | If MSVC whisper.cpp toolchain is compiled: generates source transcript segments. If built without C++ Whisper: truthfully displays diagnostic prerequisite banner (`Local speech runtime is not available in the current native build...`) without crashing. |
| **M5: Library & Markdown Export** | Meeting Library & Export | 1. Click **Library** tab.<br>2. Select a meeting and click **View / Reopen**.<br>3. Click **Export Markdown**. | 1. Library displays chronological list of meetings with state badges.<br>2. Reopening restores meeting metadata and persisted transcript segments.<br>3. Browser triggers save for `{title}_{shortId}.md` with clean GitHub Flavored Markdown. |
| **M6: Restart Retention** | Data Persistence Across Exit | Close the application completely and restart it. Navigate to **Library**. | Previously recorded meetings and saved transcript segments remain fully visible and retrievable. |

---

## 6. Troubleshooting & Diagnostic FAQ

### 1. Native Supervisor Reports `crashed` or `offline`
- **Cause:** The native sidecar executable was not found or was terminated.
- **Remedy:** Ensure `cargo build --release -p kms-native` was run prior to launching. For packaged builds, confirm `resources/native/kms-native.exe` is present.
- **Budget Limits:** The supervisor limits restarts to 3 attempts per 60-second window. If exceeded, state latches to `crashed`. Check console logs for exit codes.

### 2. Fastify API Returns `API_UNAVAILABLE` (port 4310)
- **Cause:** Local backend services (Docker or API dev server) are not listening on port 4310.
- **Remedy:** Start the local API server (`pnpm --filter @kms/api dev`) or ensure Docker containers for PostgreSQL and Redis are running (`docker compose up -d`).

### 3. Whisper Speech Feature Missing
- **Diagnostic Message:** `"Local speech runtime is not available in the current native build (requires MSVC whisper.cpp C++ toolchain)."`
- **Remedy:** This is an intentional diagnostic safeguard. Compiling the optional `local-speech` feature requires Microsoft Visual C++ Build Tools and CMake. Once installed, recompile with:
  ```powershell
  cargo build --release -p kms-native --features local-speech
  ```

### 4. Windows Defender / SmartScreen Alert
- **Cause:** Standalone personal builds are not code-signed with an EV certificate (code signing is out of scope for the personal MVP).
- **Remedy:** Click **More info** -> **Run anyway**.
