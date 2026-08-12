import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const maestroDir = resolve(mobileDir, 'maestro');
const developmentGuide = readFileSync(
  resolve(mobileDir, '../../docs/engineering/DEVELOPMENT.md'),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(resolve(mobileDir, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};
const appJson = JSON.parse(readFileSync(resolve(mobileDir, 'app.json'), 'utf8')) as {
  expo?: { android?: { package?: string } };
};

const requiredFlows = [
  {
    file: 'pre-meeting-record.yaml',
    selectors: [
      'setup-meeting-button',
      'meeting-title-input',
      'meeting-language-vi',
      'meeting-continue-button',
      'permission-continue-button',
      'readiness-screen',
      'start-recording-button',
    ],
  },
  {
    file: 'pre-meeting-translate.yaml',
    selectors: [
      'translate-mode',
      'meeting-title-input',
      'meeting-language-en',
      'meeting-continue-button',
      'permission-continue-button',
      'cloud-processing-toggle',
      'cloud-consent-checkbox',
    ],
  },
  {
    file: 'permission-denied.yaml',
    selectors: [
      'setup-meeting-button',
      'meeting-title-input',
      'meeting-continue-button',
      'permission-continue-button',
      'permission-denied-error',
    ],
  },
] as const;

describe('Android Maestro suite contract', () => {
  it('registers the real mobile E2E command and all required flows', () => {
    expect(packageJson.scripts?.['test:e2e']).toBe(
      'vitest run src/e2e/maestro-suite.test.ts && maestro test maestro',
    );
    expect(appJson.expo?.android?.package).toBe('com.anonymous.kaisermeetingspace');
    expect(readFileSync(resolve(maestroDir, 'config.yaml'), 'utf8')).toContain('flows:');

    for (const flow of requiredFlows) {
      expect(existsSync(resolve(maestroDir, 'flows', flow.file))).toBe(true);
      const yaml = readFileSync(resolve(maestroDir, 'flows', flow.file), 'utf8');
      expect(yaml).toContain('appId: com.anonymous.kaisermeetingspace');
      for (const selector of flow.selectors) expect(yaml).toContain(`id: ${selector}`);
    }
  });

  it('documents the real Android prerequisites and unavailable result policy', () => {
    expect(developmentGuide).toContain('Maestro CLI');
    expect(developmentGuide).toContain('pnpm test:e2e:mobile');
    expect(developmentGuide).toContain('authenticated');
    expect(developmentGuide).toContain('Android 12+');
    expect(developmentGuide).toContain('synthetic');
    expect(developmentGuide).toContain('three independently');
    expect(developmentGuide).toContain('runnable flows');
  });
});
