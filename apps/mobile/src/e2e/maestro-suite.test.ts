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
const workspaceAndroidManifest = readFileSync(
  resolve(mobileDir, '../../android/app/src/main/AndroidManifest.xml'),
  'utf8',
);

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
  {
    file: 'microphone-permission-prompt.yaml',
    selectors: [
      'setup-meeting-button',
      'meeting-title-input',
      'meeting-language-vi',
      'meeting-continue-button',
      'permission-screen',
      'permission-continue-button',
    ],
  },
] as const;

describe('Android Maestro suite contract', () => {
  it('declares microphone permission in the workspace Android manifest', () => {
    expect(workspaceAndroidManifest).toContain('android.permission.RECORD_AUDIO');
  });

  it('has a microphone-prompt-only flow that preserves app data and stops before capture', () => {
    const flowPath = resolve(maestroDir, 'flows/microphone-permission-prompt.yaml');
    const flowExists = existsSync(flowPath);
    expect(flowExists).toBe(true);
    if (!flowExists) return;

    const yaml = readFileSync(flowPath, 'utf8');
    expect(yaml).toContain('microphone: unset');
    expect(yaml).not.toContain('clearState: true');

    const requestTap = yaml.indexOf('id: permission-continue-button');
    expect(requestTap).toBeGreaterThanOrEqual(0);
    const afterRequestTap = yaml.slice(yaml.indexOf('\n', requestTap) + 1);
    expect(afterRequestTap).toMatch(/text:\s*["']\(\?i\).*(microphone|audio|ghi âm|âm thanh)/i);
    expect(afterRequestTap).not.toContain('- tapOn:');
    expect(afterRequestTap).not.toContain('start-recording-button');
  });

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
