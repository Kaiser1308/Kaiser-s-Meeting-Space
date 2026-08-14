# P18 integrated evidence

Status: IMPLEMENTED under the deferred qualification policy. P18's development contracts now cover five runtime-validated templates, strict provenance/output validation, deterministic context coverage/reconcile, uncertainty/conflict routing, expanded evaluation metrics, synthetic bilingual fixtures, and an immutable in-memory draft lifecycle seam. Package tests pass 26/26 and typecheck passes. Durable PostgreSQL draft persistence, frozen bilingual holdout execution, live provider quality, cost/latency, and human review are not claimed.

## 2026-08-12 implementation continuation

- T01/T02: runtime template registry validation rejects duplicate IDs/prompts,
  invalid sections/detail levels, unresolved artifact references, and broken
  compatibility metadata. The detailed output contract now pins provider,
  model, prompt/schema/config, input hash, usage, evaluation, template/detail,
  projection/completeness and strict citation/claim semantics. It rejects
  unsupported keys, duplicate claims, invalid ranges/dates, oversized/deep
  hostile input, and material claims without evidence.
- T03: added synthetic-only Vietnamese tuning and English holdout fixtures with
  SHA-256 manifest entries, expected facts/ranges, gaps, conflicts and prompt
  injection traps. Holdout answers remain fixture-only and are not runtime
  inputs.
- T04: context assembly now orders and validates segments, estimates tokens,
  creates deterministic chunk/overlap metadata and replay keys, records exact
  occurrence coverage, supports cancellation and reports missing map chunks.
- T06/T07: added evidence-span validity, topic/decision/action/temporal
  coverage, duplication/completeness/confirmation metrics and explicit cited
  conflict alternatives with `needsConfirmation`.
- T05: added an immutable owner-scoped draft lifecycle seam with idempotent
  request, stale projection/completeness rejection, compare-and-set current
  selection and no-overwrite behavior. It is an in-memory contract seam;
  PostgreSQL persistence/worker wiring remains open.
- Focused package gate: 6 files / 26 tests passed; minutes typecheck passed.
- P18 remains IMPLEMENTED. Durable persistence, provider/model baseline,
  fixed holdout quality thresholds, human rubric, security/content scans,
  full verify and inherited qualification remain open.

Run record: `RUN-20260812-2354.md`.

## 2026-08-13 durable provenance continuation

- Added additive migration `0012_minutes_provenance` for projection/completeness
  versions, schema/config versions, input hash, usage, and evaluation metadata.
- Updated `MinutesRepository` to persist and restore the provenance/usage shape.
- Database gates passed: typecheck, 6 files / 28 unit tests, and PostgreSQL
  integration 17 files / 324 tests.
- Minutes gates passed again: 6 files / 26 tests and typecheck. Execution-plan
  validation and diff check also passed.
- This is durable provenance/repository evidence, not full durable draft
  lifecycle evidence. Worker lease/retry, current-selection orchestration,
  provider/model qualification, human review, security scans, and inherited
  qualification remain open. P18 remains IMPLEMENTED.
