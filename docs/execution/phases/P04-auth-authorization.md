---
phase: P04
title: Personal authentication, authorization, and API conventions
packet_status: ACCEPTED
depends_on: [P03]
requirements: [FR-7, NFR-Security]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

Mobile/desktop authentication uses OAuth 2.1/OIDC Authorization Code + PKCE and OS-secure token storage; the API validates short-lived JWTs, maps issuer+subject to a local owner, applies safe API conventions, and denies every cross-user resource access without enumeration.

# Authoritative context

Read API Contracts, Security/Privacy identity and authorization sections, System Architecture boundaries, P00 identity decision, P02 error/envelope contracts, and P03 repository evidence.

# Preconditions and external prerequisites

P03 is `VERIFIED`. A local OIDC test issuer/JWKS fixture is required; production IdP provisioning is deferred to P25. Platform keychain adapters may require development builds/devices for final external evidence.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P03        | Verified outputs and invariants consumed by this packet. | `../evidence/P03/EVIDENCE.md` | VERIFIED          |

# Scope firewall

**Allowed:** `packages/auth/`, API auth/request/error/version/rate plugins, identity repository integration, mobile/desktop auth and secure-storage interfaces/adapters, and auth/security tests.

**Forbidden/out:** team/RBAC/SSO administration, business features beyond representative protected probes, production IdP, provider credentials, broad client UI polish, or repository methods without owner context.

**Extension seams:** `AuthorizationPolicy` remains deny-by-default and personal-owner focused; future workspace roles require a new ADR.

# Contracts and invariants

- Identity key is `(issuer, subject)`, never email; disabled/revoked session behavior is explicit.
- JWT validation pins issuer/audience/algorithm/time/skew and bounded JWKS cache/rotation; fail closed.
- `AuthenticatedOwnerContext` is required before user-data service/repository calls.
- Cross-owner existing and nonexistent resources share the approved not-found/deny response shape/timing policy.
- Retryable mutations require validated `Idempotency-Key`; responses carry `X-Request-Id` and safe error envelope/API version.
- Refresh tokens use OS secure storage and never renderer/global app state/logs; no client secret in public clients.

# File and ownership map

| Path                             | Responsibility                                 | Owner                |
| -------------------------------- | ---------------------------------------------- | -------------------- |
| `packages/auth/src/`             | JWT/OIDC/PKCE/owner contracts and verification | Auth core            |
| `apps/api/src/plugins/`          | auth, request ID, errors, version, limits      | API boundary         |
| `apps/api/src/modules/identity/` | issuer+subject mapping and disabled state      | API boundary         |
| mobile/desktop auth adapters     | PKCE, callback, refresh/logout, secure storage | Client auth          |
| `tests/security/authorization/`  | token and two-user matrices                    | Independent reviewer |

# Ordered task packets

## P04-T01 - Typed OIDC/JWT configuration and verifier

Add failing tests for issuer/audience/algorithm/key/expiry/not-before/skew/JWKS rotation/outage/cache bounds and value redaction. Implement provider-neutral verifier/config in `packages/auth`. Evidence: `evidence/P04/jwt-matrix.json`.

## P04-T02 - Bearer middleware and stable local identity

Implement Fastify authentication, issuer+subject upsert, disabled user/session handling, and `AuthenticatedOwnerContext`. Test duplicate concurrent login, email change/reuse, unknown issuer, malformed header, and no DB query on invalid token. Evidence: `identity-integration.json`.

## P04-T03 - Owner authorization boundary

Require owner context in service/repository entry points and implement a reusable existence-hiding policy. Create a route/resource inventory and two-owner negative tests for every currently modeled meeting/job/export/object metadata class. Evidence: `owner-matrix.json`.

## P04-T04 - Mobile/desktop PKCE and secure token storage

Define/test PKCE state/nonce/verifier/callback/refresh/logout flows and OS keychain interfaces; use fake adapter for CI plus platform adapter evidence when available. Test callback replay, state mismatch, refresh rotation/revocation, logout/offline recovery, and renderer/app-state token exposure. Evidence: `client-auth-report.json`.

## P04-T05 - API request/error/idempotency/version/limit conventions

Implement request IDs, safe P02 error mapping, JSON/content-type/size limits, idempotency header syntax, rate baseline, version negotiation, and security headers/CORS defaults. Test malformed/oversized/rate/replay/unsupported-version paths and log redaction. Evidence: `api-conventions.json`.

## P04-T06 - Deterministic local issuer and token fixtures

Create isolated key rotation and tokens for valid/expired/future/wrong audience/issuer/algorithm/key/revoked/disabled cases. Tests prove fixture values are synthetic, keys stay test-only, and rotation cache behavior is deterministic. Evidence: `issuer-fixture-report.json`.

## P04-T07 - Full authorization and secret-leak regression

Run every protected resource with owner A, owner B, nonexistent ID, stale token, and replay; scan API responses/logs/mobile/desktop bundles for tokens, secrets, provider keys, SQL/content. Fix root causes and rerun. Evidence: `evidence/P04/EVIDENCE.md`.

# Subagent work packages

| Package       | Tasks           | Exclusive paths         | Depends on | Review gate                    |
| ------------- | --------------- | ----------------------- | ---------- | ------------------------------ |
| JWT/API       | T01,T02,T05,T06 | auth core/API plugins   | P03        | cryptographic/error review     |
| Client auth   | T04             | mobile/desktop auth     | T01        | PKCE/secure-storage review     |
| Authorization | T03,T07         | policies/security tests | T02        | independent IDOR/secret review |

# Failure and debugging matrix

| Failure                  | Classification | Expected behavior                                      | Recovery/regression  |
| ------------------------ | -------------- | ------------------------------------------------------ | -------------------- |
| JWKS unavailable         | provider       | Use bounded valid cache, else fail closed safely       | outage/rotation test |
| Expired/wrong token      | security       | 401 and no resource query                              | token matrix         |
| Authenticated non-owner  | security       | approved 404/deny with no metadata                     | two-user matrix      |
| Refresh revoked/offline  | state          | Clear/re-auth while local evidence remains recoverable | client session E2E   |
| Secure-store unavailable | platform       | No plaintext fallback; actionable blocked login/sync   | adapter failure test |

# Integrated verification

Run auth unit/contract tests, real-DB issuer/identity integration, complete authorization security suite, client auth/secure-storage tests, rate/size/error tests, bundle/log secret scan, repository typecheck, and `pnpm verify`.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P04/EVIDENCE.md` |

# Acceptance gate

- [ ] P04-A01 - PKCE/JWT/key rotation/revocation paths pass deterministic local-issuer tests.
- [ ] P04-A02 - Every user-data access requires authenticated owner context.
- [ ] P04-A03 - Complete two-user/nonexistent resource matrix denies without enumeration.
- [ ] P04-A04 - Safe errors/logs, rate/size/version/idempotency conventions pass.
- [ ] P04-A05 - Mobile/desktop secure-storage and logout/recovery behavior pass without plaintext fallback.
- [ ] P04-A06 - No credential/token/provider secret appears in source, bundle, response, or logs.

# Migration, rollout, and rollback

Remote auth remains feature-flagged until P25 IdP config. Rollback disables cloud sync/login while preserving local recovery; identity schema is additive.

# Required documentation updates

API Contracts, Security identity section, client auth flow, `.env.example`, Status/Traceability/Progress, and P04 evidence.

# Conversation boundary

Identity and authorization only. Do not implement team/RBAC, production IdP provisioning, business features beyond protected probes, or provider credentials. Stop before P05/P06.

# Handoff record

Unblock P05 and P06; execute neither here.
