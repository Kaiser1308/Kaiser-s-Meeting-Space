# P17 integrated evidence

Status: IMPLEMENTED under the deferred qualification policy.

- AI core/registry/adapter/validation suites: 5 files, 9 tests passed.
- AI orchestration policy suite: 1 file, 2 tests passed.
- AI package typecheck: passed.
- Jobs package focused AI suite: 1 file, 2 tests passed; package-wide typecheck remains blocked by pre-existing translation workspace declarations.
- Live provider authorization, PostgreSQL/Redis durability, fuzz campaigns, secret scans, and `pnpm verify` are not claimed.

The implementation preserves provider-neutral boundaries, validates structured
output and citations before downstream use, pins owner/projection/completeness
and budget in AI jobs, and keeps source mutation false by construction.

## 2026-08-12 continuation

- Re-ran the AI suite: 6 files / 14 tests passed before the new citation
  regression; after the fix, 6 files / 15 tests passed.
- Fixed citation validation to enforce owner, meeting, projection-version and
  eligible-segment state (`not gap`, `not interim`, `not deleted`) in addition
  to segment/range containment. AI and jobs typechecks plus the jobs AI handler
  suite pass.
- The older `packages/ai/src/index.ts` prototype provider still accepts a raw
  API key configuration and parses production output outside the normalized
  adapter/validation boundary. This is an open P17 migration/security gap, not
  live-provider evidence.
- Independent architecture review classified the direct API provider call in
  `apps/api/src/app.ts` as CRITICAL: it bypasses durable job enqueueing, provider
  policy, structured/citation validation, and guarded result commit. Additional
  HIGH findings cover unused capability policy, in-memory orchestration,
  plaintext secret configuration, non-immutable artifact registry, and missing
  composite minutes/evidence lineage. These findings keep P17 open.
- Fixed the CRITICAL API bypass: `apps/api/src/app.ts` no longer constructs or
  invokes a provider from the HTTP handler. Minutes generation now requires an
  idempotency key and delegates only to a durable-dispatcher interface; the
  current composition root fails closed with a safe 503 until the P06-backed
  dispatcher is injected.
- Fresh API verification passed: API typecheck and 14 files / 52 tests. The
  boundary regression test proves the unconfigured dispatcher cannot call a
  provider and returns the typed unavailable state.
- The P06-backed database dispatcher is now wired when `DATABASE_URL` is
  configured. It creates `minutes_generation` jobs with deterministic
  owner/meeting/idempotency identity, max attempts, and durable request payload;
  duplicate requests resolve the existing job ID. Dispatcher unit tests pass
  2/2, and the fresh API suite passes 14 files / 53 tests.
- Hardened the AI worker boundary: `runAiJob` now requires explicit output
  validation and a guarded commit callback. Malformed output is rejected before
  commit, and the result is marked source-preserving only after validation.
  Worker AI suite passes 4/4; AI suite remains 15 tests and API/jobs typechecks
  pass.
- Added a concrete minutes worker seam. It parses `MinutesVersion`, validates
  every evidence reference against the pinned projection, and invokes the
  guarded commit only after both checks pass. The minutes worker suite passes
  3/3; the combined jobs AI suite is 7/7 and jobs typecheck passes.
- Live provider, durable persistence, fuzz/security scans, full verify, and
  inherited qualification remain open. P17 stays IMPLEMENTED.
- Run record: `RUN-20260812-2315.md`.
