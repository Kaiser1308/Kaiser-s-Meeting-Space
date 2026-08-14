import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/domain',
  'packages/ai',
  'packages/translation',
  'packages/jobs',
  'packages/config',
  'packages/test-support',
  'packages/database',
  'packages/storage',
  'packages/speech',
  'apps/api',
  'apps/desktop',
  'apps/mobile',
]);
