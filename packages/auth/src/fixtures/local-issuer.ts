import { SignJWT, importJWK, jwtVerify } from 'jose';
import {
  getCurrentKey,
  getPreviousKey,
  getNextKey,
  generateRotatedKey,
  type KeyPair,
} from './keys.js';

export interface JWKS {
  keys: Array<{
    kty: string;
    kid: string;
    use: string;
    alg: string;
    n: string;
    e: string;
  }>;
}

export interface IssuerConfig {
  issuer: string;
  audience: string;
}

export interface LocalIssuer {
  getIssuer(): Promise<string>;
  getCurrentKeyId(): Promise<string>;
  getPreviousKeyId(): Promise<string>;
  getNextKeyId(): Promise<string>;
  getJWKS(): Promise<JWKS>;
  getConfig(): Promise<IssuerConfig>;
}

export interface TokenVerificationResult {
  valid: boolean;
  claims?: {
    iss: string;
    aud: string;
    sub: string;
    exp: number;
    nbf: number;
    iat: number;
  };
  error?: string;
}

export interface TokenScenario {
  name: string;
  description: string;
  token: string;
}

export class TestLocalIssuer implements LocalIssuer {
  private readonly config: IssuerConfig;
  private currentKey!: KeyPair;
  private previousKey!: KeyPair;
  private nextKey!: KeyPair;
  private rotation = 0;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      issuer: 'https://test-issuer-synthetic.example.com',
      audience: 'https://kaiser-meeting-space.example.com',
    };
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      this.currentKey = await getCurrentKey();
      this.previousKey = await getPreviousKey();
      this.nextKey = await getNextKey();
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialize();
  }

  async getIssuer(): Promise<string> {
    await this.ensureInitialized();
    return this.config.issuer;
  }

  async getCurrentKeyId(): Promise<string> {
    await this.ensureInitialized();
    return this.currentKey.kid;
  }

  async getPreviousKeyId(): Promise<string> {
    await this.ensureInitialized();
    return this.previousKey.kid;
  }

  async getNextKeyId(): Promise<string> {
    await this.ensureInitialized();
    return this.nextKey.kid;
  }

  async getJWKS(): Promise<JWKS> {
    await this.ensureInitialized();
    return {
      keys: [
        {
          kty: this.currentKey.kty,
          kid: this.currentKey.kid,
          use: this.currentKey.use,
          alg: this.currentKey.alg,
          n: this.currentKey.n,
          e: this.currentKey.e,
        },
        {
          kty: this.previousKey.kty,
          kid: this.previousKey.kid,
          use: this.previousKey.use,
          alg: this.previousKey.alg,
          n: this.previousKey.n,
          e: this.previousKey.e,
        },
      ],
    };
  }

  async getConfig(): Promise<IssuerConfig> {
    return this.config;
  }

  async rotateKeys(): Promise<void> {
    // Shift keys: previous <- current, current <- next, generate new next
    this.previousKey = this.currentKey;
    this.currentKey = this.nextKey;
    this.nextKey = await generateRotatedKey(++this.rotation);
  }
}

// Singleton instance
let issuerInstance: TestLocalIssuer | null = null;

export async function getIssuerInstance(): Promise<TestLocalIssuer> {
  if (!issuerInstance) {
    issuerInstance = new TestLocalIssuer();
    await issuerInstance.initialize();
  }
  return issuerInstance;
}

export async function getIssuerConfig(): Promise<IssuerConfig> {
  const issuer = await getIssuerInstance();
  return issuer.getConfig();
}

export async function createLocalIssuer(): Promise<LocalIssuer> {
  const issuer = new TestLocalIssuer();
  await issuer.initialize();
  return issuer;
}

// Export LocalIssuer as an alias for compatibility
export const LocalIssuer = TestLocalIssuer;

// Time utilities for deterministic token generation
const FIXED_NOW = 1721702400000; // Fixed timestamp for tests
const TOKEN_TTL = 3600; // 1 hour

function getFixedTime(): number {
  return FIXED_NOW;
}

