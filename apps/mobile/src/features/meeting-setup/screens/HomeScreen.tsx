import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type MeetingMode = 'record' | 'translate';

export interface HomeScreenProps {
  mode?: MeetingMode;
  onModeChange?: (mode: MeetingMode) => void;
  onStart?: () => void;
}

export function HomeScreen({ mode = 'record', onModeChange = () => {}, onStart = () => {} }: HomeScreenProps): React.ReactElement {

  return (
    <SafeAreaView style={styles.safe} testID="home-screen">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.kicker}>KAISER'S MEETING SPACE</Text>
          <Text style={styles.title}>Make every meeting count.</Text>
          <Text style={styles.subtitle}>Capture a clear record of the work that moves your team forward.</Text>
        </View>
        <View style={styles.sheet}>
          <Text style={styles.sectionLabel}>MEETING TYPE</Text>
          <View style={styles.modeRow}>
            <ModeButton label="Record" detail="Audio + transcript" selected={mode === 'record'} onPress={() => onModeChange('record')} testID="record-mode" />
            <ModeButton label="Translate" detail="Vietnamese ↔ English" selected={mode === 'translate'} onPress={() => onModeChange('translate')} testID="translate-mode" />
          </View>
          <View style={styles.completeCard}>
            <Text style={styles.completeTitle}>Complete by default</Text>
            <Text style={styles.completeText}>Original audio · speakers · timestamps · full transcript</Text>
          </View>
          <View style={styles.readiness} accessibilityRole="text" testID="capture-readiness">
            <View style={styles.statusDot} />
            <View style={styles.readinessCopy}>
              <Text style={styles.readinessTitle}>Native capture is not ready</Text>
              <Text style={styles.readinessText}>Start meeting will unlock after Android native capture is verified.</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.startButton} disabled accessibilityRole="button" accessibilityLabel="Start meeting" accessibilityState={{ disabled: true }} testID="start-meeting-button">
            <Text style={styles.startText}>Start meeting</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.setupButton} disabled={false} onPress={onStart} accessibilityRole="button" accessibilityLabel="Set up meeting" testID="setup-meeting-button">
            <Text style={styles.setupText}>Set up meeting</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeButton({ label, detail, selected, onPress, testID }: { label: string; detail: string; selected: boolean; onPress: () => void; testID: string }) {
  return (
    <TouchableOpacity style={[styles.modeButton, selected && styles.modeButtonSelected]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} meeting type`} accessibilityState={{ selected }} testID={testID}>
      <Text style={styles.modeTitle}>{label}</Text>
      <Text style={styles.modeDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#173128' },
  scroll: { flexGrow: 1 },
  header: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 34 },
  kicker: { color: '#d8ff6a', fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  title: { color: '#ffffff', fontSize: 34, lineHeight: 40, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#d0dbd5', fontSize: 15, lineHeight: 22, marginTop: 10 },
  sheet: { flex: 1, backgroundColor: '#f5f3ed', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  sectionLabel: { color: '#53615b', fontSize: 11, letterSpacing: 1.6, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modeButton: { flex: 1, minHeight: 88, borderWidth: 1, borderColor: '#cfd5d0', borderRadius: 14, padding: 15, justifyContent: 'center', backgroundColor: '#ffffff' },
  modeButtonSelected: { borderWidth: 2, borderColor: '#173128', backgroundColor: '#edf4ef' },
  modeTitle: { color: '#17201d', fontSize: 16, fontWeight: '800' },
  modeDetail: { color: '#53615b', fontSize: 12, lineHeight: 17, marginTop: 5 },
  completeCard: { marginTop: 22, paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#d8ddd8' },
  completeTitle: { color: '#17201d', fontSize: 17, fontWeight: '800' },
  completeText: { color: '#53615b', fontSize: 12, lineHeight: 18, marginTop: 7 },
  readiness: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: '#fff5e6' },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#b54708', marginTop: 5, marginRight: 10 },
  readinessCopy: { flex: 1 },
  readinessTitle: { color: '#7a2e0b', fontSize: 14, fontWeight: '800' },
  readinessText: { color: '#7a2e0b', fontSize: 12, lineHeight: 17, marginTop: 4 },
  startButton: { minHeight: 54, marginTop: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#aab5af' },
  startText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  setupButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  setupText: { color: '#173128', fontSize: 14, fontWeight: '800' },
});
