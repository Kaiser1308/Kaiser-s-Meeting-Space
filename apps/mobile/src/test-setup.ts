import { vi } from 'vitest';
import React from 'react';

// Expo injects this global in native builds; define it for Vitest's Node runtime.
(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: (length: number) => new Uint8Array(length).fill(7),
  digest: async (_algorithm: unknown, data: Uint8Array) => new Uint8Array(32).fill(data.length).buffer,
}));

// React Native ships Flow source that rollup cannot parse. Mock the primitives
// so component modules load under vitest/node. Components are presentational
// (state via props, actions via callbacks) and tested through the custom
// element-tree renderer in test-utils, not native mounting.
const make = (name: string) => {
  const C = (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as React.ReactNode);
  C.displayName = name;
  return C;
};

vi.mock('react-native', () => ({
  View: make('View'),
  Text: make('Text'),
  TextInput: make('TextInput'),
  TouchableOpacity: make('TouchableOpacity'),
  Pressable: make('Pressable'),
  SafeAreaView: make('SafeAreaView'),
  ScrollView: make('ScrollView'),
  KeyboardAvoidingView: make('KeyboardAvoidingView'),
  StatusBar: () => null,
  StyleSheet: { create: <T>(s: T) => s, flatten: (...s: unknown[]) => Object.assign({}, ...s) },
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  AccessibilityState: {},
  AccessibilityRole: {},
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
