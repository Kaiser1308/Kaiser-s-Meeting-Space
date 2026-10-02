import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('@kms/desktop', () => {
  it('has main entry point', () => {
    expect(existsSync(resolve(__dirname, 'main.tsx'))).toBe(true);
  });

  it('has styles', () => {
    expect(existsSync(resolve(__dirname, 'styles.css'))).toBe(true);
  });

  it('has vitest configured', () => {
    expect(existsSync(resolve(__dirname, '..', 'vitest.config.ts'))).toBe(true);
  });

  describe('M3 Task 3: end meeting integration, health indicators, and session evidence', () => {
    const mainContent = readFileSync(resolve(__dirname, 'main.tsx'), 'utf-8');

    it('imports endPhysicalMeeting, EndMeetingError, and EndPhysicalMeetingResult from end-meeting-workflow', () => {
      expect(mainContent).toMatch(
        /import\s*\{[^}]*endPhysicalMeeting[^}]*EndMeetingError[^}]*\}\s*from\s*['"]\.\/end-meeting-workflow\.js['"]/,
      );
      expect(mainContent).toContain('EndPhysicalMeetingResult');
    });

    it('manages stopError and lastSessionSummary states and resets them on meeting start', () => {
      expect(mainContent).toContain(
        'const [stopError, setStopError] = useState<string | null>(null);',
      );
      expect(mainContent).toContain('const [lastSessionSummary, setLastSessionSummary] =');
      // Reset on physical start
      expect(mainContent).toMatch(/setStopError\(null\);\s*setLastSessionSummary\(null\);/);
    });

    it('wires endPhysicalMeeting in handleEndMeeting with active meeting ID check and logging', () => {
      expect(mainContent).toContain("log('Cannot end meeting: no active meeting ID.');");
      expect(mainContent).toContain("log('Stopping physical capture and finalizing meeting...');");
      expect(mainContent).toContain('await endPhysicalMeeting(');
      expect(mainContent).toContain('checkRecoveryInbox();');
    });

    it('maps EndMeetingError codes to honest user feedback banners', () => {
      expect(mainContent).toContain(
        'Capture stopped with an error. Audio data is preserved locally.',
      );
      expect(mainContent).toContain(
        'Local capture stopped, but meeting finalization failed in the API.',
      );
      expect(mainContent).toContain('An error occurred while ending the meeting.');
    });

    it('renders capture health indicators during active recording state', () => {
      expect(mainContent).toContain("state === 'recording'");
      expect(mainContent).toContain('MIC LEVEL ({micLevel}%)');
      expect(mainContent).toContain('micGapCount');
      expect(mainContent).toContain('sysGapCount');
      expect(mainContent).toContain('driftSamples');
    });

    it('renders session evidence card with chunk counts, commit status, finalized timestamp, and immutability notice', () => {
      expect(mainContent).toContain('lastSessionSummary');
      expect(mainContent).toContain('lastSessionSummary.meetingId');
      expect(mainContent).toContain('lastSessionSummary.totalMicChunks');
      expect(mainContent).toContain('lastSessionSummary.totalSysChunks');
      expect(mainContent).toContain('lastSessionSummary.commitStatus');
      expect(mainContent).toContain('lastSessionSummary.finalizedAt');
      expect(mainContent).toContain(
        'All audio chunks committed locally. Source audio is immutable.',
      );
    });

    it('exports App component and safely mounts root only when document is present', async () => {
      expect(mainContent).toContain('export function App()');
      expect(mainContent).toContain(
        "typeof document !== 'undefined' ? document.getElementById('root') : null",
      );
      const { App } = await import('./main.js');
      expect(typeof App).toBe('function');
    });
  });

  describe('M4 Task 3: post-recording transcription workflow, prerequisite banner, and immutable transcript card', () => {
    const mainContent = readFileSync(resolve(__dirname, 'main.tsx'), 'utf-8');

    it('imports transcribeMeeting, TranscriptionWorkflowError, and type TranscriptSegment from transcription-workflow', () => {
      expect(mainContent).toMatch(
        /import\s*\{[^}]*transcribeMeeting[^}]*TranscriptionWorkflowError[^}]*TranscriptSegment[^}]*\}\s*from\s*['"]\.\/transcription-workflow\.js['"]/,
      );
    });

    it('manages transcriptState, transcriptSegments, and transcriptDiagnostic states and resets them on meeting start', () => {
      expect(mainContent).toContain('const [transcriptState, setTranscriptState] = useState<');
      expect(mainContent).toContain(
        'const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);',
      );
      expect(mainContent).toContain(
        'const [transcriptDiagnostic, setTranscriptDiagnostic] = useState<string | null>(null);',
      );
      expect(mainContent).toContain("setTranscriptState('idle');");
      expect(mainContent).toContain('setTranscriptSegments([]);');
      expect(mainContent).toContain('setTranscriptDiagnostic(null);');
    });

    it('implements handleTranscribeMeeting calling transcribeMeeting and setting transcribing and completion states', () => {
      expect(mainContent).toContain('const handleTranscribeMeeting = async () => {');
      expect(mainContent).toContain("setTranscriptState('transcribing');");
      expect(mainContent).toContain('setTranscriptDiagnostic(null);');
      expect(mainContent).toContain('await transcribeMeeting(');
      expect(mainContent).toContain('setTranscriptSegments(result.segments);');
      expect(mainContent).toContain("setTranscriptState('completed');");
      expect(mainContent).toContain("setTranscriptState('failed');");
      expect(mainContent).toContain('if (err instanceof TranscriptionWorkflowError) {');
      expect(mainContent).toContain('setTranscriptDiagnostic(err.message);');
      expect(mainContent).toContain(
        "setTranscriptDiagnostic('An unexpected error occurred during transcription.');",
      );
    });

    it('renders Transcribe meeting (Local Whisper) button when session summary exists and disables during transcribing', () => {
      expect(mainContent).toContain('lastSessionSummary &&');
      expect(mainContent).toContain('Transcribe meeting (Local Whisper)');
      expect(mainContent).toContain('onClick={handleTranscribeMeeting}');
      expect(mainContent).toContain("disabled={transcriptState === 'transcribing'}");
    });

    it('renders progress indicator when transcriptState is transcribing', () => {
      expect(mainContent).toContain("transcriptState === 'transcribing'");
      expect(mainContent).toContain('Running local Whisper model inference...');
    });

    it('renders diagnostic prerequisite banner when transcriptDiagnostic is not null', () => {
      expect(mainContent).toContain('transcriptDiagnostic && (');
      expect(mainContent).toContain('role="alert"');
      expect(mainContent).toContain('className="diagnostic-banner"');
      expect(mainContent).toContain('Transcription Prerequisite:');
      expect(mainContent).toContain('{transcriptDiagnostic}');
    });

    it('renders immutable source transcript card with language badge, notice, and segments', () => {
      expect(mainContent).toContain('transcriptSegments.length > 0 && (');
      expect(mainContent).toContain('data-testid="source-transcript-card"');
      expect(mainContent).toContain('SOURCE TRANSCRIPT (LOCAL MODEL)');
      expect(mainContent).toContain('meetingLanguage.toUpperCase()');
      expect(mainContent).toContain('Read-only. Source transcript is immutable.');
      expect(mainContent).toContain('className="transcript-segments"');
      expect(mainContent).toContain('className="transcript-segment"');
      expect(mainContent).toContain('Math.floor(seg.startMs / 1000)');
      expect(mainContent).toContain('Math.floor(seg.endMs / 1000)');
      expect(mainContent).toContain('{seg.speaker &&');
      expect(mainContent).toContain('{seg.text}');
    });
  });

  describe('M5 Task 4: Personal Library view, meeting reopen, and Markdown export', () => {
    const mainContent = readFileSync(resolve(__dirname, 'main.tsx'), 'utf-8');

    it('imports listLocalMeetings, saveTranscript, exportMeetingMarkdown', () => {
      expect(mainContent).toContain('MeetingSummary');
      expect(mainContent).toContain('MeetingDetailResult');
      expect(mainContent).toMatch(
        /import\s*\{[^}]*saveTranscript[^}]*getTranscript[^}]*\}\s*from\s*['"]\.\/transcript-storage\.js['"]/,
      );
      expect(mainContent).toMatch(
        /import\s*\{[^}]*exportMeetingMarkdown[^}]*ExportableMeeting[^}]*\}\s*from\s*['"]\.\/markdown-export\.js['"]/,
      );
      expect(mainContent).toContain('meetingApi.listLocalMeetings');
      expect(mainContent).toContain('meetingApi.getLocalMeeting');
    });

    it('manages activeTab, libraryMeetings, selectedMeeting, exportStatus, and exportError', () => {
      expect(mainContent).toContain(
        "const [activeTab, setActiveTab] = useState<'record' | 'library'>('record');",
      );
      expect(mainContent).toContain(
        'const [libraryMeetings, setLibraryMeetings] = useState<MeetingSummary[]>([]);',
      );
      expect(mainContent).toContain(
        'const [libraryLoading, setLibraryLoading] = useState<boolean>(false);',
      );
      expect(mainContent).toContain(
        'const [libraryError, setLibraryError] = useState<string | null>(null);',
      );
      expect(mainContent).toContain(
        'const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetailResult | null>(null);',
      );
      expect(mainContent).toContain(
        'const [exportStatus, setExportStatus] = useState<string | null>(null);',
      );
      expect(mainContent).toContain(
        'const [exportError, setExportError] = useState<string | null>(null);',
      );
    });

    it('renders tab buttons for Record and Library', () => {
      expect(mainContent).toContain("activeTab === 'record' ? 'tab-btn active' : 'tab-btn'");
      expect(mainContent).toContain("activeTab === 'library' ? 'tab-btn active' : 'tab-btn'");
      expect(mainContent).toContain("onClick={() => setActiveTab('record')}");
      expect(mainContent).toContain("setActiveTab('library');");
      expect(mainContent).toContain('fetchLibrary();');
    });

    it("renders library container when activeTab === 'library'", () => {
      expect(mainContent).toContain("activeTab === 'library' && (");
      expect(mainContent).toContain('data-testid="meeting-library"');
      expect(mainContent).toContain('LOCAL MEETING LIBRARY');
      expect(mainContent).toContain('onClick={fetchLibrary}');
      expect(mainContent).toContain('data-testid="library-meeting-item"');
      expect(mainContent).toContain('data-testid="open-meeting-btn"');
      expect(mainContent).toContain('View / Reopen');
    });

    it('renders Export Markdown button and handles export status / error', () => {
      expect(mainContent).toContain('const handleExportMarkdown = () => {');
      expect(mainContent).toContain('exportMeetingMarkdown(targetMeeting, transcriptSegments);');
      expect(mainContent).toContain('data-testid="export-markdown-btn"');
      expect(mainContent).toContain('onClick={handleExportMarkdown}');
      expect(mainContent).toContain('Exported ${res.filename} successfully.');
      expect(mainContent).toContain('exportStatus && (');
      expect(mainContent).toContain('exportError && (');
    });

    it('reopens meeting and restores persisted transcript segments', () => {
      expect(mainContent).toContain('const handleOpenMeeting = async (meetingId: string) => {');
      expect(mainContent).toContain('await meetingApi.getLocalMeeting(meetingId)');
      expect(mainContent).toContain('setSelectedMeeting(detail)');
      expect(mainContent).toContain('getTranscript(meetingId)');
      expect(mainContent).toContain('setTranscriptSegments(cached)');
      expect(mainContent).toContain("setTranscriptState('completed')");
      expect(mainContent).toContain('data-testid="selected-meeting-card"');
      expect(mainContent).toContain('{selectedMeeting && (');
      expect(mainContent).toContain('{selectedMeeting.id}');
      expect(mainContent).toContain('{selectedMeeting.state}');
    });

    it('persists transcript segments with saveTranscript when transcription completes', () => {
      expect(mainContent).toContain('if (selectedMeeting) {');
      expect(mainContent).toContain('saveTranscript(selectedMeeting.id, result.segments);');
      expect(mainContent).toContain('if (lastSessionSummary) {');
      expect(mainContent).toContain(
        'saveTranscript(lastSessionSummary.meetingId, result.segments);',
      );
    });
  });
});
