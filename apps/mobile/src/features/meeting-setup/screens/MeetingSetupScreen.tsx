import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { validateMeetingDraft, type MeetingDraft } from './meeting-flow';

export interface MeetingSetupScreenProps {
  draft: MeetingDraft;
  onChange: (draft: MeetingDraft) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function MeetingSetupScreen({ draft, onChange, onContinue, onBack }: MeetingSetupScreenProps): React.ReactElement {
  const validation = validateMeetingDraft(draft);

  return (
    <SafeAreaView style={styles.safe} testID="meeting-setup-screen">
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.kicker}>MEETING SETUP</Text>
        <Text style={styles.title}>Name this meeting.</Text>
        <Text style={styles.subtitle}>Give your record a clear title before capture begins.</Text>
      </View>
      <View style={styles.sheet}>
        <Text style={styles.label}>MEETING TITLE</Text>
        <TextInput
          value={draft.title}
          onChangeText={(title) => onChange({ ...draft, title })}
          placeholder="e.g. Weekly product sync"
          placeholderTextColor="#8a9690"
          style={styles.input}
          accessibilityLabel="Meeting title"
          testID="meeting-title-input"
        />
        <Text style={styles.label}>MODE</Text>
        <View style={styles.modeRow}>
          {(['record', 'translate'] as const).map((mode) => (
            <Pressable key={mode} style={[styles.modeButton, draft.mode === mode && styles.selected]} onPress={() => onChange({ ...draft, mode })} accessibilityRole="button" accessibilityState={{ selected: draft.mode === mode }}>
              <Text style={styles.modeText}>{mode === 'record' ? 'Record' : 'Translate'}</Text>
            </Pressable>
          ))}
        </View>
        {validation.error ? <Text style={styles.error} accessibilityRole="alert">{validation.error}</Text> : null}
        <Pressable style={[styles.continueButton, !validation.valid && styles.disabled]} disabled={!validation.valid} onPress={onContinue} accessibilityRole="button" accessibilityLabel="Continue" accessibilityState={{ disabled: !validation.valid }} testID="meeting-continue-button">
          <Text style={styles.continueText}>Continue</Text>
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
  label: { color: '#53615b', fontSize: 11, letterSpacing: 1.5, fontWeight: '800', marginTop: 6, marginBottom: 10 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#cfd5d0', borderRadius: 12, paddingHorizontal: 16, color: '#17201d', backgroundColor: '#ffffff', fontSize: 16, marginBottom: 24 },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeButton: { flex: 1, minHeight: 52, borderWidth: 1, borderColor: '#cfd5d0', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  selected: { borderWidth: 2, borderColor: '#173128', backgroundColor: '#edf4ef' },
  modeText: { color: '#17201d', fontSize: 15, fontWeight: '700' },
  error: { color: '#9b2118', fontSize: 13, lineHeight: 18, marginTop: 14 },
  continueButton: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173128', marginTop: 'auto' },
  disabled: { backgroundColor: '#aab5af' },
  continueText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
