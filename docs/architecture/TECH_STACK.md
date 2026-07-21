# Technology Stack

**Status:** Accepted for alpha planning  
**Owner:** Engineering  
**Last reviewed:** 2026-07-21

## Selected stack

| Layer | Technology | Purpose |
|---|---|---|
| Language | TypeScript | Shared types and implementation across clients/backend |
| Workspace | pnpm workspaces; Turborepo when task graph is needed | Dependency and build orchestration |
| Mobile | Expo + React Native | iOS/Android in-person capture and mobile library |
| Desktop | Electron + React + Vite | Window/update lifecycle and full TipTap editor |
| Native runtime | Rust signed sidecar/native bridge | Predictable audio callbacks, device health and optional local AI |
| Windows audio | WASAPI loopback through the Rust runtime | Reliable microphone/system-audio capture |
| API | Node.js LTS + Fastify | Typed REST/realtime coordination |
| Validation/API schema | Zod + generated OpenAPI | Runtime validation and client contract generation |
| Database | PostgreSQL + Drizzle ORM | Transactional domain state with explicit SQL migrations |
| Client recovery store | SQLite + filesystem manifests | Offline queue and crash-safe recording state |
| Object storage | S3-compatible; MinIO dev, S3/R2 production | Immutable audio and generated files |
| Queue | Redis + BullMQ | Durable background processing and bounded retries |
| Realtime | WebSocket for speech; SSE for durable progress | Low latency plus resumable status events |
| Speech API | Deepgram adapter | Realtime Vietnamese/English transcription and diarization |
| Local speech | whisper.cpp adapter | Optional offline/file transcription |
| Translation | Provider adapter for Google/Azure/DeepL/LLM | Replaceable Vietnamese ↔ English translation |
| Generative AI | Provider registry: OpenAI, Anthropic, Gemini, Azure, Ollama | Detailed minutes without vendor lock-in |
| Editor | TipTap/ProseMirror | Structured desktop-first minutes editing |
| Export | `docx`; HTML/Chromium PDF; native MD/TXT/JSON | Version-pinned document generation |
| Unit/integration tests | Vitest + Testcontainers | Fast logic tests and real service integration |
| Web/desktop E2E | Playwright | User flows and Electron-compatible automation |
| Mobile E2E | Maestro | Cross-platform mobile flow testing |
| Observability | OpenTelemetry + Sentry | Traces/metrics and safe client/server errors |
| Delivery | Docker + GitHub Actions | Reproducible services and gated CI/CD |

## Guardrails

- Provider SDK types never leak into domain types.
- Electron owns UI/window/update concerns; Rust owns capture/device/local-model concerns; Node owns cloud business rules.
- Native capture is isolated behind a versioned, allowlisted, signed and permission-reviewed IPC contract.
- Audio/work channels are bounded with explicit overflow behavior and content-free diagnostics.
- Microphone and system source tracks are preserved independently; any mix is a derived artifact.
- PostgreSQL is the source of truth; Redis is never authoritative.
- Audio bytes do not pass through the API when direct signed upload is possible.
- Runtime validation occurs at every external boundary.
- Dependency versions are pinned by lockfile and updated through reviewed PRs.

## Alternatives and triggers

- Replace Electron with Tauri only after proving required Windows/macOS audio capture and update/signing workflows.
- A Tauri evaluation must also demonstrate measured improvement in RAM, installer size and security surface without regressing TipTap/editor, updater or IPC testability.
- Replace BullMQ with a managed queue when operational scale or delivery guarantees require it.
- Add a dedicated search index only when PostgreSQL full-text/vector performance is measured insufficient.
- Add Kubernetes only when service count/scale justifies its operational cost; alpha uses simpler managed containers.
