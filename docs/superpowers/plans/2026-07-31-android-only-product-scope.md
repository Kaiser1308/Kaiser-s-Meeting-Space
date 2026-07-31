# Android-Only Product Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android the only supported mobile product and release target while preserving existing iOS configuration and implementation as non-gating contingency assets.

**Architecture:** Establish an accepted ADR as the highest-precedence scope decision, reconcile maintained product and architecture documents, then update prospective execution packets and release gates without rewriting historical evidence. Regenerate derived phase prompts from the authoritative packets and verify both Android-only release language and continued presence of the iOS reserve.

**Tech Stack:** Markdown product/architecture/execution documentation, Node.js execution-plan generator and validator, Expo/React Native configuration retained unchanged, GitNexus change-scope verification.

## Global Constraints

- The supported mobile baseline is Android 12+.
- Windows desktop remains a supported product platform.
- iOS is a dormant contingency asset, not a supported, released, or acceptance-gating platform.
- Keep Expo iOS configuration, the `ios` development scripts, Swift native recording code, iOS adapters, and existing compatibility tests.
- Do not require an iOS device, Xcode, Apple signing, App Store Connect, VoiceOver, or iOS qualification for any phase to reach `VERIFIED`.
- Do not rewrite historical evidence or old run records.
- Do not claim any unavailable Android manual or physical-device test passed.
- Preserve every pre-existing dirty or untracked user file.
- Change authoritative phase packets before regenerating `docs/execution/PHASE_PROMPTS.md`.
- Run GitNexus `detect_changes()` before any commit.

---

## File Structure

**Create**

- `docs/decisions/ADR-007-android-only-mobile-product-scope.md` — accepted, highest-precedence platform-scope decision.

**Modify: canonical product and architecture**

- `docs/decisions/README.md` — register ADR-007.
- `docs/product/PRD.md` — release acceptance supports Windows and Android only.
- `docs/PRODUCT_AND_TECHNICAL_PLAN.md` — mobile and packaging commitments become Android-only.
- `docs/architecture/TECH_STACK.md` — Android is the mobile product target; iOS is retained contingency code.
- `docs/ROADMAP.md` — state the supported release platforms and reserve policy explicitly.
- `docs/engineering/TEST_STRATEGY.md` — make the supported mobile E2E target and TalkBack requirement explicit.

**Modify: execution control plane**

- `docs/execution/MASTER_PLAN.md` — change the production target and P09 description.
- `docs/execution/TRACEABILITY.md` — add a prospective scope decision and change RA-1 to Windows/Android.
- `docs/execution/phases/P00-design-closure.md` — add a supersession note without rewriting P00's completed historical baseline.
- `docs/execution/phases/P08-mobile-start-flow.md` — Android-only SDK, device, Maestro, and TalkBack gates.
- `docs/execution/phases/P09-mobile-recording.md` — Android-only release qualification while preserving P09-T03 as completed reserve implementation.
- `docs/execution/phases/P10-mobile-sync-recovery.md` — Android-only physical qualification.
- `docs/execution/phases/P16-transcript-review.md` — remove VoiceOver from the prospective accessibility matrix.
- `docs/execution/phases/P22-privacy-deletion-governance.md` — review product copy on Windows and Android.
- `docs/execution/phases/P24-resilience-performance-a11y.md` — Android-only mobile resilience and TalkBack qualification.
- `docs/execution/phases/P26-packaging-signing-updates.md` — remove Apple release prerequisites and convert P26-T06 from iOS release work to an iOS-reserve non-release preservation check.
- `docs/execution/phases/P27-production-qualification.md` — qualify supported journeys on Windows and Android.
- `docs/execution/PHASE_PROMPTS.md` — regenerate; never hand-edit.

**Modify: current-state summaries**

- `docs/STATUS.md` — distinguish retained iOS implementation history from the current Android qualification target.
- `docs/execution/PROGRESS.md` — append a prospective scope-decision entry and update only current summaries/blocker actions, leaving append-only history intact.

