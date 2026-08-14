# Development Guide

**Status:** Accepted
**Owner:** Engineering
**Last reviewed:** 2026-07-21

## Prerequisites

| Tool        | Version      | Installation                                                        |
| ----------- | ------------ | ------------------------------------------------------------------- |
| Node.js     | v24.18.0 LTS | https://nodejs.org/ (use nvm or fnm for version management)         |
| pnpm        | 10.14.0      | `corepack enable && corepack prepare pnpm@10.14.0 --activate`       |
| Git         | any recent   | https://git-scm.com/                                                |
| Docker      | 27+          | https://www.docker.com/products/docker-desktop (for local services) |
| Windows SDK | —            | Required for desktop builds on Windows                              |

Verify:

```powershell
node --version   # v24.18.0
pnpm --version   # 10.14.0
docker --version # Docker version 27+
```

## Setup

```powershell
# 1. Clone
git clone <repo-url> kaiser-meeting-space
cd kaiser-meeting-space

# 2. Install dependencies (frozen lockfile)
pnpm install --frozen-lockfile

# 3. Run typecheck to verify toolchain
pnpm typecheck

# 4. Run all tests
pnpm test:unit

# 5. Start local services (optional; required for integration work)
docker compose up -d
docker compose down   # stop when done
```

Copy `.env.example` to `.env` for local development. Fill in provider keys only when
testing against real services; the `mock` AI provider works without credentials.

## Common commands

| Command                          | Purpose                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Install exact dependencies from lockfile                                                   |
| `pnpm format:check`              | Check formatting (Prettier)                                                                |
| `pnpm format`                    | Auto-fix formatting                                                                        |
| `pnpm lint`                      | Run ESLint                                                                                 |
| `pnpm typecheck`                 | Type-check all workspace packages                                                          |
| `pnpm test`                      | Run unit tests (alias for test:unit)                                                       |
| `pnpm test:unit`                 | Run unit tests across all packages                                                         |
| `pnpm test:integration`          | Run integration tests (requires local services)                                            |
| `pnpm test:contract`             | Run contract tests                                                                         |
| `pnpm test:e2e:desktop`          | Run desktop E2E tests                                                                      |
| `pnpm test:e2e:mobile`           | Run mobile E2E tests                                                                       |
| `pnpm test:security`             | Run security tests                                                                         |
| `pnpm test:resilience`           | Run resilience/fault-injection tests                                                       |
| `pnpm test:performance`          | Run performance benchmarks                                                                 |
| `pnpm build`                     | Build all packages                                                                         |
| `pnpm verify`                    | Fast deterministic gate: format + lint + typecheck + unit + integration + contract + build |
| `pnpm verify:release`            | Full release gate: verify + E2E + security + resilience + performance                      |
| `pnpm dev:api`                   | Start API server in dev mode                                                               |
| `pnpm dev:desktop`               | Start desktop app in dev mode                                                              |
| `pnpm dev:mobile`                | Start Expo mobile app                                                                      |

### Per-package commands

```powershell
pnpm --filter @kms/domain test:unit    # Run tests for domain package only
pnpm --filter @kms/config test:unit    # Run config schema tests
pnpm --filter @kms/test-support test:unit  # Run test-support tests
```

## Repository structure

```
kaiser-meeting-space/
├── apps/
│   ├── api/          # Fastify API server
│   ├── desktop/      # Electron + React desktop app
│   └── mobile/       # Expo + React Native mobile app
├── packages/
│   ├── ai/           # AI provider abstraction
│   ├── config/       # Typed runtime configuration (Zod schemas)
│   ├── domain/       # Shared domain types
│   └── test-support/ # Test utilities and synthetic fixtures
├── docs/             # Architecture, engineering, execution docs
├── tests/            # Root-level cross-cutting tests
├── docker-compose.yml         # Dev services (PostgreSQL, Redis, MinIO)
├── docker-compose.test.yml    # Test service overrides
├── vitest.workspace.ts        # Vitest workspace config
├── eslint.config.mjs          # ESLint config
├── .prettierrc                # Prettier config
└── .github/workflows/         # CI/CD pipelines
```

