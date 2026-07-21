---
phase: PNN
title: Replace with a unique outcome title
status: NOT_STARTED
depends_on: []
requirements: []
risk: medium
---

# Outcome

Describe observable behavior and the precise end state. Do not describe activity alone.

# Authoritative context

List every document and accepted ADR the agent must read completely. State any phase-specific precedence.

# Preconditions and external prerequisites

- Dependency phases and required evidence links.
- Exact toolchain/services/platforms/devices/providers/credentials/approvals.
- Truthful `BLOCKED` condition when a real prerequisite is absent.

# Scope firewall

## In scope

## Out of scope

## Allowed paths

## Forbidden paths

## Extension seams

# Contracts and invariants

List exact public names, input/output types, versioning, auth/idempotency, persistence, error, compatibility, and global invariants used by this phase.

# File and ownership map

| Path | Responsibility | Task owner | Change type |
|---|---|---|---|

# Ordered task packets

## PNN-T01 - Observable component outcome

**Behavior**

**Files**

**Consumes**

**Produces**

**Failure and recovery**

**Test and implementation loop**

1. Add the named failing test/validation check with synthetic fixtures.
2. Run the exact narrow command and record the expected failure signal.
3. Implement the bounded production change.
4. Run the narrow command and record non-zero passing test count.
5. Run named related regression commands.
6. Record artifact/evidence path and checkpoint.

**Task done when**

# Subagent work packages

| Package | Task IDs | Exclusive paths | Depends on | Review gate | Output |
|---|---|---|---|---|---|

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Content-free diagnostics | Recovery/regression |
|---|---|---|---|---|

# Integrated verification

## Automated commands

| Command | Purpose | Required result | Evidence |
|---|---|---|---|

## Manual/platform/provider matrix

## Security, privacy, and data-integrity review

## Regression gate

# Acceptance gate

- [ ] PNN-A01 - Binary criterion with evidence location.

# Migration, rollout, and rollback

# Required documentation updates

# Handoff record

Use `templates/HANDOFF_TEMPLATE.md`. Stop after this phase; do not begin the next phase.
