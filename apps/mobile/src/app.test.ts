import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('@kms/mobile', () => {
  it('has App entry point', () => {
    expect(existsSync(resolve(__dirname, '..', 'App.tsx'))).toBe(true);
  });

  it('has vitest configured', () => {
    expect(existsSync(resolve(__dirname, '..', 'vitest.config.ts'))).toBe(true);
  });
});
