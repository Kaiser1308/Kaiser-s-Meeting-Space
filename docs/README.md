# Documentation Hub

| Metadata | Value |
|---|---|
| Product | Kaiser’s Meeting Space |
| Lifecycle | Pre-alpha |
| Documentation owner | Repository owner |
| Last review | 2026-07-21 |
| Review cadence | At every milestone or material architecture change |

This directory is the source of truth for product and engineering decisions. Documents describe either **Current**, **Target**, or **Decision** state. Target behavior is not assumed to exist until it appears in [STATUS.md](STATUS.md) as implemented and verified.

## Reading paths

### Phase execution

- [Execution Plan Hub](execution/README.md): one-conversation-per-phase implementation packets, protocol, progress, traceability and evidence rules.

### Product and design

- [Product Requirements](product/PRD.md): goals, users, scope, requirements and acceptance criteria.
- [User Flows](product/USER_FLOWS.md): pre-meeting, live meeting, completion, minutes and recovery flows.
- [Delivery Roadmap](ROADMAP.md): phased delivery gates and release criteria.
- [Glossary](GLOSSARY.md): canonical domain terminology.

### Architecture and interfaces

- [System Architecture](architecture/SYSTEM_ARCHITECTURE.md): components, boundaries, runtime flows and resilience.
- [Technology Stack](architecture/TECH_STACK.md): selected technologies, guardrails and replacement triggers.
- [Data Model](architecture/DATA_MODEL.md): entities, immutability and retention semantics.
- [API Contracts](architecture/API_CONTRACTS.md): public backend endpoints, errors and idempotency.
- [AI and Speech Providers](architecture/AI_AND_SPEECH_PROVIDERS.md): provider capabilities, routing and validation.
- [Architecture Decisions](decisions/README.md): accepted technical decisions and their consequences.
- [Meetily Reference Review](research/MEETILY_REFERENCE_REVIEW.md): clean-room lessons adopted/rejected from the local reference repository.

### Engineering and quality

- [Development Guide](engineering/DEVELOPMENT.md): setup, repository conventions and delivery workflow.
- [Test Strategy](engineering/TEST_STRATEGY.md): test pyramid, critical scenarios and release gates.
- [Implementation Status](STATUS.md): current repository truth and planned modules.

### Security and operations

- [Security and Privacy](security/SECURITY_AND_PRIVACY.md): threat model, controls and privacy lifecycle.
- [Deployment and Operations](operations/DEPLOYMENT_AND_RUNBOOK.md): environments, deployment, SLOs and incidents.
- [Security Policy](../SECURITY.md): private vulnerability reporting policy.

## Documentation standard

Every material document must include:

- Status: Draft, Accepted, Superseded or Deprecated.
- Owner and last-reviewed date.
- Clear distinction between implemented and target behavior.
- Links to related decisions and acceptance criteria.
- No secrets, real customer data or provider credentials.

Architecture changes require an ADR. Public API or data lifecycle changes require updates to the PRD, architecture, test strategy and implementation status in the same pull request.
