import { z } from 'zod';
import { MeetingIdSchema, MeetingLanguageSchema } from '../meeting/schemas.js';
import { EvidenceRefSchema } from '../transcript/schemas.js';

// ── Minutes template ──

export const ALL_TEMPLATES = [
  'team',
  'one_on_one',
  'direct_report',
  'leadership',
  'recurring',
] as const;

export const MinutesTemplateSchema = z.enum(ALL_TEMPLATES);
export type MinutesTemplate = z.infer<typeof MinutesTemplateSchema>;

// ── Detail level ──

export const DetailLevelSchema = z.enum(['detailed', 'near_verbatim']);
export type DetailLevel = z.infer<typeof DetailLevelSchema>;

// ── Action item status ──

export const ActionItemStatusSchema = z.enum(['open', 'done', 'needs_confirmation']);
export type ActionItemStatus = z.infer<typeof ActionItemStatusSchema>;

// ── Export format ──

export const ExportFormatSchema = z.enum(['docx', 'pdf', 'markdown', 'txt', 'json', 'audio']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

// ── Export status ──

export const ExportStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ExportStatus = z.infer<typeof ExportStatusSchema>;

// ── Minutes document ──

export const MinutesDocumentSchema = z
  .object({
    id: z.string().min(1),
    meetingId: MeetingIdSchema,
    template: MinutesTemplateSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type MinutesDocument = z.infer<typeof MinutesDocumentSchema>;

// ── Minutes section ──

export const MinutesSectionSchema = z
  .object({
    id: z.string().min(1),
    heading: z.string().min(1),
    content: z.string(),
    evidence: z.array(EvidenceRefSchema),
  })
  .strict();
export type MinutesSection = z.infer<typeof MinutesSectionSchema>;

// ── Action item ──

export const ActionItemSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    owner: z.string().optional(),
    dueDate: z.string().optional(),
    status: ActionItemStatusSchema,
    evidence: z.array(EvidenceRefSchema),
  })
  .strict();
export type ActionItem = z.infer<typeof ActionItemSchema>;

// ── Minutes version ──

export const MinutesVersionSchema = z
  .object({
    id: z.string().min(1),
    documentId: z.string().min(1),
    version: z.number().int().positive(),
    template: MinutesTemplateSchema,
    detailLevel: DetailLevelSchema,
    outputLanguage: MeetingLanguageSchema,
    provider: z.string().min(1).optional(),
    model: z.string().optional(),
    promptVersion: z.string().optional(),
    transcriptProjection: z.enum(['source', 'current']).default('current'),
    isComplete: z.boolean().default(true),
    creatorId: z.string().min(1),
    createdAt: z.string().datetime(),
    sections: z.array(MinutesSectionSchema),
    decisions: z.array(MinutesSectionSchema),
    openQuestions: z.array(MinutesSectionSchema),
    actionItems: z.array(ActionItemSchema),
  })
  .strict();
export type MinutesVersion = z.infer<typeof MinutesVersionSchema>;

// ── Brand preset ──

export const PaperSizeSchema = z.enum(['A4', 'Letter', 'Legal']);

export const HexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color like #FFF or #2563EB');

export const BrandPresetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    logoUrl: z.string().url().optional(),
    primaryColor: HexColorSchema.optional(),
    secondaryColor: HexColorSchema.optional(),
    fontFamily: z.string().optional(),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    paperSize: PaperSizeSchema.optional(),
  })
  .strict();
export type BrandPreset = z.infer<typeof BrandPresetSchema>;

// ── Export job ──

export const ExportJobSchema = z
  .object({
    id: z.string().min(1),
    meetingId: MeetingIdSchema,
    minutesVersionId: z.string().min(1),
    format: ExportFormatSchema,
    brandPresetId: z.string().min(1).optional(),
    status: ExportStatusSchema,
    downloadUrl: z.string().url().optional(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();
export type ExportJob = z.infer<typeof ExportJobSchema>;
