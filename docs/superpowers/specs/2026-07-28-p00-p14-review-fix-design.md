# P00–P14 Review and Corrective-Fix Design

## Purpose

Audit the implementation, test gates, architecture boundaries, and evidence claims for P00 through P14. Correct demonstrated defects without implementing P14, which remains `NOT_STARTED` and has unmet verified dependencies.

## Scope

The review proceeds in dependency order. Each phase is compared against its accepted packet, authoritative contracts, implementation, tests, and direct evidence. A phase's lifecycle record is corrected only after direct verification. Device, provider, Docker, and production gates remain blocked when their required environment is absent.

## Design

1. Repair the shared quality gate first. The required-suite inventory must include every executable workspace test package, unit tests must not include Testcontainers integration tests, and build verification must cover every workspace build/typecheck target. The gate must fail when a registered target has no matching tests.
2. Correct the P13 speech-session broker. It receives injected dependencies so tests do not manipulate global network state. It validates the request shape, resolves a meeting through an owner-scoped policy port, and denies unsupported language, missing consent/policy, or cross-owner access before requesting a provider credential. The response remains content-free and never exposes the master key.
3. Audit remaining P00–P13 boundaries phase-by-phase. Fix only root causes proved by a failing test, static contract mismatch, or direct evidence contradiction. Avoid broad refactors that do not enforce an accepted invariant.
4. Treat P14 as a readiness audit only. Its dependency gate stays unmet until P10 and P13 are actually `VERIFIED`; no finalization behavior is introduced.

## Test Strategy

Every behavior change follows red-green: write or correct a focused failing test, observe the expected failure, make the smallest production change, rerun the focused test, then run the affected package and shared gate. Database integration runs remain separate and are reported as environment-blocked when no container runtime is available.

## Evidence Rules

Evidence documents state only commands and results observed in the current worktree. Unsupported previous claims are replaced with exact status, command output, and the named external blocker. `PROGRESS.md`, `TRACEABILITY.md`, `STATUS.md`, and phase evidence change only after their corresponding verification runs.
