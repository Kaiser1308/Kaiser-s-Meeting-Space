import { describe, it, expect } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '../..');
const exePath = resolve(desktopRoot, "dist-packaged/win-unpacked/Kaiser's Meeting Space.exe");
const sidecarPath = resolve(
  desktopRoot,
  'dist-packaged/win-unpacked/resources/native/kms-native.exe',
);

let nextPort = 48000 + Math.floor(Math.random() * 4000);
function getFreePort(): number {
  nextPort += 30 + Math.floor(Math.random() * 20);
  return nextPort;
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CdpSession {
  ws: WebSocket;
  evaluate: (expression: string) => Promise<unknown>;
  close: () => void;
}

async function gracefulClose(child: ChildProcess, cdp?: CdpSession | null): Promise<void> {
  if (cdp) {
    try {
      await cdp.evaluate('window.close()');
    } catch {
      // Ignore evaluate error during close
    }
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      terminateProcess(child);
      resolve();
    }, 4000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (cdp) {
    try {
      cdp.close();
    } catch {
      // Ignore ws close error
    }
  }
}

async function connectToCdp(
  port: number,
  child?: ChildProcess | null,
  timeoutMs = 30_000,
): Promise<{ loadedTargetUrl: string; cdp: CdpSession }> {
  const startTime = Date.now();
  let wsUrl: string | null = null;
  let loadedTargetUrl: string | null = null;

  while (Date.now() - startTime < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`Packaged process exited prematurely with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const targets = (await res.json()) as Array<{
          type: string;
          url: string;
          webSocketDebuggerUrl?: string;
        }>;
        const pageTarget = targets.find(
          (t) => t.type === 'page' && t.url.includes('dist/index.html'),
        );
        if (pageTarget?.webSocketDebuggerUrl) {
          loadedTargetUrl = pageTarget.url;
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {
      // Endpoint warming up
    }
    await wait(500);
  }

  if (!wsUrl || !loadedTargetUrl) {
    throw new Error(
      `Failed to connect to CDP on port ${port} within ${timeoutMs}ms (child exitCode: ${child?.exitCode ?? 'running'})`,
    );
  }

  const ws = new WebSocket(wsUrl);
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

  const evaluate = async (expression: string): Promise<unknown> => {
    const id = nextId++;
    const resp = await new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (val: unknown) => void, reject });
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
    const result = resp.result as { result?: { value?: unknown } } | undefined;
    return result?.result?.value;
  };

  return {
    loadedTargetUrl,
    cdp: {
      ws,
      evaluate,
      close: () => ws.close(),
    },
  };
}

describe('Packaged Desktop Application Smoke Test', () => {
  it('verifies packaged artifacts exist on disk', () => {
    expect(existsSync(exePath), `Packaged executable must exist at: ${exePath}`).toBe(true);
    expect(existsSync(sidecarPath), `Bundled native sidecar must exist at: ${sidecarPath}`).toBe(
      true,
    );
  });

  it('executes a hardened, isolated physical meeting slice: records real audio in temp userData, verifies SQLite manifest/provenance/gaps with SHA-256 hashes, and tests app reopen in Library', async () => {
    const tempUserData = mkdtempSync(join(tmpdir(), 'kms-smoke-slice-'));
    const port1 = getFreePort();

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('VITEST') && value !== undefined) {
        env[key] = value;
      }
    }

    let child1: ChildProcess | null = null;
    let child2: ChildProcess | null = null;
    let meetingId = '';

    try {
      // --- 1. First Launch in Clean Isolated UserData Directory ---
      child1 = spawn(
        exePath,
        ['--enable-logging', `--user-data-dir=${tempUserData}`, `--remote-debugging-port=${port1}`],
        { stdio: ['ignore', 'pipe', 'pipe'], env },
      );

      const { loadedTargetUrl, cdp: cdp1 } = await connectToCdp(port1, child1);
      expect(loadedTargetUrl).toMatch(/dist\/index\.html$/);
      expect(loadedTargetUrl).not.toContain('renderer/index.html');

      // Verify status panel diagnostics
      let runtimeHealthy = false;
      for (let i = 0; i < 30; i++) {
        await wait(500);
        const status = (await cdp1.evaluate(`
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

      // --- 2. Start Physical Audio Meeting ---
      await cdp1.evaluate(`document.querySelector('button.record')?.click()`);

      let isRecording = false;
      for (let i = 0; i < 20; i++) {
        await wait(500);
        const btnText = await cdp1.evaluate(
          `document.querySelector('button.record')?.textContent?.trim()`,
        );
        if (btnText === 'End meeting') {
          isRecording = true;
          break;
        }
      }
      expect(isRecording, 'Meeting must transition to recording state').toBe(true);

      // Record real audio via WASAPI for 10 seconds
      await wait(10_000);

      // --- 3. End Meeting and Finalize ---
      await cdp1.evaluate(`document.querySelector('button.record')?.click()`);

      type SessionEvidence = {
        meetingId: string;
        micChunks: number;
        sysChunks: number;
        commitStatus: string;
        text: string;
      };

      let evidence: SessionEvidence | null = null;

      for (let i = 0; i < 25; i++) {
        await wait(500);
        evidence = (await cdp1.evaluate(`
            (() => {
              const card = document.querySelector('[data-testid="session-evidence-card"]');
              if (!card) return null;
              const rows = Array.from(card.querySelectorAll('.evidence-row strong')).map(
                (el) => el.textContent?.trim() || ''
              );
              return {
                meetingId: rows[0] || '',
                micChunks: parseInt(rows[1] || '0', 10),
                sysChunks: parseInt(rows[2] || '0', 10),
                commitStatus: rows[3] || '',
                text: card.innerText,
              };
            })()
          `)) as SessionEvidence | null;

        if (evidence && evidence.text?.includes('Session Finalized') && evidence.meetingId) {
          break;
        }
      }

      expect(evidence, 'Session evidence card must be displayed').not.toBeNull();
      meetingId = evidence!.meetingId;
      expect(meetingId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(evidence!.commitStatus).toBe('clean');
      expect(evidence!.micChunks).toBeGreaterThan(0);
      expect(evidence!.sysChunks).toBeGreaterThan(0);
      expect(evidence!.text).toContain(
        'All audio chunks committed locally. Source audio is immutable.',
      );

      // --- 4. Verify Physical Artifacts and SQLite Database for exact meetingId ---
      const storageDir = join(tempUserData, 'native-storage');
      const chunksDir = join(storageDir, 'chunks');
      const manifestDbPath = join(storageDir, 'manifest.db');

      expect(
        existsSync(chunksDir),
        `Chunks directory must exist in temp userData: ${chunksDir}`,
      ).toBe(true);
      expect(
        existsSync(manifestDbPath),
        `manifest.db must exist in temp userData: ${manifestDbPath}`,
      ).toBe(true);

      const allChunks = readdirSync(chunksDir);
      const micChunkFiles = allChunks.filter((f) => f.startsWith(`${meetingId}_microphone_`));
      const sysChunkFiles = allChunks.filter((f) => f.startsWith(`${meetingId}_system_audio_`));

      expect(micChunkFiles.length).toBe(evidence!.micChunks);
      expect(sysChunkFiles.length).toBe(evidence!.sysChunks);

      const computedHashes = new Map<string, string>();
      for (const file of [...micChunkFiles, ...sysChunkFiles]) {
        const filePath = join(chunksDir, file);
        const stat = statSync(filePath);
        expect(stat.size).toBeGreaterThan(0);

        const content = readFileSync(filePath);
        const sha256 = createHash('sha256').update(content).digest('hex');
        computedHashes.set(`chunks/${file}`, sha256);
      }

      // Query manifest.db using Node.js built-in DatabaseSync
      const db = new DatabaseSync(manifestDbPath);
      try {
        const manifestRows = db
          .prepare(
            'SELECT meeting_id, source, chunk_index, file_path, sha256, byte_length FROM manifest_entries WHERE meeting_id = ? ORDER BY source, chunk_index',
          )
          .all(meetingId) as Array<{
          meeting_id: string;
          source: string;
          chunk_index: number;
          file_path: string;
          sha256: string;
          byte_length: number;
        }>;

        expect(manifestRows.length).toBe(evidence!.micChunks + evidence!.sysChunks);
        for (const row of manifestRows) {
          expect(row.meeting_id).toBe(meetingId);
          expect(row.sha256.length).toBe(64);
          expect(computedHashes.has(row.file_path)).toBe(true);
          expect(row.sha256).toBe(computedHashes.get(row.file_path));
          expect(row.byte_length).toBeGreaterThan(0);
        }

        const provenanceRows = db
          .prepare('SELECT * FROM capture_provenance WHERE meeting_id = ?')
          .all(meetingId) as Array<{
          meeting_id: string;
          source: string;
          chunk_index: number;
          provenance_json: string;
        }>;

        expect(provenanceRows.length).toBeGreaterThanOrEqual(2);
        for (const prov of provenanceRows) {
          const parsed = JSON.parse(prov.provenance_json) as Record<string, unknown>;
          expect(parsed).toHaveProperty('canonical');
          expect(parsed).toHaveProperty('nativePackets');
        }

        const gapRows = db
          .prepare('SELECT * FROM capture_gaps WHERE meeting_id = ?')
          .all(meetingId);
        expect(Array.isArray(gapRows)).toBe(true);
      } finally {
        db.close();
      }

      // --- 5. Clean Termination of First Instance (flushes Chromium LevelDB) ---
      await gracefulClose(child1, cdp1);
      child1 = null;
      await wait(1000);

      // --- 6. Relaunch Application on the SAME tempUserData to test Persistence & Reopen ---
      const port2 = getFreePort();
      child2 = spawn(
        exePath,
        ['--enable-logging', `--user-data-dir=${tempUserData}`, `--remote-debugging-port=${port2}`],
        { stdio: ['ignore', 'pipe', 'pipe'], env },
      );

      const { cdp: cdp2 } = await connectToCdp(port2, child2);

      // Wait for UI to mount in child2
      for (let i = 0; i < 30; i++) {
        await wait(500);
        const hasTabs = await cdp2.evaluate(
          `Boolean(document.querySelector('.tab-switcher') && document.querySelectorAll('.tab-btn').length >= 2)`,
        );
        if (hasTabs) break;
      }

      // Switch to Library tab
      await cdp2.evaluate(`
          (() => {
            const tabs = document.querySelectorAll('.tab-btn');
            if (tabs[1]) tabs[1].click();
          })()
        `);

      // Wait and poll for library items
      let matchedItem: { title: string; text: string } | undefined;
      for (let i = 0; i < 25; i++) {
        await wait(500);
        const libraryItems = (await cdp2.evaluate(`
            (() => {
              const items = Array.from(document.querySelectorAll('[data-testid="library-meeting-item"]')).map(el => ({
                title: el.querySelector('h4')?.textContent?.trim() || '',
                text: el.innerText || '',
              }));
              return items;
            })()
          `)) as Array<{ title: string; text: string }>;

        matchedItem = libraryItems.find(
          (it) => it.text.includes('FINALIZED') || it.text.includes(meetingId),
        );
        if (matchedItem) break;
      }

      expect(matchedItem, 'Meeting item must be found in library after reopen').toBeDefined();
      expect(matchedItem!.title).toBe('New meeting');

      // Click "View / Reopen" on that meeting
      await cdp2.evaluate(`document.querySelector('[data-testid="open-meeting-btn"]')?.click()`);
      await wait(1000);

      const reopened = (await cdp2.evaluate(`
          (() => {
            const card = document.querySelector('[data-testid="selected-meeting-card"]');
            if (!card) return null;
            return {
              id: card.querySelector('code')?.textContent?.trim() || '',
              title: card.querySelector('h3')?.textContent?.trim() || '',
            };
          })()
        `)) as { id: string; title: string } | null;

      expect(reopened, 'Reopened meeting card must be displayed').not.toBeNull();
      expect(reopened!.id).toBe(meetingId);
      expect(reopened!.title).toBe('New meeting');

      await gracefulClose(child2, cdp2);
      child2 = null;
    } finally {
      if (child1) terminateProcess(child1);
      if (child2) terminateProcess(child2);
      try {
        rmSync(tempUserData, { recursive: true, force: true });
      } catch {
        // Ignore temp cleanup errors on Windows
      }
    }
  }, 90_000);

  it('demonstrates concurrency isolation: two packaged instances with distinct temp userData run simultaneously without lock collision', async () => {
    const tempUserDirA = mkdtempSync(join(tmpdir(), 'kms-smoke-iso-a-'));
    const tempUserDirB = mkdtempSync(join(tmpdir(), 'kms-smoke-iso-b-'));
    const portA = getFreePort();
    const portB = getFreePort();

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('VITEST') && value !== undefined) {
        env[key] = value;
      }
    }

    let childA: ChildProcess | null = null;
    let childB: ChildProcess | null = null;

    try {
      childA = spawn(
        exePath,
        ['--enable-logging', `--user-data-dir=${tempUserDirA}`, `--remote-debugging-port=${portA}`],
        { stdio: ['ignore', 'pipe', 'pipe'], env },
      );

      childB = spawn(
        exePath,
        ['--enable-logging', `--user-data-dir=${tempUserDirB}`, `--remote-debugging-port=${portB}`],
        { stdio: ['ignore', 'pipe', 'pipe'], env },
      );

      const [connA, connB] = await Promise.all([
        connectToCdp(portA, childA),
        connectToCdp(portB, childB),
      ]);

      expect(childA.exitCode).toBeNull();
      expect(childB.exitCode).toBeNull();

      for (let i = 0; i < 30; i++) {
        await wait(500);
        const readyA = await connA.cdp.evaluate(`Boolean(document.querySelector('main'))`);
        const readyB = await connB.cdp.evaluate(`Boolean(document.querySelector('main'))`);
        if (readyA && readyB) break;
      }

      const mainA = await connA.cdp.evaluate(`Boolean(document.querySelector('main'))`);
      const mainB = await connB.cdp.evaluate(`Boolean(document.querySelector('main'))`);

      expect(mainA).toBe(true);
      expect(mainB).toBe(true);

      await Promise.all([gracefulClose(childA, connA.cdp), gracefulClose(childB, connB.cdp)]);
      childA = null;
      childB = null;
    } finally {
      if (childA) terminateProcess(childA);
      if (childB) terminateProcess(childB);
      try {
        rmSync(tempUserDirA, { recursive: true, force: true });
      } catch {}
      try {
        rmSync(tempUserDirB, { recursive: true, force: true });
      } catch {}
    }
  }, 45_000);
});
