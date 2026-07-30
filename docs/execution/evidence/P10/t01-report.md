# P10-T01 Report: Authenticated P05 Sync Transport

## Status: COMPLETE

## Files changed/created

### Prerequisite gap fixes

- `packages/local-recovery/src/contracts/transport.ts` — Added `endMeeting` method to `UploadTransport` interface
- `packages/local-recovery/src/adapters/fake-transport.ts` — Implemented `endMeeting` in `FakeUploadTransport`
- `packages/local-recovery/src/adapters/expo-filesystem.ts` — New: ExpoFileSystem adapter (DI-based, implements FileSystem)
- `packages/local-recovery/src/adapters/expo-crypto.ts` — New: ExpoChecksum adapter (implements Checksum, takes FileSystem)
- `packages/local-recovery/src/adapters/expo-clock.ts` — New: ExpoClock adapter (implements Clock, uses performance.now)
- `packages/local-recovery/src/adapters/index.ts` — Export new adapters

### Main implementation

- `apps/mobile/src/features/sync/transport/auth-http.ts` — New: AuthHttpClient (Bearer injection, 401→refresh→retry, timeout)
- `apps/mobile/src/features/sync/transport/sync-transport.ts` — New: SyncTransport (implements UploadTransport)
- `apps/mobile/src/features/sync/transport/sync-transport.test.ts` — New: 13 test cases
- `apps/mobile/src/features/sync/index.ts` — New: Barrel exports
- `apps/mobile/src/types/sql.js.d.ts` — New: Type declarations for sql.js transitive dependency
- `apps/mobile/package.json` — Added `@kms/local-recovery` workspace dependency
- `apps/mobile/tsconfig.json` — Added `skipLibCheck: true`

## Tests

| Test file              | Tests | Status |
| ---------------------- | ----: | ------ |
| sync-transport.test.ts |    13 | PASS   |

### Test coverage

1. TC01: Full register→upload→complete lifecycle ✓
2. TC02: Token expiry mid-upload→refresh→retry ✓
3. TC03: Duplicate registration idempotency ✓
4. TC04: Object uploaded but complete call lost (retry) ✓
5. TC05: Malformed response → UploadTransportError ✓
6. TC06: Wrong owner (403) → SERVER_ERROR ✓
7. TC07: Network timeout → NETWORK (retryable) ✓
8. TC08: Checksum conflict (409) → CHECKSUM_CONFLICT ✓
9. TC09: Offline → NETWORK (retryable) ✓
10. TC10: getServerManifest correct entries ✓
11. TC11: endMeeting idempotent ✓
12. TC12: Upload without registration → error ✓
13. TC13: Server 500 → retryable SERVER_ERROR ✓

## Commands

| Command                                       | Exit code |          Tests |
| --------------------------------------------- | --------: | -------------: |
| `pnpm --filter @kms/local-recovery typecheck` |         0 |          Clean |
| `pnpm --filter @kms/mobile typecheck`         |         0 |          Clean |
| `pnpm --filter @kms/local-recovery test:unit` |         0 |  91 (10 files) |
| `pnpm --filter @kms/mobile test:unit`         |         0 | 188 (23 files) |
| `pnpm typecheck` (full workspace)             |         0 |    14 packages |

## Design decisions

- SyncTransport tracks registrations in-memory (Map<storageKey, {presignedUrl, headers}>) for upload correlation
- AuthHttpClient handles 401→refresh→retry transparently; double-401 fails with AUTH_EXPIRED
- Expo adapters use dependency injection rather than direct expo imports for testability
- Zod schemas mirror the API DTOs but are inlined in sync-transport for independence

## Concerns

- `crypto.randomUUID()` used for idempotency keys; available in Node 24 and React Native
- ExpoFileSystem memory fallback is NOT cryptographically secure — only for test use
- No integration test with real API server yet (requires running server + auth)
