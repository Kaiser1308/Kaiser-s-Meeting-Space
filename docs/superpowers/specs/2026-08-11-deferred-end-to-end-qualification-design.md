# Deferred End-to-End Qualification Design

## Decision

The project may implement the user-facing meeting flow continuously through P20
while the long-running, physical end-to-end qualification is deferred. P09-A05
is not waived: it becomes part of a single integrated qualification run once
recording, playback, sync, finalization, transcript, review, minutes, library,
and export surfaces exist.

## Scope

The implementation path is P10 through P20. P21 through P26 remain hardening
and packaging work; P27 remains the only release qualification phase.

The deferred run must cover the actual end-to-end path, including durable
recording, End/finalization, recovery, sync, source playback, final-run state,
and all applicable downstream evidence. It must retain the original P09/P10/
P12/P14 two-hour and physical fault criteria; the criteria are moved, not
relaxed or treated as passed.

## Dependency policy

Add an explicit `DEFERRED_END_TO_END_QUALIFICATION` policy to the execution
protocol and affected packets.

1. A phase may start with an upstream phase at `IMPLEMENTED` when the consumed
   contracts and implementation are directly evidenced and the unresolved work
   is recorded as deferred end-to-end qualification.
2. The downstream phase may reach only `IMPLEMENTED` until all of its own
   gates and every inherited deferred qualification gate pass.
3. No phase may claim `VERIFIED` while an inherited deferred qualification is
   open. P27 preflight must reject an open deferred qualification.
4. Security, owner-isolation, content-free logging, immutable-source,
   consent, provider-authorisation, migration, and data-loss gates are never
   deferred by this policy. Missing provider/model/device prerequisites remain
   visible truthful states and cannot become PASS claims.

## Affected planning artifacts

- `docs/execution/EXECUTION_PROTOCOL.md`: define the exception, inheritance,
  state ceiling, and P27 release block.
- `docs/execution/MASTER_PLAN.md`: record the P10-to-P20 implementation lane
  and deferred integrated qualification before P27.
- P09, P10, P12, P13, and P14 packets: identify their two-hour/physical or
  provider-dependent qualification as open evidence that does not prevent
  implementation of the next phase.
- P15 through P20 packets: permit `IMPLEMENTED` upstream capabilities only
  under the protocol's explicit deferred policy; preserve their own direct
  acceptance gates.
- `PROGRESS.md`, `STATUS.md`, `TRACEABILITY.md`, and P14's blocked preflight:
  replace the obsolete “cannot start” statement with the new state ceiling and
  evidence ledger link.

## Evidence and verification

Create one deferred-qualification ledger that lists every inherited gate,
its original phase/acceptance ID, required environment, current state, and
final evidence path. A later integrated run must update those original gate
records and may then promote eligible phases to `VERIFIED` only after all
ordinary phase gates also pass.

## Non-goals

- This decision does not mark P09, P10, P12, P13, P14, or later phases
  `VERIFIED`.
- This decision does not start P21-P27 or alter release requirements.
- This decision does not substitute simulated, UI-only, or shortened evidence
  for the required physical two-hour run.
