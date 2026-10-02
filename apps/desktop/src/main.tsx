import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { NativeBridgeClient, type NativeIpcTransport } from '@kms/native-contract';
import { MeetingApiError, type MeetingSummary, type MeetingDetailResult } from './meeting-api.js';
import { createLocalMeetingStore } from './local-meeting-store.js';
import { saveTranscript, getTranscript } from './transcript-storage.js';
import { exportMeetingMarkdown, type ExportableMeeting } from './markdown-export.js';
import { startPhysicalMeeting, StartMeetingError } from './start-meeting-workflow.js';
import {
  endPhysicalMeeting,
  EndMeetingError,
  type EndPhysicalMeetingResult,
} from './end-meeting-workflow.js';
import {
  transcribeMeeting,
  TranscriptionWorkflowError,
  type TranscriptSource,
  type TranscriptSegment,
} from './transcription-workflow.js';
import { headsetCompatibilityWarning } from './headset-compatibility.js';
import type { LocalModelId, SpeechLanguage } from './local-speech-models.js';
import type { LocalModelSnapshot } from './main/local-model-manager.js';
import { LocalModelManagerPanel } from './local-model-manager-panel.js';
import './styles.css';

type Mode = 'record' | 'translate';
type RuntimeStatus = 'offline' | 'connecting' | 'healthy' | 'crashed';

// Safely resolve the preload API
const kmsNativeApi =
  typeof window !== 'undefined'
    ? (window as unknown as { kmsNative?: NativeIpcTransport }).kmsNative
    : undefined;
const nativeClient = kmsNativeApi ? new NativeBridgeClient(kmsNativeApi) : null;
type KmsModelsApi = {
  listModels(): Promise<readonly LocalModelSnapshot[]>;
  getPreferredModel(language: SpeechLanguage): Promise<LocalModelId>;
  setPreferredModel(language: SpeechLanguage, modelId: LocalModelId): Promise<void>;
  download(modelId: LocalModelId): Promise<void>;
  remove(modelId: LocalModelId): Promise<void>;
  onProgress(callback: (snapshot: LocalModelSnapshot) => void): () => void;
};

const kmsModelsApi =
  typeof window !== 'undefined'
    ? (window as unknown as { kmsModels?: KmsModelsApi }).kmsModels
    : undefined;
const meetingApi = createLocalMeetingStore();
const meetingLanguage: 'vi' | 'en' =
  typeof navigator !== 'undefined' && navigator.language?.startsWith('vi') ? 'vi' : 'en';
const meetingTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

interface IncompleteSession {
  meetingId: string;
  source: string;
  chunkIndex: number;
  filePath: string;
  uploadStatus: string;
}

