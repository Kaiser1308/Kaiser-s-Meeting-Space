import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateExecutionPlan } from './validate-execution-plan.mjs';

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kms-execution-plan-'));
  try {
    await createFixture(root);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createFixture(root) {
  const phaseDir = path.join(root, 'docs', 'execution', 'phases');
  await mkdir(phaseDir, { recursive: true });
  const progressRows = [];
  const masterRows = [];

  for (let index = 0; index <= 28; index += 1) {
    const id = `P${String(index).padStart(2, '0')}`;
    const dependency = index === 0 ? '' : `P${String(index - 1).padStart(2, '0')}`;
    const slug = `phase-${String(index).padStart(2, '0')}`;
    const dependencyRow = dependency
      ? `| ${dependency} | ${dependency} output | ../evidence/${dependency}/EVIDENCE.md | VERIFIED |`
      : '| None | Root phase | Not applicable | VERIFIED |';
    const packet = `---
phase: ${id}
title: Phase ${index}
packet_status: ACCEPTED
depends_on: [${dependency}]
requirements: []
risk: medium
---

# Outcome

Deliver phase ${id}.

# Authoritative context

Read \`docs/execution/EXECUTION_PROTOCOL.md\`.

# Preconditions and external prerequisites

Use synthetic fixtures.

# Dependency gate

| Dependency | Required capability | Required evidence | Minimum lifecycle |
| --- | --- | --- | --- |
${dependencyRow}

# Scope firewall

Only ${id}.

# Contracts and invariants

Preserve evidence.

# File and ownership map

| Path | Responsibility | Owner |
| --- | --- | --- |
| \`docs/\` | Documentation | Main |

# Ordered task packets

## ${id}-T01 - Execute phase

Produce the outcome.

# Subagent work packages

| Package | Tasks | Exclusive paths | Depends on | Review gate |
| --- | --- | --- | --- | --- |
| Main | T01 | docs | ${dependency || 'None'} | Review |

# Failure and debugging matrix

| Failure | Classification | Expected behavior | Recovery |
| --- | --- | --- | --- |
| Invalid input | contract | Fail closed | Test |

# Integrated verification

| Gate | Command | Intended signal | Evidence |
| --- | --- | --- | --- |
| Plan | \`node --test scripts/execution/*.test.mjs\` | exit 0, non-zero tests | EVIDENCE.md |

# Acceptance gate

- [ ] ${id}-A01 - Outcome has evidence.

# Migration, rollout, and rollback

No migration.

# Required documentation updates

Update the ledger.

# Conversation boundary

Do not execute another phase.

# Handoff record

Stop after ${id}.
`;
    await writeFile(path.join(phaseDir, `${id}-${slug}.md`), packet);
    progressRows.push(
      `| ${id} | ${index < 4 ? 'VERIFIED' : 'NOT_STARTED'} | ${dependency || '-'} | ${index < 4 ? '1/1' : '0/1'} |`,
    );
    masterRows.push(`| [${id}](phases/${id}-${slug}.md) | Phase ${index} | ${dependency || '-'} |`);
  }

  await writeFile(
    path.join(root, 'docs', 'execution', 'PROGRESS.md'),
    `# Progress

| Phase | State | Direct dependencies | Tasks |
| --- | --- | --- | --- |
${progressRows.join('\n')}
`,
  );
  await writeFile(
    path.join(root, 'docs', 'execution', 'MASTER_PLAN.md'),
    `# Master Plan

| Phase | Outcome | Direct dependencies |
| --- | --- | --- |
${masterRows.join('\n')}
`,
  );
  await writeFile(path.join(root, 'docs', 'execution', 'EXECUTION_PROTOCOL.md'), '# Protocol\n');
}

function codes(result) {
  return result.errors.map(({ code }) => code);
}

test('valid execution fixture passes', async () => {
  await withFixture(async (root) => {
    const result = await validateExecutionPlan(root);

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.counts, {
      packets: 29,
      tasks: 29,
      acceptance: 29,
      prompts: 0,
      brokenLinks: 0,
    });
  });
});

test('missing P28 reports PACKET_COUNT', async () => {
  await withFixture(async (root) => {
    await rm(path.join(root, 'docs', 'execution', 'phases', 'P28-phase-28.md'));

    assert.ok(codes(await validateExecutionPlan(root)).includes('PACKET_COUNT'));
  });
});

test('missing dependency row reports DEPENDENCY_GATE_MISSING', async () => {
  await withFixture(async (root) => {
    const packetPath = path.join(root, 'docs', 'execution', 'phases', 'P05-phase-05.md');
    const packet = await readFile(packetPath, 'utf8');
    await writeFile(
      packetPath,
      packet.replace(
        '| P04 | P04 output | ../evidence/P04/EVIDENCE.md | VERIFIED |',
        '| None | Root phase | Not applicable | VERIFIED |',
      ),
    );

    assert.ok(codes(await validateExecutionPlan(root)).includes('DEPENDENCY_GATE_MISSING'));
  });
});

