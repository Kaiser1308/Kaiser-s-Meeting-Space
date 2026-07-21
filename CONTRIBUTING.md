# Contributing

Kaiser’s Meeting Space handles sensitive meeting evidence. Changes must preserve data integrity, privacy and traceability.

## Before coding

- Read the [Documentation Hub](docs/README.md), [PRD](docs/product/PRD.md) and [Implementation Status](docs/STATUS.md).
- Confirm the requested behavior is within the current roadmap phase.
- Create/update an ADR for a material cross-cutting decision.
- Never use real meeting content in issues, fixtures, screenshots or logs.

## Pull requests

Include:

- Problem and intended behavior.
- Requirement/ADR links.
- Risk assessment, especially audio/data/security impact.
- Test evidence and supported platforms exercised.
- Migration/deployment/rollback notes when applicable.
- Documentation and implementation-status changes.

Keep PRs focused. Generated files, provider SDK details and unrelated formatting changes should not obscure functional review.

## Commit quality

- Use imperative, scoped messages such as `feat(recording): persist chunk manifest`.
- Do not commit secrets, `.env` files, recordings, transcripts or exported minutes.
- Preserve user changes and do not rewrite shared history without coordination.

## Review expectations

Changes to recording, integrity, authorization, permanent deletion, provider routing or native bridges require explicit specialist review. A passing test suite does not replace design/security review for these areas.

## Code of conduct

Be respectful, specific and evidence-driven. Protect user privacy in every development and support interaction.
