import type { Db, OwnerContext, Connection } from '@kms/database';
import { AudioRepository } from '@kms/database';
import type { ManifestResponse } from './dto.js';

export interface ManifestServiceOptions {
  readonly db: Db;
}

export class ManifestService {
  private readonly audio = new AudioRepository();

  constructor(private readonly options: ManifestServiceOptions) {}

  async getManifest(owner: OwnerContext, meetingId: string): Promise<ManifestResponse> {
    return this.options.db.transaction(async (tx) => {
      const reconciliation = await this.audio.getReconciliation(owner, tx as Connection, meetingId);
      const reconciliationVersion = reconciliation?.version ?? 1;
      const updatedAt = reconciliation?.updatedAt
        ? reconciliation.updatedAt.toISOString()
        : new Date().toISOString();

      const orphans = await this.audio.listOrphans(owner, tx as Connection, meetingId);
      const timelineMarkers = await this.audio.getTimelineMarkers(
        owner,
        tx as Connection,
        meetingId,
      );

      const sourcesList: ('mic' | 'system')[] = ['mic', 'system'];
      const sources: ManifestResponse['sources'] = [];

      for (const source of sourcesList) {
        // Query chunks for this source using a dummy page size to fetch all chunks
        const chunksPage = await this.audio.listChunks(owner, tx as Connection, meetingId, source, {
          limit: 10000,
        });
        const chunks = [...chunksPage.items].sort((a, b) => a.chunkIndex - b.chunkIndex);

        // Fetch stored manifest
        const storedManifest = await this.audio.getManifest(
          owner,
          tx as Connection,
          meetingId,
          source,
        );

        let firstIndex: number | null = null;
        let lastIndex: number | null = null;
        let expectedCount = 0;

        if (storedManifest) {
          firstIndex = storedManifest.firstChunkIndex as number | null;
          lastIndex = storedManifest.lastChunkIndex as number | null;
          expectedCount = storedManifest.entryCount as number;
        } else if (chunks.length > 0) {
          const firstChunk = chunks[0];
          const lastChunk = chunks[chunks.length - 1];
          if (firstChunk && lastChunk) {
            firstIndex = firstChunk.chunkIndex;
            lastIndex = lastChunk.chunkIndex;
            expectedCount = lastIndex - firstIndex + 1;
          }
        }

        const registeredCount = chunks.length;
        const uploadedCount = chunks.filter((c) => c.uploadStatus === 'pending').length;
        const finalizedChunks = chunks.filter((c) => c.uploadStatus === 'completed');
        const finalizedCount = finalizedChunks.length;
        const totalBytes = finalizedChunks.reduce((sum, c) => sum + c.byteLength, 0);
        const totalDurationMs = finalizedChunks.reduce((sum, c) => sum + c.durationMs, 0);

        // Compute missing gaps
        const missing: { fromIndex: number; toIndex: number }[] = [];
        if (firstIndex !== null && lastIndex !== null) {
          const existingIndices = new Set(chunks.map((c) => c.chunkIndex));
          let startGap: number | null = null;
          for (let idx = firstIndex; idx <= lastIndex; idx++) {
            if (!existingIndices.has(idx)) {
              if (startGap === null) startGap = idx;
            } else {
              if (startGap !== null) {
                missing.push({ fromIndex: startGap, toIndex: idx - 1 });
                startGap = null;
              }
            }
          }
          if (startGap !== null) {
            missing.push({ fromIndex: startGap, toIndex: lastIndex });
          }
        }

        // Compute out of order
        const outOfOrder: { chunkIndex: number; registeredAt: string }[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const current = chunks[i];
          for (let j = 0; j < i; j++) {
            const prev = chunks[j];
            if (
              current &&
              prev &&
              new Date(current.wallClockStart) < new Date(prev.wallClockStart)
            ) {
              outOfOrder.push({
                chunkIndex: current.chunkIndex,
                registeredAt: new Date(current.wallClockStart).toISOString(),
              });
              break;
            }
          }
        }

        // Compute conflicts
        const sourceOrphans = orphans.filter((o) => o.source === source);
        const conflicts = sourceOrphans
          .filter((o) => o.status === 'corrupt_object' || o.status === 'size_mismatch')
          .map((o) => {
            const matchingChunk = chunks.find((c) => c.chunkIndex === o.chunkIndex);
            return {
              chunkIndex: o.chunkIndex,
              expectedSha256: matchingChunk?.sha256 || o.sha256 || '',
              reason: 'checksum_mismatch' as const,
            };
          });

        sources.push({
          source,
          expected: {
            count: expectedCount,
            firstIndex,
            lastIndex,
          },
          registered: {
            count: registeredCount,
          },
          uploaded: {
            count: uploadedCount,
          },
          finalized: {
            count: finalizedCount,
            totalBytes,
            totalDurationMs,
          },
          missing,
          outOfOrder,
          conflicts,
        });
      }

      const pauses = timelineMarkers
        .filter((m) => m.markerType === 'pause')
        .map((m) => ({
          startMs: Number(m.startMs),
          durationMs: Number(m.durationMs),
        }));

      const gaps = timelineMarkers
        .filter((m) => m.markerType === 'gap')
        .map((m) => ({
          description: m.description as 'source_disconnect' | 'buffer_overflow' | 'crash_recovery',
          startMs: Number(m.startMs),
          endMs: Number(m.endMs),
          durationMs: Number(m.durationMs),
        }));

      const orphansList = orphans.map((o) => ({
        source: o.source as 'mic' | 'system',
        chunkIndex: o.chunkIndex,
        status: o.status as
          | 'pending_object'
          | 'size_mismatch'
          | 'corrupt_object'
          | 'missing_completion'
          | 'reconciled'
          | 'abandoned',
        detectedAt: new Date(o.detectedAt).toISOString(),
        reconciledAt: o.reconciledAt ? new Date(o.reconciledAt).toISOString() : null,
      }));

      return {
        meetingId,
        reconciliationVersion,
        updatedAt,
        sources,
        timeline: {
          pauses,
          gaps,
        },
        orphans: orphansList,
      };
    });
  }
}
