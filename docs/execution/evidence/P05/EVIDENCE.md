# P05 Evidence

- Phase/state: IMPLEMENTED (MinIO and PostgreSQL integration tests skipped due to stopped Docker Desktop service)
- Run record: `RUN-20260723-2200.md`
- Date/timezone: 2026-07-24T16:16:00+07:00
- Environment and exact tool versions: Node v24.18.0, pnpm 10.14.0, TypeScript 5.9.3, Vitest 4.1.10
- Starting and ending commit/tree: `0fe4eb2` to working tree
- Pre-existing dirty files preserved: All P00-P04 working tree changes and untracked files preserved.

## Requirement and acceptance mapping

| Requirement / acceptance ID | Test or scenario                           | Result                     | Artifact                |
| --------------------------- | ------------------------------------------ | -------------------------- | ----------------------- |
| P05-A01                     | routes.test.ts (never returns storageKey)  | PASS                       | routes.test.ts          |
| P05-A02                     | routes.test.ts complete cases              | SKIPPED                    | routes.test.ts          |
| P05-A03                     | routes.test.ts manifest test               | PASS (Unit)                | routes.test.ts          |
| P05-A04                     | Domain immutability triggers (P03 trigger) | PASS (Verified statically) | drizzle/0000_init...sql |
| P05-A05                     | dto.test.ts & routes.test.ts               | PASS (Unit)                | dto.test.ts             |

## Dependency-consumption evidence

Exposes S3-compatible `ObjectStore` client adapter contract, key derivation logic, route registering, completing audio chunks, and computing meeting-level manifest reconciliation view.

## Commands

| Command                                | Exit code | Intended tests |            Executed tests | Duration | Report |
| -------------------------------------- | --------: | -------------: | ------------------------: | -------: | ------ |
| `pnpm --filter @kms/storage test:unit` |         0 |            125 |          110 (15 skipped) |   16.31s |        |
| `pnpm --filter @kms/api test:unit`     |         1 |             32 | 17 (1 failed, 14 skipped) |   12.28s |        |

_Note: api server.test.ts failed due to timeout when loading app module, and all database-dependent tests were skipped because the Docker container runtime was unavailable._

## Manual, device, and provider matrix

N/A

## Security, privacy, and data-integrity review

- Object keys are derived server-side and never reveal internal storage paths or bucket information.
- SafeErrorDetailSchema excludes internal paths, bucket details, and credentials from route error replies.

## Defects and root-cause fixes

None.

## Migration, rollout, rollback, and recovery

Additive database migration `0005_audio_orphan_reconciliation.sql` is prepared and verified statically.

## Residual risks and owner actions

- **Docker daemon start:** The owner must start the Docker Desktop service to run integration tests against real PostgreSQL and MinIO container runtimes.

## Final state rationale

## Verification continuation — 2026-07-25

- API typecheck: PASS.
- Audio DTO/error unit tests: 2 files / 17 tests passed.
- Storage unit/contract tests: 4 files / 110 tests passed.
- The database-backed audio route suite could not be rerun in this environment because its testcontainer dependency cannot load `ssh2`; Docker Engine is also unavailable. This is recorded as an environment/manual gate, not as a pass.
- P05 remains **IMPLEMENTED, not VERIFIED** until PostgreSQL/MinIO integration and adversarial real-storage qualification are executed with Docker running.

## Docker verification continuation — 2026-07-25

- Docker Engine 29.6.2; PostgreSQL 17, Redis 7 and MinIO containers healthy.
- MinIO real contract/presign suite: 1 file / 15 tests passed.
- PostgreSQL identity/migration integration: 2 files / 42 tests passed.
- Audio route PostgreSQL integration: 1 file / 14 tests passed.
- Fixes made during verification: registered migration 0006 in the migration journal; corrected the audio integration fixture to use the actual object SHA-256 and a non-leaking signed-URL test double.
- P05-T07 still lacks the packet-required full real-MinIO adversarial matrix (cross-owner/path abuse/expiry/fault/orphan scenarios). Therefore P05 remains **IMPLEMENTED, not VERIFIED**.

The phase is set to `IMPLEMENTED` because all code paths (T03-T06) are fully implemented and typecheck clean, but the integration tests (T07) require a running Docker Desktop container engine to verify real MinIO/PostgreSQL operations.
