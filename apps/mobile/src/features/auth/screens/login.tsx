import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { catalog } from '../../../i18n/en';

export interface LoginScreenProps {
  onLogin: () => void;
  loading: boolean;
}

export function LoginScreen({ onLogin, loading }: LoginScreenProps): React.ReactElement {
  const buttonText = loading ? catalog.auth.loading : catalog.auth.login;

  const handlePress = () => {
    if (!loading) {
      onLogin();
    }
  };

  return (
    <Pressable style={[styles.button, loading && styles.buttonLoading]} onPress={handlePress} disabled={loading} accessibilityRole="button" accessibilityLabel="Log in" accessibilityState={{ disabled: loading, busy: loading }} testID="login-button">
      <Text style={styles.buttonText}>{buttonText}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 220,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 24,
    backgroundColor: '#173128',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  buttonLoading: { opacity: 0.75 },
});
