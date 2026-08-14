import { createHash, randomUUID } from 'node:crypto';
import type { Db, OwnerContext } from '@kms/database';
import { MinutesEditorRepository, DbError } from '@kms/database';
import { validateMinutesDocument, serializeMinutesDocument, type MinutesDocumentV1 } from '@kms/domain';
import { MinutesEditorError } from './errors.js';

export interface MinutesEditorServiceOptions {
  readonly db: Db;
}

export class MinutesEditorService {
  private readonly repo = new MinutesEditorRepository();

  constructor(private readonly options: MinutesEditorServiceOptions) {}

  async save(
    ctx: OwnerContext,
    meetingId: string,
    documentId: string,
    baseVersion: number,
    document: MinutesDocumentV1,
  ): Promise<{ versionId: string; documentId: string; version: number; contentHash: string; createdAt: string }> {
    const validation = validateMinutesDocument(document);
    if (!validation.ok) throw new MinutesEditorError('INVALID_DOCUMENT', validation.reason, 400);
    if (validation.value.id !== documentId || validation.value.meetingId !== meetingId) {
      throw new MinutesEditorError('DOCUMENT_MISMATCH', 'Document id/meeting does not match route', 400);
    }

    const contentHash = createHash('sha256').update(serializeMinutesDocument(validation.value)).digest('hex');

    return this.options.db.transaction(async (tx) => {
      const current = await this.repo.getCurrent(ctx, tx, documentId);
      const nextVersion = (current?.version ?? 0) + 1;
      if (current && baseVersion !== current.version) {
        throw new DbError('version_conflict');
      }

      try {
        const saved = await this.repo.saveVersion(ctx, tx, {
          id: randomUUID(),
          documentId,
          meetingId,
          version: nextVersion,
          contentHash,
          document: validation.value,
        });
        await this.repo.setCurrent(ctx, tx, documentId, meetingId, saved.id);
        return {
          versionId: saved.id,
          documentId: saved.documentId,
          version: saved.version,
          contentHash: saved.contentHash,
          createdAt: saved.createdAt,
        };
      } catch (e) {
        if (e instanceof DbError && e.category === 'duplicate') {
          const existing = await this.repo.getCurrent(ctx, tx, documentId);
          if (existing) {
            return {
              versionId: existing.id,
              documentId: existing.documentId,
              version: existing.version,
              contentHash: existing.contentHash,
              createdAt: existing.createdAt,
            };
          }
        }
        throw e;
      }
    });
  }

  async getCurrent(ctx: OwnerContext, documentId: string) {
    const current = await this.repo.getCurrent(ctx, this.options.db, documentId);
    if (!current) throw new DbError('not_found');
    return {
      versionId: current.id,
      documentId: current.documentId,
      version: current.version,
      contentHash: current.contentHash,
      document: current.document,
      createdAt: current.createdAt,
    };
  }

  async listVersions(ctx: OwnerContext, documentId: string) {
    const versions = await this.repo.listVersions(ctx, this.options.db, documentId);
    return versions.map((v) => ({
      versionId: v.id,
      documentId: v.documentId,
      version: v.version,
      contentHash: v.contentHash,
      createdAt: v.createdAt,
    }));
  }
}
