import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalPhaseIds,
  extractSection,
  parseFrontmatter,
  parsePhasePacket,
  parseProgress,
} from './plan-model.mjs';

test('canonicalPhaseIds returns P00 through P28', () => {
  const ids = canonicalPhaseIds();

  assert.equal(ids.length, 29);
  assert.equal(ids[0], 'P00');
  assert.equal(ids[28], 'P28');
});

test('parseFrontmatter rejects duplicate keys', () => {
  assert.throws(
    () =>
      parseFrontmatter(`---
phase: P05
phase: P06
---`),
    /duplicate frontmatter key: phase/,
  );
});

test('parsePhasePacket normalizes dependency and command contracts', () => {
  const packet = parsePhasePacket(
    'docs/execution/phases/P05-object-storage-chunks.md',
    `---
phase: P05
title: Object storage
packet_status: ACCEPTED
depends_on: [P03, P04]
requirements: [FR-2]
risk: critical
---

# Outcome

Store chunks.

# Dependency gate

| Dependency | Required capability | Required evidence | Minimum lifecycle |
| --- | --- | --- | --- |
| P04 | Owner context | evidence/P04/EVIDENCE.md#acceptance-ledger | IMPLEMENTED |

# Ordered task packets

## P05-T01 - Key policy

# Integrated verification

| Gate | Command | Intended signal | Evidence |
| --- | --- | --- | --- |
| Static | \`pnpm typecheck\` | exit 0 | EVIDENCE.md |

# Acceptance gate

- [ ] P05-A01 - Keys are safe.

# Conversation boundary

Storage only. Stop before capture.

# Handoff record

Stop before P06.`,
  );

  assert.deepEqual(packet.dependsOn, ['P03', 'P04']);
  assert.deepEqual(packet.taskIds, ['P05-T01']);
  assert.deepEqual(packet.acceptanceIds, ['P05-A01']);
  assert.equal(packet.dependencyGate[0].minimumLifecycle, 'IMPLEMENTED');
  assert.equal(packet.commandRows[0].command, 'pnpm typecheck');
  assert.equal(packet.boundary, 'Storage only. Stop before capture.');
});

test('parseProgress reads canonical lifecycle rows', () => {
  const phases = parseProgress(
    `| Phase | State | Direct dependencies | Tasks |
| --- | --- | --- | --- |
| P04 | IMPLEMENTED | P03 | 7/7 |
| P05 | IN_PROGRESS | P03,P04 | 2/7 |`,
  );

  assert.equal(phases.get('P04').state, 'IMPLEMENTED');
  assert.deepEqual(phases.get('P05').tasks, { complete: 2, total: 7 });
});

test('extractSection stops at the next same-level heading', () => {
  assert.equal(extractSection('# Outcome\nFirst\n# Scope firewall\nSecond', 'Outcome'), 'First');
});
