import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BuilderConfig {
  appId?: string;
  productName?: string;
  directories?: {
    output?: string;
  };
  extraResources?: Array<{
    from: string;
    to: string;
    filter?: string[];
  }>;
}

function parseBuilderYaml(content: string): BuilderConfig {
  const config: BuilderConfig = {};
  const lines = content.split(/\r?\n/);
  let currentSection = '';
  let currentResource: { from: string; to: string; filter?: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;

    // Top-level key
    const topMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (topMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
      const key = topMatch[1] ?? '';
      const val = topMatch[2] ?? '';
      currentSection = key;
      if (key === 'appId') config.appId = val.trim();
      if (key === 'productName') config.productName = val.trim().replace(/^['"](.*)['"]$/, '$1');
      if (key === 'extraResources') {
        config.extraResources = [];
      }
      continue;
    }

    if (currentSection === 'directories' && line.startsWith('  ')) {
      const dirMatch = line.trim().match(/^output:\s*(.*)$/);
      if (dirMatch && dirMatch[1]) {
        config.directories = { output: dirMatch[1].trim() };
      }
    }

    if (currentSection === 'extraResources') {
      const trimmed = line.trim();
      if (trimmed.startsWith('- from:')) {
        currentResource = {
          from: trimmed
            .replace('- from:', '')
            .trim()
            .replace(/^['"](.*)['"]$/, '$1'),
          to: '',
          filter: [],
        };
        config.extraResources!.push(currentResource);
      } else if (currentResource && trimmed.startsWith('to:')) {
        currentResource.to = trimmed
          .replace('to:', '')
          .trim()
          .replace(/^['"](.*)['"]$/, '$1');
      } else if (currentResource && trimmed.startsWith('- ') && !trimmed.startsWith('- from:')) {
        if (!currentResource.filter) {
          currentResource.filter = [];
        }
        currentResource.filter.push(
          trimmed
            .replace('- ', '')
            .trim()
            .replace(/^['"](.*)['"]$/, '$1'),
        );
      }
    }
  }

  return config;
}

describe('package integrity and distribution configuration', () => {
  const desktopRoot = resolve(__dirname, '../..');
  const repoRoot = resolve(desktopRoot, '../..');
  const builderConfigPath = resolve(desktopRoot, 'electron-builder.yml');

  it('has valid electron-builder.yml with correct extraResources for native sidecar', () => {
    expect(existsSync(builderConfigPath)).toBe(true);
    const content = readFileSync(builderConfigPath, 'utf-8');
    const config = parseBuilderYaml(content);

    expect(config.appId).toBe('com.kaiser.meetingspace');
    expect(config.productName).toBe("Kaiser's Meeting Space");
    expect(config.directories?.output).toBe('dist-packaged');

    // Verify extraResources bundles kms-native.exe
    const extraResources = config.extraResources || [];
    const nativeResource = extraResources.find((r: { to: string }) => r.to === 'native');
    expect(nativeResource).toBeDefined();
    expect(nativeResource?.from).toContain('native/target/release');
    expect(nativeResource?.filter).toContain('kms-native.exe');
  });

  it('verifies supervisor runtime resolver branches correctly for packaged vs dev mode', () => {
    const supervisorSource = readFileSync(resolve(__dirname, 'supervisor.ts'), 'utf-8');

    // Assert supervisor checks app.isPackaged
    expect(supervisorSource).toContain('if (app.isPackaged)');
    // Assert in production it uses process.resourcesPath
    expect(supervisorSource).toContain('process.resourcesPath');
    expect(supervisorSource).toContain("join(process.resourcesPath, 'native', `kms-native${ext}`)");
    // Assert in development it uses local build output
    expect(supervisorSource).toContain(
      "join(app.getAppPath(), '..', '..', 'native', 'target', 'release', `kms-native${ext}`)",
    );
  });

  it('verifies native binary release artifact exists in native target folder', () => {
    const nativeBinaryPath = resolve(repoRoot, 'native/target/release/kms-native.exe');
    expect(existsSync(nativeBinaryPath)).toBe(true);
  });
});
