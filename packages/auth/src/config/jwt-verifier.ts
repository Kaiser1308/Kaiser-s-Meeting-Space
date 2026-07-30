import { jwtVerify, importJWK, type JWTVerifyResult, type JWK } from 'jose';
import type { OidcConfig, JwtVerificationResult, JwtVerificationOptions } from './oidc';
import { JwksCache, type JwksKey } from './jwks-cache';

export class JwtVerifier {
  constructor(
    private readonly config: OidcConfig,
    private readonly jwksCache: JwksCache,
  ) {}

  async verify(options: JwtVerificationOptions): Promise<JwtVerificationResult> {
    try {
      const { token, requiredAudience, requiredIssuer, currentTime } = options;

      const header = this.parseHeader(token);
      if (!header.kid) {
        return this.invalidResult('Token missing key ID (kid)');
      }

      const issuer = this.parsePayloadIssuer(token);
      if (!issuer) {
        return this.invalidResult('Token missing issuer (iss)');
      }

      const issuerConfig = this.findIssuerConfig(issuer);
      if (!issuerConfig) {
        return this.invalidResult('Unknown issuer');
      }

      if (requiredIssuer && issuer !== requiredIssuer) {
        return this.invalidResult('Issuer mismatch');
      }

      const jwksResult = await this.jwksCache.getJwks(issuerConfig.jwksUri);
      const jwksKey = jwksResult.keys.get(header.kid);

      if (!jwksKey) {
        return this.invalidResult('Key not found in JWKS');
      }

      if (!this.isAlgorithmAllowed(header.alg, issuerConfig.algorithms)) {
        return this.invalidResult('Algorithm not allowed');
      }

      const key = await importJWK(jwksKey as JWK, jwksKey.alg || issuerConfig.algorithms[0]);

      const result = await jwtVerify(token, key, {
        issuer,
        audience: requiredAudience || issuerConfig.audience,
        currentDate: new Date(currentTime ?? Date.now()),
        clockTolerance: this.config.timeValidation.clockSkewSeconds,
      });

      if (result.payload.revoked === true) {
        return this.invalidResult('Token revoked');
      }

      return this.validResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private parseHeader(token: string): { kid?: string; alg?: string; iss?: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf-8'));

      return {
        kid: header.kid as string | undefined,
        alg: header.alg as string | undefined,
      };
    } catch {
      return {};
    }
  }

  private parsePayloadIssuer(token: string): string | undefined {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return undefined;
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
      return typeof payload.iss === 'string' ? payload.iss : undefined;
    } catch {
      return undefined;
    }
  }

  private findIssuerConfig(issuer: string) {
    return this.config.issuers.find((i) => i.issuer === issuer);
  }

  private isAlgorithmAllowed(alg: string | undefined, allowed: string[]): boolean {
    if (!alg) {
      return false;
    }
    return allowed.includes(alg);
  }

  private validResult(result: JWTVerifyResult): JwtVerificationResult {
    const payload = result.payload as Record<string, unknown>;

    return {
      valid: true,
      payload,
      issuer: payload.iss as string | undefined,
      subject: payload.sub as string | undefined,
      audience: payload.aud
        ? Array.isArray(payload.aud)
          ? payload.aud
          : [payload.aud as string]
        : undefined,
      expiresAt: payload.exp as number | undefined,
      notBefore: payload.nbf as number | undefined,
    };
  }

  private invalidResult(error: string): JwtVerificationResult {
    return {
      valid: false,
      error: this.redactError(error),
      errorDetails: {
        code: 'INVALID_TOKEN',
        redacted: true,
      },
    };
  }

  private errorResult(error: unknown): JwtVerificationResult {
    if (error instanceof Error) {
      const validationError = error as Error & { code?: string; claim?: string };
      if (validationError.code === 'ERR_JWT_EXPIRED') {
        return {
          valid: false,
          error: 'Token expired',
          errorDetails: { code: 'TOKEN_EXPIRED', redacted: true },
        };
      }
      if (
        validationError.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' &&
        validationError.claim === 'aud'
      ) {
        return {
          valid: false,
          error: 'Invalid audience',
          errorDetails: { code: 'INVALID_AUDIENCE', redacted: true },
        };
      }
      if (
        validationError.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' &&
        validationError.claim === 'nbf'
      ) {
        return {
          valid: false,
          error: 'Token not yet valid',
          errorDetails: { code: 'TOKEN_NOT_YET_VALID', redacted: true },
        };
      }
      if (error.message.includes('exp')) {
        return {
          valid: false,
          error: 'Token expired',
          errorDetails: {
            code: 'TOKEN_EXPIRED',
            redacted: true,
          },
        };
      }

      if (error.message.includes('nbf')) {
        return {
          valid: false,
          error: 'Token not yet valid',
          errorDetails: {
            code: 'TOKEN_NOT_YET_VALID',
            redacted: true,
          },
        };
      }

      if (error.message.includes('aud')) {
        return {
          valid: false,
          error: 'Invalid audience',
          errorDetails: {
            code: 'INVALID_AUDIENCE',
            redacted: true,
          },
        };
      }

      if (error.message.includes('iss')) {
        return {
          valid: false,
          error: 'Invalid issuer',
          errorDetails: {
            code: 'INVALID_ISSUER',
            redacted: true,
          },
        };
      }
    }

    return {
      valid: false,
      error: this.redactError(error instanceof Error ? error.message : String(error)),
      errorDetails: {
        code: 'VERIFICATION_ERROR',
        redacted: true,
      },
    };
  }

  private redactError(message: string): string {
    return message
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED_TOKEN]')
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_KEY]')
      .replace(/["'][A-Za-z0-9]{32,}["']/g, '"[REDACTED]"');
  }
}

export function createJwtVerifier(
  config: OidcConfig,
  fetchFn?: (uri: string) => Promise<Response>,
): JwtVerifier {
  const defaultFetchFn = async (uri: string) => {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as { keys: JwksKey[] };
  };

  const jwksCache = new JwksCache(
    config.cache,
    config.retry,
    fetchFn
      ? async (uri: string) => {
          const response = await fetchFn(uri);
          return (await response.json()) as { keys: JwksKey[] };
        }
      : defaultFetchFn,
  );

  return new JwtVerifier(config, jwksCache);
}
