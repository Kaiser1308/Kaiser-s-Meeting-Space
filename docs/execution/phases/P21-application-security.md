---
phase: P21
title: Application, native-boundary, and supply-chain security hardening
packet_status: ACCEPTED
depends_on: [P20]
requirements: [NFR-Security, NFR-Privacy, ADR-002, ADR-006]
risk: critical
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent work packages or `superpowers:executing-plans` when work is serial. Follow `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` through `docs/execution/EXECUTION_PROTOCOL.md`. Track the locked checklist in a runtime run record.

# Outcome

The feature-complete API, workers, storage, providers, mobile app, Electron/Rust runtime, editor/renderers, and build chain match an updated threat model, pass complete authorization/input/secret/IPC/supply-chain tests, and have zero unresolved critical/high findings. Residual low/medium risk has explicit owner/review trigger.

# Authoritative context

Read Security/Privacy, Security Policy, API/Data Model/System Architecture, all accepted ADRs, P04/P05/P11/P12/P17/P20 evidence, current route/IPC/provider/file-format inventory, dependency lockfiles, and operations incident/deployment target.

# Preconditions and external prerequisites

P20 is `VERIFIED`; security scanning/fuzzing tools, representative packaged development artifacts, two-owner fixtures, dependency registries/advisories, and approved secret/keychain test adapters are available. External penetration review is optional unless P00 marked mandatory; unavailable mandated review blocks acceptance.

# Dependency gate

| Dependency | Required capability                                      | Required evidence             | Minimum lifecycle |
| ---------- | -------------------------------------------------------- | ----------------------------- | ----------------- |
| P20        | Verified outputs and invariants consumed by this packet. | `../evidence/P20/EVIDENCE.md` | VERIFIED          |

# Scope firewall

**Allowed:** threat model/data flows, security test inventories, auth/session/URL/input/limit/secret/keychain/Electron/IPC/renderer hardening, dependency updates needed to remediate, SAST/fuzz/SBOM/license/provenance config, bounded fixes, risk register.

**Forbidden/out:** enterprise SSO/compliance certification, new features/providers/formats, broad architecture replacement, accepting critical/high findings, logging content for diagnosis, or disabling controls/tests.

**Extension seams:** security inventories are generated from route/job/IPC/provider/renderer registries so later additions fail closed until reviewed.

# Contracts and invariants

- Threat model enumerates assets, actors, trust boundaries, entry points, abuse cases, controls, test/evidence, owner, residual risk.
- Every mutation/read/object/job/export/provider/IPC command has auth/owner/state/idempotency/input/limit negative cases.
- Local secrets use OS keychain; server secrets use approved manager references; renderer/mobile public config never receives provider/server secret.
- Electron/native follows ADR-006, validates version/payload/path, verifies packaged runtime in P26, and exposes no arbitrary command/filesystem/network.
- All untrusted provider/editor/logo/audio/export input is size/depth/time/type validated and safely rendered/parsed.
- Critical/high vulnerabilities/findings block completion; exceptions cannot reduce severity without evidence.

# File and ownership map

| Path                                 | Responsibility                       | Owner                  |
| ------------------------------------ | ------------------------------------ | ---------------------- |
| security threat model/inventories    | boundaries/control/test/risk mapping | Threat model           |
| API/security tests and bounded fixes | authz/session/URL/rate/parser        | API security           |
| Electron/Rust/mobile security        | keychain/IPC/privilege/bundle        | Client/native security |
| provider/editor/renderer fuzz tests  | untrusted structured/file inputs     | Input security         |
| workflows/scanners/SBOM/license      | supply chain and artifacts           | Supply chain           |
| P21 evidence/risk register           | independent findings/remediation     | Independent reviewer   |

# Ordered task packets

## P21-T01 - Complete data-flow threat model and attack inventory

Map identity, clients/local files, capture/native IPC, API/DB/object/Redis/jobs, providers, prompts/outputs, editor/paste, logos/renderers/exports, telemetry/support, deletion, deployment/updater. Validate every entry point links to control/test/owner; run structured review. Evidence: `evidence/P21/threat-model.md`.

## P21-T02 - Complete owner/IDOR/idempotency route matrix

Generate/maintain inventory from API/routes/jobs/objects/SSE/downloads and test owner A/B/nonexistent/stale/deleted, guessed IDs, nested mismatch, pagination, replay/race, and timing/response metadata. Fix all gaps. Evidence: `authorization-matrix.json`.

## P21-T03 - Session, web/API, and signed URL hardening

Recheck JWT/JWKS/refresh/revocation/skew/algorithm, CORS/CSRF/cookies if used, headers/TLS proxy trust, request smuggling/content types, redirects, URL method/object/expiry/replay, rate/size/concurrency. Security tests exercise each attack/limit boundary and prove fail-closed responses. Evidence: `api-hardening-report.json`.

## P21-T04 - Secret/keychain/config/bundle/log assurance

