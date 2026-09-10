import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

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

describe('Packaged Desktop Application Smoke Test', () => {
  it('verifies packaged artifacts exist on disk', () => {
    expect(existsSync(exePath), `Packaged executable must exist at: ${exePath}`).toBe(true);
    expect(existsSync(sidecarPath), `Bundled native sidecar must exist at: ${sidecarPath}`).toBe(
      true,
    );
  });

  it('spawns the packaged executable, verifies process stays alive, and confirms renderer loaded dist/index.html via CDP', async () => {
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

    let loadedTargetUrl: string | null = null;
    let isAlive = true;

    const startTime = Date.now();
    const timeoutMs = 25_000;

    try {
      while (Date.now() - startTime < timeoutMs) {
        if (child.exitCode !== null) {
          isAlive = false;
          break;
        }

        try {
          const res = await fetch(`http://127.0.0.1:${port}/json/list`);
          if (res.ok) {
            const targets = (await res.json()) as Array<{
              type: string;
              url: string;
              title: string;
            }>;
            const pageTarget = targets.find((t) => t.type === 'page');
            if (pageTarget && pageTarget.url.includes('dist/index.html')) {
              loadedTargetUrl = pageTarget.url;
              break;
            }
          }
        } catch {
          // DevTools endpoint not ready yet; wait and retry
        }

        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      }

      // Process must remain alive
      expect(
        isAlive,
        `Packaged executable exited prematurely with code ${child.exitCode}. Stderr: ${stderrOutput}`,
      ).toBe(true);
      expect(child.exitCode).toBeNull();

      // Renderer URL must have loaded dist/index.html
      expect(
        loadedTargetUrl,
        `Expected renderer to load dist/index.html via CDP, but loadedTargetUrl was null. Stderr: ${stderrOutput}; Stdout: ${stdoutOutput}`,
      ).not.toBeNull();
      expect(loadedTargetUrl).toMatch(/dist\/index\.html$/);
      expect(loadedTargetUrl).not.toContain('renderer/index.html');
    } finally {
      // Graceful termination
      child.kill();
      await new Promise((resolveExit) => {
        child.once('exit', () => resolveExit(undefined));
        setTimeout(resolveExit, 2000);
      });
    }
  }, 35_000);
});
