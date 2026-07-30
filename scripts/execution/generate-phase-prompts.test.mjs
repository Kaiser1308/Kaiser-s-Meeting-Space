import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkPhasePrompts,
  renderPhasePrompts,
  writePhasePrompts,
} from './generate-phase-prompts.mjs';

function fixtureModel() {
  return {
    packets: Array.from({ length: 29 }, (_, index) => {
      const id = `P${String(index).padStart(2, '0')}`;
      const dependency = index === 0 ? [] : [`P${String(index - 1).padStart(2, '0')}`];
      return {
        id,
        title: `phase ${index}`,
        path: `docs/execution/phases/${id}-phase-${index}.md`,
        outcome: `Deliver ${id}.`,
        dependsOn: dependency,
        dependencyGate: dependency.map((value) => ({
          dependency: value,
          requiredCapability: `${value} output`,
          requiredEvidence: `../evidence/${value}/EVIDENCE.md`,
          minimumLifecycle: 'VERIFIED',
        })),
        boundary: `Stop after ${id}.`,
      };
    }),
  };
}

test('renderPhasePrompts emits one compact deterministic block per phase', () => {
  const model = fixtureModel();
  const output = renderPhasePrompts(model);

  assert.equal((output.match(/^## P\d{2} /gm) ?? []).length, 29);
  assert.equal((output.match(/Mandatory workflow:/g) ?? []).length, 0);
  assert.equal((output.match(/AGENT_PROMPT\.md/g) ?? []).length, 29);
  assert.match(output, /^## P27 /m);
  assert.match(output, /^## P28 /m);
  assert.equal(renderPhasePrompts(model), output);
});

test('write and check use byte-stable generated output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kms-phase-prompts-'));
  try {
    await mkdir(path.join(root, 'docs', 'execution'), { recursive: true });
    const model = fixtureModel();
    await writePhasePrompts(root, model);

    assert.equal(await checkPhasePrompts(root, model), true);
    const promptPath = path.join(root, 'docs', 'execution', 'PHASE_PROMPTS.md');
    await writeFile(promptPath, `${await readFile(promptPath, 'utf8')}stale\n`);
    assert.equal(await checkPhasePrompts(root, model), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
