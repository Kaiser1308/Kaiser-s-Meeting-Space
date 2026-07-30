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

  it('does not overlap LISTEN and timer poll batches', async () => {
    const dispatcher = new OutboxDispatcher({
      databaseUrl: 'postgres://localhost:5432/kms',
      redisUrl: 'redis://localhost:6379/0',
    });
    let release!: () => void;
    const batch = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dispatchBatch = vi.fn(() => batch);
    Object.defineProperties(dispatcher, {
      isRunning: { value: true, writable: true },
      handle: { value: {}, writable: true },
      dispatchBatch: { value: dispatchBatch },
    });

    const first = dispatcher.pollAndDispatch();
    const second = dispatcher.pollAndDispatch();
    expect(dispatchBatch).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);
  });
});
