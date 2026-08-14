# Android-Only Mobile Product Scope Design

**Status:** Approved design  
**Date:** 2026-07-31  
**Owner:** Product and Engineering

## Decision

Kaiser's Meeting Space supports Android as its only mobile product platform.
Windows desktop remains in the supported product scope. iOS implementation and
configuration remain in the repository as dormant contingency assets, but iOS
is not a supported, released, or acceptance-gating platform.

The supported mobile baseline remains Android 12+ unless a later accepted
decision changes it.

## Product Meaning

Android-only means:

- Product requirements, release plans, support matrices, and user-facing
  platform commitments name Android as the sole supported mobile platform.
- Mobile physical-device, accessibility, resilience, performance, packaging,
  signing, upgrade, and production-qualification gates require Android
  evidence only.
- Missing iOS devices, Xcode, Apple signing identities, App Store Connect
  access, VoiceOver evidence, or iOS qualification cannot block a phase from
  reaching `VERIFIED`.
- Windows requirements and qualification gates are unchanged.

Android-only does not mean:

- deleting iOS source code, native modules, adapters, tests, dependencies, or
  Expo configuration;
- claiming that retained iOS code is release-ready or supported;
- modifying historical evidence to imply that past work targeted Android only.

## iOS Reserve Policy

Existing iOS assets remain available for contingency use:

- Expo iOS configuration and the `ios` development script remain intact;
- Swift native recording code and iOS adapter contracts remain intact;
- existing platform-neutral and iOS compatibility tests may remain;
- routine Android work must avoid intentionally breaking retained iOS assets
  when preservation has negligible cost.

These assets are dormant. They do not create an obligation to build, test,
sign, distribute, support, or maintain feature parity on iOS. Reintroducing iOS
as a supported product platform requires a separately accepted scope decision,
an updated support matrix, current security and privacy review, and full
platform qualification.

## Documentation Changes

The implementation will reconcile maintained, forward-looking documents so
they use one consistent platform model:

| Document area                              | Required change                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Product requirements and consolidated plan | Replace mobile iOS/Android commitments with Android-only commitments.                                 |
| Architecture and technology stack          | Describe Expo/React Native as the Android product stack and iOS as retained contingency code.         |
| Roadmap and execution master plan          | Remove iOS from production targets and future phase outcomes.                                         |
| Mobile phase packets                       | Make Android the only required physical-device and accessibility target.                              |
| Release/security/privacy phases            | Remove iOS, Apple signing, App Store, and VoiceOver from mandatory gates.                             |
| Test strategy and traceability             | Define release evidence against Windows and Android, with TalkBack for mobile accessibility.          |
| Status and progress ledgers                | Record the new decision prospectively while preserving historical implementation facts.               |
| Generated phase prompts                    | Regenerate from updated authoritative phase packets rather than editing generated text independently. |

Historical evidence and completed run records remain immutable except for a
clearly labeled prospective addendum if one is necessary to prevent current
scope confusion. Statements about Swift code, iOS tests, unavailable devices,
or prior Android/iOS targets remain historical facts.

## Configuration and Code Boundaries

No production source or build configuration needs to be removed for this scope
change. In particular:

- `apps/mobile/app.json` keeps its `ios` section;
- root and mobile package scripts keep `ios`;
- Swift modules and `packages/mobile-audio` iOS adapters remain;
- platform branches needed by React Native compatibility remain;
- Android is the only platform required by release-oriented commands and
  evidence matrices after the documentation reconciliation.

If maintained CI or release configuration currently requires an iOS job for
the product gate, that job will become optional/non-blocking rather than being
deleted. No fake iOS success evidence will be introduced.

## Verification

The scope migration is complete when:

1. Maintained product, architecture, roadmap, execution, test, security, and
   operational documents agree that Android is the sole supported mobile
   platform.
2. Forward-looking phase acceptance criteria and release gates contain no
   mandatory iOS device, Xcode, Apple signing, App Store, or VoiceOver
   dependency.
3. iOS configuration, scripts, native implementation, and compatibility tests
   remain present.
4. Historical evidence remains factually unchanged.
5. Generated execution prompts match their updated authoritative phase
   packets.
6. Repository execution-plan validation passes.
7. A targeted search finds no remaining forward-looking claim that iOS is a
   supported or required release platform; any remaining iOS mention is
   explicitly reserve-only, implementation history, or technical
   compatibility context.

## Risks and Controls

- **Ambiguous support expectations:** Use the terms `supported Android` and
  `dormant iOS reserve` consistently.
- **False-green phase promotion:** Remove iOS only from prospective gates; do
  not rewrite evidence or claim unexecuted Android tests passed.
- **Accidental iOS deletion:** Keep configuration and implementation files out
  of the removal scope.
- **Generated-document drift:** Change authoritative packets first, regenerate
  prompts, and run the execution-plan validator.
- **Future silent scope expansion:** Require a new accepted decision and full
  qualification before advertising or releasing iOS.

## Out of Scope

- Removing or modernizing iOS code.
- Shipping an iOS build.
- Adding new Android features.
- Changing Windows support.
- Requalifying completed phases without executing their remaining Android
  gates.
- Rewriting historical evidence or claiming unavailable manual tests passed.
