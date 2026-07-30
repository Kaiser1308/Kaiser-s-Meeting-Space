import React from 'react';
import { Text, View } from 'react-native';
import type { ClientAuth } from '../../../auth/auth-client';
import { catalog } from '../../../i18n/en';

export interface CallbackScreenProps {
  code: string;
  state: string;
  nonce?: string;
  onComplete: (success: boolean) => void;
  client: ClientAuth;
  errorKey?: 'offline' | 'expired' | 'revoked' | 'generic' | null;
}

export function CallbackScreen({ errorKey = null }: CallbackScreenProps): React.ReactElement {
  if (errorKey) {
    return (
      <View>
        <Text>{catalog.auth.error[errorKey]}</Text>
      </View>
    );
  }

  return (
    <View>
      <Text>{catalog.auth.loading}</Text>
    </View>
  );
}

export async function processCallback(
  code: string,
  state: string,
  nonce: string | undefined,
  client: ClientAuth,
  onComplete: (success: boolean) => void,
): Promise<'offline' | 'expired' | 'revoked' | 'generic' | null> {
  try {
    if (!nonce) {
      throw new Error('generic');
    }

    await client.completeLogin({ code, state, nonce });
    onComplete(true);
    return null;
  } catch (error) {
    let key: 'offline' | 'expired' | 'revoked' | 'generic' = 'generic';
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (message.includes('offline') || message.includes('network')) {
      key = 'offline';
    } else if (message.includes('expired')) {
      key = 'expired';
    } else if (message.includes('revoked')) {
      key = 'revoked';
    }

    onComplete(false);
    return key;
  }
}
