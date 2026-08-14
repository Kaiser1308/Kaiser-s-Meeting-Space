import type { Db, Connection, OwnerContext } from '@kms/database';
import { FinalizationRepository, MeetingsRepository, DbError } from '@kms/database';
import {
  decidePrimaryFinalAction,
  type FinalizationManifestV1,
} from '@kms/domain';
import { FinalizationError } from './errors.js';

export interface FinalizationServiceOptions {
  readonly db: Db;
}

export interface FinalizeInput {
  readonly manifest: FinalizationManifestV1;
  readonly desktopAvailable: boolean;
  readonly localModelAvailable: boolean;
  readonly cloudProviderAvailable: boolean;
}

export class FinalizationService {
  private readonly finalizationRepo = new FinalizationRepository();
  private readonly meetingsRepo = new MeetingsRepository();

  constructor(private readonly options: FinalizationServiceOptions) {}

  async finalize(ctx: OwnerContext, meetingId: string, input: FinalizeInput) {
    const { manifest } = input;
    if (manifest.meetingId !== meetingId) {
      throw new FinalizationError('MANIFEST_MEETING_MISMATCH', 'Manifest meetingId does not match route', 400);
    }

    const meeting = await this.meetingsRepo.get(ctx, this.options.db, meetingId);
    if (!meeting) {
      throw new DbError('not_found');
    }

    return this.options.db.transaction(async (tx) => {
      // Idempotent: the manifest is unique per meeting; a duplicate insert means
      // the manifest was already recorded, so return the existing state.
      try {
        await this.finalizationRepo.recordManifest(ctx, tx, meetingId, manifest, manifest.localManifestHash);
      } catch (e: unknown) {
        if (e instanceof DbError && e.category === 'duplicate') {
          return this.readStatus(ctx, tx, meetingId);
        }
        throw e;
      }

      const policy = (await this.meetingsRepo.getTranscriptionPolicy(ctx, tx, meetingId)) ?? undefined;
      const action = decidePrimaryFinalAction({
        meetingState: 'finalizing',
        policy: policy ?? {
          version: 1,
          language: meeting.language,
          live: 'off',
          final: 'none',
          cloudConsent: 'not_required',
          cloudCheckScope: 'off',
        },
        desktopAvailable: input.desktopAvailable,
        localModelAvailable: input.localModelAvailable,
        cloudProviderAvailable: input.cloudProviderAvailable,
      });

      await this.finalizationRepo.upsertState(ctx, tx, meetingId, 'processing', action.kind);
      return this.readStatus(ctx, tx, meetingId);
    });
  }

  async getStatus(ctx: OwnerContext, meetingId: string) {
    return this.readStatus(ctx, this.options.db, meetingId);
  }

  private async readStatus(ctx: OwnerContext, conn: Connection, meetingId: string) {
    const state = await this.finalizationRepo.getState(ctx, conn, meetingId);
    if (!state) {
      throw new DbError('not_found');
    }
    return {
      meetingId,
      state: state.state,
      primaryAction: state.primaryAction,
      version: state.version,
    };
  }
}
