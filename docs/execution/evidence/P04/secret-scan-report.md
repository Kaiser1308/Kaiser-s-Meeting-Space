# P04 Secret Scan Report

**Date:** 2026-08-06 (closure rerun)
**Scanner:** grep-based pattern matching
**Scope:** All source files excluding node_modules, .git, .claude/worktrees, pnpm-lock.yaml

## Scan patterns

| Pattern              | Regex                                                                    | Severity |
| -------------------- | ------------------------------------------------------------------------ | -------- |
| Bearer tokens        | `Bearer ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`                | HIGH     |
| API keys             | `\b(?:sk\|pk)-[a-z0-9][a-z0-9_-]{8,}`                                    | CRITICAL |
| Private keys         | `-----BEGIN (RSA\|EC\|PRIVATE\|DSA\|OPENSSH) PRIVATE`                    | CRITICAL |
| Passwords in configs | `(?:password\|passwd\|secret)\s*[:=]\s*['"][^'"]+['"]`                   | MEDIUM   |
| Database URLs        | `DATABASE_URL\s*=\s*[^:]+\/\/[^:]+:[^@]+`                                | HIGH     |
| Meeting content      | `\b(?:transcriptText\|audioData\|minutesContent\|meetingContent)\s*[:=]` | MEDIUM   |

## Results

### Findings (non-actionable, synthetic fixtures)

| File                                            | Line   | Pattern          | Classification                     |
| ----------------------------------------------- | ------ | ---------------- | ---------------------------------- |
| `tests/security/secret-leak-regression.test.ts` | 17     | Bearer token     | LOW — Synthetic test fixture       |
| `tests/security/secret-leak-regression.test.ts` | 18     | API key (sk-)    | LOW — Synthetic test fixture       |
| `packages/domain/src/errors/catalog.test.ts`    | 70     | API key (sk-)    | LOW — Synthetic error catalog test |
| `packages/auth/src/fixtures/keys.ts`            | 30-116 | RSA key material | LOW — Synthetic test JWK keys      |

### Negative findings (no leaks detected)

- **No production credentials** in source code, configs, or documentation
- **No real API keys** (all sk-/pk- patterns are synthetic test fixtures)
- **No private keys** (BEGIN PRIVATE) in any file
- **No hardcoded passwords** in configuration files
- `.env.example`: all credential fields are empty strings
- **No meeting content** (transcriptText, audioData, etc.) in source, logs, or test fixtures
- **No SQL in response/log files** (schema SQL in migrations is expected)
- **No database URLs with embedded credentials** (localhost defaults only)

## Fixed JWK keys

The RSA key material embedded in `packages/auth/src/fixtures/keys.ts` is synthetically generated for test purposes only. All keys carry the `test-issuer-synthetic` kid prefix and are never used in production. This is consistent with the P04 phase requirement: "Use only synthetic fixed JWK/test keys."

## Conclusion

P04-A06 (No credential/token/provider secret appears in source, bundle, response, or logs) is **VERIFIED** for all automatable artifact types:

- Source code: clean
- Test fixtures: synthetic only
- Configuration: all credentials empty/default
- Documentation: no embedded secrets

## Closure artifact scan — 2026-08-06

The generated Android release bundle, mobile Hermes bundle, and desktop renderer
bundle were scanned directly with the same high-risk patterns above:

| Artifact                                                                                 | Bearer/API-key/private-key/content matches |
| ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| `android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle` | 0                                          |
| `apps/mobile/dist/_expo/static/js/android/index-f5a0a8b7e5db73b22d279921c0b26a39.hbc`    | 0                                          |
| `apps/desktop/dist/assets/index-DTQowe3o.js`                                             | 0                                          |

No persisted runtime response or log artifact exists in the repository to scan;
the response/log paths are covered by the 37-test security suite using synthetic
values only. No real credentials, tokens, meeting content, or provider output
were used or recorded.
