import { describe, expect, it, vi } from 'vitest';
import { IpcHandler } from './ipc-handler.js';

describe('IpcHandler', () => {
  it('preserves a valid request correlation ID when the native supervisor rejects', async () => {
    const supervisor = {
      getState: vi.fn(() => 'running'),
      send: vi.fn(async () => {
        throw new Error('native process disconnected');
      }),
    };
    let handler: ((event: unknown, request: unknown) => Promise<unknown>) | undefined;
    const ipcMain = {
      handle: vi.fn((_channel: string, registered: (event: unknown, request: unknown) => Promise<unknown>) => {
        handler = registered;
      }),
    };
    new IpcHandler(supervisor as never).register(ipcMain as never);

    const response = await handler?.({}, {
      version: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      payload: {},
      cancel: false,
    });

    expect(response).toMatchObject({
      success: false,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      command: 'ping',
      error: { code: 'INTERNAL', category: 'internal' },
    });
  });
});
