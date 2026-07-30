import { and, eq, asc, sql, inArray } from 'drizzle-orm';
import type { Connection } from '../client.js';
import {
  minutesDocuments,
  minutesVersions,
  minutesSections,
  actionItems,
  evidenceRefs,
  brandPresets,
  exportJobs,
  exportManifests,
} from '../schema/index.js';
import {
  type MinutesDocument,
  type MinutesVersion,
  type MinutesTemplate,
  type DetailLevel,
  type BrandPreset,
  type ExportJob,
  type ExportFormat,
  MinutesDocumentSchema,
  MinutesVersionSchema,
  BrandPresetSchema,
  ExportJobSchema,
  type MinutesSection,
  type ActionItem,
} from '@kms/domain';
import { type OwnerContext, type Page, type PageQuery, DbError } from './types.js';
import { ownerCondition, paginate, toDomain, updateWithVersion, mapDbError } from './base.js';

export interface CreateVersionInput {
  id: string;
  documentId: string;
  meetingId: string;
  version: number;
  template: MinutesTemplate;
  detailLevel: DetailLevel;
  outputLanguage: 'vi' | 'en';
  provider?: string;
  model?: string;
  promptVersion?: string;
  transcriptProjection?: 'source' | 'current';
  isComplete?: boolean;
  creatorId: string;
  createdAt: string;
  sections: MinutesSection[];
  decisions: MinutesSection[];
  openQuestions: MinutesSection[];
  actionItems: ActionItem[];
}

export class MinutesRepository {
  // ── createDocument ──

