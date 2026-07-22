import { describe, it, expect } from 'vitest';
import {
  MinutesTemplateSchema,
  DetailLevelSchema,
  ActionItemStatusSchema,
  MinutesDocumentSchema,
  MinutesVersionSchema,
  MinutesSectionSchema,
  ActionItemSchema,
  BrandPresetSchema,
  ExportJobSchema,
  ExportFormatSchema,
  ExportStatusSchema,
  ALL_TEMPLATES,
} from './schemas.js';

const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('MinutesTemplate', () => {
  it('accepts all five templates', () => {
    for (const t of ALL_TEMPLATES) {
      expect(MinutesTemplateSchema.parse(t)).toBe(t);
    }
  });

  it('rejects unknown template', () => {
    const result = MinutesTemplateSchema.safeParse('summary');
    expect(result.success).toBe(false);
  });

  it('ALL_TEMPLATES contains exactly 5 templates', () => {
    expect(ALL_TEMPLATES).toEqual([
      'team',
      'one_on_one',
      'direct_report',
      'leadership',
      'recurring',
    ]);
  });
});

describe('DetailLevel', () => {
  it('accepts "detailed" and "near_verbatim"', () => {
    expect(DetailLevelSchema.parse('detailed')).toBe('detailed');
    expect(DetailLevelSchema.parse('near_verbatim')).toBe('near_verbatim');
  });

  it('rejects "verbatim" (deprecated prototype name)', () => {
    const result = DetailLevelSchema.safeParse('verbatim');
    expect(result.success).toBe(false);
  });
});

describe('ActionItemStatus', () => {
  it('accepts open, done, needs_confirmation', () => {
    expect(ActionItemStatusSchema.parse('open')).toBe('open');
    expect(ActionItemStatusSchema.parse('done')).toBe('done');
    expect(ActionItemStatusSchema.parse('needs_confirmation')).toBe('needs_confirmation');
  });
});

describe('MinutesDocument', () => {
  it('accepts valid document', () => {
    const result = MinutesDocumentSchema.parse({
      id: 'doc-001',
      meetingId: MEETING_ID,
      template: 'team',
      createdAt: '2026-07-22T10:00:00.000Z',
    });
    expect(result.template).toBe('team');
  });
});

