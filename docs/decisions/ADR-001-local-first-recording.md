# ADR-001: Local-first chunked recording

**Status:** Accepted  
**Date:** 2026-07-21

## Context

Mobile/desktop networks and provider sessions can fail during a meeting. Streaming-only capture creates unacceptable evidence loss.

## Decision

Write bounded audio chunks to private local storage, finalize/checksum them, then upload asynchronously. Pause closes a chunk; resume starts a new chunk. A local manifest enables crash recovery and idempotent upload.

## Consequences

- Recording continues without network/provider availability.
- Clients need storage monitoring, cleanup policy and recovery UI.
- Upload/finalization are more complex but testable by stable chunk IDs/checksums.

## Alternatives

Streaming-only capture was rejected due to data-loss risk. One monolithic local file was rejected because recovery/upload retry is less granular.