  async createDocument(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    template: MinutesTemplate,
    id?: string,
  ): Promise<MinutesDocument> {
    try {
      const docId = id ?? crypto.randomUUID();
      const [row]: any[] = await conn
        .insert(minutesDocuments)
        .values({
          id: docId,
          meetingId,
          ownerId: ctx.ownerId,
          template,
          currentVersion: 1,
          createdAt: new Date(),
        })
        .returning();

      if (!row) throw new DbError('internal');
      const {
        ownerId: _ownerId,
        currentVersion: _currentVersion,
        currentVersionId: _currentVersionId,
        ...docFields
      } = row;
      return toDomain(docFields, MinutesDocumentSchema);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── createVersion (atomic: version + sections + action_items + evidence) ──

  async createVersion(
    ctx: OwnerContext,
    conn: Connection,
    input: CreateVersionInput,
  ): Promise<MinutesVersion> {
    try {
      // 1. Insert minutes version
      const [versionRow]: any[] = await conn
        .insert(minutesVersions)
        .values({
          id: input.id,
          documentId: input.documentId,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          version: input.version,
          template: input.template,
          detailLevel: input.detailLevel,
          outputLanguage: input.outputLanguage,
          provider: input.provider ?? null,
          model: input.model ?? null,
          promptVersion: input.promptVersion ?? null,
          transcriptProjection: input.transcriptProjection ?? 'current',
          isComplete: input.isComplete ?? true,
          creatorId: input.creatorId,
          createdAt: new Date(input.createdAt),
        })
        .returning();

      if (!versionRow) throw new DbError('internal');

      // 2. Insert sections (kind='section')
      for (let i = 0; i < input.sections.length; i++) {
        const sec = input.sections[i]!;
        await conn.insert(minutesSections).values({
          id: sec.id,
          versionId: input.id,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          kind: 'section',
          heading: sec.heading,
          content: sec.content,
          orderIndex: i,
        });

        // 2a. Insert evidence for this section
        for (const ev of sec.evidence ?? []) {
          await conn.insert(evidenceRefs).values({
            meetingId: input.meetingId,
            ownerId: ctx.ownerId,
            ownerType: 'section',
            sectionId: sec.id,
            segmentId: ev.segmentId,
            startMs: ev.startMs,
            endMs: ev.endMs,
            quoteHash: ev.quoteHash ?? null,
          });
        }
      }

      // 3. Insert decisions (kind='decisions')
      for (let i = 0; i < input.decisions.length; i++) {
        const dec = input.decisions[i]!;
        await conn.insert(minutesSections).values({
          id: dec.id,
          versionId: input.id,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          kind: 'decisions',
          heading: dec.heading,
          content: dec.content,
          orderIndex: i,
        });

        for (const ev of dec.evidence ?? []) {
          await conn.insert(evidenceRefs).values({
            meetingId: input.meetingId,
            ownerId: ctx.ownerId,
            ownerType: 'section',
            sectionId: dec.id,
            segmentId: ev.segmentId,
            startMs: ev.startMs,
            endMs: ev.endMs,
            quoteHash: ev.quoteHash ?? null,
          });
        }
      }

      // 4. Insert open questions (kind='open_questions')
      for (let i = 0; i < input.openQuestions.length; i++) {
        const q = input.openQuestions[i]!;
        await conn.insert(minutesSections).values({
          id: q.id,
          versionId: input.id,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          kind: 'open_questions',
          heading: q.heading,
          content: q.content,
          orderIndex: i,
        });

        for (const ev of q.evidence ?? []) {
          await conn.insert(evidenceRefs).values({
            meetingId: input.meetingId,
            ownerId: ctx.ownerId,
            ownerType: 'section',
            sectionId: q.id,
            segmentId: ev.segmentId,
            startMs: ev.startMs,
            endMs: ev.endMs,
            quoteHash: ev.quoteHash ?? null,
          });
        }
      }

      // 5. Insert action items
      for (let i = 0; i < input.actionItems.length; i++) {
        const ai = input.actionItems[i]!;
        await conn.insert(actionItems).values({
          id: ai.id,
          versionId: input.id,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          description: ai.description,
          owner: ai.owner ?? null,
          dueDate: ai.dueDate ?? null,
          status: ai.status,
          orderIndex: i,
        });

        for (const ev of ai.evidence ?? []) {
          await conn.insert(evidenceRefs).values({
            meetingId: input.meetingId,
            ownerId: ctx.ownerId,
            ownerType: 'action_item',
            actionItemId: ai.id,
            segmentId: ev.segmentId,
            startMs: ev.startMs,
            endMs: ev.endMs,
            quoteHash: ev.quoteHash ?? null,
          });
        }
      }

      // 6. Advance document current_version pointer (optimistic)
      const updateResult: any = await conn
        .update(minutesDocuments)
        .set({
          currentVersionId: input.id,
          currentVersion: sql`${minutesDocuments.currentVersion} + 1`,
        })
        .where(
          and(eq(minutesDocuments.id, input.documentId), eq(minutesDocuments.ownerId, ctx.ownerId)),
        );

      const affected: number = updateResult?.count ?? 0;
      if (affected === 0) {
        // Document not found or not owned
        throw new DbError('not_found');
      }

      return this.assembleVersion(conn, versionRow);
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }
  }

  // ── getVersion (full aggregate with sections, action items, evidence) ──

  async getVersion(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
  ): Promise<MinutesVersion | null> {
    const [row]: any[] = await conn
      .select()
      .from(minutesVersions)
      .where(and(eq(minutesVersions.id, id), eq(minutesVersions.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    return this.assembleVersion(conn, row);
  }

  // ── getCurrentVersion ──

  async getCurrentVersion(
    ctx: OwnerContext,
    conn: Connection,
    documentId: string,
  ): Promise<MinutesVersion | null> {
    const [doc]: any[] = await conn
      .select()
      .from(minutesDocuments)
      .where(and(eq(minutesDocuments.id, documentId), eq(minutesDocuments.ownerId, ctx.ownerId)))
      .limit(1);

    if (!doc?.currentVersionId) return null;

    return this.getVersion(ctx, conn, doc.currentVersionId);
  }

  // ── listVersions ──

  async listVersions(
    ctx: OwnerContext,
    conn: Connection,
    documentId: string,
    query: PageQuery,
  ): Promise<Page<MinutesVersion>> {
    const page = await paginate(
      conn,
      query,
      minutesVersions,
      minutesVersions.createdAt,
      minutesVersions.id,
      [ownerCondition(ctx, minutesVersions), eq(minutesVersions.documentId, documentId)],
    );
    const items: readonly MinutesVersion[] = await Promise.all(
      page.items.map((row: any) => this.assembleVersion(conn, row)),
    );
    return { items, nextCursor: page.nextCursor };
  }

  // ── upsertBrandPreset (optimistic) ──

  async upsertBrandPreset(
    ctx: OwnerContext,
    conn: Connection,
    preset: BrandPreset,
    expectedVersion?: number,
  ): Promise<BrandPreset> {
    try {
      if (expectedVersion !== undefined) {
        // Optimistic update
        await updateWithVersion(conn, brandPresets, preset.id, ctx.ownerId, expectedVersion, {
          name: preset.name,
          logo_url: preset.logoUrl ?? null,
          primary_color: preset.primaryColor ?? null,
          secondary_color: preset.secondaryColor ?? null,
          font_family: preset.fontFamily ?? null,
          header_text: preset.headerText ?? null,
          footer_text: preset.footerText ?? null,
          paper_size: preset.paperSize ?? null,
          updated_at: new Date(),
        });
      } else {
        // Insert or update on conflict (owner_id, name)
        const [row]: any[] = await conn
          .insert(brandPresets)
          .values({
            id: preset.id,
            ownerId: ctx.ownerId,
            name: preset.name,
            logoUrl: preset.logoUrl ?? null,
            primaryColor: preset.primaryColor ?? null,
            secondaryColor: preset.secondaryColor ?? null,
            fontFamily: preset.fontFamily ?? null,
            headerText: preset.headerText ?? null,
            footerText: preset.footerText ?? null,
            paperSize: preset.paperSize ?? null,
          })
          .onConflictDoUpdate({
            target: [brandPresets.ownerId, brandPresets.name],
            set: {
              logoUrl: preset.logoUrl ?? null,
              primaryColor: preset.primaryColor ?? null,
              secondaryColor: preset.secondaryColor ?? null,
              fontFamily: preset.fontFamily ?? null,
              headerText: preset.headerText ?? null,
              footerText: preset.footerText ?? null,
              paperSize: preset.paperSize ?? null,
              updatedAt: new Date(),
              version: sql`${brandPresets.version} + 1`,
            },
          })
          .returning();

        if (!row) throw new DbError('internal');
        const { ownerId: _bo, createdAt: _bc, updatedAt: _bu, version: _bv, ...bpFields } = row;
        return toDomain(bpFields, BrandPresetSchema);
      }

      // Re-read after update
      const updated = await this.getBrandPreset(ctx, conn, preset.id);
      if (!updated) throw new DbError('not_found');
      return updated;
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }
  }

  // ── listBrandPresets ──

  async listBrandPresets(ctx: OwnerContext, conn: Connection): Promise<BrandPreset[]> {
    try {
      const rows: any[] = await conn
        .select()
        .from(brandPresets)
        .where(ownerCondition(ctx, brandPresets))
        .orderBy(asc(brandPresets.createdAt));

      return rows.map((row: any) => {
        const {
          ownerId: _ownerId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          version: _version,
          ...bpFields
        } = row;
        return toDomain(bpFields, BrandPresetSchema);
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── createExportJob ──

  async createExportJob(ctx: OwnerContext, conn: Connection, input: ExportJob): Promise<ExportJob> {
    try {
      const [row]: any[] = await conn
        .insert(exportJobs)
        .values({
          id: input.id,
          meetingId: input.meetingId,
          ownerId: ctx.ownerId,
          minutesVersionId: input.minutesVersionId,
          format: input.format,
          brandPresetId: input.brandPresetId ?? null,
          status: input.status ?? 'pending',
          downloadUrl: input.downloadUrl ?? null,
          createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
        })
        .returning();

      if (!row) throw new DbError('internal');
      const { ownerId: _eo, ...exportFields } = row;
      return toDomain(exportFields, ExportJobSchema);
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  // ── completeExportJob ──

  async completeExportJob(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
    manifest: {
      minutesVersionId: string;
      template: MinutesTemplate;
      detailLevel: DetailLevel;
      outputLanguage: 'vi' | 'en';
      transcriptProjection: string;
      provider?: string;
      model?: string;
      promptVersion?: string;
      brandPresetId?: string;
      format: ExportFormat;
      sha256: string;
      byteLength: number;
      storageKey: string;
    },
  ): Promise<ExportJob> {
    try {
      await conn
        .update(exportJobs)
        .set({
          status: 'completed',
          downloadUrl: manifest.storageKey,
          completedAt: new Date(),
        })
        .where(and(eq(exportJobs.id, id), eq(exportJobs.ownerId, ctx.ownerId)));

      // Write immutable export manifest
      await conn.insert(exportManifests).values({
        exportJobId: id,
        ownerId: ctx.ownerId,
        minutesVersionId: manifest.minutesVersionId,
        template: manifest.template,
        detailLevel: manifest.detailLevel,
        outputLanguage: manifest.outputLanguage,
        transcriptProjection: manifest.transcriptProjection,
        provider: manifest.provider ?? null,
        model: manifest.model ?? null,
        promptVersion: manifest.promptVersion ?? null,
        brandPresetId: manifest.brandPresetId ?? null,
        format: manifest.format,
        sha256: manifest.sha256,
        byteLength: manifest.byteLength,
        storageKey: manifest.storageKey,
      });

      const job = await this.getExportJob(ctx, conn, id);
      if (!job) throw new DbError('internal');
      return job;
    } catch (e) {
      if (e instanceof DbError) throw e;
      throw mapDbError(e);
    }
  }

  // ── getExportJob ──

  async getExportJob(ctx: OwnerContext, conn: Connection, id: string): Promise<ExportJob | null> {
    const [row]: any[] = await conn
      .select()
      .from(exportJobs)
      .where(and(eq(exportJobs.id, id), eq(exportJobs.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    const { ownerId: _ownerId, ...exportFields } = row;
    return toDomain(exportFields, ExportJobSchema);
  }

  // ── listExportJobs ──

  async listExportJobs(
    ctx: OwnerContext,
    conn: Connection,
    meetingId: string,
    query: PageQuery,
  ): Promise<Page<ExportJob>> {
    const page = await paginate(conn, query, exportJobs, exportJobs.createdAt, exportJobs.id, [
      ownerCondition(ctx, exportJobs),
      eq(exportJobs.meetingId, meetingId),
    ]);
    const items: readonly ExportJob[] = page.items.map((row: any) => {
      const { ownerId: _ownerId, ...exportFields } = row;
      return toDomain(exportFields, ExportJobSchema);
    });
    return { items, nextCursor: page.nextCursor };
  }

  // ── Private helpers ──

  private async assembleVersion(conn: Connection, versionRow: any): Promise<MinutesVersion> {
    const allSections: any[] = await conn
      .select()
      .from(minutesSections)
      .where(eq(minutesSections.versionId, versionRow.id))
      .orderBy(asc(minutesSections.orderIndex));

    const allActionItems: any[] = await conn
      .select()
      .from(actionItems)
      .where(eq(actionItems.versionId, versionRow.id))
      .orderBy(asc(actionItems.orderIndex));

    // Collect evidence for all sections and action items
    const sectionIds = allSections.map((s: any) => s.id);
    const actionItemIds = allActionItems.map((a: any) => a.id);

    const allEvidence: any[] = [];
    if (sectionIds.length > 0) {
      const ev = await conn
        .select()
        .from(evidenceRefs)
        .where(inArray(evidenceRefs.sectionId, sectionIds));
      allEvidence.push(...ev);
    }
    if (actionItemIds.length > 0) {
      const ev = await conn
        .select()
        .from(evidenceRefs)
        .where(inArray(evidenceRefs.actionItemId, actionItemIds));
      allEvidence.push(...ev);
    }

    const evidenceMap = new Map<string, any[]>();
    for (const ev of allEvidence) {
      if (ev.sectionId) {
        const list = evidenceMap.get(`section:${ev.sectionId}`) ?? [];
        list.push(ev);
        evidenceMap.set(`section:${ev.sectionId}`, list);
      }
      if (ev.actionItemId) {
        const list = evidenceMap.get(`action_item:${ev.actionItemId}`) ?? [];
        list.push(ev);
        evidenceMap.set(`action_item:${ev.actionItemId}`, list);
      }
    }

    const sections: any[] = [];
    const decisions: any[] = [];
    const openQuestions: any[] = [];

    for (const s of allSections) {
      const ev = (evidenceMap.get(`section:${s.id}`) ?? []).map((e: any) => ({
        segmentId: e.segmentId,
        startMs: e.startMs,
        endMs: e.endMs,
        quoteHash: e.quoteHash ?? undefined,
      }));

      const item = {
        id: s.id,
        heading: s.heading,
        content: s.content,
        evidence: ev,
      };

      if (s.kind === 'section') sections.push(item);
      else if (s.kind === 'decisions') decisions.push(item);
      else if (s.kind === 'open_questions') openQuestions.push(item);
    }

    const actionItemsList = allActionItems.map((a: any) => {
      const ev = (evidenceMap.get(`action_item:${a.id}`) ?? []).map((e: any) => ({
        segmentId: e.segmentId,
        startMs: e.startMs,
        endMs: e.endMs,
        quoteHash: e.quoteHash ?? undefined,
      }));
      return {
        id: a.id,
        description: a.description,
        owner: a.owner ?? undefined,
        dueDate: a.dueDate ?? undefined,
        status: a.status,
        evidence: ev,
      };
    });

    const { ownerId: _vo, meetingId: _vm, ...versionFields } = versionRow;

    return toDomain(
      {
        ...versionFields,
        sections,
        decisions,
        openQuestions,
        actionItems: actionItemsList,
      },
      MinutesVersionSchema,
    );
  }

  private async getBrandPreset(
    ctx: OwnerContext,
    conn: Connection,
    id: string,
  ): Promise<BrandPreset | null> {
    const [row]: any[] = await conn
      .select()
      .from(brandPresets)
      .where(and(eq(brandPresets.id, id), eq(brandPresets.ownerId, ctx.ownerId)))
      .limit(1);

    if (!row) return null;
    const {
      ownerId: _ownerId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      version: _version,
      ...bpFields
    } = row;
    return toDomain(bpFields, BrandPresetSchema);
  }
}
