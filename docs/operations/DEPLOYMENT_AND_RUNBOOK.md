# Deployment and Operations Runbook

**Status:** Draft target operations standard  
**Owner:** Platform Engineering  
**Last reviewed:** 2026-07-21

## Environments

| Environment | Data                                 | Purpose                               | Access                       |
| ----------- | ------------------------------------ | ------------------------------------- | ---------------------------- |
| Local       | Synthetic/consented dev data         | Development and unit/integration work | Developer machine            |
| CI          | Ephemeral synthetic data             | Automated verification                | CI service account           |
| Staging     | Synthetic and approved test accounts | Production-like validation            | Restricted team              |
| Production  | Real user data                       | Released product                      | Least privilege/on-call only |

Never copy production audio/transcripts into local, CI or staging.

## Deployable units

- API service.
- Worker service with queue-specific concurrency.
- PostgreSQL migrations as a controlled release step.
- Desktop signed installer/update channel.
- Mobile builds through store/internal distribution channels.
- Static prompt/schema versions packaged with the worker release.

## CI/CD gates

1. Install from lockfile and verify supply-chain policy.
2. Typecheck, lint, unit, integration and contract tests.
3. Secret/dependency/license scans.
4. Build API/worker/client artifacts with provenance/version.
5. Run migrations and smoke tests in staging.
6. Manual approval for production while pre-beta.
7. Deploy backward-compatible services, then migrations/clients in documented order.
8. Run synthetic meeting smoke test and monitor rollout.

## Configuration and secrets

- Configuration is environment-specific and validated on startup.
- Secrets use a managed secret store with audit/rotation; they are never baked into images/client bundles.
- Provider/model allowlists and cross-provider fallback are explicit feature flags.
- Production configuration changes use reviewed deployment records.

## Service objectives for beta

| Indicator                                                  | Objective            |
| ---------------------------------------------------------- | -------------------- |
| API availability excluding planned maintenance             | 99.9% monthly        |
| Accepted chunk durability                                  | 100%; no silent loss |
| Meeting finalization success                               | ≥ 99.5%              |
| Processing job success after allowed retries               | ≥ 99%                |
| P95 API metadata latency                                   | < 500 ms             |
| P95 realtime transcript latency under supported conditions | < 3 s                |

Objectives are provisional until load/beta measurements establish baselines.

## Monitoring

- API request rate/latency/error by safe code.
- Active recordings and finalize outcomes.
- Chunk registration/upload/checksum conflicts and missing ranges.
- Queue depth, age, attempts and dead-letter counts.
- Provider availability, latency, safe error category and usage units.
- Export success and duration.
- Client crash-free sessions and recovery outcomes.

Logs/metrics never include meeting titles, transcript, translation, minutes, audio URLs or credentials.

## Common incidents

### Speech provider degradation

1. Confirm provider health/error class without viewing user content.
2. Preserve recording; mark transcript delayed.
3. Stop automatic retries if rate limiting amplifies failure.
4. Communicate backfill status.
5. Cross-provider processing requires existing user policy/explicit action.

### Object storage/upload failure

1. Keep local client chunks and prevent premature cache cleanup.
2. Inspect signed URL/permission/region and storage health.
3. Retry idempotently by chunk ID/checksum.
4. Reconcile manifest before declaring finalization complete.

### Queue backlog

1. Identify job type/provider bottleneck.
2. Scale safe worker concurrency within rate/cost limits.
3. Prioritize finalization/backfill over optional minutes/export.
4. Pause optional work if it threatens recording integrity.

### Suspected data exposure

Follow the security incident process: contain, rotate, scope, preserve safe evidence, notify and review. Do not paste content into tickets/chat.

## Backup and recovery

- Automated encrypted PostgreSQL backups with point-in-time recovery.
- Object storage versioning/retention aligned with deletion policy.
- Restore drills at least quarterly before beta and after material storage changes.
- Recovery validates row/object counts, manifests and checksums using synthetic records.
- Document target RPO/RTO after infrastructure selection; initial planning targets are RPO ≤ 15 minutes and RTO ≤ 4 hours for cloud metadata.

## Rollback

- Services support the previous database/client contract during rollout.
- Roll back application versions first when schema remains compatible.
- Never reverse a destructive migration without a tested restore procedure.
- Desktop/mobile releases use staged rollout and kill switches for provider/optional processing features.
