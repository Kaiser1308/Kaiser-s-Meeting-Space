import { describe, expect, it } from 'vitest';
import { createExportManifest, validateBrandPreset } from './schemas.js';
describe('safe export contracts', () => {
  it('rejects external/script brand content', () => {
    expect(
      validateBrandPreset({
        version: 1,
        id: 'b',
        ownerId: 'o',
        brandVersion: 1,
        colors: ['#ffffff'],
        fonts: ['Inter'],
        header: 'javascript:x',
        footer: '',
        paper: 'a4',
        logoAssetHash: null,
      }).ok,
    ).toBe(false);
  });
  it('creates deterministic pinned manifest hash', async () => {
    const base: any = {
      version: 1,
      ownerId: 'o',
      meetingId: 'm',
      projectionVersion: 1,
      minutesVersion: 1,
      templateVersion: 'team:1',
      brandVersion: 1,
      locale: 'vi',
      timezone: 'Asia/Saigon',
      rendererVersion: 'md:1',
      configVersion: 'c1',
      fontVersion: 'f1',
      format: 'md',
      options: { b: true, a: 'x' },
    };
    const one = await createExportManifest(base);
    const two = await createExportManifest({ ...base, options: { a: 'x', b: true } });
    expect(one.inputHash).toBe(two.inputHash);
  });
});
