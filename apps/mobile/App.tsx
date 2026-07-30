import React from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { StyleSheet } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { ClientAuth, type OAuthTransport } from './src/auth/auth-client';
import { createAuthRedirectUri } from './src/auth/redirect-uri';
import { createNativeSecureStorage } from './src/auth/secure-storage';
import { parseDeepLink } from './src/app/deep-link';
import { AppShell } from './src/app/AppShell';
import { ErrorBoundary } from './src/app/ErrorBoundary';
import { HomeScreen } from './src/features/meeting-setup/screens/HomeScreen';
import { MeetingSetupScreen } from './src/features/meeting-setup/screens/MeetingSetupScreen';
import { ReadinessScreen } from './src/features/meeting-setup/screens/ReadinessScreen';
import { PermissionScreen } from './src/features/meeting-setup/screens/PermissionScreen';
import { RecordingScreen } from './src/features/recording/screens/RecordingScreen';
import { createNativeAudioModule } from './src/features/recording/native-audio-module';
import { RecordingService } from './src/features/recording/service/recording-service';
import type { RecordingState } from './src/features/recording/reducer/types';
import type { MeetingDraft } from './src/features/meeting-setup/screens/meeting-flow';
import type { MeetingMode } from './src/features/meeting-setup/screens/HomeScreen';

const AUTH0_DOMAIN = 'dev-enjk3jocienzslhw.us.auth0.com';
const AUTH0_CLIENT_ID = 'ZNcGLrC78OnHceRpFBWPs5tE603ty1gb';
const AUTH0_AUDIENCE = 'https://kms.local.api';
const REDIRECT_URI = createAuthRedirectUri((path) => ExpoLinking.createURL(path));

function readIdTokenNonce(idToken: unknown): { nonce?: string } | undefined {
  if (typeof idToken !== 'string') return undefined;
  const payload = idToken.split('.')[1];
  if (!payload) return undefined;
  try {
    const decoded = globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(decoded) as { nonce?: unknown };
    return typeof parsed.nonce === 'string' ? { nonce: parsed.nonce } : undefined;
  } catch {
    return undefined;
  }
}

function createAuthTransport(): OAuthTransport {
  const endpoint = `https://${AUTH0_DOMAIN}`;
  async function request(path: string, body: Record<string, string>) {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error_description === 'string' ? payload.error_description : 'auth request failed');
    return payload;
  }
  return {
    async exchangeCode({ code, codeVerifier, redirectUri }) {
      const result = await request('/oauth/token', {
        grant_type: 'authorization_code', client_id: AUTH0_CLIENT_ID, code,
        code_verifier: codeVerifier, redirect_uri: redirectUri,
      });
      return { accessToken: String(result.access_token), refreshToken: String(result.refresh_token ?? ''), expiresIn: Number(result.expires_in ?? 3600), idToken: readIdTokenNonce(result.id_token) };
    },
    async refresh({ refreshToken }) {
      const result = await request('/oauth/token', { grant_type: 'refresh_token', client_id: AUTH0_CLIENT_ID, refresh_token: refreshToken });
      return { accessToken: String(result.access_token), refreshToken: String(result.refresh_token ?? refreshToken), expiresIn: Number(result.expires_in ?? 3600) };
    },
    async revoke({ refreshToken }) {
      await request('/oauth/revoke', { client_id: AUTH0_CLIENT_ID, token: refreshToken });
    },
  };
}

