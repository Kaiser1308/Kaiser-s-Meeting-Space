import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const securityRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: securityRoot,
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    alias: {
      '@kms/auth': resolve(securityRoot, '../../packages/auth/src/index.ts'),
      '@kms/domain': resolve(securityRoot, '../../packages/domain/src/index.ts'),
    },
  },
});
