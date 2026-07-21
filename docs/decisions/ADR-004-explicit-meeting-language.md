# ADR-004: Explicit meeting language selection

**Status:** Accepted  
**Date:** 2026-07-21

## Context

Automatic mixed-language recognition increases complexity and can reduce predictable transcription quality.

## Decision

Before Start, the user must choose Vietnamese or English. The selected language is fixed for the meeting. Translation mode derives the target as the other language.

## Consequences

- Provider configuration and evaluation are simpler and more predictable.
- Users must confirm language each time.
- Switching languages mid-meeting can reduce accuracy and is communicated before Start.

## Alternatives

Automatic/mixed-language mode is deferred until benchmarks prove it reliable enough without harming core completeness.
