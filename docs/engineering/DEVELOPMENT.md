# Development Guide

**Status:** Accepted  
**Owner:** Engineering  
**Last reviewed:** 2026-07-21

## Prerequisites

- Node.js current LTS supported by Expo/Electron tooling.
- pnpm version declared in the root `package.json`.
- Git and platform SDKs for the target application.
- Docker for local PostgreSQL, Redis and MinIO once infrastructure is added.

## Setup

```powershell
pnpm install
pnpm run typecheck
```

Copy `.env.example` to an ignored local env file. Never commit provider keys. The `mock` AI provider is the default for credential-free development.

## Common commands

```powershell
pnpm dev:api
pnpm dev:desktop
pnpm dev:mobile
pnpm run typecheck
pnpm test
```

The current clients are UI prototypes. Commands and setup evolve with implementation; update this guide in the same change.

## Repository conventions

- Domain types and state rules live in shared packages, not duplicated in clients.
- Runtime schemas accompany TypeScript types at network/storage boundaries.
- Provider-specific code remains in adapters.
- Source evidence is never updated through generic repository methods.
- Long-running work returns a job resource.
- User-visible errors use stable codes and localized messages.

## Branch and change workflow

1. Create a `codex/` or feature branch from the current integration branch.
2. Link the change to a requirement/ADR when applicable.
3. Add tests before or with behavior changes.
4. Run typecheck, unit/integration tests and relevant E2E scenarios.
5. Update implementation status and affected docs.
6. Use a pull request with risk, test evidence, migration and rollback notes.

## Definition of done

- Acceptance criteria pass and failure paths are tested.
- Types plus runtime validation are present.
- Logs/telemetry contain no meeting content or secrets.
- Accessibility/localization impact is checked.
- Database changes include migration, rollback/restore and compatibility sequencing.
- Documentation and implementation status reflect reality.
- No critical/high security or data-loss issue remains open.

## Environment variables

Names, not values, are documented in `.env.example`. Categories:

- Database, Redis and object-storage endpoints.
- Auth signing/issuer configuration.
- Speech/translation/generative provider selection and credentials.
- Observability endpoints and release/environment tags.
- Feature flags and cost/concurrency limits.

Validate configuration at startup and fail with safe, actionable messages.
