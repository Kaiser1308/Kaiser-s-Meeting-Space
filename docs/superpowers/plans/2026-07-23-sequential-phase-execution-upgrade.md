# Sequential Phase Execution Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one-conversation-per-phase execution deterministic by introducing capability-scoped dependency gates, one canonical lifecycle ledger, generated phase prompts, exact command contracts, and automated plan validation.

**Architecture:** A small dependency-free Node.js control-plane library parses phase packets and the progress ledger. A validator enforces graph, ID, prompt, link, command, and lifecycle invariants; a deterministic generator produces `PHASE_PROMPTS.md` from packet metadata and the single workflow in `AGENT_PROMPT.md`. Documentation migration preserves all P00-P28 IDs and existing evidence while reconciling current truth to P05 at 2/7 tasks.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, PowerShell-compatible pnpm scripts, Markdown/YAML-like frontmatter parsed without new dependencies.

## Global Constraints

- Execute no product phase and modify no product behavior.
- Preserve P00-P28 phase IDs, every `Pxx-Tnn`, every `Pxx-Ann`, requirement ID, ADR ID, and historical evidence file.
- Preserve all pre-existing dirty and untracked files; never reset or discard them.
- `docs/execution/PROGRESS.md` is the only runtime lifecycle source.
- Phase packets use `packet_status: ACCEPTED`; they do not duplicate runtime lifecycle.
- Capability-scoped entry never upgrades a dependency's lifecycle state or waives an acceptance gate.
- Generated output is deterministic, offline, and byte-stable.
- The validator is read-only.
- Use LF in changed files and leave unrelated whitespace untouched.

---

### Task 1: Execution-plan parser and normalized model

**Files:**

- Create: `scripts/execution/plan-model.mjs`
- Create: `scripts/execution/plan-model.test.mjs`

**Interfaces:**

- Consumes: UTF-8 Markdown strings and repository-relative POSIX paths.
- Produces:
  - `parseFrontmatter(markdown: string): Record<string, string | string[]>`
  - `extractSection(markdown: string, heading: string): string`
  - `parsePhasePacket(path: string, markdown: string): PhasePacket`
  - `parseProgress(markdown: string): Map<string, ProgressPhase>`
  - `loadExecutionModel(rootDir: string): Promise<ExecutionModel>`
  - `canonicalPhaseIds(): string[]`

`PhasePacket` contains `id`, `title`, `packetStatus`, `dependsOn`,
`requirements`, `risk`, `outcome`, `dependencyGate`, `commandRows`, `taskIds`,
`acceptanceIds`, `boundary`, and `path`.

- [ ] **Step 1: Run GitNexus impact checks before editing**

Run:

```powershell
node .gitnexus/run.cjs impact package.json -r . --direction upstream
node .gitnexus/run.cjs impact EXECUTION_PROTOCOL -r . --direction upstream
```

Expected: report the blast radius before later tasks edit existing control-plane
documents. New parser symbols have no existing callers.

- [ ] **Step 2: Write parser tests**

Create `scripts/execution/plan-model.test.mjs` with `node:test` cases that assert:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalPhaseIds,
  extractSection,
  parseFrontmatter,
  parsePhasePacket,
  parseProgress,
} from './plan-model.mjs';

test('canonicalPhaseIds returns P00 through P28', () => {
  const ids = canonicalPhaseIds();
  assert.equal(ids.length, 29);
  assert.equal(ids[0], 'P00');
  assert.equal(ids[28], 'P28');
});

test('parsePhasePacket normalizes dependency and command contracts', () => {
  const packet = parsePhasePacket(
    'docs/execution/phases/P05-object-storage-chunks.md',
    `---
phase: P05
title: Object storage
packet_status: ACCEPTED
depends_on: [P03, P04]
requirements: [FR-2]
risk: critical
---
# Outcome
Store chunks.
# Dependency gate
| Dependency | Required capability | Required evidence | Minimum lifecycle |
| --- | --- | --- | --- |
| P04 | Owner context | evidence/P04/EVIDENCE.md#acceptance-ledger | IMPLEMENTED |
# Ordered task packets
## P05-T01 - Key policy
# Integrated verification
| Gate | Command | Intended signal | Evidence |
| --- | --- | --- | --- |
| Static | \`pnpm typecheck\` | exit 0 | EVIDENCE.md |
# Acceptance gate
- [ ] P05-A01 - Keys are safe.
# Handoff record
Stop before P06.`,
  );

  assert.deepEqual(packet.dependsOn, ['P03', 'P04']);
  assert.deepEqual(packet.taskIds, ['P05-T01']);
  assert.deepEqual(packet.acceptanceIds, ['P05-A01']);
  assert.equal(packet.dependencyGate[0].minimumLifecycle, 'IMPLEMENTED');
  assert.equal(packet.commandRows[0].command, 'pnpm typecheck');
});

