import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LoginScreen } from '../features/auth/screens/login';

interface AppShellProps {
  locale: 'vi' | 'en';
  authed: boolean;
  onLocaleChange: (locale: 'vi' | 'en') => void;
  onLogin?: () => void;
  onLogout?: () => void;
  authLoading?: boolean;
  authError?: string;
  children: React.ReactNode;
}

export function AppShell({ locale, authed, onLocaleChange, onLogin = () => {}, onLogout = () => {}, authLoading = false, authError, children }: AppShellProps) {
  const confirmLogout = () => {
    Alert.alert(
      'Log out?',
      'You can sign in again anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: onLogout },
      ],
    );
  };

  return (
    <View style={styles.root} testID="app-shell" accessibilityLabel={locale} accessibilityState={{ disabled: !authed }}>
      {authed ? (
        <View style={styles.content}>
          <Pressable style={styles.logoutButton} onPress={confirmLogout} accessibilityRole="button" accessibilityLabel="Log out" testID="logout-button">
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
          {children}
        </View>
      ) : (
        <SafeAreaView style={styles.loginSafe} testID="login-screen">
          <KeyboardAvoidingView style={styles.loginKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.loginCard}>
                <Text style={styles.brandMark}>KMS</Text>
                <Text style={styles.title}>Kaiser's Meeting Space</Text>
                <Text style={styles.subtitle}>Sign in to start a meeting</Text>
                <LoginScreen onLogin={onLogin} loading={authLoading} />
                {authError ? <Text style={styles.error} testID="auth-error" accessibilityRole="alert">{authError}</Text> : null}
                <Pressable style={styles.localeButton} onPress={() => onLocaleChange(locale === 'vi' ? 'en' : 'vi')} accessibilityRole="button" accessibilityLabel="Change language" testID="locale-button">
                  <Text style={styles.localeText}>English / Tiếng Việt</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f3ed' },
  content: { flex: 1 },
  logoutButton: { position: 'absolute', zIndex: 2, top: 14, right: 18, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  logoutText: { color: '#d8ff6a', fontSize: 13, fontWeight: '700' },
  loginSafe: { flex: 1, backgroundColor: '#173128' },
  loginKeyboard: { flex: 1 },
  loginScroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  loginCard: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', backgroundColor: '#f5f3ed', borderRadius: 24, padding: 28 },
  brandMark: { color: '#d8ff6a', backgroundColor: '#173128', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 10, fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#173128', fontSize: 28, lineHeight: 34, fontWeight: '700', textAlign: 'center', marginTop: 18 },
  subtitle: { color: '#53615b', fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 28 },
  error: { color: '#9b2118', fontSize: 13, lineHeight: 18, marginTop: 14, textAlign: 'center' },
  localeButton: { minHeight: 44, marginTop: 20, padding: 12, justifyContent: 'center' },
  localeText: { color: '#53615b', fontSize: 14 },
});
