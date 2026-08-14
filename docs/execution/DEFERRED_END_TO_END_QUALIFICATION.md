# Deferred End-to-End Qualification Ledger

**Status:** OPEN
**Owner decision:** 2026-08-11
**Policy authority:** [`EXECUTION_PROTOCOL.md` section 3.2](EXECUTION_PROTOCOL.md#32-deferred-end-to-end-qualification-policy) and [`MASTER_PLAN.md`](MASTER_PLAN.md#deferred-end-to-end-qualification-lane)

## Purpose and boundary

This ledger schedules the named long-running physical-device, route, provider,
and integrated end-to-end qualification after the complete P10-P20 meeting flow
is implemented. It does not waive, simulate, or mark any gate as passed. A
phase that inherits an open row may reach `IMPLEMENTED` only; it cannot claim
`VERIFIED`.

P10 through P20 may use this bounded implementation lane when their packet
names the directly consumed capability and records the inherited row(s) in its
run record. P21 through P27 and P28 retain the normal `VERIFIED` dependency
rule. P27 preflight must reject every open row below before release work begins.

Security, owner isolation, consent, immutable source evidence, data-loss,
migration, and provider-authorisation gates are not deferrable. Missing real
devices, providers, models, or authorized credentials remain truthful
unavailable states.

## Open source gates

| Source phase | Open gate(s) | Current evidence state | Required closure evidence | State |
| --- | --- | --- | --- | --- |
| P09 | P09-A04, P09-A05, P09-T07 | CPH2699 smoke, microphone contention, Bluetooth route, repeated End, and force-stop recovery are directly evidenced; locked/background and wired-route coverage remain incomplete, and the uninterrupted two-hour run did not complete because ADB disconnected. | Complete the physical interruption/route matrix and uninterrupted two-hour CPH2699 run with durable recording/recovery evidence. | OPEN |
| P10 | P10-A06 and long-run recovery/upload qualification | Existing implementation evidence is not a completed real-device/integrated qualification. | Run sync, Recovery Inbox, retry/idempotency, and offline-to-online recovery against the final recording flow. | OPEN |
| P12 | P12-A03, P12-A04, P12-T08 | Windows native capture and long-run/native-link qualification remain external to this ledger's current evidence. | Run the required real Windows device/route, interruption, restart, and two-hour capture evidence. | OPEN |
| P13 | P13-A03, P13-A04, P13-A05 | Real Deepgram/provider authorization, model/corpus quality, and final native-link qualification remain open. | Use the authorized real provider/model and consented or synthetic qualification corpus; capture provider, quality, failure, and recovery evidence. | OPEN |
| P14 | P14-A05, P14-A06, P14-T08 | P14 implementation lane passed isolated tests and synthetic smoke; real finalization/backfill, provider/device, and two-hour qualification remain open. | Run finalization/backfill/reconciliation on the completed P10-P20 flow, including two-hour source manifests and truthful missing-provider/device states. | OPEN |
| P15 | P15-A05, P15-A06 live qualification | P15 deterministic mock corpus and fault/conformance tests pass; approved provider/key, reviewed bilingual corpus, live quality/cost/latency, and full integrated authorization remain open. | Run authorized vi→en/en→vi provider matrix, fixed-corpus quality/cost/latency/failure campaign, and integrated owner/consent/budget evidence. | OPEN |

## Integrated exit evidence

The final qualification run must use the implemented P10-P20 flow and record:

- uninterrupted two-hour capture on each required native platform, plus screen-lock/background, microphone contention, route, restart, and repeated End behavior;
- durable sync/recovery, finalization, transcription/provider, translation, review, minutes, library, playback/export, and restart/retry behavior;
- real provider/model authorization and quality evidence where a phase requires it, with no fabricated provider or device result;
- a cross-phase evidence index that closes each row above before any affected phase is promoted to `VERIFIED`.
