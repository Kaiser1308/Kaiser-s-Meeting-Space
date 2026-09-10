import { describe, it, expect } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '../..');
const exePath = resolve(desktopRoot, "dist-packaged/win-unpacked/Kaiser's Meeting Space.exe");
const sidecarPath = resolve(
  desktopRoot,
  'dist-packaged/win-unpacked/resources/native/kms-native.exe',
);

/** Generate a random port in ephemeral range (45000-58000) to avoid TIME_WAIT collisions on Windows. */
function getFreePort(): number {
  return 45000 + Math.floor(Math.random() * 13000);
}

function terminateProcess(child: ChildProcess): void {
  if (child.pid && process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // Process already terminated
    }
  } else {
    child.kill('SIGKILL');
  }
}

describe('Packaged Desktop Application Smoke Test', () => {
  it('verifies packaged artifacts exist on disk', () => {
    expect(existsSync(exePath), `Packaged executable must exist at: ${exePath}`).toBe(true);
    expect(existsSync(sidecarPath), `Bundled native sidecar must exist at: ${sidecarPath}`).toBe(
      true,
    );
  });

  it('spawns packaged executable, loads dist/index.html, records real audio, finalizes chunks and SQLite manifest, and verifies Library', async () => {
    const port = await getFreePort();
    let stderrOutput = '';
    let stdoutOutput = '';

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('VITEST') && value !== undefined) {
        env[key] = value;
      }
    }

    const child = spawn(exePath, ['--enable-logging', `--remote-debugging-port=${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutOutput += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      let loadedTargetUrl: string | null = null;
      let wsUrl: string | null = null;
      const startTime = Date.now();
      const timeoutMs = 25_000;

      // 1. Poll for CDP endpoint and verify renderer loads dist/index.html
      while (Date.now() - startTime < timeoutMs) {
        if (child.exitCode !== null) {
          throw new Error(
            `Packaged executable exited prematurely with code ${child.exitCode}. Stderr: ${stderrOutput}`,
          );
        }

        try {
          const res = await fetch(`http://127.0.0.1:${port}/json/list`);
          if (res.ok) {
            const targets = (await res.json()) as Array<{
              type: string;
              url: string;
              webSocketDebuggerUrl?: string;
            }>;
            const pageTarget = targets.find((t) => t.type === 'page');
            if (pageTarget && pageTarget.url.includes('dist/index.html')) {
              loadedTargetUrl = pageTarget.url;
              wsUrl = pageTarget.webSocketDebuggerUrl ?? null;
              break;
            }
          }
        } catch {
          // DevTools endpoint not ready yet
        }

        await wait(500);
      }

      expect(child.exitCode).toBeNull();
      expect(
        loadedTargetUrl,
        `Expected renderer to load dist/index.html via CDP, but was null. Stderr: ${stderrOutput}; Stdout: ${stdoutOutput}`,
      ).not.toBeNull();
      expect(loadedTargetUrl).toMatch(/dist\/index\.html$/);
      expect(loadedTargetUrl).not.toContain('renderer/index.html');
      expect(wsUrl, 'CDP WebSocket URL must be available').not.toBeNull();

      // 2. Connect via WebSocket to evaluate renderer commands
      const ws = new WebSocket(wsUrl!);
      let nextId = 1;
      const pending = new Map<
        number,
        { resolve: (val: unknown) => void; reject: (err: unknown) => void }
      >();

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id)!;
          pending.delete(msg.id);
          resolve(msg);
        }
      };

      await new Promise((resolve, reject) => {
        ws.onopen = () => resolve(undefined);
        ws.onerror = reject;
      });

      const sendCommand = (method: string, params: Record<string, unknown> = {}) => {
        const id = nextId++;
        return new Promise<Record<string, unknown>>((resolve, reject) => {
          pending.set(id, { resolve: resolve as (val: unknown) => void, reject });
          ws.send(JSON.stringify({ id, method, params }));
        });
      };

      const evaluate = async (expression: string): Promise<unknown> => {
        const resp = await sendCommand('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        const result = resp.result as { result?: { value?: unknown } } | undefined;
        return result?.result?.value;
      };

      // 3. Verify UI status panel: local API and storage must be healthy
      let runtimeHealthy = false;
      for (let i = 0; i < 30; i++) {
        await wait(500);
        const status = (await evaluate(`
            ({
              apiStatus: document.querySelector('[data-testid="api-status"]')?.textContent?.trim(),
              storageStatus: document.querySelector('[data-testid="storage-status"]')?.textContent?.trim(),
              recordBtn: document.querySelector('button.record')?.textContent?.trim(),
            })
          `)) as { apiStatus?: string; storageStatus?: string; recordBtn?: string } | undefined;

        if (status?.apiStatus === 'HEALTHY' && status?.recordBtn === 'Start meeting') {
          runtimeHealthy = true;
          expect(status.storageStatus).toBe('LOCAL PERSISTENT');
          break;
        }
      }
      expect(runtimeHealthy, 'Runtime and local API must become healthy').toBe(true);

      // 4. Start physical audio capture meeting
      await evaluate(`document.querySelector('button.record')?.click()`);

      let isRecording = false;
      for (let i = 0; i < 20; i++) {
        await wait(500);
        const btnText = await evaluate(
          `document.querySelector('button.record')?.textContent?.trim()`,
        );
        if (btnText === 'End meeting') {
          isRecording = true;
          break;
        }
      }
      expect(isRecording, 'Meeting must transition to recording state').toBe(true);

      // 5. Record real audio for 10 seconds
      await wait(10_000);

      // 6. Stop meeting and trigger chunk finalization + SQLite commit
      await evaluate(`document.querySelector('button.record')?.click()`);

      let evidenceText: string | null = null;
      for (let i = 0; i < 25; i++) {
        await wait(500);
        const cardText = (await evaluate(`
            document.querySelector('[data-testid="session-evidence-card"]')?.innerText || null
          `)) as string | null;

        if (cardText && cardText.includes('Session Finalized')) {
          evidenceText = cardText;
          break;
        }
      }

      expect(
        evidenceText,
        'Session evidence card must appear with finalization summary',
      ).not.toBeNull();
      expect(evidenceText).toContain(
        'All audio chunks committed locally. Source audio is immutable.',
      );

      // 7. Verify Library tab shows the recorded meeting
      await evaluate(`
          (() => {
            const tabs = document.querySelectorAll('.tab-btn');
            if (tabs[1]) tabs[1].click();
          })()
        `);
      await wait(1500);

      const libraryResult = (await evaluate(`
          (() => {
            const items = Array.from(document.querySelectorAll('[data-testid="library-meeting-item"]'));
            return items.length;
          })()
        `)) as number;
      expect(libraryResult).toBeGreaterThanOrEqual(1);

      // 8. Verify physical artifacts on disk
      const appData = process.env.APPDATA || '';
      const storageDir = resolve(appData, '@kms/desktop/native-storage');
      const chunksDir = resolve(storageDir, 'chunks');
      const manifestDbPath = resolve(storageDir, 'manifest.db');

      expect(existsSync(chunksDir), `Chunks directory must exist at: ${chunksDir}`).toBe(true);
      expect(existsSync(manifestDbPath), `manifest.db must exist at: ${manifestDbPath}`).toBe(true);

      const chunkFiles = readdirSync(chunksDir);
      expect(chunkFiles.length).toBeGreaterThan(0);
      const firstChunkStat = statSync(join(chunksDir, chunkFiles[0]!));
      expect(firstChunkStat.size).toBeGreaterThan(0);

      ws.close();
    } finally {
      terminateProcess(child);
    }
  }, 60_000);
});
