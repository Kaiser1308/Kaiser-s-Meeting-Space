import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { RecordingState } from '../reducer/types';

export interface RecordingScreenProps {
  state: RecordingState | null;
  error: string | null;
  onPause: () => void | Promise<void>;
  onResume: () => void | Promise<void>;
  onEnd: () => void | Promise<void>;
  onBack: () => void;
}

export function RecordingScreen({ state, error, onPause, onResume, onEnd, onBack }: RecordingScreenProps): React.ReactElement {
  const status = state?.status ?? 'error';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isFinished = status === 'idle' && state?.chunksCommitted !== 0;

  return (
    <SafeAreaView style={styles.safe} testID="recording-screen">
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.kicker}>LOCAL RECORDING</Text>
        <Text style={styles.title}>{isFinished ? 'Recording saved locally.' : isPaused ? 'Recording paused.' : isRecording ? 'Recording in progress.' : 'Recording unavailable.'}</Text>
        <Text style={styles.subtitle}>Native state: {status}. Chunks committed: {state?.chunksCommitted ?? 0}.</Text>
      </View>
      <View style={styles.sheet}>
        <View style={styles.card}>
          <View style={styles.dot} />
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>{isFinished ? 'Local manifest finalized' : isPaused ? 'Microphone paused' : isRecording ? 'Microphone active' : 'Native capture error'}</Text>
            <Text style={styles.cardText}>{error ?? state?.error ?? (isFinished ? 'Durable chunks are available for recovery.' : 'Audio stays on this device until the local manifest is finalized.')}</Text>
          </View>
        </View>
        <View style={styles.controls}>
          <Pressable style={[styles.control, !isRecording && styles.disabled]} disabled={!isRecording} onPress={() => { void onPause(); }} accessibilityRole="button" accessibilityLabel="Pause recording" testID="pause-recording-button">
            <Text style={styles.controlText}>Pause</Text>
          </Pressable>
          <Pressable style={[styles.control, !isPaused && styles.disabled]} disabled={!isPaused} onPress={() => { void onResume(); }} accessibilityRole="button" accessibilityLabel="Resume recording" testID="resume-recording-button">
            <Text style={styles.controlText}>Resume</Text>
          </Pressable>
          <Pressable style={[styles.control, styles.endControl, !isRecording && !isPaused && styles.disabled]} disabled={!isRecording && !isPaused} onPress={() => { void onEnd(); }} accessibilityRole="button" accessibilityLabel="End recording" testID="end-recording-button">
            <Text style={styles.controlText}>End</Text>
          </Pressable>
        </View>
        <Pressable style={styles.backCta} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to readiness">
          <Text style={styles.backCtaText}>{isFinished ? 'Back to readiness' : 'Cancel recording'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#173128' },
  header: { padding: 24, paddingTop: 16 },
  backButton: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { color: '#ffffff', fontSize: 34, lineHeight: 38 },
  kicker: { color: '#d8ff6a', fontSize: 11, letterSpacing: 1.8, fontWeight: '800', marginTop: 14 },
  title: { color: '#ffffff', fontSize: 32, lineHeight: 38, fontWeight: '800', marginTop: 10 },
  subtitle: { color: '#d0dbd5', fontSize: 15, lineHeight: 22, marginTop: 8 },
  sheet: { flex: 1, backgroundColor: '#f5f3ed', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  card: { flexDirection: 'row', padding: 16, borderRadius: 14, backgroundColor: '#fff5e6' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#b54708', marginTop: 4, marginRight: 10 },
  copy: { flex: 1 },
  cardTitle: { color: '#7a2e0b', fontSize: 15, fontWeight: '800' },
  cardText: { color: '#7a2e0b', fontSize: 13, lineHeight: 19, marginTop: 5 },
  note: { color: '#53615b', fontSize: 13, lineHeight: 19, marginTop: 20 },
  controls: { flexDirection: 'row', gap: 8, marginTop: 'auto' },
  control: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173128' },
  endControl: { backgroundColor: '#9b2c24' },
  controlText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  backCta: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173128', marginTop: 'auto' },
  backCtaText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
