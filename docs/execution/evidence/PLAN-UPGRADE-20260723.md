# Sequential Phase Execution Control-Plane Upgrade Evidence

**Date/timezone:** 2026-07-23 / UTC+7  
**Scope:** `docs/execution/`, execution control scripts, root command wiring, and CI plan validation  
**Starting commit:** `c8c991c` plus preserved P01-P05 working-tree changes  
**Ending tree:** working tree; no product-phase completion claimed

## Outcome

The execution system now supports one conversation per phase with:

- `PROGRESS.md` as the only canonical lifecycle ledger;
- `packet_status: ACCEPTED` in all phase packets;
- explicit capability-scoped dependency gates;
- exact integrated command contracts;
- phase-specific conversation boundaries;
- deterministic generated ready-to-copy prompts;
- an offline validator for graph, IDs, state duplication, links, path case,
  ambiguity markers, commands, and generated prompt drift.

P00-P03 remain `VERIFIED`. P04 remains `IMPLEMENTED`; P04-A04 and P04-A05
remain unsatisfied. P05 is reconciled to `IN_PROGRESS` at 2/7 from the existing
T01 and T02 reports. No product task was implemented by this upgrade.

## Structural counts

| Item                    |                         Result |
| ----------------------- | -----------------------------: |
| Phase packets           |                             29 |
| Task IDs                |                            213 |
| Acceptance IDs          |                            170 |
| Generated prompt blocks |                             29 |
| Broken relative links   |                              0 |
| Control-plane tests     | 18 passed, 0 failed, 0 skipped |

## Dependency reconciliation

P05 and P06 may consume P04 at `IMPLEMENTED` only for:

- JWT verification;
- authenticated owner context;
- owner-isolation policy;
- safe API conventions.

The gate links P04's acceptance ledger. Full-route coverage (P04-A04) and
OS-keychain/device evidence (P04-A05) are orthogonal, remain unsatisfied, and
still prevent P04 from becoming `VERIFIED`.

## Commands

| Command                                                     | Exit | Result                                                                                                             |
| ----------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------ |
| `node --test scripts/execution/*.test.mjs`                  |    0 | 18 passed, 0 failed, 0 skipped                                                                                     |
| `node scripts/execution/generate-phase-prompts.mjs --check` |    0 | Generated prompt bytes match packet metadata                                                                       |
| `node scripts/execution/validate-execution-plan.mjs`        |    0 | 29 packets, 213 tasks, 170 acceptance IDs, 29 prompts, 0 broken links                                              |
| `git diff --check -- <upgrade file set>`                    |    0 | No whitespace error in the upgrade file set                                                                        |
| `pnpm test:unit` through managed pnpm                       |    1 | Tests did not start; pre-existing supply-chain policy rejected two lockfile entries newer than `minimumReleaseAge` |

## Baseline blocker

The managed pnpm bootstrap rejected:

- `@aws-sdk/client-s3@3.1093.0`;
- `@aws-sdk/s3-request-presigner@3.1093.0`.

Both versions were present in the pre-existing lockfile and were younger than
the active minimum-release-age cutoff. This upgrade did not relax the policy,
rebuild the lockfile, change dependency versions, or claim product tests passed.
The dependency-free Node control-plane gate remains directly verified.

## Safety review

- No product code, migration, provider, device behavior, or product acceptance
  criterion changed.
- Historical evidence was preserved. The active P05 run record received only a
  control-plane reconciliation note and status corrections matching its existing
  T01/T02 reports.
- No credential, meeting content, audio, transcript, translation, or minutes
  data was created or logged.
- GitNexus reported no affected execution process for the control-plane design
  change; root package-script blast radius was low with zero callers.
