import { generateToken, verifyToken, type TokenScenario } from './local-issuer.js';

const TOKEN_SCENARIO_DEFS: Array<Omit<TokenScenario, 'token'>> = [
  { name: 'valid', description: 'Valid token with correct issuer, audience, and timing' },
  { name: 'expired', description: 'Token with past expiration time' },
  { name: 'future', description: 'Token with future not-before time' },
  { name: 'wrong-audience', description: 'Token with incorrect audience claim' },
  { name: 'wrong-issuer', description: 'Token with incorrect issuer claim' },
  { name: 'wrong-algorithm', description: 'Token signed with wrong algorithm header' },
  { name: 'wrong-key', description: 'Token signed with non-current key (previous key)' },
  { name: 'revoked', description: 'Token for revoked user/session' },
  { name: 'disabled-issuer', description: 'Token from disabled issuer' },
];

const TOKEN_CACHE = new Map<string, Promise<string>>();

function getTokenPromise(name: string, subject: string = 'user123'): Promise<string> {
  const key = `${name}:${subject}`;
  if (!TOKEN_CACHE.has(key)) {
    TOKEN_CACHE.set(key, generateToken(name, subject));
  }
  return TOKEN_CACHE.get(key)!;
}

export async function getAllTokenScenarios(): Promise<TokenScenario[]> {
  const scenarios = await Promise.all(
    TOKEN_SCENARIO_DEFS.map(async (def) => ({
      ...def,
      token: await getTokenPromise(def.name),
    })),
  );
  return scenarios;
}

export async function getTokenScenario(name: string): Promise<TokenScenario | undefined> {
  const def = TOKEN_SCENARIO_DEFS.find((s) => s.name === name);
  if (!def) return undefined;
  return {
    ...def,
    token: await getTokenPromise(def.name),
  };
}

export { generateToken, verifyToken };
