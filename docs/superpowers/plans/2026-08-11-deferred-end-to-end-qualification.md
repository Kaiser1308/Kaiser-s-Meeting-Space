# Deferred End-to-End Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the meeting-flow implementation lane P10 through P20 to proceed while long-running physical and provider qualification remains explicitly deferred until integrated qualification before P27.

**Architecture:** Add one protocol-level `DEFERRED_END_TO_END_QUALIFICATION` exception with an explicit phase allowlist, state ceiling, inheritance, and release block. A central ledger owns deferred-gate truth; packets and runtime status link to it instead of treating deferred qualification as a waiver.

**Tech Stack:** Markdown execution governance, phase packets, evidence ledger, repository validation scripts.

## Global Constraints

- Only P10 through P20 are eligible for the deferred implementation lane.
- `IMPLEMENTED` is the maximum state for a phase with open inherited deferred qualification.
- P27 and `VERIFIED` remain blocked until every inherited deferred gate and every ordinary gate has direct evidence.
- Never defer security, owner-isolation, consent, source immutability, data-loss, migration, or provider authorisation controls.
- Preserve historical evidence; append supersession notes instead of deleting blocked run records.

---

### Task 1: Define the protocol and stable graph policy

**Files:**

- Modify: `docs/execution/EXECUTION_PROTOCOL.md`
- Modify: `docs/execution/MASTER_PLAN.md`
- Test: `pnpm execution:check` and `node --test scripts/execution/validate-execution-plan.test.mjs`

**Interfaces:**

- Consumes: accepted design at `docs/superpowers/specs/2026-08-11-deferred-end-to-end-qualification-design.md`
- Produces: `DEFERRED_END_TO_END_QUALIFICATION` rule, P10–P20 allowlist, and P27 state ceiling.

- [ ] **Step 1: Add the protocol and master-plan policy**

Define that only a named, ledgered deferred qualification allows an `IMPLEMENTED` dependency. State that downstream phases inherit the qualification and cannot be promoted to `VERIFIED`; P27 cannot begin its release qualification with an open row.

- [ ] **Step 2: Run the structural policy checks**

Run: `node --test scripts/execution/validate-execution-plan.test.mjs; pnpm execution:check`

Expected: the policy is structurally valid and no phase outside P10–P20 gains eligibility.

- [ ] **Step 3: Verify every policy token manually**

Run: `rg -n 'DEFERRED_END_TO_END_QUALIFICATION|P10 through P20|P27|IMPLEMENTED' docs/execution/EXECUTION_PROTOCOL.md docs/execution/MASTER_PLAN.md`.

Expected: the allowlist, state ceiling, and release block are all present.

### Task 2: Create the deferred qualification ledger and update runtime status

**Files:**

- Create: `docs/execution/DEFERRED_END_TO_END_QUALIFICATION.md`
- Modify: `docs/execution/PROGRESS.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/execution/TRACEABILITY.md`
- Test: Markdown link and policy-reference checks

**Interfaces:**

- Consumes: protocol policy from Task 1 and current P09/P10/P12/P13/P14 evidence.
- Produces: canonical rows for P09-A04/A05/T07, P10-A06/T07, P12-A03/A04/T08, P13-A03/A04/A05, and P14-A05/A06/T08.

- [ ] **Step 1: Add the ledger and status references**

For every row, record source phase/gate, environment, current evidence state, final required evidence, and that no PASS is implied. Mark P14 `NOT_STARTED` but eligible for a fresh implementation preflight, not verified.

- [ ] **Step 2: Run the ledger and structural checks**

Run: `node --test scripts/execution/validate-execution-plan.test.mjs; pnpm execution:check; git diff --check -- docs/STATUS.md docs/execution`

Expected: all links resolve and no whitespace errors occur.

- [ ] **Step 3: Verify every runtime file links to the ledger**

Run: `rg -n 'DEFERRED_END_TO_END_QUALIFICATION.md' docs/STATUS.md docs/execution/PROGRESS.md docs/execution/TRACEABILITY.md`.

Expected: each file has exactly one current-policy reference.

### Task 3: Align phase packets P09 through P14

**Files:**

