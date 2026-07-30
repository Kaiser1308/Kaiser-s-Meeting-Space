import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateRequiredSuiteInventory } from './required-suite-inventory.mjs';
import { REQUIRED_SUITES } from './required-suites.mjs';
import { countExecutedTests } from './suite-result.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '../..');
const suite = process.argv[2];
const checkOnly = process.argv[3] === '--check';

if (!suite || !Object.hasOwn(REQUIRED_SUITES, suite)) {
  throw new Error(
    `Usage: node scripts/quality/run-required-suite.mjs <${Object.keys(REQUIRED_SUITES).join('|')}> [--check]`,
  );
}

const rootPackageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
validateRequiredSuiteInventory({
  rootDir,
  inventory: {
    rootScripts: rootPackageJson.scripts ?? {},
    suites: { [suite]: REQUIRED_SUITES[suite] },
  },
});

if (checkOnly) {
  console.log(`required ${suite} suite inventory is valid`);
  process.exit(0);
}

for (const target of REQUIRED_SUITES[suite]) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const reportDir = target.testFiles ? mkdtempSync(resolve(tmpdir(), 'kms-vitest-report-')) : null;
  const reportPath = reportDir ? resolve(reportDir, 'result.json') : null;
  const workspacePath = resolve(rootDir, target.workspace);
  const args = [
    '--dir',
    process.platform === 'win32' ? `"${workspacePath}"` : workspacePath,
    'run',
    target.script,
  ];
  if (reportPath) {
    const quotedReportPath = process.platform === 'win32' ? `"${reportPath}"` : reportPath;
    args.push('--reporter=json', '--outputFile', quotedReportPath);
  }

  const result = spawnSync(pnpm, args, { cwd: rootDir, stdio: 'inherit', shell: true });

  try {
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
    if (reportPath) countExecutedTests(JSON.parse(readFileSync(reportPath, 'utf8')));
  } finally {
    if (reportDir) rmSync(reportDir, { recursive: true, force: true });
  }
}
