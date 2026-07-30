import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { validateRequiredSuiteInventory } from './required-suite-inventory.mjs';

const temporaryDirectories = [];

function createFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), 'kms-suite-inventory-'));
  temporaryDirectories.push(rootDir);

  mkdirSync(join(rootDir, 'packages', 'database', 'test'), { recursive: true });
  writeFileSync(
    join(rootDir, 'packages', 'database', 'package.json'),
    JSON.stringify({ scripts: { 'test:integration': 'vitest run test' } }),
  );
  writeFileSync(
    join(rootDir, 'packages', 'database', 'test', 'database.test.ts'),
    "it('uses postgres', () => {});",
  );

  return rootDir;
}

function validInventory() {
  return {
    rootScripts: {
      'test:integration': 'node scripts/quality/run-required-suite.mjs integration',
    },
    suites: {
      integration: [
        {
          workspace: 'packages/database',
          script: 'test:integration',
          testFiles: ['test/**/*.test.ts'],
        },
      ],
    },
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('validateRequiredSuiteInventory', () => {
  it('rejects a root suite with no registered execution target', () => {
    const rootDir = createFixture();
    const inventory = validInventory();
    inventory.suites.integration = [];

    assert.throws(
      () => validateRequiredSuiteInventory({ rootDir, inventory }),
      /integration must register at least one execution target/,
    );
  });

  it('rejects an execution target whose workspace script is missing', () => {
    const rootDir = createFixture();
    const inventory = validInventory();
    inventory.suites.integration[0].script = 'test:missing';

    assert.throws(
      () => validateRequiredSuiteInventory({ rootDir, inventory }),
      /packages\/database must define "test:missing"/,
    );
  });

  it('rejects an execution target that matches no test files', () => {
    const rootDir = createFixture();
    const inventory = validInventory();
    inventory.suites.integration[0].testFiles = ['test/**/*.contract.ts'];

    assert.throws(
      () => validateRequiredSuiteInventory({ rootDir, inventory }),
      /packages\/database:test:integration matches no test files/,
    );
  });

  it('rejects an execution target whose matching files declare no test cases', () => {
    const rootDir = createFixture();
    writeFileSync(
      join(rootDir, 'packages', 'database', 'test', 'database.test.ts'),
      'export const fixtureOnly = true;\n',
    );

    assert.throws(
      () => validateRequiredSuiteInventory({ rootDir, inventory: validInventory() }),
      /packages\/database:test:integration declares no test cases/,
    );
  });

  it('rejects a test file registered in more than one required suite', () => {
    const rootDir = createFixture();
    const inventory = validInventory();
    inventory.rootScripts['test:unit'] = 'node scripts/quality/run-required-suite.mjs unit';
    inventory.suites.unit = [
      {
        workspace: 'packages/database',
        script: 'test:integration',
        testFiles: ['test/**/*.test.ts'],
      },
    ];

    assert.throws(
      () => validateRequiredSuiteInventory({ rootDir, inventory }),
      /packages\/database:test:integration is registered by both integration and unit/,
    );
  });

  it('accepts a root suite with a real workspace script and test file', () => {
    const rootDir = createFixture();

    assert.doesNotThrow(() =>
      validateRequiredSuiteInventory({ rootDir, inventory: validInventory() }),
    );
  });

  it('accepts a build target that has a real workspace build-check script', () => {
    const rootDir = createFixture();
    const inventory = {
      rootScripts: { build: 'node scripts/quality/run-required-suite.mjs build' },
      suites: {
        build: [{ workspace: 'packages/database', script: 'typecheck' }],
      },
    };
    writeFileSync(
      join(rootDir, 'packages', 'database', 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }),
    );

    assert.doesNotThrow(() => validateRequiredSuiteInventory({ rootDir, inventory }));
  });
});
