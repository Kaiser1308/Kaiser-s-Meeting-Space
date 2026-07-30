# Security and Privacy

**Status:** Draft security baseline  
**Owner:** Security / Engineering  
**Last reviewed:** 2026-07-21

This document is an engineering baseline, not legal advice. Recording consent, privacy notices and provider agreements require review for each operating jurisdiction.

## Assets and trust boundaries

Protected assets: account identity, audio, transcript, translation, minutes, exports, provider credentials, encryption/signing keys and deletion records.

Trust boundaries exist between client/API, API/object storage, workers/providers, local files/other desktop processes and operational staff/production systems.

## Threat model

| Threat                                | Primary controls                                              |
| ------------------------------------- | ------------------------------------------------------------- |
| Unauthorized meeting access           | Owner-scoped authorization, opaque IDs, access tests          |
| Leaked object URL                     | Short expiry, narrow method/object scope, revocation strategy |
| Provider credential exposure          | Server secret manager, redaction, client bundle scans         |
| Malicious/compromised provider output | Runtime schemas, evidence validation, escaped rendering       |
| Audio/transcript tampering            | Checksums, immutable records, revision history                |
| Replay/duplicate requests             | Idempotency keys, event deduplication, nonce/session expiry   |
| Local device compromise               | OS secure storage, least-privilege files, optional app lock   |
| Destructive user error                | Soft deletion, clear confirmation, recovery window            |
| Sensitive logging/telemetry           | Content exclusion, structured allowlist logging               |
| Dependency compromise                 | Lockfile, scanning, reviewed updates and minimal native code  |

## Identity and authorization

- Short-lived access tokens with refresh rotation and secure OS storage.
- Every resource access is authorized against owner ID at the data layer.
- Reauthentication is required for account deletion, key/provider changes and sensitive exports when risk warrants.
- Future workspace roles must be deny-by-default and designed in a separate ADR.

## Data protection

- TLS for all external/internal network paths.
- Managed encryption at rest plus application-level encryption for selected high-risk fields if required.
- Provider keys in a secret manager, never database plaintext or client config.
- Signed URLs with minimum scope and lifetime.
- Audio local cache uses private app storage and is removed only after verified upload/user policy.
- Checksums provide integrity, not authenticity; server manifests and access controls protect association.

## Privacy lifecycle

- Collect only data required for meeting functionality.
- Show consent reminder before recording; never auto-start recording.
- Display which external provider will receive content.
- Keep source and derived artifacts separately identifiable.
- Default personal retention is indefinite until product/legal policy is approved; UI must disclose this and support deletion.
- Soft deletion recovery duration and backup expiry must be published before beta.
- Telemetry excludes content and uses pseudonymous operational IDs.

## Secure AI handling

- Treat transcript/provider output as untrusted input.
- Prompts do not grant provider output permission to call tools or change records.
- Structured output is validated and rendered safely.
- Cross-provider fallback is opt-in.
- Review provider data retention, training use, region and subprocessors before enablement.

## Incident response

1. Contain access and rotate affected credentials.
2. Preserve safe audit/operational evidence without copying meeting content unnecessarily.
3. Determine affected users, artifacts, providers and time range.
4. Restore service through tested rollback/recovery.
5. Notify according to contractual/legal requirements.
6. Complete blameless review with tracked corrective actions.

Security contact and response expectations are in the repository [Security Policy](../../SECURITY.md).

## Transcription locality and model controls

- Cloud live, cloud final and cloud check each require a versioned meeting policy, named-provider disclosure, exact approved audio scope and explicit consent.
- Cloud speech consent never authorizes cloud minutes AI, and generative-AI consent never authorizes cloud speech.
- Local-to-cloud speech fallback is never automatic. A new cloud run requires explicit user action even after local failure.
- Cloud check sends only approved uncertain ranges or the explicitly approved full meeting and cannot mutate the current projection without a versioned review decision.
- Local STT does not itself disable encrypted account synchronization; local-only storage is a separate policy.
- Local model files are data-only, app-private, non-executable, allowlisted and checked for license/provenance, size, SHA-256, language and runtime compatibility before activation.
- Capture has resource priority over local transcription. Cancellation is bounded and committed run parts remain recoverable.
- Logs and telemetry may contain run/part IDs, ranges, durations and safe status but never audio, transcript text, provider payloads, credentials or model file contents.
