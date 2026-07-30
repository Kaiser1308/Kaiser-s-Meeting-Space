import { CryptoDigestAlgorithm, digest, getRandomBytes } from 'expo-crypto';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function randomUrlSafeValue(bytes = 32): string {
  return base64Url(getRandomBytes(bytes));
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hashed = await digest(CryptoDigestAlgorithm.SHA256, data);
  return base64Url(new Uint8Array(hashed));
}