## Local services

### Starting

```powershell
# Development services (ports 5432, 6379, 9000-9001)
docker compose up -d

# Test services (isolated ports 5433, 6380, 9002-9003)
docker compose -f docker-compose.test.yml up -d
```

### Port map

| Service       | Dev port                   | Test port                  | Credentials                                 |
| ------------- | -------------------------- | -------------------------- | ------------------------------------------- |
| PostgreSQL 17 | 5432                       | 5433                       | kms/kms_dev (dev), kms_test/kms_test (test) |
| Redis 7       | 6379                       | 6380                       | —                                           |
| MinIO         | 9000 (API), 9001 (console) | 9002 (API), 9003 (console) | minioadmin/minioadmin                       |

### Troubleshooting

| Problem                 | Solution                                                    |
| ----------------------- | ----------------------------------------------------------- |
| Port conflict           | Stop existing services or use test compose file             |
| Container won't start   | `docker compose logs <service>`                             |
| pg_isready fails        | Check `POSTGRES_USER`/`POSTGRES_DB` match connection string |
| MinIO healthcheck fails | Wait for MinIO bootstrap; `start_period: 3s`                |
| Windows paths in Docker | Use `//` prefix for absolute Windows paths in volumes       |
| Docker not running      | Start Docker Desktop; verify with `docker info`             |

## Test infrastructure

### Running tests

Tests use Vitest configured per package. Each package has its own `vitest.config.ts`.

```powershell
pnpm test:unit           # All packages
pnpm --filter @kms/domain test:unit -- --reporter=verbose  # Single package, verbose
pnpm --filter @kms/ai test:unit -- --coverage               # With coverage
```

### Android Maestro E2E

The mobile E2E suite uses the Maestro CLI and contains three independently
runnable flows covering only the Android pre-meeting journeys: Record
setup/readiness, Translate cloud disclosure and consent, and microphone-denial
remediation. It does not verify successful
recording, upload, provider work, recovery, transcription, or iOS behavior.

Before running it, prepare an Android 12+ device or emulator, install the
current mobile development build, make sure the Maestro CLI is available on
`PATH`, and sign in manually through Auth0 with an authenticated synthetic test
account. Credentials must never appear in a flow or shell command. Reset only
the test app's permission state as needed between flows, then return to the app
with the authenticated session available.

Run:

```powershell
pnpm test:e2e:mobile
```

This dispatches `pnpm --filter @kms/mobile test:e2e` and executes the three
flows in `apps/mobile/maestro/`. If Maestro, the Android device/build, or the
authenticated session is unavailable, the command must produce a non-zero
unavailable/blocked result. Record that result as external evidence; do not
claim the mobile E2E suite passed.

### Test locations

| Package           | Test location                         | Config                                   |
| ----------------- | ------------------------------------- | ---------------------------------------- |
| Root              | `tests/*.test.ts`                     | `vitest.config.ts`                       |
| @kms/domain       | `packages/domain/src/*.test.ts`       | `packages/domain/vitest.config.ts`       |
| @kms/ai           | `packages/ai/src/*.test.ts`           | `packages/ai/vitest.config.ts`           |
| @kms/config       | `packages/config/src/*.test.ts`       | `packages/config/vitest.config.ts`       |
| @kms/test-support | `packages/test-support/src/*.test.ts` | `packages/test-support/vitest.config.ts` |
| @kms/api          | `apps/api/src/*.test.ts`              | `apps/api/vitest.config.ts`              |
| @kms/desktop      | `apps/desktop/src/*.test.ts`          | `apps/desktop/vitest.config.ts`          |
| @kms/mobile       | `apps/mobile/src/*.test.ts`           | `apps/mobile/vitest.config.ts`           |

### Synthetic fixtures

`@kms/test-support` provides deterministic fixtures for all tests:

