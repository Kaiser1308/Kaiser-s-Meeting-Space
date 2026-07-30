import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PackageJson = {
  main?: string;
  dependencies?: Record<string, string>;
};

function readPackage(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}

describe('Expo monorepo runtime contract', () => {
  it('uses one Expo and React Native runtime version across root and mobile', () => {
    const root = readPackage(resolve(process.cwd(), '../../package.json'));
    const mobile = readPackage(resolve(process.cwd(), 'package.json'));

    expect(root.dependencies?.expo).toBe(mobile.dependencies?.expo);
    expect(root.dependencies?.['react-native']).toBe(mobile.dependencies?.['react-native']);
    expect(root.dependencies?.react).toBe(mobile.dependencies?.react);
  });

  it('uses the mobile app as the Expo project root for the workspace Android build', () => {
    const gradle = readFileSync(resolve(process.cwd(), '../../android/app/build.gradle'), 'utf8');

      expect(gradle).toContain("def mobileProjectRoot = new File(rootDir, '../apps/mobile').canonicalPath");
      expect(gradle).toContain("root = file('../../')");
      expect(gradle).toContain('entryFile = file("${mobileProjectRoot}/index.js")');
      expect(gradle).toContain('def resolveWindowsSafeExecutablePath = { String executablePath ->');
      expect(gradle).toContain('hermesCommand = resolveWindowsSafeExecutablePath(');
    });

  it('uses the mobile entrypoint when Expo is invoked from the workspace root', () => {
    const root = readPackage(resolve(process.cwd(), '../../package.json'));
    expect(root.main).toBe('apps/mobile/index.js');
    expect(readFileSync(resolve(process.cwd(), '../../apps/mobile/index.js'), 'utf8')).toContain("from './App'");
    expect(readFileSync(resolve(process.cwd(), '../../metro.config.js'), 'utf8')).toContain("./apps/mobile/metro.config");
  });
});
