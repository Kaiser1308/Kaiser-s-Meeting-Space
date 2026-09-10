/**
 * Electron Main Process — Secure desktop shell.
 *
 * Security invariants:
 * - Context isolation enabled
 * - Sandbox enabled
 * - No nodeIntegration
 * - Strict CSP via session headers
 * - Navigation/window-open/permission denial
 * - Single-instance lock
 * - Dev/prod URL policy
 */

import { app, BrowserWindow, session, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeSupervisor } from './supervisor.js';
import { IpcHandler } from './ipc-handler.js';
import { NATIVE_EVENT_CHANNEL } from '@kms/native-contract';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Content Security Policy — strict, no inline, no eval. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Vite injects an inline React-refresh preamble only in local development.
// Packaged builds retain the strict CSP above.
const DEV_CSP = CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");

/** Allowed dev server origins. */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

let mainWindow: BrowserWindow | null = null;
let supervisor: NativeSupervisor | null = null;
let ipcHandler: IpcHandler | null = null;

/**
 * Determine if running in development mode.
 */
function isDev(): boolean {
  return !app.isPackaged;
}

/**
 * Get the preload script path.
 */
function getPreloadPath(): string {
  return join(__dirname, 'preload.mjs');
}

/**
 * Get the renderer URL (dev server or file).
 */
function getRendererUrl(): string {
  if (isDev()) {
    return 'http://localhost:5173';
  }
  return `file://${join(__dirname, '../renderer/index.html')}`;
}

/**
 * Validate a navigation URL against allowed origins.
 */
function isAllowedUrl(url: string): boolean {
  if (isDev()) {
    return DEV_ORIGINS.some((origin) => url.startsWith(origin));
  }
  return url.startsWith('file://');
}

/**
 * Create the main BrowserWindow with secure defaults.
 */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Kaiser's Meeting Space",
    show: false,
    webPreferences: {
      // Security: context isolation prevents renderer from accessing Node.js
      contextIsolation: true,
      // Security: sandbox restricts renderer capabilities
      sandbox: true,
      // Security: no Node.js integration in renderer
      nodeIntegration: false,
      // Security: no Node.js in web workers
      nodeIntegrationInWorker: false,
      // Security: no Node.js in subframes
      nodeIntegrationInSubFrames: false,
      // Security: disable remote module
      // Security: preload script for typed IPC bridge
      preload: getPreloadPath(),
      // Security: disable webview tag
      webviewTag: false,
      // Security: don't allow opening devtools in production
      devTools: isDev(),
      // Performance: enable hardware acceleration
      enableBlinkFeatures: '',
      // Security: spell checker disabled (no content to spell-check)
      spellcheck: false,
    },
  });

  // Show window when ready to prevent white flash
  if (win && typeof win.once === 'function') {
    win.once('ready-to-show', () => {
      win.show();
    });
  }

  return win;
}

/**
 * Apply session-level security policies.
 */
function applySecurityPolicies(): void {
  const ses = session.defaultSession;

  // Set Content-Security-Policy headers on all responses
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev() ? DEV_CSP : CSP],
      },
    });
  });

  // Deny all permission requests (microphone, camera, geolocation, etc.)
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // Deny permission checks
  ses.setPermissionCheckHandler(() => {
    return false;
  });
}

/**
 * Apply window-level security policies.
 */
function applyWindowSecurity(win: BrowserWindow): void {
  // Block navigation to non-allowed URLs
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
    }
  });

  // Block new window creation
  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

/**
 * Initialize the native runtime supervisor.
 */
async function initNativeRuntime(): Promise<void> {
  supervisor = new NativeSupervisor({
    maxRestarts: 3,
    restartWindowMs: 60_000,
    healthIntervalMs: 30_000,
    shutdownTimeoutMs: 5_000,
  });

  supervisor.on('event', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(NATIVE_EVENT_CHANNEL, event);
    }
  });
  supervisor.on('error', (error) => {
    console.error('Native runtime error', error);
  });

  ipcHandler = new IpcHandler(supervisor);
  ipcHandler.register(ipcMain);

  await supervisor.start();
}

/**
 * Application lifecycle.
 */
async function bootstrap(): Promise<void> {
  // Single instance lock
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  await app.whenReady();

  // Apply security policies before creating windows
  applySecurityPolicies();

  // Initialize native runtime
  void initNativeRuntime().catch((error: unknown) => {
    console.error('Native runtime failed to start', error);
  });

  // Create the main window
  mainWindow = createMainWindow();
  applyWindowSecurity(mainWindow);

  // Load the renderer
  const url = getRendererUrl();
  await mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // macOS: re-create window on dock click
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      applyWindowSecurity(mainWindow);
      void mainWindow.loadURL(getRendererUrl());
    }
  });
}

/**
 * Clean shutdown — stop native runtime before quitting.
 */
app.on('before-quit', async () => {
  if (supervisor) {
    await supervisor.shutdown();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Prevent loading remote content
app.on('web-contents-created', (_event, contents) => {
  // Block navigation
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
    }
  });

  // Block new window creation
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

if (!process.env.VITEST) {
  bootstrap().catch((err) => {
    console.error('Fatal: failed to start desktop application', err);
    app.quit();
  });
}

// Export for testing
export {
  CSP,
  isDev,
  isAllowedUrl,
  createMainWindow,
  applySecurityPolicies,
  applyWindowSecurity,
  bootstrap,
  initNativeRuntime,
};