Integrate platform keychain and approved server secret-reference adapters, rotation/revocation paths, least privilege, and scans of source/history/lock/config/env/images/mobile/desktop/native bundles/logs/reports. Tests inject synthetic secrets into every scanned artifact class and require detection; real hits rotate/remove. Evidence: `secret-assurance.json`.

## P21-T05 - Electron/Rust/native privilege and IPC hardening

Audit sandbox/CSP/navigation/preload/protocol/future-updater boundary, process spawn, app-data paths/symlink/reparse, binary/runtime version, IPC allowlist/size/rate/cancel, native unsafe code/dependencies, and crash logs. Attempt renderer compromise/path/process/unknown command/flood. Evidence: `native-security-report.json`.

## P21-T06 - Untrusted input limits and fuzzing

Fuzz JSON/OpenAPI/provider output/prompts, transcript revisions, editor docs/paste, logos/fonts/audio metadata/import seam, archives/DOCX/PDF rendering, URLs and compression bombs with CPU/memory/time/size/depth limits and escaped output. Evidence: `input-fuzz-report.json`.

## P21-T07 - Dependency, SAST, license, provenance, and SBOM gate

Run pinned JS/Rust/native/container dependency audits, SAST, lockfile integrity, install-script review, license allow/deny, build permission review, and generate SPDX/CycloneDX-style SBOM/provenance references for API/worker/client/native/renderers. Evidence: `supply-chain-report.json`.

## P21-T08 - Findings remediation and independent full security regression

Classify with reproduction/impact/owner; remediate root cause and regression, rotate compromised secrets, or record owned low/medium residual risk. Independent reviewer reruns complete security suites/artifact scans and confirms zero unresolved critical/high. Evidence: `evidence/P21/EVIDENCE.md`.

# Subagent work packages

| Package                 | Tasks              | Exclusive paths                             | Depends on | Review gate                 |
| ----------------------- | ------------------ | ------------------------------------------- | ---------- | --------------------------- |
| Threat/API              | T01-T03            | threat docs/API/tests                       | P20        | independent auth/web review |
| Client/native           | T04 client,T05     | client/native/tests                         | P11/P12    | privilege/keychain review   |
| Inputs/supply chain     | T04 server,T06,T07 | fuzz/scans/workflows                        | P17/P20    | parser/dependency review    |
| Independent remediation | T08                | tests/evidence + bounded fixes coordination | all        | final security review       |

# Failure and debugging matrix

| Failure                   | Classification | Expected behavior                        | Recovery/regression |
| ------------------------- | -------------- | ---------------------------------------- | ------------------- |
| Cross-user identifier     | security       | Uniform deny/no metadata                 | route matrix        |
| Compromised renderer      | security       | No Node/secret/broad native capability   | adversarial IPC     |
| Malformed/oversized input | security       | Bounded rejection before costly work     | fuzz regression     |
| Secret scanner hit        | security       | Block, rotate/remove/rebuild             | synthetic detection |
| Critical/high dependency  | security       | Upgrade/mitigate or block; no acceptance | scan/SBOM rerun     |

# Integrated verification

Run complete authorization/URL/session matrix, secret/source/history/artifact/log scans, Electron/Rust/mobile security assertions, parser/file fuzz/limit suites, SAST/dependency/license/lock/SBOM/provenance, `pnpm verify:release`, Rust checks, and independent diff/threat review.

| Gate                  | Command       | Intended signal                                                                 | Evidence                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- |
| Integrated phase gate | `pnpm verify` | exit 0 with non-zero intended tests; external gates remain separately evidenced | `evidence/P21/EVIDENCE.md` |

# Acceptance gate

- [ ] P21-A01 - Updated threat model covers every current entry point/data flow/control/test/owner.
- [ ] P21-A02 - Every route/object/job/event/export/provider/IPC operation has passing negative owner/state/replay tests.
- [ ] P21-A03 - Electron/mobile/native/keychain privilege boundaries match accepted architecture and pass compromise tests.
- [ ] P21-A04 - Secrets/content are absent from source/history/config/artifacts/bundles/logs/reports and rotation paths work.
- [ ] P21-A05 - Input/resource/parser/renderer/provider fuzzing is bounded and safe.
- [ ] P21-A06 - Release SBOM/provenance/license/dependency/SAST evidence exists with zero unresolved critical/high finding.

# Migration, rollout, and rollback

Security fixes follow compatibility/migration rules and feature kill switches. Never roll back to a known critical/high vulnerability. Any new route/provider/IPC/file format must reopen relevant inventory/tests.

# Required documentation updates

Security threat model/policy, architecture boundaries, API inventory, operations incident/runbook, dependency policy, Status/Traceability/Progress, and P21 evidence/risk register.

# Conversation boundary

Security remediation only. Do not add features/providers/formats, replace architecture broadly, weaken tests, log content, or accept unresolved critical/high findings. Stop before P22.

# Handoff record

Unblock P22 only.
