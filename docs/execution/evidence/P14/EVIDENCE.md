# P14 Evidence

- Phase/state: P14 — IMPLEMENTED under the deferred end-to-end qualification policy
- Run record: `RUN-20260811-2059.md`
- Date/timezone: 2026-08-11 UTC+7
- Starting commit/tree: `65d76fb9` plus pre-existing dirty worktree preserved
- Ending commit/tree: working tree, uncommitted; no unrelated changes were reset or staged

## Scope delivered

P14 adds versioned finalization manifests and policy contracts, immutable-source verification boundaries, owner-scoped End/status API wiring, additive PostgreSQL schema/migration/repository persistence, deterministic finalization planning and checkpointed part execution, replay-safe transcript reconciliation, run-scoped speaker evidence, explicit cloud-check consent gates, completeness accounting, and desktop/mobile status projections.

No translation, transcript editing, minutes generation, or source deletion was added.

## Task status

| Task | State | Evidence |
| --- | --- | --- |
| P14-T01 contract and manifest boundary | IMPLEMENTED | Domain schemas and focused finalization tests |
| P14-T02 End persistence and idempotency | IMPLEMENTED | Repository/store implementation; API typecheck; focused End test |
| P14-T03 source verification | IMPLEMENTED | HEAD-only verifier and focused verifier test |
| P14-T04 resumable finalization jobs | IMPLEMENTED | Planner/handler and focused handler test |
| P14-T05 deterministic reconciliation | IMPLEMENTED | Replay/order/lineage tests |
| P14-T06 speaker/cloud-check/completeness | IMPLEMENTED | Focused domain tests; client status tests |
| P14-T07 status and recovery surfaces | IMPLEMENTED | API/client projections and typechecks |
| P14-T08 synthetic qualification/evidence | PARTIAL | Synthetic runtime smoke and focused matrix pass; real service/device/provider qualification remains open |

## Direct commands and results

| Command | Result | Evidence |
| --- | --- | --- |
| `node scripts/execution/validate-execution-plan.mjs` | PASS | 29 packets, 213 tasks, 170 acceptance IDs, 0 broken links |
| Scoped Prettier check | PASS | P14 TypeScript sources after formatting |
| Scoped ESLint | PASS with one warning | No errors; one explicit-`any` warning in an API mock |
| `git diff --check` on P14 paths | PASS | No whitespace errors |
| TypeScript `--noEmit` for domain/database/jobs/api/desktop/mobile | PASS | All six checks exit 0 |
| Isolated P14 Vitest suites | PASS | Domain 5 files/11 tests; jobs 1/1; API 2/2; database 1/1; desktop 1/1; mobile 1/1 |
| Neighboring regression suites | PASS | Domain 18 files/367 tests; jobs 2 files/3 tests; API finalization+meetings+speech 6 files/24 tests |
| Synthetic runtime smoke | PASS | Manifest/plan/completeness/reconciliation invariants; synthetic data only |

## Gates left open

`pnpm verify` did not execute: pnpm attempted an automatic modules purge and aborted in the non-interactive shell (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). A combined direct Vitest invocation expanded through workspace configuration and exposed unrelated missing-harness/path failures (`meta/_journal.json`, PostgreSQL/MinIO setup, and mobile path assumptions); it is not used as P14 isolated evidence.

Real PostgreSQL migration/repository integration, Redis/job fault campaigns, MinIO/object-store qualification, provider-key/model quality gates, Windows/Android manual/device matrices, two-hour capture, security/resilience/performance/release gates, and independent review remain OPEN. No real meeting content, provider behavior, device result, or manual PASS is claimed.

P14 is therefore `IMPLEMENTED`, not `VERIFIED`. This execution stops at the P14 handoff and does not begin P15.

## 2026-08-12 qualification continuation

- PostgreSQL integration: 16 files / 323 tests passed after updating the migration inventory to the current 12 journals and adding the P14-P16 table/enum expectations.
- MinIO-backed storage and API real-storage suites: 110 and 51 tests passed respectively (package script scopes).
- Redis-loss resilience: 1 file / 3 tests passed against disposable P14-only Postgres/Redis containers; containers were removed afterward.
- Added `tests/resilience/vitest.config.ts` to isolate the resilience suite from nested worktrees. Execution-plan validation, changed-file formatting, and database/worker typechecks passed.
- Architecture review completed; P14 remains `IMPLEMENTED`. ADB retry did not produce a device result, so physical-device/provider/two-hour qualification remains a manual gate. No manual PASS is claimed.

## 2026-08-12 Android physical smoke

- Device: OPPO CPH2699, Android 16, ADB state `device`.
- Release APK built from `apps/mobile`, installed successfully, and launched without RedBox or fatal exception.
- Fixed recovery discard navigation so a discarded session returns to titled meeting setup instead of readiness with an empty title.
- Fixed Expo autolinking search paths to include `apps/mobile/modules`; rebuilt release with `AudioRecorder` and `expo-network` native modules linked.
- Manual/device smoke passed: microphone permission grant, native readiness, start, pause, resume, and End/drain. Final UI reported `Native state: idle`, `Chunks committed: 2`, and `Local manifest finalized`.
- This is a physical smoke result only; two-hour fault/restart, provider/model, full E2E, security, performance, and inherited P10/P13 qualification remain open. P14 stays `IMPLEMENTED`.
