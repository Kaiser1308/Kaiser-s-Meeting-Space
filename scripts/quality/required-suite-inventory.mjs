import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function listFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
  });
}

function matchesPattern(relativePath, pattern) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const normalizedPattern = pattern.replaceAll('\\', '/');
  let expression = '^';

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    const nextCharacter = normalizedPattern[index + 1];

    if (character === '*' && nextCharacter === '*') {
      const followedBySlash = normalizedPattern[index + 2] === '/';
      expression += followedBySlash ? '(?:.*/)?' : '.*';
      index += followedBySlash ? 2 : 1;
      continue;
    }

    if (character === '*') {
      expression += '[^/]*';
      continue;
    }

    expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }

  return new RegExp(`${expression}$`).test(normalizedPath);
}

function readPackageScripts(rootDir, workspace) {
  const packageJsonPath = join(rootDir, workspace, 'package.json');
  if (!existsSync(packageJsonPath)) return null;

  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).scripts ?? {};
}

export function validateRequiredSuiteInventory({ rootDir, inventory }) {
  const errors = [];
  const unitIntegrationFiles = new Map();

  for (const [suite, targets] of Object.entries(inventory.suites)) {
    const rootScriptName = suite === 'build' ? 'build' : `test:${suite}`;
    const rootCommand = inventory.rootScripts[rootScriptName];
    const runnerInvocation = `node scripts/quality/run-required-suite.mjs ${suite}`;

    if (!rootCommand?.includes(runnerInvocation)) {
      errors.push(`${rootScriptName} must dispatch through ${runnerInvocation}`);
    }

    if (!Array.isArray(targets) || targets.length === 0) {
      errors.push(`${suite} must register at least one execution target`);
      continue;
    }

    for (const target of targets) {
      const scripts = readPackageScripts(rootDir, target.workspace);
      if (!scripts?.[target.script]) {
        errors.push(`${target.workspace} must define "${target.script}"`);
        continue;
      }

      if (!target.testFiles) continue;

      const workspaceDir = join(rootDir, target.workspace);
      const files = listFiles(workspaceDir).map((file) => relative(workspaceDir, file));
      const matchingFiles = files.filter((file) =>
        target.testFiles?.some((pattern) => matchesPattern(file, pattern)),
      );

      if (matchingFiles.length === 0) {
        errors.push(`${target.workspace}:${target.script} matches no test files`);
        continue;
      }

      if (suite === 'unit' || suite === 'integration') {
        for (const file of matchingFiles) {
          const fileKey = `${target.workspace}/${file}`;
          const priorSuite = unitIntegrationFiles.get(fileKey);
          if (priorSuite && priorSuite !== suite) {
            errors.push(
              `${target.workspace}:${target.script} is registered by both ${priorSuite} and ${suite}`,
            );
          }
          unitIntegrationFiles.set(fileKey, suite);
        }
      }

      const declaresTestCase = matchingFiles.some((file) =>
        /\b(?:it|test)\s*\(/.test(readFileSync(join(workspaceDir, file), 'utf8')),
      );
      if (!declaresTestCase) {
        errors.push(`${target.workspace}:${target.script} declares no test cases`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Required suite inventory invalid:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
}