**Must remain unmodified by this migration**

- `apps/mobile/app.json`
- `apps/mobile/package.json`
- root `package.json`
- `apps/mobile/modules/audio-recorder/ios/**`
- `packages/mobile-audio/src/adapters/ios/**`
- historical files under `docs/execution/evidence/**`

---

### Task 1: Establish the Canonical Platform Decision

**Files:**

- Create: `docs/decisions/ADR-007-android-only-mobile-product-scope.md`
- Modify: `docs/decisions/README.md`
- Modify: `docs/product/PRD.md:149`
- Modify: `docs/PRODUCT_AND_TECHNICAL_PLAN.md:25`
- Modify: `docs/PRODUCT_AND_TECHNICAL_PLAN.md:369`
- Modify: `docs/architecture/TECH_STACK.md:13`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/engineering/TEST_STRATEGY.md`

**Interfaces:**

- Consumes: approved design at `docs/superpowers/specs/2026-07-31-android-only-product-scope-design.md`.
- Produces: accepted ADR-007 with the terms `supported Android` and `dormant iOS reserve`; all later tasks use those definitions.

- [ ] **Step 1: Prove the maintained product documents contradict the approved scope**

Run:

```powershell
rg -n -i "Windows.{0,30}Android.{0,30}iOS|iOS.{0,20}Android|Android/iOS|iOS/Android" docs/product/PRD.md docs/PRODUCT_AND_TECHNICAL_PLAN.md docs/architecture/TECH_STACK.md
```

Expected: non-empty output containing the PRD Windows/Android/iOS release criterion, the iOS-and-Android mobile commitment, and the iOS/Android Tech Stack purpose.

- [ ] **Step 2: Create ADR-007 with the exact decision boundary**

Create an accepted ADR using the repository's ADR format and include these normative statements:

```markdown
## Decision

Kaiser's Meeting Space supports Windows desktop and Android 12+.
Android is the sole supported mobile product platform.

Existing iOS configuration, scripts, native code, adapters, and compatibility
tests remain as a dormant reserve. They do not create a release, support,
parity, testing, signing, distribution, or phase-verification commitment.

Reintroducing iOS as a supported platform requires a new accepted decision,
an updated support matrix, current security/privacy review, and complete iOS
qualification.
```

Record consequences explicitly: Android evidence gates releases; missing Apple/Xcode/iOS resources never block `VERIFIED`; historical evidence is not rewritten.

- [ ] **Step 3: Register ADR-007 and reconcile product/architecture language**

Make these exact semantic changes:

```text
PRD release acceptance: supported Windows and Android targets.
Product plan mobile: Android application for in-person microphone capture.
Product plan packaging: Windows and Android.
Tech stack mobile purpose: Android in-person capture and mobile library;
  retained iOS implementation is contingency-only.
Roadmap: add an explicit supported-platform scope statement for Windows 11
  23H2+ x64 and Android 12+, with dormant iOS reserve.
Test Strategy: Maestro release E2E targets supported Android; mobile manual
  screen-reader qualification uses TalkBack.
