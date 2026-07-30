import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export interface ReadinessScreenProps {
  onBack: () => void;
  onStart: () => void | Promise<void>;
  error?: string | null;
  nativeAvailable: boolean;
}

export function ReadinessScreen({ onBack, onStart, error, nativeAvailable }: ReadinessScreenProps): React.ReactElement {
  return (
    <SafeAreaView style={styles.safe} testID="readiness-screen">
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" testID="readiness-back-button">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.kicker}>READY CHECK</Text>
        <Text style={styles.title}>One last check.</Text>
        <Text style={styles.subtitle}>We will only start after the device is ready to capture safely.</Text>
      </View>
      <View style={styles.sheet}>
        <View style={styles.card}>
          <View style={styles.dot} />
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>{nativeAvailable ? 'Native capture is ready' : 'Native capture is unavailable'}</Text>
            <Text style={styles.cardText}>{nativeAvailable ? 'The native development build will request permission and write durable local chunks.' : 'Install the native development build. Expo Go cannot load AudioRecorder.'}</Text>
          </View>
        </View>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Text style={styles.note}>Recording stays local and does not require a network or speech provider.</Text>
        <Pressable style={[styles.previewButton, !nativeAvailable && styles.disabledButton]} disabled={!nativeAvailable} onPress={() => { void onStart(); }} accessibilityRole="button" accessibilityLabel="Start recording" testID="start-recording-button">
          <Text style={styles.previewText}>{nativeAvailable ? 'Start recording' : 'Native build required'}</Text>
        </Pressable>
        <Pressable style={styles.backCta} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to setup">
          <Text style={styles.backCtaText}>Back to setup</Text>
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
  backCta: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173128', marginTop: 'auto' },
  backCtaText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  previewButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  previewText: { color: '#173128', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.45 },
  error: { color: '#a12b1f', fontSize: 13, lineHeight: 19, marginTop: 14 },
});
