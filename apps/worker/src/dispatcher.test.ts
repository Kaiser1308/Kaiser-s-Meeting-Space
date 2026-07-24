import { describe, expect, it, vi } from 'vitest';
import { OutboxDispatcher } from './dispatcher.js';

describe('OutboxDispatcher Unit Isolation', () => {
  it('should construct correctly with connection options', () => {
    const dispatcher = new OutboxDispatcher({
      databaseUrl: 'postgres://localhost:5432/kms',
      redisUrl: 'redis://localhost:6379/0',
    });

    expect(dispatcher).toBeDefined();
    expect(dispatcher.pollAndDispatch).toBeDefined();
    expect(dispatcher.start).toBeDefined();
    expect(dispatcher.stop).toBeDefined();
  });
});
