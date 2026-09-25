import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
const PROJECT_ROOT = resolve(process.cwd(), '../..');

describe('workspace-root Android deep-link contract', () => {
  it('resolves the existing scheme and package from the root Expo config', () => {
    const output = execSync('pnpm exec expo config --json', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    const config = JSON.parse(output) as {
      scheme?: string;
      android?: { package?: string };
    };

    expect(config.scheme).toBe('kms');
    expect(config.android?.package).toBe('com.anonymous.kaisermeetingspace');
  });

  it('includes the local audio recorder module in root Android autolinking', () => {
    const output = execSync(
      'pnpm exec expo-modules-autolinking resolve --platform android --json',
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
      },
    );
    const resolution = JSON.parse(output) as {
      modules?: Array<{
        packageName?: string;
        projects?: Array<{ modules?: string[] }>;
      }>;
    };

    const recorderModule = resolution.modules?.find(
      (module) => module.packageName === 'audio-recorder',
    );
    const hasNativeRecorderClass = recorderModule?.projects?.some((project) =>
      project.modules?.includes('expo.modules.audiorecorder.AudioRecorderModule'),
    );

    expect(hasNativeRecorderClass).toBe(true);
  });

  it('registers kms VIEW links on the root MainActivity', () => {
    const xml = readFileSync(
      resolve(PROJECT_ROOT, 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const activity = Array.from(document.getElementsByTagName('activity')).find(
      (node) => node.getAttributeNS(ANDROID_NS, 'name') === '.MainActivity',
    );
    expect(activity).toBeDefined();

    const handlesKmsView = Array.from(activity!.getElementsByTagName('intent-filter')).some(
      (filter) => {
        const actions = Array.from(filter.getElementsByTagName('action')).map((node) =>
          node.getAttributeNS(ANDROID_NS, 'name'),
        );
        const categories = Array.from(filter.getElementsByTagName('category')).map((node) =>
          node.getAttributeNS(ANDROID_NS, 'name'),
        );
        const schemes = Array.from(filter.getElementsByTagName('data')).map((node) =>
          node.getAttributeNS(ANDROID_NS, 'scheme'),
        );

        return (
          actions.includes('android.intent.action.VIEW') &&
          categories.includes('android.intent.category.DEFAULT') &&
          categories.includes('android.intent.category.BROWSABLE') &&
          schemes.includes('kms')
        );
      },
    );

    expect(handlesKmsView).toBe(true);
  });
});
