import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  formatMeetingMarkdown,
  exportMeetingMarkdown,
  generateExportFilename,
  defaultDownloadHandler,
  type ExportableMeeting,
} from './markdown-export.js';
import type { TranscriptSegment } from './transcription-workflow.js';

describe('markdownExport', () => {
  const mockMeeting: ExportableMeeting = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Q3 Planning Session',
    language: 'vi',
    state: 'finalized',
    createdAt: '2026-09-10T10:00:00.000Z',
    startedAt: '2026-09-10T10:01:00.000Z',
    endedAt: '2026-09-10T10:45:00.000Z',
    captureSources: ['mic', 'system'],
    timezone: 'Asia/Ho_Chi_Minh',
  };

  const mockSegments: TranscriptSegment[] = [
    { startMs: 0, endMs: 2500, text: 'Bắt đầu cuộc họp.', speaker: 'Alice' },
    { startMs: 3000, endMs: 6500, text: 'Mục tiêu quý 3 rất rõ ràng.' },
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats meeting metadata and transcript segments into clean Markdown', () => {
    const md = formatMeetingMarkdown(mockMeeting, mockSegments);

    expect(md).toContain('# Q3 Planning Session');
    expect(md).toContain('## Meeting Overview');
    expect(md).toContain('- **Meeting ID:** `550e8400-e29b-41d4-a716-446655440000`');
    expect(md).toContain('- **State:** `finalized`');
    expect(md).toContain('- **Language:** VI');
    expect(md).toContain('- **Capture Sources:** mic, system');
    expect(md).toContain('## Source Transcript');
    expect(md).toContain('[00:00 - 00:02] **Alice**: Bắt đầu cuộc họp.');
    expect(md).toContain('[00:03 - 00:06] Mục tiêu quý 3 rất rõ ràng.');
    expect(md).toContain('## Integrity & Durability');
    expect(md).toContain('Source transcript and audio recordings are immutable.');
  });

  it('handles meeting without segments gracefully with placeholder notice', () => {
    const md = formatMeetingMarkdown(mockMeeting, []);
    expect(md).toContain('_No transcript recorded or transcript not yet generated._');
  });

  it('generates sanitized, filesystem-safe filename', () => {
    const filename = generateExportFilename(mockMeeting);
    expect(filename).toBe('q3_planning_session_550e8400.md');

    // Edge cases: empty title, symbols
    expect(
      generateExportFilename({
        ...mockMeeting,
        id: '12345678-abcd',
        title: '!!! Special $$$ Characters ???',
      }),
    ).toBe('special_characters_12345678.md');

    expect(
      generateExportFilename({
        ...mockMeeting,
        id: 'abcdef12',
        title: '',
      }),
    ).toBe('meeting_abcdef12.md');
  });

  it('exports markdown successfully using injected download handler', () => {
    const saveMock = vi.fn().mockReturnValue(true);
    const result = exportMeetingMarkdown(mockMeeting, mockSegments, saveMock);

    expect(saveMock).toHaveBeenCalledWith('q3_planning_session_550e8400.md', expect.any(String));
    expect(result.success).toBe(true);
    expect(result.filename).toBe('q3_planning_session_550e8400.md');
    expect(result.error).toBeUndefined();
  });

  it('reports failed export when download handler returns false or throws', () => {
    // When handler returns false
    const saveMockFalse = vi.fn().mockReturnValue(false);
    const resultFalse = exportMeetingMarkdown(mockMeeting, mockSegments, saveMockFalse);

    expect(resultFalse.success).toBe(false);
    expect(resultFalse.error).toContain('Failed to save Markdown file to local disk.');

    // When handler throws an error
    const saveMockThrow = vi.fn().mockImplementation(() => {
      throw new Error('Permission denied');
    });
    const resultThrow = exportMeetingMarkdown(mockMeeting, mockSegments, saveMockThrow);

    expect(resultThrow.success).toBe(false);
    expect(resultThrow.error).toContain('Failed to save Markdown file to local disk.');
  });

  it('defaultDownloadHandler returns false when window/document are undefined', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('window', undefined);

    const handled = defaultDownloadHandler('test.md', '# Test');
    expect(handled).toBe(false);
  });

  it('defaultDownloadHandler triggers DOM download when document and window are defined', () => {
    const appendChildMock = vi.fn();
    const removeChildMock = vi.fn();
    const clickMock = vi.fn();

    const fakeAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: clickMock,
    };

    const fakeDocument = {
      createElement: vi.fn().mockReturnValue(fakeAnchor),
      body: {
        appendChild: appendChildMock,
        removeChild: removeChildMock,
      },
    };

    const fakeUrl = {
      createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/test'),
      revokeObjectURL: vi.fn(),
    };

    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('window', {});
    vi.stubGlobal('URL', fakeUrl);

    const handled = defaultDownloadHandler('test.md', '# Test Content');
    expect(handled).toBe(true);
    expect(fakeAnchor.download).toBe('test.md');
    expect(fakeAnchor.href).toBe('blob:http://localhost/test');
    expect(appendChildMock).toHaveBeenCalledWith(fakeAnchor);
    expect(clickMock).toHaveBeenCalled();
    expect(removeChildMock).toHaveBeenCalledWith(fakeAnchor);
    expect(fakeUrl.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test');
  });
});
