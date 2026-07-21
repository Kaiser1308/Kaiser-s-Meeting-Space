# ADR-002: Immutable source evidence

**Status:** Accepted  
**Date:** 2026-07-21

## Context

Users need to verify exact statements. AI cleanup or manual edits must not erase provider output or audio evidence.

## Decision

Finalized audio and source transcript segments are immutable. Corrections, speaker mappings, translations, minutes and exports are versioned derived artifacts. Important minutes content cites source segments/time ranges.

## Consequences

- Auditability and recovery are strong.
- Storage grows with versions and requires explicit retention/deletion.
- UI must distinguish source, corrected projection and derived artifacts.

## Alternatives

In-place transcript editing was rejected because it destroys traceability. Keeping only summaries was rejected because completeness is a core requirement.
