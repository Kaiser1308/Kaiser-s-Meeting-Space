import { describe, expect, it } from 'vitest';
import { InMemoryExportJobs, verifyStoredArtifact } from './jobs.js';

describe('idempotent export jobs', () => {
  it('deduplicates by owner and manifest hash and keeps output immutable', async () => {
    const jobs = new InMemoryExportJobs();
    const first = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'a'.repeat(64), format: 'txt' });
    const duplicate = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'a'.repeat(64), format: 'txt' });
    expect(duplicate.id).toBe(first.id);

    const completed = await jobs.complete(first.id, {
      format: 'txt',
      body: 'Synthetic\n',
      contentType: 'text/plain',
    });
    expect(completed.status).toBe('completed');
    expect(completed.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(completed.artifactByteLength).toBe(Buffer.byteLength('Synthetic\n'));
    expect(completed.provenance).toEqual({ manifestHash: 'a'.repeat(64), rendererFormat: 'txt' });
    await expect(
      jobs.complete(first.id, { format: 'txt', body: 'Changed\n', contentType: 'text/plain' }),
    ).rejects.toThrow('immutable');
    await expect(jobs.get(first.id, 'owner-b')).rejects.toThrow('not found');
  });

  it('supports owner-scoped cancellation, retry, history and expiring downloads', async () => {
    const jobs = new InMemoryExportJobs();
    const first = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'b'.repeat(64), format: 'markdown' });
    await jobs.cancel(first.id, 'owner-a');
    const retried = await jobs.retry(first.id, 'owner-a');
    expect(retried.id).not.toBe(first.id);
    await jobs.complete(retried.id, { format: 'markdown', body: '# Synthetic\n', contentType: 'text/markdown' });
    const history = await jobs.history('owner-a');
    expect(history.map((job) => job.id)).toEqual([retried.id, first.id]);
    const download = await jobs.createDownload(retried.id, 'owner-a', 1_000, 100);
    expect(await jobs.resolveDownload(download.url, 'owner-a', 1_050)).toBe(retried.id);
    await expect(jobs.resolveDownload(download.url, 'owner-b', 1_050)).rejects.toThrow('not found');
    await expect(jobs.resolveDownload(download.url, 'owner-a', 1_101)).rejects.toThrow('expired');
  });

  it('accepts audio jobs and keeps them distinct from simple formats', async () => {
    const jobs = new InMemoryExportJobs();
    const audio = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'c'.repeat(64), format: 'audio' });
    const text = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'c'.repeat(64), format: 'txt' });
    expect(audio.id).not.toBe(text.id);
    expect(audio.format).toBe('audio');
  });

  it('accepts document renderer jobs as distinct immutable formats', async () => {
    const jobs = new InMemoryExportJobs();
    const docx = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'd'.repeat(64), format: 'docx' });
    const pdf = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'd'.repeat(64), format: 'pdf' });
    expect(docx.id).not.toBe(pdf.id);
    expect(docx.format).toBe('docx');
    expect(pdf.format).toBe('pdf');
  });

  it('measures binary renderer artifacts by decoded bytes, not base64 text', async () => {
    const jobs = new InMemoryExportJobs();
    const job = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'e'.repeat(64), format: 'pdf' });
    const body = Buffer.from([0, 1, 2, 255]).toString('base64');
    const completed = await jobs.complete(job.id, { format: 'pdf', body, contentType: 'application/pdf' });
    expect(completed.artifactByteLength).toBe(4);
  });

  it('fails closed when stored artifact metadata is missing or mismatched', async () => {
    const jobs = new InMemoryExportJobs();
    const job = await jobs.enqueue({ ownerId: 'owner-a', manifestHash: 'f'.repeat(64), format: 'txt' });
    const completed = await jobs.complete(job.id, { format: 'txt', body: 'Stored\n', contentType: 'text/plain' });
    expect(verifyStoredArtifact(completed, { exists: false })).toEqual({ ok: false, reason: 'artifact not found' });
    expect(verifyStoredArtifact(completed, {
      exists: true,
      contentLength: completed.artifactByteLength,
      sha256: '0'.repeat(64),
      contentType: 'text/plain',
    })).toEqual({ ok: false, reason: 'artifact hash mismatch' });
    expect(verifyStoredArtifact(completed, {
      exists: true,
      contentLength: completed.artifactByteLength,
      sha256: completed.artifactSha256,
      contentType: 'text/plain',
    })).toEqual({ ok: true });
    const download = await jobs.createDownload(job.id, 'owner-a', 2_000, 100);
    await expect(jobs.resolveVerifiedDownload(download.url, 'owner-a', { exists: false }, 2_050)).rejects.toThrow('artifact not found');
    await expect(jobs.resolveVerifiedDownload(download.url, 'owner-a', {
      exists: true,
      contentLength: completed.artifactByteLength,
      sha256: completed.artifactSha256,
      contentType: 'text/plain',
    }, 2_050)).resolves.toBe(job.id);
  });
});