- `createMeetingFixture()` — synthetic meeting with Vietnamese title
- `createTranscriptFixture(meetingId, count)` — ordered transcript segments
- `deterministicId(prefix, index)` — reproducible UUID-format IDs
- `deterministicNow()` — fixed timestamp (2026-07-21T12:00:00.000Z)
- `fakeClockFixture()` — Vitest fake timers at deterministic epoch
- `normalizePath()` — Windows-safe path normalization
- `uniqueNamespace(prefix)` — unique isolation namespace

All fixtures use synthetic data. Never embed real meeting content or realistic
secret patterns in test fixtures.

### Coverage ratchet

- Current threshold: 0% (baseline — executable domain code is minimal)
- Target threshold: >=80% line/branch when executable code exists
- Integrity/state/auth validators: 100% branch coverage when introduced
- Coverage reports: `**/coverage/` directories per package

### False-green protection

The pipeline fails truthfully when:

- A required workspace package has zero tests (vitest exits code 1)
- A required root script is missing (script-inventory test fails)
- The `--if-present` flag is used for required scripts
- `verify:release` does not reference `verify`

Proof documented in `docs/execution/evidence/P01/false-green-report.md`.

## Adding a new package

1. Create directory under `packages/` or `apps/`
2. Add `package.json` with name, scripts (`typecheck`, `test:unit`)
3. Add `vitest.config.ts` with coverage thresholds
4. Add `tsconfig.json` extending base config
5. Add at least one test file so `test:unit` returns non-zero tests
6. Add package to `vitest.workspace.ts`
7. Run `pnpm install` to link

## CI reproduction

To reproduce CI locally:

```powershell
# Frozen install
pnpm install --frozen-lockfile

# Fast gate (same as CI verify job)
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build

# Full gate
pnpm verify:release
```

## Repository conventions

- Domain types and state rules live in shared packages, not duplicated in clients
- Runtime schemas accompany TypeScript types at network/storage boundaries
- Provider-specific code remains in adapters
- Source evidence is never updated through generic repository methods
- Long-running work returns a job resource
- User-visible errors use stable codes and localized messages

## Branch and change workflow

1. Create a `codex/` or feature branch from the current integration branch
2. Link the change to a requirement/ADR when applicable
3. Add tests before or with behavior changes
4. Run `pnpm verify` before pushing
5. Update implementation status and affected docs
6. Use a pull request with risk, test evidence, migration and rollback notes

## Definition of done

- Acceptance criteria pass and failure paths are tested
- Types plus runtime validation are present
- Logs/telemetry contain no meeting content or secrets
- Accessibility/localization impact is checked
- Database changes include migration, rollback/restore and compatibility sequencing
- Documentation and implementation status reflect reality
- No critical/high security or data-loss issue remains open

## Environment variables

Names, not values, are documented in `.env.example`. Categories:

- **Base:** `NODE_ENV`, `API_PORT`
- **Database:** `DATABASE_URL`, `DATABASE_MAX_CONNECTIONS`, `DATABASE_SSL`
- **Redis:** `REDIS_URL`, `REDIS_MAX_RETRIES`
- **Object storage:** `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`
- **Auth:** `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`
- **AI:** `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`
- **Speech:** `SPEECH_PROVIDER`, `DEEPGRAM_API_KEY`
- **Translation:** `TRANSLATION_PROVIDER`
- **Limits:** `MAX_CONCURRENT_JOBS`, `JOB_TIMEOUT_MS`, `RATE_LIMIT_RPM`, `MAX_UPLOAD_SIZE_MB`
- **Observability:** `OTEL_EXPORTER_ENDPOINT`, `SENTRY_DSN`, `LOG_LEVEL`, `RELEASE_TAG`

Validate configuration at startup with `@kms/config` schemas. The `validateConfig()`
function returns safe error messages that reference field names but never expose values.

### Configuration in tests

```typescript
import { validateConfig, redactConfig, clientSafeConfig } from '@kms/config';

const result = validateConfig(process.env);
if (result.isError) {
  console.error(result.message); // Safe: no values leaked
  process.exit(1);
}
const config = result.config;
console.log(redactConfig(config)); // Secrets replaced with [REDACTED]
```
