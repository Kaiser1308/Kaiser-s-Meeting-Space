import { getAllKeys } from './keys.js';
import type { JWKS } from './local-issuer.js';

export async function generateJWKS(): Promise<JWKS> {
  const allKeys = await getAllKeys();

  // JWKS should only include current and previous keys (not next key)
  // Next key is for future rotation scenarios
  const keys = [
    allKeys[0]!, // Current key
    allKeys[1]!, // Previous key
  ];

  // Remove private components for JWKS
  const publicKeys = keys.map(
    (key): { kty: string; kid: string; use: string; alg: string; n: string; e: string } => ({
      kty: key.kty,
      kid: key.kid,
      use: key.use,
      alg: key.alg,
      n: key.n,
      e: key.e,
    }),
  );

  return {
    keys: publicKeys,
  };
}
