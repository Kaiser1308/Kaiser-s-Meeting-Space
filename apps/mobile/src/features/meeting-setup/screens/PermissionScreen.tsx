import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export interface PermissionScreenProps {
  onBack: () => void;
  onContinue: () => void;
}

export function PermissionScreen({ onBack, onContinue }: PermissionScreenProps): React.ReactElement {
  return (
    <SafeAreaView style={styles.safe} testID="permission-screen">
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.kicker}>MICROPHONE</Text>
        <Text style={styles.title}>Check your microphone.</Text>
        <Text style={styles.subtitle}>The app only asks for access when you choose to start a meeting.</Text>
      </View>
      <View style={styles.sheet}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Native permission check pending</Text>
          <Text style={styles.cardText}>Expo Go cannot verify the final Android capture path. The native build will request permission here.</Text>
        </View>
        <Pressable style={styles.continueButton} onPress={onContinue} accessibilityRole="button" accessibilityLabel="Continue to readiness" testID="permission-continue-button">
          <Text style={styles.continueText}>Continue to readiness</Text>
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
  card: { padding: 18, borderRadius: 14, backgroundColor: '#fff5e6' },
  cardTitle: { color: '#7a2e0b', fontSize: 16, fontWeight: '800' },
  cardText: { color: '#7a2e0b', fontSize: 13, lineHeight: 19, marginTop: 6 },
  continueButton: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173128', marginTop: 'auto' },
  continueText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