describe('MinutesVersion', () => {
  it('accepts valid version', () => {
    const result = MinutesVersionSchema.parse({
      id: 'ver-001',
      documentId: 'doc-001',
      version: 1,
      template: 'team',
      detailLevel: 'detailed',
      outputLanguage: 'vi',
      provider: 'openai',
      model: 'gpt-4o',
      promptVersion: '1.0.0',
      transcriptProjection: 'current',
      isComplete: true,
      creatorId: 'user-1',
      createdAt: '2026-07-22T10:30:00.000Z',
      sections: [],
      decisions: [],
      openQuestions: [],
      actionItems: [],
    });
    expect(result.version).toBe(1);
  });

  it('rejects version <= 0', () => {
    const result = MinutesVersionSchema.safeParse({
      id: 'ver-001',
      documentId: 'doc-001',
      version: 0,
      template: 'team',
      detailLevel: 'detailed',
      outputLanguage: 'vi',
      createdAt: '2026-07-22T10:00:00.000Z',
      sections: [],
      decisions: [],
      openQuestions: [],
      actionItems: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer version', () => {
    const result = MinutesVersionSchema.safeParse({
      id: 'ver-001',
      documentId: 'doc-001',
      version: 1.5,
      template: 'team',
      detailLevel: 'detailed',
      outputLanguage: 'vi',
      createdAt: '2026-07-22T10:00:00.000Z',
      sections: [],
      decisions: [],
      openQuestions: [],
      actionItems: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('MinutesSection', () => {
  it('accepts section with evidence', () => {
    const result = MinutesSectionSchema.parse({
      id: 'sec-001',
      heading: 'Project Updates',
      content: 'The team discussed the Q3 roadmap.',
      evidence: [{ segmentId: 'seg-001', startMs: 1000, endMs: 5000 }],
    });
    expect(result.heading).toBe('Project Updates');
  });

  it('accepts section without evidence', () => {
    const result = MinutesSectionSchema.parse({
      id: 'sec-001',
      heading: 'Notes',
      content: 'General discussion.',
      evidence: [],
    });
    expect(result.evidence).toEqual([]);
  });

  it('rejects empty heading', () => {
    const result = MinutesSectionSchema.safeParse({
      id: 'sec-001',
      heading: '',
      content: 'Text',
      evidence: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ActionItem', () => {
  it('accepts action item with all fields', () => {
    const result = ActionItemSchema.parse({
      id: 'act-001',
      description: 'Update the project timeline',
      owner: 'Nguyen Van A',
      dueDate: '2026-07-30',
      status: 'needs_confirmation',
      evidence: [{ segmentId: 'seg-001', startMs: 2000, endMs: 4000 }],
    });
    expect(result.status).toBe('needs_confirmation');
  });

  it('accepts minimal action item', () => {
    const result = ActionItemSchema.parse({
      id: 'act-001',
      description: 'Schedule follow-up',
      status: 'open',
      evidence: [],
    });
    expect(result.owner).toBeUndefined();
  });

  it('rejects empty description', () => {
    const result = ActionItemSchema.safeParse({
      id: 'act-001',
      description: '',
      status: 'open',
      evidence: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ExportFormat', () => {
  it('accepts all formats', () => {
    expect(ExportFormatSchema.parse('docx')).toBe('docx');
    expect(ExportFormatSchema.parse('pdf')).toBe('pdf');
    expect(ExportFormatSchema.parse('markdown')).toBe('markdown');
    expect(ExportFormatSchema.parse('txt')).toBe('txt');
    expect(ExportFormatSchema.parse('json')).toBe('json');
    expect(ExportFormatSchema.parse('audio')).toBe('audio');
  });
});

describe('ExportStatus', () => {
  it('accepts all statuses', () => {
    expect(ExportStatusSchema.parse('pending')).toBe('pending');
    expect(ExportStatusSchema.parse('processing')).toBe('processing');
    expect(ExportStatusSchema.parse('completed')).toBe('completed');
    expect(ExportStatusSchema.parse('failed')).toBe('failed');
  });
});

describe('BrandPreset', () => {
  it('accepts valid brand preset', () => {
    const result = BrandPresetSchema.parse({
      id: 'brand-001',
      name: 'Company Standard',
      logoUrl: 'https://example.com/logo.png',
      primaryColor: '#2563EB',
      secondaryColor: '#7C3AED',
      fontFamily: 'Inter',
      headerText: 'Confidential',
      footerText: 'Page {page} of {total}',
      paperSize: 'A4',
    });
    expect(result.primaryColor).toBe('#2563EB');
  });

  it('validates hex color format', () => {
    const valid = BrandPresetSchema.parse({
      id: 'b1',
      name: 'Test',
      primaryColor: '#FFF',
    });
    expect(valid.primaryColor).toBe('#FFF');

    const invalid = BrandPresetSchema.safeParse({
      id: 'b1',
      name: 'Test',
      primaryColor: 'red',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates paper size', () => {
    const valid = BrandPresetSchema.parse({
      id: 'b1',
      name: 'Test',
      paperSize: 'A4',
    });
    expect(valid.paperSize).toBe('A4');

    const invalid = BrandPresetSchema.safeParse({
      id: 'b1',
      name: 'Test',
      paperSize: 'A7',
    });
    expect(invalid.success).toBe(false);
  });
});

describe('ExportJob', () => {
  it('accepts valid export job', () => {
    const result = ExportJobSchema.parse({
      id: 'exp-001',
      meetingId: MEETING_ID,
      minutesVersionId: 'ver-001',
      format: 'pdf',
      brandPresetId: 'brand-001',
      status: 'pending',
      createdAt: '2026-07-22T11:00:00.000Z',
    });
    expect(result.format).toBe('pdf');
  });
});