export function App() {
  const [mode, setMode] = useState<Mode>('record');
  const [state, setState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('offline');
  const [apiStatus, setApiStatus] = useState<'checking' | 'healthy' | 'offline'>('checking');
  const [uptime, setUptime] = useState<number>(0);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [incompleteSessions, setIncompleteSessions] = useState<IncompleteSession[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [meetingTitle, setMeetingTitle] = useState('New meeting');
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [lastSessionSummary, setLastSessionSummary] = useState<EndPhysicalMeetingResult | null>(
    null,
  );
  const [transcriptState, setTranscriptState] = useState<
    'idle' | 'transcribing' | 'completed' | 'failed'
  >('idle');
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptSourceMetrics, setTranscriptSourceMetrics] = useState<{
    durationMs: number;
    chunksTranscribed: number;
  } | null>(null);
  const [transcriptDiagnostic, setTranscriptDiagnostic] = useState<string | null>(null);
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource>('microphone');
  const [activeTab, setActiveTab] = useState<'record' | 'library'>('record');
  const [libraryMeetings, setLibraryMeetings] = useState<MeetingSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState<boolean>(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetailResult | null>(null);
  const [activeMeetingRecord, setActiveMeetingRecord] = useState<MeetingDetailResult | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<readonly LocalModelSnapshot[]>([]);
  const [localModelError, setLocalModelError] = useState<string | null>(null);

  // Capture mode configuration
  const [captureType, setCaptureType] = useState<'physical' | 'simulated'>('physical');
  const [physicalMics, setPhysicalMics] = useState<any[]>([]);
  const [physicalSys, setPhysicalSys] = useState<any[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [selectedSysId, setSelectedSysId] = useState<string>('default');

  // Real-time levels and alignment metrics
  const [micLevel, setMicLevel] = useState<number>(0);
  const [sysLevel, setSysLevel] = useState<number>(0);
  const [micGapCount, setMicGapCount] = useState<number>(0);
  const [sysGapCount, setSysGapCount] = useState<number>(0);
  const [driftSamples, setDriftSamples] = useState<number>(0);
  const [micOverflowCount, setMicOverflowCount] = useState<number>(0);
  const [sysOverflowCount, setSysOverflowCount] = useState<number>(0);
  const [micDiagnosticCount, setMicDiagnosticCount] = useState<number>(0);
  const [sysDiagnosticCount, setSysDiagnosticCount] = useState<number>(0);

  // Add structured log message
  const log = (msg: string) => {
    setLogMessages((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Monitor native runtime health and query state
  useEffect(() => {
    if (!nativeClient) {
      log('Preload IPC bridge not found. Running in demo/mock mode.');
      return;
    }

    let active = true;
    log('Connecting to native runtime supervisor...');
    setRuntimeStatus('connecting');

    const checkHealth = async () => {
      try {
        const resp = await nativeClient.healthCheck();
        if (!active) return;

        if (resp.success) {
          const payload = resp.payload as Record<string, unknown>;
          setRuntimeStatus('healthy');
          setUptime(payload.uptimeMs as number);
          setIsSimulated(payload.simulatorActive as boolean);
        } else {
          setRuntimeStatus('crashed');
        }
      } catch {
        if (active) {
          setRuntimeStatus('offline');
        }
      }
    };

    // Initial check
    checkHealth();
    const timer = setInterval(checkHealth, 5000);

    // Subscribe to runtime events
    const unsubscribe = nativeClient.onEvent((evt: unknown) => {
      const event = evt as { eventType: string; payload?: Record<string, unknown> };
      log(`Received event: ${event.eventType} - ${JSON.stringify(event.payload ?? {})}`);
      if (event.eventType === 'runtime_ready') {
        setRuntimeStatus('healthy');
      } else if (event.eventType === 'device_event') {
        fetchPhysicalDevices();
      }
    });

    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!kmsModelsApi) return;
    let active = true;
    kmsModelsApi.listModels().then(
      (models) => { if (active) setLocalModels(models); },
      () => { if (active) setLocalModelError('Could not load local speech models.'); },
    );
    const unsubscribe = kmsModelsApi.onProgress((snapshot) => {
      if (!active) return;
      setLocalModels((models) => models.map((model) => model.modelId === snapshot.modelId ? snapshot : model));
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const downloadLocalModel = async (modelId: LocalModelId) => {
    if (!kmsModelsApi) return;
    setLocalModelError(null);
    try {
      await kmsModelsApi.download(modelId);
    } catch {
      setLocalModelError('Model download failed. Check storage and network, then try again.');
    }
  };

  const selectLocalModel = async (language: SpeechLanguage, modelId: LocalModelId) => {
    if (!kmsModelsApi) return;
    setLocalModelError(null);
    try {
      await kmsModelsApi.setPreferredModel(language, modelId);
      setLocalModels(await kmsModelsApi.listModels());
    } catch {
      setLocalModelError('Could not select this local model.');
    }
  };

  const removeLocalModel = async (modelId: LocalModelId) => {
    if (!kmsModelsApi || !window.confirm('Remove this local model from this device?')) return;
    setLocalModelError(null);
    try {
      await kmsModelsApi.remove(modelId);
    } catch {
      setLocalModelError('Could not remove this local model.');
    }
  };

  // Monitor local meeting API connectivity
  useEffect(() => {
    let active = true;
    const checkApi = async () => {
      try {
        await meetingApi.listLocalMeetings({ limit: 1 });
        if (active) setApiStatus('healthy');
      } catch {
        if (active) setApiStatus('offline');
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Fetch physical devices
  const fetchPhysicalDevices = async () => {
    if (!nativeClient || runtimeStatus !== 'healthy') return;
    try {
      const resp = await nativeClient.send('device_enumerate');
      if (resp.success && Array.isArray(resp.payload)) {
        const devs = resp.payload;
        setPhysicalMics(devs.filter((d: any) => d.deviceType === 'microphone'));
        setPhysicalSys(devs.filter((d: any) => d.deviceType === 'system_audio'));
        log(`Loaded ${devs.length} physical audio devices.`);
      }
    } catch (err) {
      log(`Failed to fetch physical devices: ${err}`);
    }
  };

  // Fetch devices based on capture type
  useEffect(() => {
    if (!nativeClient || runtimeStatus !== 'healthy') return;

    if (captureType === 'physical') {
      fetchPhysicalDevices();
    } else {
      const fetchSimulatedDevices = async () => {
        try {
          await nativeClient.send('simulator_configure', { seed: 42, deviceCount: 2 });
          const resp = await nativeClient.send('simulator_enumerate_devices');
          const payload = resp.payload as Record<string, unknown>;
          if (resp.success && payload.devices) {
            setDevices(payload.devices as any[]);
            log(`Loaded ${(payload.devices as any[]).length} simulated devices.`);
          }
        } catch (err) {
          log(`Failed to fetch simulated devices: ${err}`);
        }
      };
      fetchSimulatedDevices();
    }
  }, [captureType, runtimeStatus]);

  // Poll level meters and alignment metrics during active capture
  useEffect(() => {
    if (!nativeClient || state !== 'recording' || captureType !== 'physical') {
      setMicLevel(0);
      setSysLevel(0);
      return;
    }

    const pollMetrics = async () => {
      try {
        const resp = await nativeClient.send('capture_get_state');
        if (resp.success && resp.payload) {
          const metrics = resp.payload as any;
          setMicLevel(Math.round((metrics.mic?.peak ?? 0) * 100));
          setSysLevel(Math.round((metrics.sys?.peak ?? 0) * 100));
          setMicGapCount(metrics.mic?.sourceGapCount ?? metrics.mic?.gapCount ?? 0);
          setSysGapCount(metrics.sys?.sourceGapCount ?? metrics.sys?.gapCount ?? 0);
          setMicOverflowCount(metrics.mic?.overflowCount ?? 0);
          setSysOverflowCount(metrics.sys?.overflowCount ?? 0);
          setMicDiagnosticCount(metrics.mic?.diagnosticCount ?? 0);
          setSysDiagnosticCount(metrics.sys?.diagnosticCount ?? 0);
          setDriftSamples(metrics.driftSamples ?? 0);
        }
      } catch {
        // ignore polling errors
      }
    };

    const interval = setInterval(pollMetrics, 200);
    return () => {
      clearInterval(interval);
    };
  }, [state, captureType]);

  // Load incomplete sessions for recovery inbox
  const checkRecoveryInbox = async () => {
    if (!nativeClient || runtimeStatus !== 'healthy') return;
    try {
      const resp = await nativeClient.send('manifest_get_incomplete', {
        meetingId: 'active-session',
      });
      const payload = resp.payload as Record<string, unknown>;
      if (resp.success && payload.entries) {
        setIncompleteSessions(payload.entries as IncompleteSession[]);
      }
    } catch (err) {
      log(`Recovery inbox check failed: ${err}`);
    }
  };

  useEffect(() => {
    checkRecoveryInbox();
  }, [runtimeStatus]);

  const handleStartMeeting = async () => {
    try {
      const title = meetingTitle.trim();
      if (!title) {
        setStartError('Enter a meeting title.');
        return;
      }

      if (captureType === 'physical') {
        if (!nativeClient) {
          setState('idle');
          setCurrentMeetingId(null);
          setStartError('Local capture runtime is unavailable.');
          return;
        }
        log('Starting physical audio capture session...');
        const { meetingId } = await startPhysicalMeeting(
          { api: meetingApi, native: nativeClient },
          {
            title,
            language: meetingLanguage,
            timezone: meetingTimezone,
            micDeviceId: selectedMicId,
            systemDeviceId: selectedSysId,
          },
        );
        setCurrentMeetingId(meetingId);
        try {
          const detail = await meetingApi.getLocalMeeting(meetingId);
          setActiveMeetingRecord(detail);
        } catch {
          // ignore
        }
        setState('recording');
        setStartError(null);
        setStopError(null);
        setLastSessionSummary(null);
        setTranscriptState('idle');
        setTranscriptSegments([]);
        setTranscriptSourceMetrics(null);
        setTranscriptDiagnostic(null);
        log('Physical capture started successfully.');
      } else {
        if (!nativeClient) {
          setState('idle');
          setCurrentMeetingId(null);
          setStartError('Local capture runtime is unavailable.');
          return;
        }
        log('Starting simulated capture session...');
        const storage = await nativeClient.send('storage_init');
        if (!storage.success) {
          setState('idle');
          setCurrentMeetingId(null);
          setStartError('Failed to initialize simulated capture storage.');
          return;
        }
        const resp = await nativeClient.send('simulator_start_capture');
        if (resp.success) {
          const payload = resp.payload as Record<string, unknown>;
          setState('recording');
          setStartError(null);
          setStopError(null);
          setLastSessionSummary(null);
          setTranscriptState('idle');
          setTranscriptSegments([]);
          setTranscriptSourceMetrics(null);
          setTranscriptDiagnostic(null);
          log(`Capture started. Session ID: ${payload.sessionId}`);

          // Add entry to manifest for durability tracking
          await nativeClient.send('manifest_add_entry', {
            meetingId: 'active-session',
            source: 'sim-device-000',
            chunkIndex: 0,
            filePath: 'chunks/chunk_000.webm',
            sha256: '0000000000000000000000000000000000000000000000000000000000000000',
            byteLength: 1024,
          });
        } else {
          setState('idle');
          setCurrentMeetingId(null);
          setStartError('Failed to start simulated capture.');
        }
      }
    } catch (err) {
      setState('idle');
      setCurrentMeetingId(null);
      if (err instanceof MeetingApiError) {
        setStartError(
          err.code === 'API_UNAVAILABLE'
            ? 'Local meeting service is unavailable.'
            : 'Local meeting service returned an invalid response.',
        );
      } else if (err instanceof StartMeetingError) {
        setStartError('Meeting started in the service but local capture did not start.');
      } else {
        setStartError('Meeting started in the service but local capture did not start.');
      }
      log(`Failed to start capture: ${err}`);
    }
  };

  const handleEndMeeting = async () => {
    if (!nativeClient) {
      setState('idle');
      log('Ended mock recording session.');
      return;
    }

    try {
      if (captureType === 'physical') {
        if (!currentMeetingId) {
          log('Cannot end meeting: no active meeting ID.');
          setState('idle');
          return;
        }
        log('Stopping physical capture and finalizing meeting...');
        const result = await endPhysicalMeeting(
          { api: meetingApi, native: nativeClient! },
          { meetingId: currentMeetingId },
        );
        setState('idle');
        setCurrentMeetingId(null);
        setStopError(null);
        setLastSessionSummary(result);
        try {
          const detail = await meetingApi.getLocalMeeting(result.meetingId);
          setActiveMeetingRecord(detail);
        } catch {
          // ignore
        }
        log(
          `Meeting finalized: ${result.meetingId}. Mic Chunks: ${result.totalMicChunks}, Sys Chunks: ${result.totalSysChunks}, Status: ${result.commitStatus}`,
        );
        checkRecoveryInbox();
      } else {
        log('Stopping simulated capture...');
        const resp = await nativeClient.send('simulator_stop_capture');
        if (resp.success) {
          const payload = resp.payload as Record<string, unknown>;
          setState('idle');
          log(`Capture stopped. Total chunks: ${payload.totalChunks}`);

          // Mark chunks completed
          await nativeClient.send('manifest_update_upload_status', {
            meetingId: 'active-session',
            source: 'sim-device-000',
            chunkIndex: 0,
            status: 'completed',
          });
          checkRecoveryInbox();
        }
      }
    } catch (err) {
      setState('idle');
      if (err instanceof EndMeetingError) {
        if (err.code === 'CAPTURE_STOP_FAILED') {
          setStopError('Capture stopped with an error. Audio data is preserved locally.');
        } else if (err.code === 'API_END_FAILED') {
          setStopError('Local capture stopped, but meeting finalization failed in the API.');
        }
      } else {
        setStopError('An error occurred while ending the meeting.');
      }
      log(`Failed to end meeting: ${err}`);
    }
  };

  const handleTranscribeMeeting = async () => {
    const targetMeeting = selectedMeeting ?? activeMeetingRecord;
    const targetMeetingId = targetMeeting ? targetMeeting.id : lastSessionSummary?.meetingId;
    if (!targetMeetingId || !nativeClient) return;
    if (!kmsModelsApi) {
      setTranscriptDiagnostic('Local model management is unavailable. Restart the desktop application.');
      return;
    }
    const targetLanguage = targetMeeting ? targetMeeting.language : meetingLanguage;
    setTranscriptState('transcribing');
    setTranscriptSourceMetrics(null);
    setTranscriptDiagnostic(null);
    try {
      log(`Starting post-recording transcription for meeting ${targetMeetingId}...`);
      const result = await transcribeMeeting(
        { native: nativeClient, resolveModel: (language) => kmsModelsApi.getPreferredModel(language) },
        {
          meetingId: targetMeetingId,
          language: targetLanguage,
          source: transcriptSource,
        },
      );
      setTranscriptSegments(result.segments);
      setTranscriptSourceMetrics({
        durationMs: result.durationMs,
        chunksTranscribed: result.chunksTranscribed,
      });
      setTranscriptState('completed');
      if (selectedMeeting) {
        saveTranscript(selectedMeeting.id, result.segments);
      }
      if (lastSessionSummary) {
        saveTranscript(lastSessionSummary.meetingId, result.segments);
      }
      log(`Transcription completed: ${result.segments.length} segments received.`);
    } catch (err) {
      setTranscriptState('failed');
      if (err instanceof TranscriptionWorkflowError) {
        setTranscriptDiagnostic(err.message);
      } else {
        setTranscriptDiagnostic('An unexpected error occurred during transcription.');
      }
      log(`Transcription failed: ${err}`);
    }
  };

  const fetchLibrary = async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const res = await meetingApi.listLocalMeetings({ limit: 50 });
      setLibraryMeetings(res.items);
    } catch (err) {
      setLibraryError('Failed to load local meeting library.');
      log('Failed to load library: ' + err);
    } finally {
      setLibraryLoading(false);
    }
  };

  const handleOpenMeeting = async (meetingId: string) => {
    try {
      const detail = await meetingApi.getLocalMeeting(meetingId);
      setSelectedMeeting(detail);
      setTranscriptSourceMetrics(null);
      const cached = getTranscript(meetingId);
      if (cached && cached.length > 0) {
        setTranscriptSegments(cached);
        setTranscriptState('completed');
      } else {
        setTranscriptSegments([]);
        setTranscriptState('idle');
      }
    } catch (err) {
      log('Failed to open meeting: ' + err);
    }
  };

  const handleExportMarkdown = () => {
    setExportError(null);
    setExportStatus(null);
    const targetMeeting: ExportableMeeting | null = selectedMeeting
      ? selectedMeeting
      : activeMeetingRecord
        ? activeMeetingRecord
        : lastSessionSummary
          ? {
              id: lastSessionSummary.meetingId,
              title: meetingTitle,
              language: meetingLanguage,
              state: 'finalized',
              createdAt: lastSessionSummary.finalizedAt,
              endedAt: lastSessionSummary.finalizedAt,
              captureSources: ['mic', 'system'],
              timezone: meetingTimezone,
            }
          : null;

    if (!targetMeeting) return;
    const res = exportMeetingMarkdown(targetMeeting, transcriptSegments);
    if (res.success) {
      setExportStatus(`Exported ${res.filename} successfully.`);
      log(`Exported markdown: ${res.filename}`);
    } else {
      setExportError(res.error || 'Failed to export Markdown.');
      log(`Markdown export failed: ${res.error}`);
    }
  };

  const handlePause = async () => {
    if (captureType === 'physical') {
      log(
        'Pause is not supported on physical capture (continuous monotonic timeline requirement).',
      );
      return;
    }

    if (!nativeClient) {
      setState(state === 'paused' ? 'recording' : 'paused');
      return;
    }

    try {
      const targetState = state === 'paused' ? 'resume' : 'pause';
      log(`Requesting simulator ${targetState}...`);
      const resp = await nativeClient.send('simulator_inject_event', { eventKind: targetState });
      if (resp.success) {
        setState(state === 'paused' ? 'recording' : 'paused');
        log(`Simulator ${state === 'paused' ? 'resumed' : 'paused'}.`);
      }
    } catch (err) {
      log(`Failed to change pause state: ${err}`);
    }
  };

  // Inject simulator events
  const injectEvent = async (eventKind: string) => {
    if (!nativeClient) return;
    try {
      log(`Injecting simulator event: ${eventKind}...`);
      const resp = await nativeClient.send('simulator_inject_event', {
        eventKind,
        advanceMs: 5000,
      });
      if (resp.success) {
        log(`Successfully injected: ${eventKind}. Response: ${JSON.stringify(resp.payload)}`);
        if (eventKind === 'crash') {
          setState('idle');
          setRuntimeStatus('crashed');
        }
        checkRecoveryInbox();
      }
    } catch (err) {
      log(`Failed to inject event: ${err}`);
    }
  };

  const handleRecover = async (action: 'continue' | 'finalize' | 'delete') => {
    if (!nativeClient) return;
    log(`Executing recovery inbox action: ${action}...`);
    try {
      if (action === 'delete') {
        await nativeClient.send('storage_delete', { path: 'chunks/chunk_000.webm' });
        await nativeClient.send('manifest_update_upload_status', {
          meetingId: 'active-session',
          source: 'sim-device-000',
          chunkIndex: 0,
          status: 'deleted',
        });
      } else {
        await nativeClient.send('manifest_update_upload_status', {
          meetingId: 'active-session',
          source: 'sim-device-000',
          chunkIndex: 0,
          status: 'completed',
        });
      }
      log(`Recovery action ${action} completed successfully.`);
      checkRecoveryInbox();
    } catch (err) {
      log(`Recovery action failed: ${err}`);
    }
  };

  const active = state !== 'idle';

  return (
    <main>
      <aside>
        <div className="brand">
          K<span>•</span>
        </div>
        <nav>
          <button className="selected">Meetings</button>
          <button>Templates</button>
          <button>Settings</button>
        </nav>

        {/* Runtime Diagnostics */}
        <div className="diagnostics-panel">
          <h3>NATIVE RUNTIME</h3>
          <div className="diag-row">
            <span>Status:</span>
            <strong className={`status-${runtimeStatus}`}>{runtimeStatus.toUpperCase()}</strong>
          </div>
          <div className="diag-row" style={{ marginTop: '8px' }}>
            <span>API Service:</span>
            <strong className={`status-${apiStatus}`} data-testid="api-status">
              {apiStatus.toUpperCase()}
            </strong>
          </div>
          <div className="diag-row" style={{ marginTop: '8px' }}>
            <span>Storage:</span>
            <strong className="status-healthy" data-testid="storage-status">
              LOCAL PERSISTENT
            </strong>
          </div>
          {runtimeStatus === 'healthy' && (
            <>
              <div className="diag-row">
                <span>Uptime:</span>
                <strong>{(uptime / 1000).toFixed(1)}s</strong>
              </div>
              <div className="diag-row">
                <span>Simulator:</span>
                <strong>{isSimulated ? 'ACTIVE' : 'OFFLINE'}</strong>
              </div>
            </>
          )}
        </div>
      </aside>

      <section className="page">
        {/* Recovery Inbox */}
        {incompleteSessions.length > 0 && (
          <div className="recovery-inbox">
            <div className="recovery-header">
              <span className="badge">DURABILITY RECOVERY REQUIRED</span>
              <h3>Unfinished capture session discovered</h3>
              <p>The previous recording session was interrupted. Please choose an action below.</p>
            </div>
            <div className="recovery-actions">
              <button className="btn-primary" onClick={() => handleRecover('continue')}>
                Continue
              </button>
              <button className="btn-secondary" onClick={() => handleRecover('finalize')}>
                Finalize
              </button>
              <button className="btn-danger" onClick={() => handleRecover('delete')}>
                Discard
              </button>
            </div>
          </div>
        )}

        <header>
          <div>
            <p className="eyebrow">KAISER'S MEETING SPACE</p>
            <h1>Your meetings, fully preserved.</h1>
            <p className="sub">
              Record every word. Translate live. Create evidence-linked minutes.
            </p>
          </div>
          <button className="profile">KT</button>
        </header>

        {/* Tab Navigation */}
        <div className="tab-switcher" style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button
            className={activeTab === 'record' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('record')}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid #ccd2cf',
              background: activeTab === 'record' ? '#183128' : '#fff',
              color: activeTab === 'record' ? '#fff' : '#17201d',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Record
          </button>
          <button
            className={activeTab === 'library' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => {
              setActiveTab('library');
              fetchLibrary();
            }}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid #ccd2cf',
              background: activeTab === 'library' ? '#183128' : '#fff',
              color: activeTab === 'library' ? '#fff' : '#17201d',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Library
          </button>
        </div>

        {activeTab === 'record' && (
          <div className="grid">
            <article className="start-card">
              <p className="eyebrow">NEW MEETING</p>
              <h2>Ready when you are.</h2>
              <label className="eyebrow" htmlFor="meeting-title">
                MEETING TITLE
              </label>
              <input
                id="meeting-title"
                value={meetingTitle}
                onChange={(event) => setMeetingTitle(event.target.value)}
                disabled={active}
                required
              />
              <div className="modes">
                <button
                  className={mode === 'record' ? 'active' : ''}
                  onClick={() => setMode('record')}
                >
                  <b>Record meeting</b>
                  <small>Full audio + transcript</small>
                </button>
                <button
                  className={mode === 'translate' ? 'active' : ''}
                  onClick={() => setMode('translate')}
                >
                  <b>Live translation</b>
                  <small>Vietnamese ↔ English</small>
                </button>
              </div>

              {/* Toggle group between physical hardware and simulator */}
              <div className="selector-group">
                <button
                  className={`selector-btn ${captureType === 'physical' ? 'active' : ''}`}
                  onClick={() => setCaptureType('physical')}
                  disabled={active}
                >
                  Physical Capture
                </button>
                <button
                  className={`selector-btn ${captureType === 'simulated' ? 'active' : ''}`}
                  onClick={() => setCaptureType('simulated')}
                  disabled={active}
                >
                  Simulated (P11)
                </button>
              </div>

              {/* Dropdown selectors for physical sources */}
              {captureType === 'physical' && (
                <div style={{ marginTop: '16px' }}>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>
                    MICROPHONE SOURCE
                  </label>
                  <select
                    className="device-select"
                    value={selectedMicId}
                    onChange={(e) => setSelectedMicId(e.target.value)}
                    disabled={active}
                  >
                    <option value="default">Default Input Device</option>
                    {physicalMics.map((d: any) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.deviceName}
                      </option>
                    ))}
                  </select>

                  <label className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>
                    SYSTEM AUDIO SOURCE
                  </label>
                  <select
                    className="device-select"
                    value={selectedSysId}
                    onChange={(e) => setSelectedSysId(e.target.value)}
                    disabled={active}
                  >
                    <option value="">No system audio</option>
                    <option value="default">Default Loopback Device</option>
                    {physicalSys.map((d: any) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.deviceName}
                      </option>
                    ))}
                  </select>
                {headsetCompatibilityWarning(
                  physicalMics.find((device: any) => device.deviceId === selectedMicId)?.deviceName ?? '',
                  physicalSys.find((device: any) => device.deviceId === selectedSysId)?.deviceName ?? '',
                ) && (
                  <p role="status" className="headset-warning">
                    No endpoint will be changed automatically.
                  </p>
                )}
                </div>
              )}

              {/* Simulated static devices list */}
              {captureType === 'simulated' && (
                <div className="sources">
                  <span>MICROPHONE</span>
                  <strong>
                    {devices.find((d: any) => d.device_type === 'microphone')?.device_name ||
                      'Default microphone'}
                  </strong>
                  <span>SYSTEM AUDIO</span>
                  <strong>
                    {devices.find((d: any) => d.device_type === 'system_audio')?.device_name ||
                      'Computer audio'}
                  </strong>
                </div>
              )}

              {/* Real-time capture health indicators */}
              {state === 'recording' && (
                <div className="level-meters" data-testid="capture-health-indicators">
                  <div className="level-meter-track">
                    <label>
                      MIC LEVEL ({micLevel}%) — SOURCE LOSS: {micGapCount} — OVERFLOW: {micOverflowCount} — DEVICE DIAGNOSTICS: {micDiagnosticCount}
                    </label>
                    <div className="level-meter-bar-outer">
                      <div className="level-meter-bar-inner" style={{ width: `${micLevel}%` }} />
                    </div>
                  </div>
                  <div className="level-meter-track">
                    <label>
                      SYSTEM AUDIO LEVEL ({sysLevel}%) — SOURCE LOSS: {sysGapCount} — OVERFLOW: {sysOverflowCount} — DEVICE DIAGNOSTICS: {sysDiagnosticCount}
                    </label>
                    <div className="level-meter-bar-outer">
                      <div className="level-meter-bar-inner" style={{ width: `${sysLevel}%` }} />
                    </div>
                  </div>
                  <div
                    className="capture-health-stats"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: '#738079',
                      marginTop: '8px',
                    }}
                  >
                    <span>
                      SOURCE LOSS: Mic ({micGapCount}) / Sys ({sysGapCount})
                    </span>
                    <span>Drift indicator: {driftSamples} samples</span>
                  </div>
                </div>
              )}

              <div className="action-buttons">
                <button className="record" onClick={active ? handleEndMeeting : handleStartMeeting}>
                  <i />
                  {active ? 'End meeting' : 'Start meeting'}
                </button>
                {active && (
                  <button className="pause" onClick={handlePause}>
                    {state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                )}
              </div>
              {startError && <p role="alert">{startError}</p>}
              {stopError && (
                <div
                  role="alert"
                  className="error-banner"
                  style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    background: '#fdf2f2',
                    border: '1px solid #f8b4b4',
                    borderRadius: '8px',
                    color: '#9b1c1c',
                    fontSize: '13px',
                    lineHeight: '1.4',
                  }}
                >
                  {stopError}
                </div>
              )}

              {/* Session Completion Evidence Card */}
              {lastSessionSummary && (
                <div
                  className="session-evidence-card"
                  data-testid="session-evidence-card"
                  style={{
                    marginTop: '20px',
                    padding: '20px',
                    background: '#193128',
                    color: '#fff',
                    borderRadius: '14px',
                  }}
                >
                  <p className="eyebrow" style={{ color: '#a8b6af' }}>
                    SESSION EVIDENCE
                  </p>
                  <h3 style={{ color: '#fff', margin: '4px 0 16px 0', fontSize: '18px' }}>
                    Session Finalized
                  </h3>
                  <div
                    className="evidence-row"
                    style={{ paddingTop: '10px', paddingBottom: '10px' }}
                  >
                    <span>
                      <small>Meeting ID (UUID)</small>
                      <strong style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
                        {lastSessionSummary.meetingId}
                      </strong>
                    </span>
                  </div>
                  <div
                    className="evidence-row"
                    style={{ paddingTop: '10px', paddingBottom: '10px' }}
                  >
                    <span>
                      <small>Mic Chunks count</small>
                      <strong>{lastSessionSummary.totalMicChunks}</strong>
                    </span>
                  </div>
                  <div
                    className="evidence-row"
                    style={{ paddingTop: '10px', paddingBottom: '10px' }}
                  >
                    <span>
                      <small>Sys Chunks count</small>
                      <strong>{lastSessionSummary.totalSysChunks}</strong>
                    </span>
                  </div>
                  <div
                    className="evidence-row"
                    style={{ paddingTop: '10px', paddingBottom: '10px' }}
                  >
                    <span>
                      <small>Commit Status</small>
                      <strong>{lastSessionSummary.commitStatus}</strong>
                    </span>
                  </div>
                  <div
                    className="evidence-row"
                    style={{ paddingTop: '10px', paddingBottom: '10px' }}
                  >
                    <span>
                      <small>Finalized At</small>
                      <strong>
                        {new Date(lastSessionSummary.finalizedAt).toLocaleTimeString()}
                      </strong>
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#d8ff6a',
                      marginTop: '16px',
                      marginBottom: 0,
                      fontWeight: 500,
                    }}
                  >
                    All audio chunks committed locally. Source audio is immutable.
                  </p>

                  {(['idle', 'failed'] as string[]).includes(transcriptState) && (
                    <div style={{ marginTop: '16px' }}>
                      <select
                        data-testid="transcript-source-select"
                        value={transcriptSource}
                        onChange={(event) => setTranscriptSource(event.target.value as TranscriptSource)}
                      >
                        <option value="microphone">Microphone</option>
                        <option value="system_audio">System audio</option>
                      </select>
                      <button
                        className="btn-transcribe"
                        onClick={handleTranscribeMeeting}
                        disabled={transcriptState === 'transcribing'}
                        style={{
                          marginLeft: '8px',
                          padding: '10px 16px',
                          background: '#d8ff6a',
                          color: '#14241e',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Transcribe meeting (Local Whisper)
                      </button>
                    </div>
                  )}

                  {transcriptState === 'transcribing' && (
                    <p role="status" style={{ color: '#d8ff6a', marginTop: '12px' }}>
                      Running local Whisper model inference...
                    </p>
                  )}

                  {transcriptDiagnostic && (
                    <div
                      role="alert"
                      className="diagnostic-banner"
                      style={{
                        marginTop: '12px',
                        padding: '12px 14px',
                        background: '#fff8e1',
                        border: '1px solid #ffe082',
                        borderRadius: '8px',
                        color: '#8d6e63',
                        fontSize: '13px',
                        lineHeight: '1.4',
                      }}
                    >
                      <strong>Transcription Prerequisite: </strong>
                      {transcriptDiagnostic}
                    </div>
                  )}

                  {transcriptSegments.length > 0 && (
                    <div
                      className="source-transcript-card"
                      data-testid="source-transcript-card"
                      data-duration-ms={transcriptSourceMetrics?.durationMs}
                      data-chunks-transcribed={transcriptSourceMetrics?.chunksTranscribed}
                      style={{
                        marginTop: '16px',
                        padding: '16px',
                        background: '#12241d',
                        borderRadius: '10px',
                        border: '1px solid #2a473a',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <p className="eyebrow" style={{ color: '#a8b6af', margin: 0 }}>
                            SOURCE TRANSCRIPT (LOCAL MODEL) [{meetingLanguage.toUpperCase()}]
                          </p>
                          <p style={{ fontSize: '12px', color: '#738079', margin: '4px 0 12px 0' }}>
                            Read-only. Source transcript is immutable.
                          </p>
                        </div>
                        <button
                          className="btn-export-markdown"
                          data-testid="export-markdown-btn"
                          onClick={handleExportMarkdown}
                          style={{
                            padding: '8px 14px',
                            background: '#d8ff6a',
                            color: '#14241e',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Export Markdown
                        </button>
                      </div>

                      {exportStatus && (
                        <div
                          role="status"
                          style={{
                            marginTop: '8px',
                            padding: '8px 12px',
                            background: '#193b2d',
                            border: '1px solid #2a5a44',
                            borderRadius: '6px',
                            color: '#d8ff6a',
                            fontSize: '12px',
                          }}
                        >
                          {exportStatus}
                        </div>
                      )}

                      {exportError && (
                        <div
                          role="alert"
                          style={{
                            marginTop: '8px',
                            padding: '8px 12px',
                            background: '#3d1c1c',
                            border: '1px solid #6b2d2d',
                            borderRadius: '6px',
                            color: '#ff8a80',
                            fontSize: '12px',
                          }}
                        >
                          {exportError}
                        </div>
                      )}
                      <div className="transcript-segments" style={{ marginTop: '12px' }}>
                        {transcriptSegments.map((seg, idx) => (
                          <div
                            key={idx}
                            className="transcript-segment"
                            data-start-ms={seg.startMs}
                            data-end-ms={seg.endMs}
                            style={{
                              padding: '8px 0',
                              borderBottom: '1px solid #2a473a',
                            }}
                          >
                            <span
                              style={{
                                color: '#738079',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                marginRight: '8px',
                              }}
                            >
                              [{Math.floor(seg.startMs / 1000)}s - {Math.floor(seg.endMs / 1000)}s]
                            </span>
                            {seg.speaker && (
                              <strong
                                style={{
                                  color: '#d8ff6a',
                                  marginRight: '6px',
                                  fontSize: '12px',
                                }}
                              >
                                {seg.speaker}:
                              </strong>
                            )}
                            <span style={{ color: '#fff', fontSize: '14px' }}>{seg.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>

            {/* Simulator Panel */}
            <article className="evidence">
              <p className="eyebrow">DETERMINISTIC SIMULATOR CONTROLS</p>
              <h2>Inject Runtime Events</h2>
              <div className="sim-grid">
                <button
                  className="sim-btn"
                  onClick={() => injectEvent('chunk_ready')}
                  disabled={!active || captureType !== 'simulated'}
                >
                  Ready Chunk
                </button>
                <button
                  className="sim-btn"
                  onClick={() => injectEvent('gap_detected')}
                  disabled={!active || captureType !== 'simulated'}
                >
                  Inject Gap
                </button>
                <button
                  className="sim-btn"
                  onClick={() => injectEvent('overflow')}
                  disabled={!active || captureType !== 'simulated'}
                >
                  Buffer Overflow
                </button>
                <button
                  className="sim-btn"
                  onClick={() => injectEvent('hot_plug')}
                  disabled={captureType !== 'simulated'}
                >
                  Toggle Hot-Plug
                </button>
                <button
                  className="sim-btn"
                  onClick={() => injectEvent('sleep_wake')}
                  disabled={!active || captureType !== 'simulated'}
                >
                  Sleep / Wake
                </button>
                <button
                  className="sim-btn btn-danger"
                  onClick={() => injectEvent('crash')}
                  disabled={!active || captureType !== 'simulated'}
                >
                  Crash Runtime
                </button>
              </div>
            </article>
          </div>
        )}

        {/* Meeting Library Tab */}
        {activeTab === 'library' && (
          <div
            className="meeting-library"
            data-testid="meeting-library"
            style={{ display: 'grid', gap: '24px' }}
          >
            <article className="start-card" style={{ padding: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <p className="eyebrow" style={{ margin: 0 }}>
                    LOCAL MEETING LIBRARY
                  </p>
                  <h2 style={{ margin: '4px 0' }}>Stored Meetings</h2>
                </div>
                <button
                  onClick={fetchLibrary}
                  style={{
                    padding: '8px 16px',
                    background: '#183128',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Refresh
                </button>
              </div>

              {libraryLoading && <p role="status">Loading local meetings...</p>}

              {libraryError && (
                <div
                  role="alert"
                  className="diagnostic-banner"
                  style={{
                    padding: '12px 14px',
                    background: '#fff8e1',
                    border: '1px solid #ffe082',
                    borderRadius: '8px',
                    color: '#8d6e63',
                    fontSize: '13px',
                    marginBottom: '16px',
                  }}
                >
                  {libraryError}
                </div>
              )}

              {!libraryLoading && libraryMeetings.length === 0 && (
                <p>No local meetings found. Record a meeting to get started.</p>
              )}

              {libraryMeetings.length > 0 && (
                <div className="library-meeting-list" style={{ display: 'grid', gap: '12px' }}>
                  {libraryMeetings.map((m) => (
                    <div
                      key={m.id}
                      data-testid="library-meeting-item"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 18px',
                        background: '#fafaf8',
                        border: '1px solid #e2e2dd',
                        borderRadius: '10px',
                      }}
                    >
                      <div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '16px' }}>{m.title}</h4>
                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                            fontSize: '12px',
                            color: '#738079',
                          }}
                        >
                          <span
                            className="badge-state"
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              fontSize: '11px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {m.state}
                          </span>
                          <span
                            className="badge-lang"
                            style={{
                              background: '#fef3c7',
                              color: '#b45309',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              fontSize: '11px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {m.language}
                          </span>
                          <span>Created: {new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <button
                        data-testid="open-meeting-btn"
                        onClick={() => handleOpenMeeting(m.id)}
                        style={{
                          padding: '8px 14px',
                          background: '#183128',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '13px',
                        }}
                      >
                        View / Reopen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </article>

            {selectedMeeting && (
              <article
                className="selected-meeting-card"
                data-testid="selected-meeting-card"
                style={{
                  padding: '24px',
                  background: '#193128',
                  color: '#fff',
                  borderRadius: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <p className="eyebrow" style={{ color: '#a8b6af', margin: 0 }}>
                      REOPENED MEETING
                    </p>
                    <h3 style={{ margin: '6px 0 12px 0', color: '#fff', fontSize: '20px' }}>
                      {selectedMeeting.title}
                    </h3>
                  </div>
                  <button
                    className="btn-export-markdown"
                    data-testid="export-markdown-btn"
                    onClick={handleExportMarkdown}
                    style={{
                      padding: '8px 16px',
                      background: '#d8ff6a',
                      color: '#14241e',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Export Markdown
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '8px',
                    margin: '16px 0',
                    fontSize: '13px',
                    color: '#d8dee9',
                  }}
                >
                  <div>
                    <strong style={{ color: '#a8b6af' }}>Meeting ID: </strong>
                    <code style={{ fontFamily: 'monospace', color: '#fff' }}>
                      {selectedMeeting.id}
                    </code>
                  </div>
                  <div>
                    <strong style={{ color: '#a8b6af' }}>State: </strong>
                    <span style={{ textTransform: 'uppercase', color: '#d8ff6a', fontWeight: 600 }}>
                      {selectedMeeting.state}
                    </span>
                  </div>
                  <div>
                    <strong style={{ color: '#a8b6af' }}>Created At: </strong>
                    <span>{selectedMeeting.createdAt}</span>
                  </div>
                  <div>
                    <strong style={{ color: '#a8b6af' }}>Ended At: </strong>
                    <span>{selectedMeeting.endedAt || 'N/A'}</span>
                  </div>
                </div>

                {exportStatus && (
                  <div
                    role="status"
                    style={{
                      marginTop: '12px',
                      padding: '10px 14px',
                      background: '#193b2d',
                      border: '1px solid #2a5a44',
                      borderRadius: '8px',
                      color: '#d8ff6a',
                      fontSize: '13px',
                    }}
                  >
                    {exportStatus}
                  </div>
                )}

                {exportError && (
                  <div
                    role="alert"
                    style={{
                      marginTop: '12px',
                      padding: '10px 14px',
                      background: '#3d1c1c',
                      border: '1px solid #6b2d2d',
                      borderRadius: '8px',
                      color: '#ff8a80',
                      fontSize: '13px',
                    }}
                  >
                    {exportError}
                  </div>
                )}

                {kmsModelsApi && (
                  <LocalModelManagerPanel
                    models={localModels}
                    language={selectedMeeting.language}
                    error={localModelError}
                    onDownload={downloadLocalModel}
                    onSelect={selectLocalModel}
                    onRemove={removeLocalModel}
                  />
                )}

                {transcriptSegments.length === 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <select
                      data-testid="transcript-source-select"
                      value={transcriptSource}
                      onChange={(event) => setTranscriptSource(event.target.value as TranscriptSource)}
                    >
                      <option value="microphone">Microphone</option>
                      <option value="system_audio">System audio</option>
                    </select>
                    <button
                      className="btn-transcribe"
                      onClick={handleTranscribeMeeting}
                      disabled={transcriptState === 'transcribing'}
                      style={{
                        marginLeft: '8px',
                        padding: '10px 16px',
                        background: '#d8ff6a',
                        color: '#14241e',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Transcribe meeting (Local Whisper)
                    </button>
                  </div>
                )}

                {transcriptState === 'transcribing' && (
                  <p role="status" style={{ color: '#d8ff6a', marginTop: '12px' }}>
                    Running local Whisper model inference...
                  </p>
                )}

                {transcriptDiagnostic && (
                  <div
                    role="alert"
                    className="diagnostic-banner"
                    style={{
                      marginTop: '12px',
                      padding: '12px 14px',
                      background: '#fff8e1',
                      border: '1px solid #ffe082',
                      borderRadius: '8px',
                      color: '#8d6e63',
                      fontSize: '13px',
                      lineHeight: '1.4',
                    }}
                  >
                    <strong>Transcription Prerequisite: </strong>
                    {transcriptDiagnostic}
                  </div>
                )}

                {transcriptSegments.length > 0 && (
                  <div
                    className="source-transcript-card"
                    data-testid="source-transcript-card"
                    style={{
                      marginTop: '20px',
                      padding: '16px',
                      background: '#12241d',
                      borderRadius: '10px',
                      border: '1px solid #2a473a',
                    }}
                  >
                    <p className="eyebrow" style={{ color: '#a8b6af', margin: 0 }}>
                      SOURCE TRANSCRIPT (LOCAL MODEL) [{selectedMeeting.language.toUpperCase()}]
                    </p>
                    <p style={{ fontSize: '12px', color: '#738079', margin: '4px 0 12px 0' }}>
                      Read-only. Source transcript is immutable.
                    </p>
                    <div className="transcript-segments" style={{ marginTop: '12px' }}>
                      {transcriptSegments.map((seg, idx) => (
                        <div
                          key={idx}
                          className="transcript-segment"
                          data-start-ms={seg.startMs}
                          data-end-ms={seg.endMs}
                          style={{
                            padding: '8px 0',
                            borderBottom: '1px solid #2a473a',
                          }}
                        >
                          <span
                            style={{
                              color: '#738079',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              marginRight: '8px',
                            }}
                          >
                            [{Math.floor(seg.startMs / 1000)}s - {Math.floor(seg.endMs / 1000)}s]
                          </span>
                          {seg.speaker && (
                            <strong
                              style={{
                                color: '#d8ff6a',
                                marginRight: '6px',
                                fontSize: '12px',
                              }}
                            >
                              {seg.speaker}:
                            </strong>
                          )}
                          <span style={{ color: '#fff', fontSize: '14px' }}>{seg.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            )}
          </div>
        )}
        <section className="recent">
          <div>
            <p className="eyebrow">CONSOLE LOGS</p>
            <h2>Event trace stream</h2>
          </div>
          <div className="log-viewer">
            {logMessages.length === 0 ? (
              <p className="empty">Logs will appear here when events occur.</p>
            ) : (
              logMessages.map((msg, idx) => (
                <pre key={idx} className="log-line">
                  {msg}
                </pre>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

const rootElement = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
