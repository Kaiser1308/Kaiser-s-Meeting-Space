# Kaiser’s Meeting Space

Meeting capture and documentation software for Vietnamese and English conversations. The product preserves original audio and complete transcripts, optionally translates meetings in real time, and produces detailed, evidence-linked minutes.

> **Project status:** Pre-alpha / architecture prototype. Recording, persistence, authentication, production AI integrations, export, and release packaging are not implemented yet. See [Implementation Status](docs/STATUS.md).

## Product principles

- **Complete by default:** Never replace the original audio or transcript with a summary.
- **Evidence-linked:** Important minutes content points back to transcript segments and timestamps.
- **Explicit language:** Every meeting starts with Vietnamese or English selected by the user.
- **User-controlled AI:** AI creates reviewable derived artifacts; it never silently changes evidence.
- **Provider-neutral:** Speech and generative AI providers can be changed independently.
- **Resilient capture:** Audio is written locally before upload and recoverable after network or application failure.

## Target applications

| Application | Primary use | Status |
|---|---|---|
| Mobile (Expo / React Native) | In-person microphone recording | UI prototype |
| Desktop (Electron / React + Rust runtime) | Online meetings, system audio, minutes editor | UI prototype; native runtime not started |
| API (Fastify / TypeScript) | Provider orchestration and business API | Skeleton |

## Repository

```text
apps/
  api/                 Backend API
  desktop/             Desktop client
  mobile/              Mobile client
packages/
  ai/                  Generative AI provider abstraction
  domain/              Shared domain types
docs/                  Product, architecture, security and operations docs
```

## Local development

Requirements: Node.js 22+, pnpm 10+ and platform tooling required by Expo/Electron. Rust is added when the native capture phase begins.

```powershell
pnpm install
pnpm run typecheck
pnpm dev:api
pnpm dev:desktop
pnpm dev:mobile
```

Copy `.env.example` to an ignored local environment file before enabling external providers. Provider credentials must remain server-side.

## Documentation

Start with the [Documentation Hub](docs/README.md). Key references:

- [Product Requirements](docs/product/PRD.md)
- [User Flows](docs/product/USER_FLOWS.md)
- [System Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Security and Privacy](docs/security/SECURITY_AND_PRIVACY.md)
- [Delivery Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

## License

No license has been selected. Until one is added, the repository is private/proprietary and reuse is not granted.