// Main token generation function
export async function generateToken(
  scenario: string,
  subject: string = 'test-user',
): Promise<string> {
  const issuer = await getIssuerInstance();
  const config = await issuer.getConfig();
  const now = Math.floor(getFixedTime() / 1000);

  let key: KeyPair;
  let alg: string;
  let iss: string;
  let aud: string;
  let exp: number;
  let nbf: number;

  switch (scenario) {
    case 'valid':
      key = await getCurrentKey();
      alg = 'RS256';
      iss = config.issuer;
      aud = config.audience;
      exp = now + TOKEN_TTL;
      nbf = now;
      break;

    case 'expired':
      key = await getCurrentKey();
      alg = 'RS256';
      iss = config.issuer;
      aud = config.audience;
      exp = now - 3600; // Expired 1 hour ago
      nbf = now - 7200;
      break;

    case 'future':
      key = await getCurrentKey();
      alg = 'RS256';
      iss = config.issuer;
      aud = config.audience;
      exp = now + TOKEN_TTL;
      nbf = now + TOKEN_TTL; // Not valid until 1 hour in future
      break;

    case 'wrong-audience':
      key = await getCurrentKey();
      alg = 'RS256';
      iss = config.issuer;
      aud = 'https://wrong-audience.example.com';
      exp = now + TOKEN_TTL;
      nbf = now;
      break;

    case 'wrong-issuer':
      key = await getCurrentKey();
      alg = 'RS256';
      iss = 'https://wrong-test-issuer.example.com';
      aud = config.audience;
      exp = now + TOKEN_TTL;
      nbf = now;
      break;

    case 'wrong-algorithm':
      key = await getCurrentKey();
      alg = 'RS512'; // Wrong algorithm
      iss = config.issuer;
      aud = config.audience;
      exp = now + TOKEN_TTL;
      nbf = now;
      break;

    case 'wrong-key':
      key = await getNextKey(); // Signed with a not-yet-published key
      alg = 'RS256';
      iss = config.issuer;
      aud = config.audience;
      exp = now + TOKEN_TTL;
      nbf = now;
      break;

    case 'revoked':
      key = await getCurrentKey();
      alg = 'RS256';
      iss = config.issuer;
      aud = config.audience;
      exp = now + TOKEN_TTL;
      nbf = now;
      // Mark as revoked by including custom claim
      break;

    case 'disabled-issuer':
      key = await getCurrentKey();
      alg = 'RS256';
      iss = 'https://disabled-test-issuer.example.com';
      aud = config.audience;
      exp = now + TOKEN_TTL;
      nbf = now;
      break;

    default:
      throw new Error(`Unknown token scenario: ${scenario}`);
  }

  const payload: Record<string, unknown> = {
    iss,
    aud,
    sub: subject,
    exp,
    nbf,
    iat: now,
    ...(scenario === 'revoked' && { revoked: true }),
  };

  // Ensure key exists and has kid
  if (!key || !key.kid) {
    throw new Error('Key not properly initialized');
  }

  const signingKey =
    alg === 'RS512'
      ? await importJWK(
          {
            kty: key.kty,
            n: key.n,
            e: key.e,
            d: key.d,
            p: key.p,
            q: key.q,
            dp: key.dp,
            dq: key.dq,
            qi: key.qi,
          },
          'RS512',
        )
      : key.privateKey;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: alg as 'RS256' | 'RS512', kid: key.kid })
    .sign(signingKey);

  return token;
}

// Simple verification for testing purposes
export async function verifyToken(token: string): Promise<TokenVerificationResult> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [encodedHeader, encodedPayload] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString());
    JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString());

    const issuer = await getIssuerInstance();
    const config = await issuer.getConfig();
    const allKeys = await Promise.all([getCurrentKey(), getPreviousKey()]);

    // Verify algorithm
    if (header.alg !== 'RS256') {
      return { valid: false, error: 'Wrong algorithm' };
    }

    // Find matching key
    const key = allKeys.find((k) => k.kid === header.kid);
    if (!key) {
      return { valid: false, error: 'Invalid signature (unknown key ID)' };
    }

    const verified = await jwtVerify(token, key.publicKey, {
      algorithms: ['RS256'],
      currentDate: new Date(getFixedTime()),
    });
    const verifiedPayload = verified.payload as Record<string, unknown>;

    if (verifiedPayload.iss?.toString().includes('disabled')) {
      return { valid: false, error: 'Issuer disabled' };
    }
    if (verifiedPayload.iss !== config.issuer) {
      return { valid: false, error: 'Wrong issuer' };
    }
    if (verifiedPayload.aud !== config.audience) {
      return { valid: false, error: 'Wrong audience' };
    }
    if (verifiedPayload.revoked) {
      return { valid: false, error: 'Token revoked' };
    }

    return {
      valid: true,
      claims: {
        iss: verifiedPayload.iss as string,
        aud: verifiedPayload.aud as string,
        sub: verifiedPayload.sub as string,
        exp: verifiedPayload.exp as number,
        nbf: verifiedPayload.nbf as number,
        iat: verifiedPayload.iat as number,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('"exp"')) {
      return { valid: false, error: 'Token expired' };
    }
    if (error instanceof Error && error.message.includes('"nbf"')) {
      return { valid: false, error: 'Token not yet valid (future)' };
    }
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification error',
    };
  }
}
