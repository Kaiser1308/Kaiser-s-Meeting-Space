import { describe, expect, it } from 'vitest';
import { renderAudioPackageManifest, renderDocx, renderJson, renderMarkdown, renderPdf, renderText, validateExportInput } from './renderers.js';
const input = {
  title: 'Synthetic',
  locale: 'vi' as const,
  sections: [{ heading: 'Discussion', content: 'Safe content' }],
};
describe('deterministic simple exporters', () => {
  it('renders markdown/text/json with stable semantics', () => {
    const markdown = renderMarkdown(input);
    expect(markdown.format).toBe('markdown');
    expect(markdown.body).toContain('# Synthetic');
    expect(renderText(input).body).toContain('Safe content');
    expect(JSON.parse(renderJson(input).body)).toEqual(input);
  });

  it('renders an authorized audio package manifest in stable track order', () => {
    const artifact = renderAudioPackageManifest({
      tracks: [
        { source: 'system', storageKey: 'audio/m/system/1.webm', sha256: 'b'.repeat(64) },
        { source: 'mic', storageKey: 'audio/m/mic/0.webm', sha256: 'a'.repeat(64) },
      ],
      gaps: [{ source: 'mic', startMs: 20, endMs: 40 }],
    });
    expect(artifact.format).toBe('audio');
    expect(JSON.parse(artifact.body).tracks[0].source).toBe('mic');
  });

  it('renders a deterministic internal-only DOCX package', () => {
    const artifact = renderDocx({
      title: 'Biên bản tổng hợp',
      locale: 'vi',
      sections: [{ heading: 'Quyết định', content: 'Nội dung tổng hợp' }],
    });
    expect(artifact.format).toBe('docx');
    expect(artifact.contentType).toContain('wordprocessingml.document');
    expect(artifact.body).toBe(renderDocx({
      title: 'Biên bản tổng hợp',
      locale: 'vi',
      sections: [{ heading: 'Quyết định', content: 'Nội dung tổng hợp' }],
    }).body);
    const packageText = Buffer.from(artifact.body, 'base64').toString('utf8');
    expect(packageText).toContain('word/document.xml');
    expect(packageText).not.toMatch(/Target="External"|Target="https?:\/\//i);
  });

  it('renders a deterministic self-contained PDF document', () => {
    const input = { title: 'Synthetic PDF', locale: 'en' as const, sections: [{ heading: 'Summary', content: 'Safe content' }] };
    const artifact = renderPdf(input);
    expect(artifact.format).toBe('pdf');
    const pdf = Buffer.from(artifact.body, 'base64').toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('%%EOF');
    expect(pdf).toContain('Synthetic PDF');
    expect(renderPdf(input).body).toBe(artifact.body);
  });

  it('rejects oversized or deeply fragmented documents before rendering', () => {
    expect(validateExportInput({ title: 'x', locale: 'en', sections: Array.from({ length: 101 }, () => ({ heading: 'h', content: 'c' })) })).toEqual({
      ok: false,
      reason: 'too many sections',
    });
    expect(() => renderPdf({ title: 'x', locale: 'en', sections: [{ heading: 'h', content: 'x'.repeat(1_000_001) }] })).toThrow('export input is too large');
  });
});