- Modify: `docs/execution/phases/P09-mobile-recording.md`
- Modify: `docs/execution/phases/P10-mobile-sync-recovery.md`
- Modify: `docs/execution/phases/P12-windows-audio-capture.md`
- Modify: `docs/execution/phases/P13-speech-deepgram.md`
- Modify: `docs/execution/phases/P14-finalization-backfill.md`
- Modify: `docs/execution/evidence/P14/RUN-20260730-0000.md`
- Test: Dependency-gate and acceptance-ID reference checks

**Interfaces:**

- Consumes: Task 1 policy and Task 2 ledger.
- Produces: packets that distinguish implementation eligibility from verification eligibility without changing acceptance criteria.

- [ ] **Step 1: Amend each packet and append a historical supersession note**

P09/P12 retain their physical two-hour criteria; P10 retains physical sync/recovery; P13 retains provider/model quality criteria; P14 may now start implementation with truthful unavailable states. Do not alter gate definitions or erase the historical blocked P14 preflight.

- [ ] **Step 2: Run the packet checks**

Run: `node --test scripts/execution/validate-execution-plan.test.mjs; pnpm execution:check`

Expected: every packet preserves its acceptance gate and has a correct deferred-policy link.

- [ ] **Step 3: Confirm acceptance identifiers remain unchanged**

Run: `rg -n '^\- \[ \] P(09|10|12|13|14)-A' docs/execution/phases/P09-mobile-recording.md docs/execution/phases/P10-mobile-sync-recovery.md docs/execution/phases/P12-windows-audio-capture.md docs/execution/phases/P13-speech-deepgram.md docs/execution/phases/P14-finalization-backfill.md`.

Expected: the same acceptance IDs remain present.

### Task 4: Align P15 through P20 with the allowed implementation lane

**Files:**

- Modify: `docs/execution/phases/P15-translation.md`
- Modify: `docs/execution/phases/P16-transcript-review.md`
- Modify: `docs/execution/phases/P17-ai-provider-platform.md`
- Modify: `docs/execution/phases/P18-detailed-minutes-evaluation.md`
- Modify: `docs/execution/phases/P19-minutes-editor.md`
- Modify: `docs/execution/phases/P20-branding-export-library.md`
- Test: Complete P10–P20 graph validation

**Interfaces:**

- Consumes: Task 1 policy and upstream ledger inheritance.
- Produces: an explicitly bounded P10–P20 implementation lane.

- [ ] **Step 1: Amend P15–P20 dependency/precondition wording**

Permit only implementation under inherited ledger rows, retain all direct acceptance gates, and state that verification remains blocked. Leave P21–P27 untouched except for the protocol-level P27 block.

- [ ] **Step 2: Run the graph and Markdown link checks**

Run: `node --test scripts/execution/validate-execution-plan.test.mjs; pnpm execution:check`

Expected: P10–P20 are eligible to implement; P21–P27 retain their default verified-dependency rule.

- [ ] **Step 3: Run the negative policy scan**

Run: `rg -n 'DEFERRED_END_TO_END_QUALIFICATION' docs/execution/phases/P2*.md`.

Expected: references exist only in P20; P21–P28 have none.

### Task 5: Verify the complete governance change

**Files:**

- Verify: all Task 1–4 files
- Test: repository execution-plan validator, Markdown link scan, `git diff --check`

**Interfaces:**

- Consumes: all prior tasks.
- Produces: evidence that the phase graph permits implementation without a false verification/release claim.

- [ ] **Step 1: Run the complete execution-plan validator**

Run: `pnpm execution:check`

Expected: exit 0 and no dependency-cycle or missing-reference finding.

- [ ] **Step 2: Run a negative policy scan**

Run: `rg -n 'DEFERRED_END_TO_END_QUALIFICATION' docs/execution` and inspect every result.

Expected: references exist only in the protocol, ledger, P09–P20 packets, and runtime/evidence records; P21–P27 do not gain an implementation exception.

- [ ] **Step 3: Run final whitespace and scope checks**

Run: `git diff --check` and `git diff --name-only`.

Expected: no whitespace error and only expected governance files changed.

- [ ] **Step 4: Detect changed execution scope before final handoff**

Run: GitNexus `detect_changes()` when the repository index is available; otherwise record the index-refresh timeout and inspect `git diff --name-only`.

Expected: only documentation/governance flows are affected; no production symbol changes.

- [ ] **Step 5: Preserve the change set uncommitted for the owner**

Do not stage unrelated pre-existing files. Report the exact governance files
changed and the GitNexus-index limitation in the handoff.