export default function App() {
  const [client, setClient] = React.useState<ClientAuth | null>(null);
  const [authed, setAuthed] = React.useState(false);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState<string>();
  const [mode, setMode] = React.useState<MeetingMode>('record');
  const [screen, setScreen] = React.useState<'home' | 'setup' | 'permission' | 'readiness' | 'recording'>('home');
  const [recordingError, setRecordingError] = React.useState<string | null>(null);
  const [nativeCaptureError, setNativeCaptureError] = React.useState<string | null>(null);
  const [recordingState, setRecordingState] = React.useState<RecordingState | null>(null);
  const [meetingDraft, setMeetingDraft] = React.useState<MeetingDraft>({
    title: '',
    mode: 'record',
    sourceLanguage: 'vi',
    targetLanguage: 'en',
  });

  const nativeCapture = React.useMemo(() => {
    try {
      return { service: new RecordingService(createNativeAudioModule()), error: null };
    } catch (error) {
      return {
        service: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, []);
  const recordingService = nativeCapture.service;

  React.useEffect(() => {
    if (nativeCapture.error) {
      console.error(`[AudioRecorder] ${nativeCapture.error}`);
      setNativeCaptureError(nativeCapture.error);
    }
  }, [nativeCapture]);

  React.useEffect(() => {
    if (!recordingService) return;
    setRecordingState(recordingService.getState());
    void recordingService.initialize();
    return recordingService.subscribe(setRecordingState);
  }, [recordingService]);

  React.useEffect(() => {
    return () => recordingService?.destroy();
  }, [recordingService]);

  const continueFromPermission = React.useCallback(async () => {
    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        setRecordingError('Microphone permission was denied.');
        return;
      }
    }
    setRecordingError(null);
    setScreen('readiness');
  }, []);

  const startRecording = React.useCallback(async () => {
    if (!recordingService) {
      setRecordingError(nativeCaptureError ?? 'AudioRecorder native module is unavailable. Install the native development build.');
      return;
    }
    setRecordingError(null);
    const meetingId = Crypto.randomUUID();
    await recordingService.configure(meetingId, '');
    if (recordingService.getState().status !== 'idle') {
      setRecordingError(recordingService.getState().error ?? 'Unable to configure local recording.');
      return;
    }
    await recordingService.start();
    const state = recordingService.getState();
    if (state.status !== 'recording') {
      setRecordingError(state.error ?? 'Native recording did not start.');
      return;
    }
    setScreen('recording');
  }, [nativeCaptureError, recordingService]);

  const cancelRecording = React.useCallback(async () => {
    await recordingService?.cancel();
    setScreen('readiness');
  }, [recordingService]);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const authClient = new ClientAuth({
          clientId: AUTH0_CLIENT_ID,
          redirectUri: REDIRECT_URI,
          authorizationEndpoint: `https://${AUTH0_DOMAIN}/authorize?audience=${encodeURIComponent(AUTH0_AUDIENCE)}`,
          storage: await createNativeSecureStorage(),
          transport: createAuthTransport(),
        });
        if (!mounted) return;
        setClient(authClient);
        try { await authClient.refresh(); if (mounted) setAuthed(true); } catch { if (mounted) setAuthError('Please log in'); }
      } catch (error) {
        if (mounted) setAuthError(error instanceof Error ? error.message : 'Authentication unavailable');
      } finally { if (mounted) setAuthLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    const handleUrl = async (url: string) => {
      const intent = parseDeepLink(url);
      if (intent.kind !== 'oauth_callback' || !client) return;
      setAuthLoading(true); setAuthError(undefined);
      try { await client.completeLogin({ code: intent.code, state: intent.state, nonce: intent.nonce }); setAuthed(true); }
      catch (error) { setAuthError(error instanceof Error ? error.message : 'Authentication failed'); }
      finally { setAuthLoading(false); }
    };
    const subscription = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    void Linking.getInitialURL().then((url) => { if (url) void handleUrl(url); });
    return () => subscription.remove();
  }, [client]);

  const onLogin = React.useCallback(async () => {
    if (!client) return;
    setAuthLoading(true); setAuthError(undefined);
    try { const request = await client.beginLogin(); await Linking.openURL(request.url); }
    catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to open login'); setAuthLoading(false); }
  }, [client]);

  return (
    <ErrorBoundary>
      <AppShell locale="vi" authed={authed} onLocaleChange={() => {}} onLogin={() => { void onLogin(); }} onLogout={() => { void client?.logout(); setAuthed(false); }} authLoading={authLoading} authError={authError}>
        {screen === 'home' ? (
          <HomeScreen mode={mode} onModeChange={(nextMode) => { setMode(nextMode); setMeetingDraft((current) => ({ ...current, mode: nextMode })); }} onStart={() => setScreen('setup')} />
        ) : screen === 'setup' ? (
          <MeetingSetupScreen draft={meetingDraft} onChange={setMeetingDraft} onBack={() => setScreen('home')} onContinue={() => setScreen('permission')} />
        ) : screen === 'permission' ? (
          <PermissionScreen onBack={() => setScreen('setup')} onContinue={() => { void continueFromPermission(); }} />
        ) : screen === 'readiness' ? (
          <ReadinessScreen onBack={() => setScreen('setup')} onStart={startRecording} error={recordingError ?? nativeCaptureError} nativeAvailable={recordingService !== null} />
        ) : (
          <RecordingScreen state={recordingState} error={recordingError} onPause={() => recordingService?.pause()} onResume={() => recordingService?.resume()} onEnd={() => recordingService?.end()} onBack={cancelRecording} />
        )}
        {/* HomeScreen owns the Android-safe responsive start-flow preview. */}
        {/*
          <StatusBar barStyle="light-content" />
          <View style={styles.hero}>
            <Text style={styles.kicker}>KAISER'S MEETING SPACE</Text>
            <Text style={styles.title}>Capture every word.</Text>
            <Text style={styles.subtitle}>
              Full-fidelity meeting records, wherever work happens.
            </Text>
          </View>
          <View style={styles.sheet}>
            <Text style={styles.label}>MEETING MODE</Text>
            <View style={styles.modes}>
              <TouchableOpacity
                style={[styles.mode, mode === 'record' && styles.active]}
                onPress={() => setMode('record')}
              >
                <Text style={styles.modeTitle}>Record</Text>
                <Text style={styles.modeSub}>Audio + full transcript</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mode, mode === 'translate' && styles.active]}
                onPress={() => setMode('translate')}
              >
                <Text style={styles.modeTitle}>Translate</Text>
                <Text style={styles.modeSub}>Vietnamese ↔ English</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.promise}>
              <Text style={styles.promiseTitle}>Complete by default</Text>
              <Text style={styles.promiseText}>
                Original audio • Speakers • Timestamps • Full transcript
              </Text>
            </View>
            <TouchableOpacity style={styles.start} disabled accessibilityState={{ disabled: true }}>
              <View style={styles.dot} />
              <Text style={styles.startText}>Complete setup to start</Text>
            </TouchableOpacity>
            <Text style={styles.unavailable}>
              Recording is unavailable until the authenticated start flow and native capture
              readiness are complete.
            </Text>
          </View>
        */}
      </AppShell>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#173128' },
  hero: { padding: 28, paddingTop: 42, paddingBottom: 44 },
  kicker: { color: '#d8ff6a', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  title: { color: 'white', fontSize: 42, fontWeight: '700', letterSpacing: -1.5, marginTop: 12 },
  subtitle: { color: '#b7c3be', fontSize: 16, lineHeight: 23, marginTop: 10 },
  sheet: {
    flex: 1,
    backgroundColor: '#f5f3ed',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
  },
  label: { fontSize: 10, letterSpacing: 1.6, color: '#737d78', fontWeight: '700' },
  modes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mode: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d6d9d5',
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#fff',
  },
  active: { borderWidth: 2, borderColor: '#183128', backgroundColor: '#edf4ef' },
  modeTitle: { fontWeight: '700', fontSize: 16, color: '#17201d' },
  modeSub: { fontSize: 12, color: '#707874', marginTop: 5, lineHeight: 17 },
  promise: {
    marginTop: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#deded8',
    paddingVertical: 22,
  },
  promiseTitle: { fontSize: 16, fontWeight: '700', color: '#17201d' },
  promiseText: { fontSize: 12, color: '#737d78', marginTop: 7 },
  start: {
    marginTop: 'auto',
    backgroundColor: '#183128',
    borderRadius: 14,
    padding: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  dot: { height: 9, width: 9, borderRadius: 5, backgroundColor: '#ff6c5c', marginRight: 10 },
  startText: { color: 'white', fontWeight: '700', fontSize: 16 },
  unavailable: {
    textAlign: 'center',
    color: '#737d78',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
  },
});
