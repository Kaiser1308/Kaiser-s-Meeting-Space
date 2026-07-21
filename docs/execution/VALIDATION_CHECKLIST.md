# Execution Plan Validation Checklist

**Status:** Accepted
**Owner:** Engineering
**Last reviewed:** 2026-07-21

Run this checklist after any phase packet, dependency, requirement, or execution-framework change. Store the completed result in the planning change or P00 evidence; this checklist does not prove a product phase.

## Catalog and dependency integrity

- [ ] Exactly 29 packets exist for P00-P28 and filenames match `MASTER_PLAN.md` links.
- [ ] Every packet frontmatter phase ID matches its filename and is unique.
- [ ] `depends_on` lists only canonical direct dependencies, is acyclic, and matches both `MASTER_PLAN.md` and `PROGRESS.md` exactly.
- [ ] Every dependency ID exists; P28 is optional and no P00-P27 phase depends on it.
- [ ] Task totals in `PROGRESS.md` match `Pxx-Tnn` headings in each packet.

Suggested read-only checks:

```powershell
(Get-ChildItem docs/execution/phases -Filter 'P*.md').Count
rg -n '^phase:|^depends_on:' docs/execution/phases docs/execution/PROGRESS.md docs/execution/MASTER_PLAN.md
rg -n '^## P[0-9]{2}-T[0-9]{2} ' docs/execution/phases
```

## Packet completeness

- [ ] Every packet contains Outcome, Authoritative context, Preconditions/external prerequisites, Scope firewall, Contracts/invariants, File/ownership map, Ordered task packets, Subagent work packages, Failure/debugging matrix, Integrated verification, Acceptance gate, Migration/rollout/rollback, Required documentation updates, and Handoff.
- [ ] Every task describes behavior, target paths/owner, consumed/produced boundary, failure/recovery tests, narrow or named verification, and evidence destination directly or through its packet's maps/contracts.
- [ ] Work packages have non-overlapping ownership and explicit dependency/review gates.
- [ ] Every phase has automated, real manual/platform/provider requirements where applicable, security/privacy/integrity review, regression, and truthful `IMPLEMENTED/BLOCKED` behavior.
- [ ] Each packet is one integrated outcome suitable for one sustained conversation; no hidden phase or successor implementation exists.

## IDs, traceability, and evidence

- [ ] `Pxx-Tnn` and `Pxx-Ann` IDs are unique, ordered, and use their packet phase prefix.
- [ ] Every PRD FR/NFR, accepted ADR, release criterion, and Test Strategy critical scenario appears in `TRACEABILITY.md` with implementation, verification, and evidence target.
- [ ] P27 re-verifies every production release criterion; only P27 may set `RELEASED`.
- [ ] P28 scenario/evidence is explicitly optional and does not weaken P27.
- [ ] Evidence filenames contain no real meeting content, credential, raw audio/transcript/minutes, or signed URL.

## Language and ambiguity scan

- [ ] Execution documentation is English.
- [ ] No `TBD`, `TODO`, `implement later`, `fill in`, "similar to", vague "appropriate handling", or unsupported future-pass claim remains outside templates/design examples that explicitly prohibit them.
- [ ] No mojibake/replacement character exists.
- [ ] State names, interface names, units, version names, language/mode enums, and source/derived semantics are consistent across producing/consuming phases.

Suggested scan:

```powershell
rg -n -i 'TBD|TODO|implement later|fill in|similar to|appropriate handling|placeholder|�' docs/execution
rg -n 'mixed|record_translate|streaming-only|client.*provider.*key' docs/execution
```

## Links and repository truth

- [ ] Every relative Markdown link resolves with exact filename/case.
- [ ] All authoritative documents named by a packet exist and remain maintained/accepted/draft as represented.
- [ ] `STATUS.md` distinguishes current implementation from target plan.
- [ ] `git diff --check` reports no whitespace error, and `git status --short --branch` is captured without discarding pre-existing work.
- [ ] No product code, dependency, credential, generated binary, or execution evidence was created while only authoring the plan.

## Reviewer sign-off

Record packet count, task/acceptance counts, dependency result, broken-link count, ambiguity-scan result, traceability gaps, files changed, reviewer, and date. Any failed item keeps the planning system incomplete.
