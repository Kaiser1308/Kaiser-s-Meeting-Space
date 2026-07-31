# ADR-007: Android-only mobile product scope

**Status:** Accepted  
**Date:** 2026-07-31

## Context

The initial personal-release baseline treated Android and iOS as equally
supported mobile platforms. That made iOS devices, Xcode, Apple signing,
App Store Connect, VoiceOver qualification and iOS release artifacts mandatory
dependencies for mobile phase verification and the production release.

The product now targets Android only on mobile. Existing iOS configuration and
implementation remain useful contingency assets, but they must not create a
release promise or block Android delivery.

## Decision

Kaiser's Meeting Space supports Windows 11 23H2+ x64 and Android 12+.
Android is the sole supported mobile product platform.

Existing iOS configuration, scripts, native code, adapters and compatibility
tests remain as a dormant iOS reserve. They do not create a release, support,
parity, testing, signing, distribution or phase-verification commitment.

Missing iOS devices, Xcode, Apple signing identities, App Store Connect access,
VoiceOver evidence or iOS qualification cannot prevent a phase from reaching
`VERIFIED`. Mobile product and release gates require direct Android evidence
only.

Historical evidence and dated execution records remain unchanged. When they
refer to an earlier Android/iOS target or completed iOS implementation, they
record the scope and facts at that time rather than a current support promise.

Reintroducing iOS as a supported platform requires a new accepted decision, an
updated support matrix, a current security and privacy review, and complete iOS
qualification.

## Consequences

- Product, architecture, roadmap and execution documents use Windows and
  Android as the supported release matrix.
- Android 12+ physical-device, TalkBack, resilience, performance, packaging,
  upgrade and production evidence gates mobile verification.
- Existing Expo iOS configuration, `ios` scripts, Swift capture code, iOS
  adapters and compatibility tests stay in the repository.
- Routine Android work should avoid breaking the reserve when preservation has
  negligible cost, but iOS parity and release readiness are not required.
- iOS build, signing, distribution and physical-device failures are
  non-gating unless iOS is formally restored to the supported scope.

## Alternatives

- Updating only the PRD was rejected because execution packets and release gates
  would continue to require iOS.
- Deleting all iOS assets was rejected because the implementation is retained
  for contingency use.
- Continuing equal Android/iOS support was rejected because it makes
  unavailable Apple tooling and qualification a release dependency.

## Review trigger

Review this decision only when Product proposes shipping or supporting iOS.
That proposal must include current platform ownership, security/privacy review,
device and accessibility coverage, signing/distribution prerequisites, and a
complete qualification plan.
