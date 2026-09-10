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
});