```

Do not remove general React Native cross-platform terminology when it describes a library capability rather than a product commitment.

- [ ] **Step 4: Verify the canonical documents agree**

Run:

```powershell
rg -n -i "Windows.{0,30}Android.{0,30}iOS|iOS.{0,20}Android|Android/iOS|iOS/Android" docs/product/PRD.md docs/PRODUCT_AND_TECHNICAL_PLAN.md docs/architecture/TECH_STACK.md docs/ROADMAP.md docs/engineering/TEST_STRATEGY.md
```

Expected: no forward-looking supported/release claim for iOS. Any result must say that iOS is dormant, reserve-only, or a framework compatibility capability.

Run:

```powershell
rg -n "Android 12\\+|dormant iOS reserve|sole supported mobile" docs/decisions/ADR-007-android-only-mobile-product-scope.md docs/product/PRD.md docs/ROADMAP.md
```

Expected: Android 12+ and the reserve boundary are present.

- [ ] **Step 5: Commit the canonical decision**

Before committing, run GitNexus:

```text
detect_changes({scope: "compare", base_ref: "main"})
```

Expected: only documentation scope is affected; no execution flow or application symbol changes.

Then run:

```powershell
git add -- docs/decisions/ADR-007-android-only-mobile-product-scope.md docs/decisions/README.md docs/product/PRD.md docs/PRODUCT_AND_TECHNICAL_PLAN.md docs/architecture/TECH_STACK.md docs/ROADMAP.md docs/engineering/TEST_STRATEGY.md
git commit -m "docs: make Android the sole supported mobile platform"
```

---

### Task 2: Reconcile Mobile and Release Phase Packets

**Files:**

- Modify: `docs/execution/MASTER_PLAN.md:4`
- Modify: `docs/execution/MASTER_PLAN.md:72`
- Modify: `docs/execution/phases/P00-design-closure.md:49`
- Modify: `docs/execution/phases/P08-mobile-start-flow.md:22`
- Modify: `docs/execution/phases/P08-mobile-start-flow.md:84`
- Modify: `docs/execution/phases/P08-mobile-start-flow.md:109`
- Modify: `docs/execution/phases/P08-mobile-start-flow.md:120`
- Modify: `docs/execution/phases/P09-mobile-recording.md:14`
- Modify: `docs/execution/phases/P09-mobile-recording.md:22`
- Modify: `docs/execution/phases/P09-mobile-recording.md:32`
- Modify: `docs/execution/phases/P09-mobile-recording.md:66`
- Modify: `docs/execution/phases/P09-mobile-recording.md:84`
- Modify: `docs/execution/phases/P09-mobile-recording.md:118`
- Modify: `docs/execution/phases/P10-mobile-sync-recovery.md:85`
- Modify: `docs/execution/phases/P10-mobile-sync-recovery.md:121`
- Modify: `docs/execution/phases/P16-transcript-review.md:89`
- Modify: `docs/execution/phases/P22-privacy-deletion-governance.md:136`
- Modify: `docs/execution/phases/P24-resilience-performance-a11y.md:14`
- Modify: `docs/execution/phases/P24-resilience-performance-a11y.md:23`
- Modify: `docs/execution/phases/P24-resilience-performance-a11y.md:82`
- Modify: `docs/execution/phases/P24-resilience-performance-a11y.md:98`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:14`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:23`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:37`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:68`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:95`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:105`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:114`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:129`
- Modify: `docs/execution/phases/P26-packaging-signing-updates.md:140`
- Modify: `docs/execution/phases/P27-production-qualification.md:86`

**Interfaces:**

- Consumes: ADR-007 platform definitions from Task 1.
- Produces: unchanged phase IDs/task counts/dependency graph, with Android-only prospective acceptance gates and a non-release P26-T06 iOS reserve check.

- [ ] **Step 1: Capture the failing execution-scope search**

Run:

```powershell
rg -n -i "Android/iOS|Windows/Android/iOS|Android and iOS|Android, and iOS|VoiceOver|Apple Developer|App Store|TestFlight|signed iOS|iOS release" docs/execution/MASTER_PLAN.md docs/execution/phases
```

Expected: results in P00, P08-P10, P16, P22, P24, P26, and P27.

- [ ] **Step 2: Update the master target and preserve P00 history**

Set the master production target to:

```markdown
**Production target:** Personal-use cloud-synced release for Windows and Android
```

Change the P09 summary to `Android local-first microphone recording lifecycle`.

In P00, retain its original baseline text but add a labeled note near the outcome:

```markdown
> **Current platform-scope supersession (2026-07-31):** ADR-007 makes Android
> the sole supported mobile product platform. The Windows/Android/iOS wording
> below records P00's accepted 2026-07-21 baseline and is not a current iOS
> release commitment.
```

Do not edit `docs/execution/evidence/P00/**`.

- [ ] **Step 3: Convert P08-P10 gates to Android**

Apply these rules:

```text
P08: Android SDK/device/Maestro only; TalkBack only; P08-A04 names TalkBack.
P09: outcome, preconditions, physical tests, and P09-A04 require Android only.
P09-T03: keep the task and iOS file-ownership row as completed reserve history;
  label both non-gating and do not request new iOS work or qualification.
P10: physical sync/recovery campaign and P10-A06 require Android only.
```

Do not change task IDs, acceptance IDs, dependency rows, or historical evidence links.

- [ ] **Step 4: Convert future privacy, resilience, accessibility, packaging, and production gates**

Apply these exact scope outcomes:

```text
P16: keyboard/TalkBack/Windows screen reader; no VoiceOver requirement.
P22: consent/disclosure/delete copy reviewed on Windows and Android.
P24: supported matrix is Windows/Android; representative physical Android
  device only; mobile campaign is Android; accessibility uses TalkBack and a
  Windows screen reader.
P26: Windows and Android release artifacts only; remove Apple Developer,
  App Store Connect, TestFlight, iOS signing, and signed-iOS acceptance.
P26-T06: rename to "Retained iOS reserve boundary check"; verify the retained
  config/scripts/native sources still exist, remain non-release, and do not
  enter release manifests or block P26. Keep task ID P26-T06 so task totals
  and the progress ledger remain stable.
P26-A04: signed Android internal build passes clean-install and upgrade matrix.
P27: full supported journey/fault matrix runs on Windows and Android.
```

P26-T06 must not build, sign, distribute, or claim qualification of iOS.

- [ ] **Step 5: Run packet-structure validation before regeneration**

Run:

```powershell
pnpm execution:check
```

Expected at this intermediate point: either PASS, or only `PROMPT_STALE` because packet metadata changed. Any task-count, dependency, missing-section, broken-link, or ambiguous-marker error must be fixed before continuing.

- [ ] **Step 6: Commit the phase-packet reconciliation**

Before committing, run:

```text
detect_changes({scope: "compare", base_ref: "main"})
```

Expected: documentation-only changes limited to the master plan and named phase packets; no application execution flow changes.

Then run:

```powershell
git add -- docs/execution/MASTER_PLAN.md docs/execution/phases/P00-design-closure.md docs/execution/phases/P08-mobile-start-flow.md docs/execution/phases/P09-mobile-recording.md docs/execution/phases/P10-mobile-sync-recovery.md docs/execution/phases/P16-transcript-review.md docs/execution/phases/P22-privacy-deletion-governance.md docs/execution/phases/P24-resilience-performance-a11y.md docs/execution/phases/P26-packaging-signing-updates.md docs/execution/phases/P27-production-qualification.md
git commit -m "docs: align release gates with Android-only scope"
```

---

### Task 3: Reconcile Current State and Regenerate Derived Prompts

**Files:**

- Modify: `docs/execution/TRACEABILITY.md:16`
- Modify: `docs/execution/TRACEABILITY.md:45`
- Modify: `docs/STATUS.md:26`
- Modify: `docs/STATUS.md:29`
- Modify: `docs/execution/PROGRESS.md:9`
- Modify: `docs/execution/PROGRESS.md:64`
- Modify: `docs/execution/PHASE_PROMPTS.md` (generated)

**Interfaces:**

- Consumes: ADR-007 and the updated authoritative phase packets.
- Produces: current summaries that distinguish old Android/iOS implementation facts from Android-only remaining gates; generated prompts exactly matching packet metadata.

- [ ] **Step 1: Add a prospective traceability decision without rewriting history**

Near the top of `TRACEABILITY.md`, add:

```markdown
Platform-scope decision (2026-07-31): ADR-007 makes Android the sole supported
mobile product platform. Existing iOS implementation is retained as a dormant,
non-gating reserve. Earlier Android/iOS entries below remain historical facts;
all prospective release evidence and RA-1 qualification target Windows and
Android.
```

Change RA-1 to:

```text
RA-1 supported Windows/Android critical E2E
```

Leave dated P10/P13 verification-attempt prose intact.

- [ ] **Step 2: Update status summaries without erasing retained iOS facts**

In `STATUS.md`:

```text
Audio capture/chunking: retain the factual Android and iOS implementation
description, then state that only Android physical qualification gates product
verification under ADR-007.

Mobile sync & recovery: replace the current Android/iOS qualification blocker
with the Android physical qualification blocker; add that iOS remains
non-gating reserve code.
```

Do not promote any capability state.

- [ ] **Step 3: Update only the current PROGRESS summary and append a decision entry**

Change the top, current-state summary so P10 lacks the Android T07 matrix, not an Android/iOS matrix. Update the current P09 owner action so authorization and completion of the Android matrix is sufficient; remove iOS as a current blocker.

Append this new entry at the start of the append-only history section, above older runs:

```markdown
### Product scope decision 2026-07-31 - Android-only mobile release

- ADR-007 makes Android 12+ the sole supported mobile product platform; Windows
  support is unchanged.
- Existing iOS configuration and implementation remain as dormant,
  non-gating reserve assets.
- Historical Android/iOS run entries and evidence remain unchanged.
- P08-P10 verification still requires direct Android physical-device evidence;
  no unavailable test is claimed as passed.
```

Do not edit the body of older dated run records, including their prior iOS blockers.

- [ ] **Step 4: Regenerate phase prompts from authoritative packets**

Run:

```powershell
pnpm execution:generate
```

Expected: exit 0 and only `docs/execution/PHASE_PROMPTS.md` changes as a generated artifact.

- [ ] **Step 5: Verify generated consistency and current summaries**

Run:

```powershell
pnpm execution:generate:check
pnpm execution:check
```

Expected:

```text
execution:generate:check exits 0
execution plan valid: 29 packets, ... 29 prompts, 0 broken links
```

Run:

```powershell
rg -n "Android/iOS T07 matrix|provide iOS physical evidence for full P09 verification" docs/execution/PROGRESS.md docs/STATUS.md
```

Expected: any match occurs only inside an unchanged historical run entry, not in the current summary or current owner action.

- [ ] **Step 6: Commit ledgers and generated prompts**

Before committing, run:

```text
detect_changes({scope: "compare", base_ref: "main"})
```

Expected: only traceability/status/progress documentation and the derived prompt file change.

Then run:

```powershell
git add -- docs/execution/TRACEABILITY.md docs/STATUS.md docs/execution/PROGRESS.md docs/execution/PHASE_PROMPTS.md
git commit -m "docs: record Android-only release scope"
```

---

### Task 4: Verify Android-Only Scope and iOS Reserve Preservation

**Files:**

- Verify only: `apps/mobile/app.json`
- Verify only: `apps/mobile/package.json`
- Verify only: `package.json`
- Verify only: `apps/mobile/modules/audio-recorder/ios/**`
- Verify only: `packages/mobile-audio/src/adapters/ios/**`
- Verify only: `docs/execution/evidence/**`
- Verify all modified documentation from Tasks 1-3.

**Interfaces:**

- Consumes: all documentation changes and regenerated prompts.
- Produces: evidence that release scope is Android-only, iOS assets remain present, historical evidence was not edited by this migration, and the execution plan is valid.

- [ ] **Step 1: Verify retained iOS configuration and implementation**

Run:

```powershell
@'
const fs = require('node:fs');
const app = JSON.parse(fs.readFileSync('apps/mobile/app.json', 'utf8'));
const mobile = JSON.parse(fs.readFileSync('apps/mobile/package.json', 'utf8'));
const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!app.expo?.ios) throw new Error('missing Expo iOS reserve config');
if (!mobile.scripts?.ios) throw new Error('missing mobile ios script');
if (!root.scripts?.ios) throw new Error('missing root ios script');
console.log('iOS reserve config present');
'@ | node
```

Expected: `iOS reserve config present`.

Run:

```powershell
$swift = @(rg --files apps/mobile/modules/audio-recorder/ios)
$adapters = @(rg --files packages/mobile-audio/src/adapters/ios)
if ($swift.Count -eq 0) { throw 'missing Swift reserve sources' }
if ($adapters.Count -eq 0) { throw 'missing iOS reserve adapters' }
"Swift reserve files: $($swift.Count); iOS adapter files: $($adapters.Count)"
```

Expected: both counts are greater than zero.

- [ ] **Step 2: Verify no release gate still requires iOS**

Run:

```powershell
rg -n -i "supported (physical )?iOS|Windows/Android/iOS|Android/iOS (physical|signed|release|build)|Apple Developer|App Store Connect|TestFlight|VoiceOver|signed iOS|iOS release build" docs --glob '!execution/evidence/**' --glob '!execution/PROGRESS.md' --glob '!STATUS.md' --glob '!superpowers/**'
```

Expected: no forward-looking release requirement. Allowed matches are limited to:

```text
ADR-007 or P00 supersession text describing dormant/historical iOS;
P09-T03 retained reserve implementation;
P26-T06 retained reserve boundary check;
framework compatibility context that explicitly disclaims product support.
```

Every other match must be corrected at its authoritative source and prompts regenerated.

- [ ] **Step 3: Verify historical evidence was not changed by this migration**

Run:

```powershell
git diff --name-only -- docs/execution/evidence
```

Expected: no path introduced by this migration. If pre-existing user changes are listed, compare against the initial dirty-file inventory and leave them untouched.

- [ ] **Step 4: Run the full documentation gate**

Run:

```powershell
pnpm execution:generate:check
pnpm execution:check
git diff --check
```

Expected: all commands exit 0. If repository-wide `git diff --check` reports a pre-existing unrelated file, rerun it against only files modified by this plan and record the pre-existing failure separately.

- [ ] **Step 5: Run final GitNexus change-scope verification**

Run:

```text
detect_changes({scope: "compare", base_ref: "main"})
```

Expected: no application symbols or execution flows changed; documentation scope matches ADR/product/architecture/execution/status files only.

- [ ] **Step 6: Review staged scope and create the final verification commit if needed**

Run:

```powershell
git status --short
git diff --stat
git diff --cached --stat
```

Confirm that no pre-existing user change or iOS reserve implementation file was accidentally staged.

If Task 4 required documentation corrections, stage only those exact files and run:

```powershell
git commit -m "docs: verify Android-only product scope"
```

If Task 4 required no correction, do not create an empty commit.

---

## Final Acceptance Checklist

- [ ] ADR-007 is accepted and registered.
- [ ] PRD, product plan, tech stack, roadmap, and test strategy agree on Windows + Android support.
- [ ] Android 12+ is the sole supported mobile baseline.
- [ ] P08-P10, P16, P22, P24, P26, and P27 contain no mandatory iOS gate.
- [ ] P26 does not require Apple credentials, App Store Connect, TestFlight, or signed iOS artifacts.
- [ ] Current STATUS/PROGRESS summaries no longer list iOS as a blocker.
- [ ] Older evidence and dated run history remain factual and unchanged.
- [ ] Expo iOS config, `ios` scripts, Swift code, and iOS adapters remain present.
- [ ] Generated phase prompts are current.
- [ ] `pnpm execution:check` passes.
- [ ] GitNexus reports documentation-only impact.
- [ ] No unrelated dirty file was staged, reset, discarded, or overwritten.
