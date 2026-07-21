# ADR-003: Provider-neutral AI adapters

**Status:** Accepted  
**Date:** 2026-07-21

## Context

Quality, price, privacy terms, availability and language performance differ across providers and change over time.

## Decision

Speech, translation and generative AI use separate capability-based provider contracts. Domain/client code does not import provider SDK types. Cross-provider fallback is disabled by default and creates a new job/version when explicitly used.

## Consequences

- Providers can change without rewriting workflows.
- Normalization, conformance fixtures and capability negotiation are mandatory.
- Advanced provider-specific features may require optional adapter extensions.

## Alternatives

A single vendor was rejected as lock-in. A lowest-common-denominator untyped interface was rejected because it would hide capability and validation differences.