test('dependency cycle reports DEPENDENCY_CYCLE', async () => {
  await withFixture(async (root) => {
    const packetPath = path.join(root, 'docs', 'execution', 'phases', 'P00-phase-00.md');
    const packet = await readFile(packetPath, 'utf8');
    await writeFile(
      packetPath,
      packet
        .replace('depends_on: []', 'depends_on: [P28]')
        .replace(
          '| None | Root phase | Not applicable | VERIFIED |',
          '| P28 | P28 output | ../evidence/P28/EVIDENCE.md | VERIFIED |',
        ),
    );

    assert.ok(codes(await validateExecutionPlan(root)).includes('DEPENDENCY_CYCLE'));
  });
});

test('duplicate task ID reports TASK_ID_DUPLICATE', async () => {
  await withFixture(async (root) => {
    const packetPath = path.join(root, 'docs', 'execution', 'phases', 'P05-phase-05.md');
    const packet = await readFile(packetPath, 'utf8');
    await writeFile(
      packetPath,
      packet.replace(
        '## P05-T01 - Execute phase',
        '## P05-T01 - Execute phase\n\n## P05-T01 - Duplicate',
      ),
    );

    assert.ok(codes(await validateExecutionPlan(root)).includes('TASK_ID_DUPLICATE'));
  });
});

test('missing command row reports COMMAND_CONTRACT_EMPTY', async () => {
  await withFixture(async (root) => {
    const packetPath = path.join(root, 'docs', 'execution', 'phases', 'P05-phase-05.md');
    const packet = await readFile(packetPath, 'utf8');
    await writeFile(
      packetPath,
      packet.replace(
        '| Plan | `node --test scripts/execution/*.test.mjs` | exit 0, non-zero tests | EVIDENCE.md |',
        '',
      ),
    );

    assert.ok(codes(await validateExecutionPlan(root)).includes('COMMAND_CONTRACT_EMPTY'));
  });
});

test('broken relative link reports LINK_BROKEN', async () => {
  await withFixture(async (root) => {
    const packetPath = path.join(root, 'docs', 'execution', 'phases', 'P05-phase-05.md');
    const packet = await readFile(packetPath, 'utf8');
    await writeFile(
      packetPath,
      packet.replace(
        'Read `docs/execution/EXECUTION_PROTOCOL.md`.',
        'Read [missing](../MISSING.md).',
      ),
    );

    const result = await validateExecutionPlan(root);
    assert.ok(codes(result).includes('LINK_BROKEN'));
    assert.equal(result.counts.brokenLinks, 1);
  });
});

test('runtime status in packet reports LIFECYCLE_DUPLICATED', async () => {
  await withFixture(async (root) => {
    const packetPath = path.join(root, 'docs', 'execution', 'phases', 'P05-phase-05.md');
    const packet = await readFile(packetPath, 'utf8');
    await writeFile(
      packetPath,
      packet.replace('packet_status: ACCEPTED', 'packet_status: ACCEPTED\nstatus: NOT_STARTED'),
    );

    assert.ok(codes(await validateExecutionPlan(root)).includes('LIFECYCLE_DUPLICATED'));
  });
});

test('stale generated prompts report PROMPT_STALE', async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, 'docs', 'execution', 'PHASE_PROMPTS.md'), '## P00 stale\n');

    assert.ok(codes(await validateExecutionPlan(root)).includes('PROMPT_STALE'));
  });
});

test('ambiguous marker in an active planning document reports AMBIGUOUS_MARKER', async () => {
  await withFixture(async (root) => {
    const masterPath = path.join(root, 'docs', 'execution', 'MASTER_PLAN.md');
    const master = await readFile(masterPath, 'utf8');
    await writeFile(masterPath, master.replace('Phase 5', 'TBD'));

    assert.ok(codes(await validateExecutionPlan(root)).includes('AMBIGUOUS_MARKER'));
  });
});

test('wrong relative-link case reports LINK_CASE_MISMATCH', async () => {
  await withFixture(async (root) => {
    const packetPath = path.join(root, 'docs', 'execution', 'phases', 'P05-phase-05.md');
    const packet = await readFile(packetPath, 'utf8');
    await writeFile(
      packetPath,
      packet.replace(
        'Read `docs/execution/EXECUTION_PROTOCOL.md`.',
        'Read [protocol](../execution_protocol.md).',
      ),
    );

    assert.ok(codes(await validateExecutionPlan(root)).includes('LINK_CASE_MISMATCH'));
  });
});
