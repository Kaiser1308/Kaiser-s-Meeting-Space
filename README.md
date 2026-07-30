# Kaiser's Meeting Space

Meeting capture and documentation software for Vietnamese and English conversations. The product preserves original audio and complete transcripts, optionally translates meetings in real time, and produces detailed, evidence-linked minutes.

> **Project status:** Pre-alpha / engineering foundation (P01 in progress). Recording, persistence, authentication, production AI integrations, export, and release packaging are not implemented yet. See [Implementation Status](docs/STATUS.md) and [Execution Progress](docs/execution/PROGRESS.md).

## Product principles

- **Complete by default:** Never replace the original audio or transcript with a summary.
- **Evidence-linked:** Important minutes content points back to transcript segments and timestamps.
- **Explicit language:** Every meeting starts with Vietnamese or English selected by the user.
- **User-controlled AI:** AI creates reviewable derived artifacts; it never silently changes evidence.
- **Provider-neutral:** Speech and generative AI providers can be changed independently.
- **Resilient capture:** Audio is written locally before upload and recoverable after network or application failure.

## Target applications

| Application                               | Primary use                                   | Status                                   |
| ----------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| Mobile (Expo / React Native)              | In-person microphone recording                | UI prototype                             |
| Desktop (Electron / React + Rust runtime) | Online meetings, system audio, minutes editor | UI prototype; native runtime not started |
| API (Fastify / TypeScript)                | Provider orchestration and business API       | Skeleton                                 |

## Repository

```text
apps/
  api/                 Backend API
  desktop/             Desktop client
  mobile/              Mobile client
packages/
  ai/                  Generative AI provider abstraction
  config/              Typed runtime configuration (Zod)
  domain/              Shared domain types
  test-support/        Test utilities and synthetic fixtures
docs/                  Product, architecture, security, operations, and execution docs
tests/                 Root-level cross-cutting tests
```

## Local development

**Requirements:** Node.js v24.18.0, pnpm 10.14.0, Docker 27+ (for local services).

```powershell
# Setup
pnpm install --frozen-lockfile
pnpm typecheck

# Run tests
pnpm test:unit

# Fast verification gate
pnpm verify

# Start local services (PostgreSQL, Redis, MinIO)
docker compose up -d

# Development servers
pnpm dev:api
pnpm dev:desktop
pnpm dev:mobile
```

Copy `.env.example` to `.env` for local development. The `mock` AI provider works without credentials.

### Quick reference

| Command               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `pnpm format:check`   | Check formatting (Prettier)                          |
| `pnpm lint`           | Run ESLint                                           |
| `pnpm typecheck`      | Type-check all packages                              |
| `pnpm test:unit`      | Run unit tests                                       |
| `pnpm verify`         | Fast gate: format + lint + typecheck + tests + build |
| `pnpm verify:release` | Full release gate                                    |

Full details in the [Development Guide](docs/engineering/DEVELOPMENT.md).

## Documentation

Start with the [Documentation Hub](docs/README.md). Key references:

- [Product Requirements](docs/product/PRD.md)
- [User Flows](docs/product/USER_FLOWS.md)
- [System Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Development Guide](docs/engineering/DEVELOPMENT.md)
- [Test Strategy](docs/engineering/TEST_STRATEGY.md)
- [Security and Privacy](docs/security/SECURITY_AND_PRIVACY.md)
- [Delivery Roadmap](docs/ROADMAP.md)
- [Implementation Status](docs/STATUS.md)
- [Contributing](CONTRIBUTING.md)

## License

No license has been selected. Until one is added, the repository is private/proprietary and reuse is not granted.
