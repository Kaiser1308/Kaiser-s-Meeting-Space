import type { TranscriptSegment } from './transcription-workflow.js';

export interface ExportableMeeting {
  id: string;
  title: string;
  language: 'vi' | 'en';
  state: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  captureSources?: Array<'mic' | 'system'>;
  timezone?: string;
}

export type DownloadHandler = (filename: string, content: string) => boolean;

export interface ExportResult {
  success: boolean;
  filename: string;
  markdown: string;
  error?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function generateExportFilename(meeting: ExportableMeeting): string {
  const sanitized =
    (meeting.title || 'meeting')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'meeting';
  const shortId = (meeting.id || 'export').slice(0, 8);
  return `${sanitized}_${shortId}.md`;
}

export function formatMeetingMarkdown(
  meeting: ExportableMeeting,
  segments: TranscriptSegment[],
): string {
  const sections: string[] = [];

  // Title
  sections.push(`# ${meeting.title || 'Meeting'}`);

  // Overview
  sections.push(`## Meeting Overview
- **Meeting ID:** \`${meeting.id}\`
- **State:** \`${meeting.state}\`
- **Created At:** ${meeting.createdAt}
- **Ended At:** ${meeting.endedAt || 'N/A'}
- **Language:** ${(meeting.language || 'en').toUpperCase()}
- **Timezone:** ${meeting.timezone || 'UTC'}
- **Capture Sources:** ${(meeting.captureSources || []).join(', ') || 'mic'}`);

  // Transcript
  sections.push(`## Source Transcript`);
  if (!segments || segments.length === 0) {
    sections.push(`_No transcript recorded or transcript not yet generated._`);
  } else {
    const transcriptLines = segments.map((seg) => {
      const timeTag = `[${formatDuration(seg.startMs)} - ${formatDuration(seg.endMs)}]`;
      const speakerTag = seg.speaker ? `**${seg.speaker}**: ` : '';
      return `${timeTag} ${speakerTag}${seg.text}`;
    });
    sections.push(transcriptLines.join('\n\n'));
  }

  // Integrity Notice
  sections.push(`## Integrity & Durability
Source transcript and audio recordings are immutable. Export generated offline by Kaiser's Meeting Space.`);

  return sections.join('\n\n') + '\n';
}

export function defaultDownloadHandler(filename: string, content: string): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function exportMeetingMarkdown(
  meeting: ExportableMeeting,
  segments: TranscriptSegment[],
  saveFn?: DownloadHandler,
): ExportResult {
  const filename = generateExportFilename(meeting);
  const markdown = formatMeetingMarkdown(meeting, segments);
  const handler = saveFn ?? defaultDownloadHandler;

  try {
    const saved = handler(filename, markdown);
    if (!saved) {
      return {
        success: false,
        filename,
        markdown,
        error: 'Failed to save Markdown file to local disk.',
      };
    }
    return {
      success: true,
      filename,
      markdown,
    };
  } catch {
    return {
      success: false,
      filename,
      markdown,
      error: 'Failed to save Markdown file to local disk.',
    };
  }
}