test('parseProgress reads canonical lifecycle rows', () => {
  const phases = parseProgress(
    `| Phase | State | Direct dependencies | Tasks |
| --- | --- | --- | --- |
| P04 | IMPLEMENTED | P03 | 7/7 |
| P05 | IN_PROGRESS | P03,P04 | 2/7 |`,
  );
  assert.equal(phases.get('P04').state, 'IMPLEMENTED');
  assert.deepEqual(phases.get('P05').tasks, { complete: 2, total: 7 });
});

test('extractSection stops at the next same-level heading', () => {
  assert.equal(extractSection('# Outcome\nFirst\n# Scope firewall\nSecond', 'Outcome'), 'First');
});
```

- [ ] **Step 3: Confirm the tests fail**

Run:

```powershell
node --test scripts/execution/plan-model.test.mjs
```

Expected: non-zero exit with `ERR_MODULE_NOT_FOUND` for `plan-model.mjs`.

- [ ] **Step 4: Implement the normalized model**

Create `scripts/execution/plan-model.mjs` using only `node:fs/promises`,
`node:path`, and regular expressions. The implementation must:

- reject duplicate frontmatter keys;
- accept bracket arrays such as `[P03, P04]`;
- require exactly one top-level section requested by `extractSection`;
- parse Markdown tables by header name rather than column position;
- sort packet files by phase ID;
- reject any packet whose filename phase differs from frontmatter;
- normalize all stored paths to `/`.

The module must export exactly the six interfaces listed above and no CLI side
effects.

- [ ] **Step 5: Verify the parser**

Run:

```powershell
node --test scripts/execution/plan-model.test.mjs
```

Expected: 4 tests pass, 0 fail, 0 skip.

- [ ] **Step 6: Checkpoint**

Run:

```powershell
git diff --check -- scripts/execution/plan-model.mjs scripts/execution/plan-model.test.mjs
```

Expected: exit 0.

---

### Task 2: Read-only execution-plan validator

**Files:**

- Create: `scripts/execution/validate-execution-plan.mjs`
- Create: `scripts/execution/validate-execution-plan.test.mjs`
- Modify: `docs/execution/VALIDATION_CHECKLIST.md`

**Interfaces:**

- Consumes: `ExecutionModel` from Task 1 and repository files.
- Produces:
  - `validateExecutionPlan(rootDir: string): Promise<ValidationResult>`
  - CLI exit 0 with a count summary when valid.
  - CLI exit 1 with stable `CODE path: message` diagnostics when invalid.

`ValidationResult` contains `{ errors: ValidationIssue[], counts: { packets,
tasks, acceptance, prompts, brokenLinks } }`.

- [ ] **Step 1: Write validator tests using temporary fixture copies**

Create tests with `node:test`, `mkdtemp`, and copied fixture documents. Required
cases:

1. current migrated fixture passes;
2. missing P28 reports `PACKET_COUNT`;
3. P05 depending on P04 without a dependency-gate row reports
   `DEPENDENCY_GATE_MISSING`;
4. a cycle reports `DEPENDENCY_CYCLE`;
5. duplicate `P05-T01` reports `TASK_ID_DUPLICATE`;
6. missing command row reports `COMMAND_CONTRACT_EMPTY`;
7. a broken relative link reports `LINK_BROKEN`;
8. stale generated prompts report `PROMPT_STALE`;
9. lifecycle state outside `PROGRESS.md` reports `LIFECYCLE_DUPLICATED`.

The assertion form is:

```js
assert.deepEqual(
  result.errors.map(({ code }) => code),
  ['DEPENDENCY_GATE_MISSING'],
);
```

- [ ] **Step 2: Confirm validator tests fail**

Run:

```powershell
node --test scripts/execution/validate-execution-plan.test.mjs
```

Expected: non-zero exit because the validator module does not exist.

- [ ] **Step 3: Implement validation rules**

Implement deterministic checks for:

- exactly 29 packets, P00-P28;
- `packet_status: ACCEPTED`;
- unique ordered task and acceptance IDs with packet prefixes;
- canonical acyclic direct dependencies matching `MASTER_PLAN.md` and
  `PROGRESS.md`;
- one dependency-gate row per direct dependency;
- minimum lifecycle in `IMPLEMENTED | VERIFIED`;
- an evidence link for every `IMPLEMENTED` minimum;
- all required packet sections;
- at least one exact command row per packet;
- relative Markdown link existence and exact filename case;
- no runtime `status:` in packet frontmatter;
- no `Current phase` in `MASTER_PLAN.md`;
- prompt byte equality against generator output;
- no banned ambiguity markers in active planning documents;
- P05 current state `IN_PROGRESS` with 2/7 only after migration Task 5.

Historical files under `docs/execution/evidence/` are link-checked but excluded
from ambiguity-marker and lifecycle-duplication checks.

- [ ] **Step 4: Replace the manual checklist with executable ownership**

Update `VALIDATION_CHECKLIST.md` so every checklist group names the validator
rule code and the single command:

```powershell
pnpm execution:check
```

Retain reviewer sign-off fields for packet count, task count, acceptance count,
dependency result, broken-link count, changed files, reviewer, and date.

- [ ] **Step 5: Verify validator behavior**

Run:

```powershell
node --test scripts/execution/validate-execution-plan.test.mjs
```

Expected: 9 tests pass, 0 fail, 0 skip.

---

### Task 3: Deterministic phase-prompt generator

**Files:**

- Create: `scripts/execution/generate-phase-prompts.mjs`
- Create: `scripts/execution/generate-phase-prompts.test.mjs`
- Modify: `docs/execution/AGENT_PROMPT.md`
- Generate: `docs/execution/PHASE_PROMPTS.md`

**Interfaces:**

- Consumes: normalized packets from `loadExecutionModel`.
- Produces:
  - `renderPhasePrompts(model: ExecutionModel): string`
  - `writePhasePrompts(rootDir: string): Promise<void>`
  - CLI default writes the artifact.
  - CLI `--check` compares without writing and exits non-zero on drift.

- [ ] **Step 1: Write generator tests**

Required assertions:

```js
const output = renderPhasePrompts(model);
assert.equal((output.match(/^## P\d{2} /gm) ?? []).length, 29);
assert.equal((output.match(/Mandatory workflow:/g) ?? []).length, 0);
assert.equal((output.match(/AGENT_PROMPT\.md/g) ?? []).length, 29);
assert.match(output, /^## P27 /m);
assert.match(output, /^## P28 /m);
assert.equal(renderPhasePrompts(model), renderPhasePrompts(model));
```

Also test `--check` against one mutated byte.

- [ ] **Step 2: Confirm generator tests fail**

Run:

```powershell
node --test scripts/execution/generate-phase-prompts.test.mjs
```

Expected: non-zero exit because the generator module does not exist.

- [ ] **Step 3: Consolidate the mandatory workflow**

Update `AGENT_PROMPT.md` to contain the only complete mandatory workflow. Replace
the unconditional dependency rule with:

```text
Validate every direct dependency against the requested packet's Dependency gate.
VERIFIED remains the default. IMPLEMENTED is allowed only for a named consumed
capability with direct evidence and orthogonal unsatisfied acceptance gates.
Never upgrade or waive the dependency's lifecycle state.
```

Keep exactly one hard subagent gate and one required role matrix.

- [ ] **Step 4: Implement and run the generator**

Each generated phase block must contain only:

- phase heading;
- packet path;
- required outcome;
- dependency-gate summary;
- `Follow the complete mandatory workflow in docs/execution/AGENT_PROMPT.md`;
- phase boundary.

Run:

```powershell
node scripts/execution/generate-phase-prompts.mjs
node scripts/execution/generate-phase-prompts.mjs --check
node --test scripts/execution/generate-phase-prompts.test.mjs
```

Expected: both CLI commands exit 0; generator tests pass with 0 skips.

---

### Task 4: Migrate protocol, template, and all 29 phase packets

**Files:**

- Modify: `docs/execution/EXECUTION_PROTOCOL.md`
- Modify: `docs/execution/MASTER_PLAN.md`
- Modify: `docs/execution/README.md`
- Modify: `docs/execution/templates/PHASE_TEMPLATE.md`
- Modify: `docs/execution/templates/RUN_TEMPLATE.md`
- Modify: `docs/execution/templates/EVIDENCE_TEMPLATE.md`
- Modify: `docs/execution/phases/P00-design-closure.md`
- Modify: `docs/execution/phases/P01-quality-foundation.md`
- Modify: `docs/execution/phases/P02-domain-contracts.md`
- Modify: `docs/execution/phases/P03-persistence.md`
- Modify: `docs/execution/phases/P04-auth-authorization.md`
- Modify: `docs/execution/phases/P05-object-storage-chunks.md`
- Modify: `docs/execution/phases/P06-jobs-outbox-events.md`
- Modify: `docs/execution/phases/P07-local-recovery-engine.md`
- Modify: `docs/execution/phases/P08-mobile-start-flow.md`
- Modify: `docs/execution/phases/P09-mobile-recording.md`
- Modify: `docs/execution/phases/P10-mobile-sync-recovery.md`
- Modify: `docs/execution/phases/P11-desktop-rust-foundation.md`
- Modify: `docs/execution/phases/P12-windows-audio-capture.md`
- Modify: `docs/execution/phases/P13-speech-deepgram.md`
- Modify: `docs/execution/phases/P14-finalization-backfill.md`
- Modify: `docs/execution/phases/P15-translation.md`
- Modify: `docs/execution/phases/P16-transcript-review.md`
- Modify: `docs/execution/phases/P17-ai-provider-platform.md`
- Modify: `docs/execution/phases/P18-detailed-minutes-evaluation.md`
- Modify: `docs/execution/phases/P19-minutes-editor.md`
- Modify: `docs/execution/phases/P20-branding-export-library.md`
- Modify: `docs/execution/phases/P21-application-security.md`
- Modify: `docs/execution/phases/P22-privacy-deletion-governance.md`
- Modify: `docs/execution/phases/P23-observability-support.md`
- Modify: `docs/execution/phases/P24-resilience-performance-a11y.md`
- Modify: `docs/execution/phases/P25-deployment-backup-dr.md`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md`
- Modify: `docs/execution/phases/P27-production-qualification.md`
- Modify: `docs/execution/phases/P28-local-ai-import-extension.md`

**Interfaces:**

- Consumes: accepted upgrade design and existing packet content.
- Produces: validator-compliant packet metadata, dependency gates, and command
  contracts without changing product acceptance.

- [ ] **Step 1: Add protocol semantics**

Document:

- packet state versus runtime lifecycle;
- `PROGRESS.md` as the only lifecycle source;
- default `VERIFIED` dependency readiness;
- five conditions for `IMPLEMENTED` capability-scoped readiness;
- prohibition on owner waivers;
- exact command-contract requirements.

Remove `Current phase: P00` from `MASTER_PLAN.md`.

- [ ] **Step 2: Update templates**

`PHASE_TEMPLATE.md` must use:

```yaml
packet_status: ACCEPTED
```

and add:

```markdown
# Dependency gate

| Dependency | Required capability | Required evidence | Minimum lifecycle |
| ---------- | ------------------- | ----------------- | ----------------- |

# Integrated verification

| Gate | Command | Intended signal | Evidence |
| ---- | ------- | --------------- | -------- |
```

`RUN_TEMPLATE.md` records the evaluated dependency capability and orthogonal
unsatisfied gates. `EVIDENCE_TEMPLATE.md` records lifecycle evidence separately
from dependency-consumption evidence.

- [ ] **Step 3: Migrate packet frontmatter and dependency gates**

For P00, state that no dependency gate applies. For P01-P28, add exactly one row
per direct dependency.

All minimum lifecycles are `VERIFIED` except:

- P05 consumes P04 JWT verification, authenticated owner context,
  owner-isolation policy, and safe API conventions at `IMPLEMENTED`.
- P06 consumes the same P04 capability subset at `IMPLEMENTED`.

Both rows link to
`../evidence/P04/EVIDENCE.md#acceptance-ledger`. Their text explicitly excludes
P04-A04's future full-route matrix and P04-A05's OS-keychain/device evidence.

- [ ] **Step 4: Add exact command contracts**

Every packet gets a Markdown command table. Use exact root commands where
applicable:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm verify
```

Add exact existing package filters for phases whose packages already exist.
For future native/device/provider commands, name the intended command from the
accepted test strategy and mark its environment `external`; do not claim a
future pass.

- [ ] **Step 5: Regenerate and run structural tests**

Run:

```powershell
node scripts/execution/generate-phase-prompts.mjs
node --test scripts/execution/plan-model.test.mjs
node --test scripts/execution/generate-phase-prompts.test.mjs
node --test scripts/execution/validate-execution-plan.test.mjs
```

Expected: all tests pass, 0 fail, 0 skip.

---

### Task 5: Reconcile current truth and wire the gate into verification

**Files:**

- Modify: `docs/execution/PROGRESS.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/execution/TRACEABILITY.md`
- Modify: `docs/execution/evidence/P05/RUN-20260723-2200.md`
- Create: `docs/execution/evidence/PLAN-UPGRADE-20260723.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: existing P04 evidence and P05 T01/T02 reports.
- Produces: canonical P05 `IN_PROGRESS` state at 2/7 and repository commands
  `execution:generate`, `execution:generate:check`, and `execution:check`.

- [ ] **Step 1: Run impact analysis before existing-symbol edits**

Run:

```powershell
node .gitnexus/run.cjs impact package.json -r . --direction upstream
node .gitnexus/run.cjs impact ci -r . --direction upstream
```

Report HIGH or CRITICAL risk before proceeding. Expected current risk is low
because the changes add an independent documentation gate.

- [ ] **Step 2: Update canonical current state**

Change the progress header and row to:

```text
Current phase: P05
Current task: P05-T03
State: P00-P03 VERIFIED; P04 IMPLEMENTED; P05 IN_PROGRESS
P05: IN_PROGRESS, 2/7
```

Append a reconciliation run entry. Do not rewrite historical run entries.

Update `STATUS.md` object storage to `In progress` with T01/T02 evidence and
T03-T07 remaining. Update traceability links without changing requirement
ownership.

In the P05 run record, mark only the architecture, T01 implementer/reviewer, and
T02 implementer/reviewer rows `DONE`, matching existing reports. Leave all later
rows pending.

- [ ] **Step 3: Add package and CI commands**

Add to root `package.json`:

```json
"execution:generate": "node scripts/execution/generate-phase-prompts.mjs",
"execution:generate:check": "node scripts/execution/generate-phase-prompts.mjs --check",
"execution:check": "node scripts/execution/validate-execution-plan.mjs"
```

Prepend `pnpm execution:check` to the existing `verify` chain. Add the same
command to CI before product test jobs.

- [ ] **Step 4: Create upgrade evidence**

`PLAN-UPGRADE-20260723.md` records:

- starting and ending commit/tree;
- all files changed by this upgrade;
- packet/task/acceptance/prompt counts;
- dependency and link validation results;
- prompt generation check;
- parser/generator/validator test counts;
- `git diff --check` limited to upgrade files;
- explicit statement that no product phase or product evidence was advanced.

- [ ] **Step 5: Run the narrow control-plane gate**

Run:

```powershell
pnpm execution:generate:check
pnpm execution:check
node --test scripts/execution/*.test.mjs
```

Expected:

- generator check exit 0;
- validator exit 0 with 29 packets, 213 tasks, 170 acceptance IDs, 29 prompts,
  and 0 broken links;
- all control-plane tests pass with 0 skips.

- [ ] **Step 6: Run repository-facing verification**

Run:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm execution:check
```

Expected: each exits 0. If repository-wide formatting fails on a pre-existing
file outside this upgrade, record it separately and run Prettier check against
the upgrade file list; do not reformat unrelated user work.

- [ ] **Step 7: Detect change scope**

Run:

```powershell
node .gitnexus/run.cjs detect-changes -r .
git diff --check
```

Expected: no unexpected product execution flow is affected. Existing unrelated
working-tree warnings are separated from upgrade-file results.

- [ ] **Step 8: Final review and handoff**

Review against all 11 design acceptance criteria. Report:

- files changed;
- exact commands, exit codes, and test counts;
- current canonical state;
- P04 unsatisfied gates retained;
- P05 newly valid entry contract;
- any unrelated pre-existing failures;
- confirmation that P05 implementation did not continue.
