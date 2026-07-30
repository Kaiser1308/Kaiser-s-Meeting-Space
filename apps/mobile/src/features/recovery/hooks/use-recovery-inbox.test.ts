import { describe, it, expect, beforeEach } from 'vitest';
import { RecoveryInbox, ManifestStore, FakeFileSystem } from '@kms/local-recovery';
import { createSqlJsConnection } from '@kms/local-recovery';

describe('RecoveryInbox integration', () => {
  let inbox: RecoveryInbox;

  beforeEach(async () => {
    const db = await createSqlJsConnection();
    const manifest = new ManifestStore(db);
    await manifest.runMigrations();
    const fs = new FakeFileSystem();
    inbox = new RecoveryInbox(manifest, fs);
  });

  it('discovers empty sessions initially', async () => {
    const sessions = await inbox.discover();
    expect(sessions).toHaveLength(0);
  });

  it('getActions returns expected action types', () => {
    const actions = inbox.getActions({
      meetingId: 'test-id' as any,
      source: 'mic',
      totalChunks: 5,
      acknowledgedChunks: 3,
      unacknowledgedChunks: 2,
      orphanFiles: [],
      hasMissingFiles: false,
      hasServerConflict: false,
      lastActivityAt: new Date().toISOString(),
    });
    expect(actions.length).toBeGreaterThanOrEqual(2); // Continue + Finalize at minimum
    expect(actions.some((a) => a.type === 'Continue')).toBe(true);
  });

  it('executeAction requires confirmation for Delete', async () => {
    const actions = inbox.getActions({
      meetingId: 'test-id' as any,
      source: 'mic',
      totalChunks: 3,
      acknowledgedChunks: 1,
      unacknowledgedChunks: 2,
      orphanFiles: ['/tmp/orphan.webm'],
      hasMissingFiles: true,
      hasServerConflict: false,
      lastActivityAt: new Date().toISOString(),
    });

    const deleteAction = actions.find((a) => a.type === 'Delete');
    expect(deleteAction).toBeDefined();

    if (deleteAction) {
      const result = await inbox.executeAction(deleteAction, false);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('confirmation');
    }
  });
});
