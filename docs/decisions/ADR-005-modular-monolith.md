# ADR-005: Modular monolith plus workers

**Status:** Accepted  
**Date:** 2026-07-21

## Context

The product needs asynchronous processing but begins with a small team and uncertain scale. Premature microservices would increase operational risk.

## Decision

Use a modular Fastify API backed by PostgreSQL plus separately scalable background workers. Domain modules own boundaries; queue events connect durable async work. Split services only after measured scaling/ownership/failure-isolation need.

## Consequences

- Simpler deployment and transactions during alpha.
- Workers isolate expensive/provider work.
- Module boundaries and outbox/idempotency discipline remain required.

## Alternatives

Microservices were rejected for alpha complexity. A single synchronous server was rejected because long-running AI/export work needs retries and isolation.
