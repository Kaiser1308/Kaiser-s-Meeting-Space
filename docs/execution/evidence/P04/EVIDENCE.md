# P04 Evidence

**State:** VERIFIED
**Run:** 2026-08-06 10:15 continuation

## Directly verified

- `packages/auth`: isolated Vitest gate passed, 8 files / 125 tests (added 4 cross-process determinism tests).
- `packages/auth`: TypeScript typecheck passed.
- `apps/api`: TypeScript typecheck passed.
- `packages/database`: full test suite passed, 9 files / 292 tests (added 13 identity integration + 14 IDOR matrix tests).
- `tests/security`: all tests passed, 4 files / 37 tests.
- `apps/mobile`: auth tests passed, 3 files / 7 tests.
- `apps/desktop`: auth tests passed, 2 files / 5 tests.
- Workspace typecheck: clean across all 7 packages.
- Secret scan: source files clean (see `secret-scan-report.md`).
- Security suite: 4 files / 37 tests passed using `pnpm test:security`.
- Windows native keychain synthetic write/read/delete passed through
  `createNativeSecureStorage()`; see `secure-storage-report.md`.
- Android CPH2699 / Android 16 restart retained the authenticated Home state
  through the real Expo SecureStore path; see `secure-storage-report.md`.
- Current registered API route inventory and evidence mapping: `route-matrix.json`.

## Acceptance ledger

| Acceptance | State    | Evidence / limitation                                                                                                                                                                                                                                                                               |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P04-A01    | VERIFIED | Fixed JWK key material in `packages/auth/src/fixtures/keys.ts`; cross-process determinism verified via JWK fingerprint snapshot test; local issuer token scenario tests pass (125 auth tests).                                                                                                      |
| P04-A02    | VERIFIED | Bearer middleware with real PostgreSQL identity persistence; 13 integration tests covering identity mapping, concurrent first login deduplication, disabled user rejection, revoked session rejection. Database `users.status` and `sessions` table provide persistence for disabled/revoked state. |
| P04-A03    | VERIFIED | 14 IDOR matrix tests against real PostgreSQL: owner A access allowed, owner B access denied with null (same shape as nonexistent), listing scope verified. Policy invariants tested across all 4 resource classes.                                                                                  |
| P04-A04    | VERIFIED | Current registered API surface is enumerated in `route-matrix.json`; 9 API convention tests, API route/service tests, and owner-scoped repository matrix pass. Target-contract routes not registered in this phase remain successor scope.                                                          |
| P04-A05    | VERIFIED | Android 16 force-stop/restart retained authenticated state through Expo SecureStore; Windows native `keytar` write/read/delete passed with synthetic data; logout deletion and no-fallback behavior pass automated tests/source review.                                                             |
| P04-A06    | VERIFIED | Source/bundle/response/log scans completed (see `secret-scan-report.md`). No real credentials, tokens, API keys, private keys, or meeting content found. All detected patterns are synthetic test fixtures only.                                                                                    |

## Schema changes

- `users.status` column: text NOT NULL DEFAULT 'active', CHECK (active|disabled)
- `sessions` table: tracks (issuer, subject) → session status with unique constraint
- Migration: `packages/database/drizzle/0004_identity_status.sql`
- Drizzle schema: `packages/database/src/schema/identity.ts`

## Integrity notes

## Verification continuation — 2026-07-25

- Direct security/API matrix: 4 files / 37 tests passed.
- API server/jobs/SSE route checks: 3 files / 3 tests passed.
- P04-A04 remains implemented pending the complete production-route matrix.
- P04-A05 is **DEFERRED BY OWNER DECISION**: mobile device/keychain evidence will be collected in P08; Windows/Electron evidence in P11; final signed-package evidence in P26.
- Docker check: **BLOCKED** because the Docker Engine named pipe is unavailable.
- Docker is now healthy, but the full workspace typecheck still reports the pre-existing mobile `Locale` import conflict; this does not provide P04-A05 device evidence.

- No real meeting content, provider credentials, production keys, or fake device/provider evidence were used.
- All RSA key material is synthetically generated and tagged with `test-issuer-synthetic` kid prefix.
- P04-A04 (full production route matrix) requires routes built in later phases (P05-P20).
- P04-A05 evidence is intentionally collected by P08/P11 platform phases and linked back here; P26 covers signed release artifacts.
- **P04-A06** has been upgraded to VERIFIED: comprehensive source scan completed with reproducible grep-based methodology.

## P04-A05 implementation continuation — 2026-07-25

- Added mobile `expo-secure-store` adapter and desktop `keytar` OS-keychain adapter; fake adapters remain available for CI.
- Native-backend tests were observed failing before implementation, then passed: mobile auth/storage/i18n 18/18 and desktop auth 3/3.
- Desktop typecheck passed; mobile typecheck passed after removing an erroneous self-import and declaring Vitest globals.
- Historical owner decision 2026-07-25: defer physical/device verification to P08 (Android/iOS) and P11 (Windows/Electron), then link the evidence back to this gate. This was superseded by the direct evidence recorded below.

## Verification closure — 2026-08-06

The earlier deferred-device note is superseded for the supported product
platforms by `secure-storage-report.md`: Android direct restart evidence and a
real Windows keytar write/read/delete run are now present. iOS remains dormant
and non-gating under ADR-007. The current registered API surface is captured in
`route-matrix.json`; target-contract routes not registered in this phase remain
successor scope. No production credentials, token values, or meeting content
were used or recorded.
