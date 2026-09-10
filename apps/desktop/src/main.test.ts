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
});
