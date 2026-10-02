import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  startMock,
  supervisorOnMock,
  consoleErrorMock,
  loadURLMock,
  BrowserWindowMock,
  LocalModelManagerMock,
  initializeModelManagerMock,
  registerLocalModelIpcMock,
  createPinnedArtifactTransportMock,
} =
  vi.hoisted(() => ({
    startMock: vi.fn(),
    supervisorOnMock: vi.fn(),
    consoleErrorMock: vi.fn(),
    loadURLMock: vi.fn(),
    BrowserWindowMock: vi.fn(),
    LocalModelManagerMock: vi.fn(),
    initializeModelManagerMock: vi.fn(),
    registerLocalModelIpcMock: vi.fn(),
    createPinnedArtifactTransportMock: vi.fn(),
  }));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    getPath: vi.fn(() => 'C:/kms-test-user-data'),
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
    on: supervisorOnMock,
    getState: vi.fn(() => ({ status: 'starting' })),
    shutdown: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('./ipc-handler.js', () => ({
  IpcHandler: vi.fn().mockImplementation(() => ({ register: vi.fn() })),
}));

vi.mock('./local-model-manager.js', () => ({
  LocalModelManager: LocalModelManagerMock,
}));

vi.mock('./local-model-ipc.js', () => ({
  registerLocalModelIpc: registerLocalModelIpcMock,
}));

vi.mock('./local-model-transport.js', () => ({
  createPinnedArtifactTransport: createPinnedArtifactTransportMock,
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
    initializeModelManagerMock.mockReset();
    initializeModelManagerMock.mockResolvedValue(undefined);
    LocalModelManagerMock.mockReset();
    LocalModelManagerMock.mockImplementation(() => ({ initialize: initializeModelManagerMock }));
    registerLocalModelIpcMock.mockReset();
    createPinnedArtifactTransportMock.mockReset();
    createPinnedArtifactTransportMock.mockReturnValue({ stream: vi.fn() });
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
    expect(BrowserWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          preload: expect.stringMatching(/preload\.mjs$/),
        }),
      }),
    );
  });

  it('initializes the local model manager before the renderer can invoke its fixed IPC actions', async () => {
    startMock.mockResolvedValueOnce(undefined);

    const { bootstrap } = await import('./main.js');
    await bootstrap();

    expect(LocalModelManagerMock).toHaveBeenCalledWith(expect.objectContaining({
      storageRoot: expect.stringMatching(/kms-test-user-data[\\\\/]native-storage$/),
      transport: expect.anything(),
    }));
    expect(initializeModelManagerMock).toHaveBeenCalledTimes(1);
    expect(registerLocalModelIpcMock).toHaveBeenCalledTimes(1);
    expect(registerLocalModelIpcMock.mock.invocationCallOrder[0]!).toBeLessThan(loadURLMock.mock.invocationCallOrder[0]!);
  });

  it('keeps the desktop shell available when native startup rejects', async () => {
    const error = new Error('sidecar missing');
    startMock.mockRejectedValueOnce(error);

    const { bootstrap } = await import('./main.js');
    await bootstrap();
    await Promise.resolve();

    expect(BrowserWindowMock).toHaveBeenCalledTimes(1);
    expect(loadURLMock).toHaveBeenCalledWith('http://localhost:5173');
    expect(consoleErrorMock).toHaveBeenCalledWith('Native runtime failed to start', error);
  });

  it('handles native supervisor errors without throwing from the main process', async () => {
    const runtimeError = new Error('malformed native response');
    const { initNativeRuntime } = await import('./main.js');
    await initNativeRuntime();

    const errorRegistration = supervisorOnMock.mock.calls.find(([event]) => event === 'error');
    expect(errorRegistration).toBeDefined();
    const handler = errorRegistration?.[1] as (error: Error) => void;

    expect(() => handler(runtimeError)).not.toThrow();
    expect(consoleErrorMock).toHaveBeenCalledWith('Native runtime error', runtimeError);
  });

  it('resolves correct renderer URL in dev vs packaged production mode', async () => {
    const { getRendererUrl } = await import('./main.js');
    const { app } = await import('electron');

    (app as any).isPackaged = false;
    expect(getRendererUrl()).toBe('http://localhost:5173');

    (app as any).isPackaged = true;
    const prodUrl = getRendererUrl();
    expect(prodUrl).toMatch(/^file:\/\/\/.+\/dist\/index\.html$/);
    expect(prodUrl).not.toContain('renderer/index.html');
  });
});
