import { randomUUID } from 'node:crypto';
import type { Db, OwnerContext } from '@kms/database';
import { TranslationRepository, MeetingsRepository, DbError } from '@kms/database';
import {
  DeterministicMockTranslationProvider,
  resolveTargetLanguage,
  type TranslationProvider,
  type TranslationVersionV1,
} from '@kms/translation';
import { TranslationError } from './errors.js';
import { MeetingIdSchema, type Sha256 } from '@kms/domain';

export interface TranslationServiceOptions {
  readonly db: Db;
  readonly provider?: TranslationProvider;
}

export interface TranslateInput {
  readonly sourceSegmentId: string;
  readonly projectionVersion: number;
  readonly revision: number;
  readonly sourceTextHash: Sha256;
  readonly sourceLanguage: 'vi' | 'en';
}

export class TranslationService {
  private readonly translationRepo = new TranslationRepository();
  private readonly meetingsRepo = new MeetingsRepository();
  private readonly provider: TranslationProvider;

  constructor(private readonly options: TranslationServiceOptions) {
    this.provider = options.provider ?? new DeterministicMockTranslationProvider();
  }

  async translate(ctx: OwnerContext, meetingId: string, input: TranslateInput): Promise<TranslationVersionV1> {
    const meeting = await this.meetingsRepo.get(ctx, this.options.db, meetingId);
    if (!meeting) throw new DbError('not_found');

    if (meeting.mode !== 'meeting_translate') {
      throw new TranslationError('TRANSLATION_MODE_REQUIRED', 'Meeting is not in translation mode', 409);
    }

    const targetLanguage = resolveTargetLanguage(input.sourceLanguage);
    const result = await this.provider.translate(
      {
        version: 1,
        sourceSegmentId: input.sourceSegmentId,
        projectionVersion: input.projectionVersion,
        revision: input.revision,
        sourceTextHash: input.sourceTextHash,
        sourceLanguage: input.sourceLanguage,
        targetLanguage,
        idempotencyKey: randomUUID(),
      },
      {},
    );

    const version: TranslationVersionV1 = {
      version: 1,
      id: randomUUID(),
      meetingId: MeetingIdSchema.parse(meetingId),
      sourceSegmentId: input.sourceSegmentId,
      sourceRevision: input.revision,
      sourceTextHash: input.sourceTextHash,
      sourceLanguage: input.sourceLanguage,
      targetLanguage,
      translatedText: result.translatedText,
      provider: result.provider,
      model: result.model,
      config: result.config,
      promptId: result.promptId,
      status: 'completed',
      confidence: result.confidence,
      usage: result.usage,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    return this.options.db.transaction(async (tx) => {
      const recorded = await this.translationRepo.recordVersion(ctx, tx, version);
      await this.translationRepo.setCurrent(
        ctx,
        tx,
        input.sourceSegmentId,
        meetingId,
        targetLanguage,
        recorded.id,
      );
      return recorded;
    });
  }

  async listVersions(ctx: OwnerContext, meetingId: string): Promise<TranslationVersionV1[]> {
    return this.translationRepo.listVersions(ctx, this.options.db, meetingId);
  }

  async getCurrent(
    ctx: OwnerContext,
    segmentId: string,
  ): Promise<TranslationVersionV1 | null> {
    return this.translationRepo.getCurrent(ctx, this.options.db, segmentId);
  }
}
