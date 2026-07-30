import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface PackageJson {
  name: string;
  scripts?: Record<string, string>;
}

function readPackageJson(pkgPath: string): PackageJson {
  const raw = readFileSync(resolve(rootDir, pkgPath, 'package.json'), 'utf-8');
  return JSON.parse(raw) as PackageJson;
}

// Required root scripts per P01 contract (without --if-present)
const REQUIRED_ROOT_SCRIPTS = [
  'format:check',
  'lint',
  'typecheck',
  'test:unit',
  'test:integration',
  'test:contract',
  'test:e2e:desktop',
  'test:e2e:mobile',
  'test:security',
  'test:resilience',
  'test:performance',
  'build',
  'verify',
  'verify:release',
];

// Required scripts that every workspace package must have
const REQUIRED_PACKAGE_SCRIPTS = ['typecheck', 'test:unit'];

// Workspace packages (excluding prototypes that may not yet have all scripts)
const WORKSPACE_PACKAGES = [
  'packages/domain',
  'packages/ai',
  'apps/api',
  'apps/desktop',
  'apps/mobile',
];

describe('Script inventory', () => {
  describe('Root package.json', () => {
    const rootPkg = readPackageJson('.');
    const rootScripts = rootPkg.scripts ?? {};

    for (const script of REQUIRED_ROOT_SCRIPTS) {
      it(`has "${script}" script`, () => {
        expect(rootScripts).toHaveProperty(script);
      });
    }

    it('has no root scripts using --if-present', () => {
      for (const [name, command] of Object.entries(rootScripts)) {
        if (REQUIRED_ROOT_SCRIPTS.includes(name)) {
          expect(command, `"${name}" must not use --if-present`).not.toContain('--if-present');
        }
      }
    });

    it('verify:release depends on verify', () => {
      const releaseCmd = rootScripts['verify:release'];
      expect(releaseCmd, 'verify:release must reference verify').toContain('verify');
    });

    it('verify runs format:check, lint, typecheck, and tests', () => {
      const verifyCmd = rootScripts['verify'];
      expect(verifyCmd).toContain('format:check');
      expect(verifyCmd).toContain('lint');
      expect(verifyCmd).toContain('typecheck');
      expect(verifyCmd).toContain('test:unit');
    });

    it('package.json has packageManager field pinned', () => {
      expect(rootPkg).toHaveProperty('packageManager');
      expect((rootPkg as Record<string, unknown>).packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    });
  });

  describe('Workspace packages', () => {
    for (const pkgPath of WORKSPACE_PACKAGES) {
      const pkg = readPackageJson(pkgPath);
      const pkgScripts = pkg.scripts ?? {};

      describe(pkg.name, () => {
        for (const script of REQUIRED_PACKAGE_SCRIPTS) {
          it(`has "${script}" script`, () => {
            expect(pkgScripts).toHaveProperty(script);
          });
        }

        it('does not use --if-present for required scripts', () => {
          for (const [name, command] of Object.entries(pkgScripts)) {
            if (REQUIRED_PACKAGE_SCRIPTS.includes(name)) {
              expect(command, `"${name}" must not use --if-present`).not.toContain('--if-present');
            }
          }
        });
      });
    }
  });
});
