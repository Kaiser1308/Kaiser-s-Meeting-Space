export type UserStatus = 'active' | 'disabled';
export type SessionStatus = 'active' | 'revoked';

export interface IdentityKey {
  readonly issuer: string;
  readonly subject: string;
}

export interface IdentityRecord {
  readonly ownerId: string;
  readonly userStatus: UserStatus;
  readonly sessionStatus: SessionStatus;
}

export interface IdentityPersistence {
  upsert(key: IdentityKey): Promise<IdentityRecord>;
}

export interface AuthenticatedOwnerContext extends IdentityKey {
  readonly ownerId: string;
}

export class IdentityResolutionError extends Error {
  constructor(public readonly reason: 'disabled_user' | 'revoked_session') {
    super('UNAUTHENTICATED');
    this.name = 'IdentityResolutionError';
  }
}

/** Maps a verified external identity to a local owner and collapses concurrent first logins. */
export class IdentityResolver {
  private readonly inFlight = new Map<string, Promise<AuthenticatedOwnerContext>>();

  constructor(private readonly persistence: IdentityPersistence) {}

  async resolve(key: IdentityKey): Promise<AuthenticatedOwnerContext> {
    const cacheKey = `${key.issuer}\u0000${key.subject}`;
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    const pending = this.load(key);
    this.inFlight.set(cacheKey, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(cacheKey) === pending) this.inFlight.delete(cacheKey);
    }
  }

  private async load(key: IdentityKey): Promise<AuthenticatedOwnerContext> {
    const record = await this.persistence.upsert(key);
    if (record.userStatus === 'disabled') throw new IdentityResolutionError('disabled_user');
    if (record.sessionStatus === 'revoked') throw new IdentityResolutionError('revoked_session');
    return { ownerId: record.ownerId, issuer: key.issuer, subject: key.subject };
  }
}
