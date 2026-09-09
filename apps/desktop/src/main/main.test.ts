import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startMock, consoleErrorMock, loadURLMock, BrowserWindowMock } =
  vi.hoisted(() => ({
    startMock: vi.fn(),
    consoleErrorMock: vi.fn(),
    loadURLMock: vi.fn(),
    BrowserWindowMock: vi.fn(),
  }));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: BrowserWindowMock,
  session: {
    defaultSession: {
      webRequest: { onHeadersReceived: vi.fn() },
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
  },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('./supervisor.js', () => ({
  NativeSupervisor: vi.fn().mockImplementation(() => ({
    start: startMock,
    on: vi.fn(),
    getState: vi.fn(() => ({ status: 'starting' })),
    shutdown: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('./ipc-handler.js', () => ({
  IpcHandler: vi.fn().mockImplementation(() => ({ register: vi.fn() })),
}));

vi.mock('@kms/native-contract', () => ({ NATIVE_EVENT_CHANNEL: 'native:event' }));

const windowMock = {
  once: vi.fn(),
  isDestroyed: vi.fn(() => false),
  loadURL: loadURLMock,
  on: vi.fn(),
  webContents: {
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    send: vi.fn(),
  },
};

BrowserWindowMock.mockImplementation(() => windowMock);

describe('desktop bootstrap native startup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startMock.mockReset();
    loadURLMock.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
  });

  it('starts the NativeSupervisor once while bootstrapping the desktop shell', async () => {
    startMock.mockResolvedValueOnce(undefined);

    const { bootstrap } = await import('./main.js');
    await bootstrap();
    await Promise.resolve();

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(BrowserWindowMock).toHaveBeenCalledTimes(1);
    expect(loadURLMock).toHaveBeenCalledWith('http://localhost:5173');
  });

  it('keeps the desktop shell available when native startup rejects', async () => {
    const error = new Error('sidecar missing');
    startMock.mockRejectedValueOnce(error);

    const { bootstrap } = await import('./main.js');
    await bootstrap();
    await Promise.resolve();

    expect(BrowserWindowMock).toHaveBeenCalledTimes(1);
    expect(loadURLMock).toHaveBeenCalledWith('http://localhost:5173');
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Native runtime failed to start',
      error,
    );
  });
});
