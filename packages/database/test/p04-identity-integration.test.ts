import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { startPostgres, type TestDb } from './harness.js';
import { createDatabaseIdentityPersistence } from '../../apps/api/src/modules/identity/database-identity-persistence.js';
import {
  IdentityResolver,
  IdentityResolutionError,
} from '../../apps/api/src/modules/identity/identity-resolver.js';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@kms/database';

describe('P04 Identity PostgreSQL integration', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startPostgres();
  }, 60_000);

  afterAll(async () => {
    await testDb.close();
  }, 30_000);

  const ISSUER_A = 'https://issuer-a.test';
  const SUBJECT_1 = 'subject-1';
  const SUBJECT_2 = 'subject-2';

  // ── G01: Identity mapping ──────────────────────────────────────────

  describe('identity mapping', () => {
    it('maps a new (issuer, subject) to a stable owner id', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const first = await resolver.resolve({ issuer: ISSUER_A, subject: SUBJECT_1 });
      expect(first.ownerId).toMatch(/^oidc_[a-f0-9]{64}$/);
      expect(first.issuer).toBe(ISSUER_A);
      expect(first.subject).toBe(SUBJECT_1);

      // Second resolution must return the SAME owner id
      const second = await resolver.resolve({ issuer: ISSUER_A, subject: SUBJECT_1 });
      expect(second.ownerId).toBe(first.ownerId);
    });

    it('assigns distinct owner ids to different subjects', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const a = await resolver.resolve({ issuer: ISSUER_A, subject: SUBJECT_1 });
      const b = await resolver.resolve({ issuer: ISSUER_A, subject: SUBJECT_2 });

      expect(a.ownerId).not.toBe(b.ownerId);
    });

    it('assigns distinct owner ids to same subject across different issuers', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const a = await resolver.resolve({ issuer: ISSUER_A, subject: SUBJECT_1 });
      const b = await resolver.resolve({ issuer: 'https://issuer-b.test', subject: SUBJECT_1 });

      expect(a.ownerId).not.toBe(b.ownerId);
    });

    it('is deterministic: same (issuer, subject) always produces the same owner id', async () => {
      const p1 = createDatabaseIdentityPersistence(testDb.db);
      const p2 = createDatabaseIdentityPersistence(testDb.db);
      const r1 = new IdentityResolver(p1);
      const r2 = new IdentityResolver(p2);

      const a = await r1.resolve({ issuer: ISSUER_A, subject: 'deterministic-test' });
      const b = await r2.resolve({ issuer: ISSUER_A, subject: 'deterministic-test' });

      expect(a.ownerId).toBe(b.ownerId);
    });

    it('returns active status for a newly created user', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const ctx = await resolver.resolve({ issuer: ISSUER_A, subject: 'new-user-status' });
      expect(ctx).toBeDefined();

      // Verify user status in DB
      const [user] = await testDb.db
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.ownerId))
        .limit(1);
      expect(user!.status).toBe('active');
    });
  });

  // ── G02: Concurrent first login ────────────────────────────────────

  describe('concurrent first login', () => {
    it('deduplicates concurrent upserts for the same (issuer, subject)', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      // Fire concurrent resolutions for the same identity
      const key = { issuer: ISSUER_A, subject: 'concurrent-test' };
      const [a, b, c] = await Promise.all([
        resolver.resolve(key),
        resolver.resolve(key),
        resolver.resolve(key),
      ]);

      expect(a.ownerId).toBe(b.ownerId);
      expect(b.ownerId).toBe(c.ownerId);

      // Only one user row should exist
      const rows = await testDb.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(eq(schema.users.id, a.ownerId));
      expect(rows[0]!.count).toBe(1);

      // Only one external_identities row
      const idRows = await testDb.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.externalIdentities)
        .where(eq(schema.externalIdentities.userId, a.ownerId));
      expect(idRows[0]!.count).toBe(1);
    });
  });

  // ── G03: Disabled user ─────────────────────────────────────────────

  describe('disabled user', () => {
    it('rejects a disabled user with IdentityResolutionError', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const key = { issuer: ISSUER_A, subject: 'disabled-user-test' };

      // First login succeeds
      const ctx = await resolver.resolve(key);
      expect(ctx.ownerId).toBeDefined();

      // Disable the user in the database
      await testDb.db
        .update(schema.users)
        .set({ status: 'disabled' })
        .where(eq(schema.users.id, ctx.ownerId));

      // Subsequent resolution must reject
      const resolver2 = new IdentityResolver(createDatabaseIdentityPersistence(testDb.db));
      await expect(resolver2.resolve(key)).rejects.toThrow(IdentityResolutionError);
      await expect(resolver2.resolve(key)).rejects.toMatchObject({
        reason: 'disabled_user',
      });
    });

    it('does not expose the disabled reason in a generic error context', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const key = { issuer: ISSUER_A, subject: 'disabled-reason-test' };
      const ctx = await resolver.resolve(key);

      await testDb.db
        .update(schema.users)
        .set({ status: 'disabled' })
        .where(eq(schema.users.id, ctx.ownerId));

      const resolver2 = new IdentityResolver(createDatabaseIdentityPersistence(testDb.db));
      try {
        await resolver2.resolve(key);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(IdentityResolutionError);
        expect((err as IdentityResolutionError).reason).toBe('disabled_user');
        // Message must not leak internal state
        expect((err as Error).message).toBe('UNAUTHENTICATED');
      }
    });
  });

  // ── G04: Revoked session ───────────────────────────────────────────

  describe('revoked session', () => {
    it('rejects a user whose session has been revoked', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const key = { issuer: ISSUER_A, subject: 'revoked-session-test' };

      // First login creates the session
      const ctx = await resolver.resolve(key);
      expect(ctx.ownerId).toBeDefined();

      // Revoke the session in the database
      await testDb.db
        .update(schema.sessions)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(schema.sessions.userId, ctx.ownerId));

      // Subsequent resolution must reject
      const resolver2 = new IdentityResolver(createDatabaseIdentityPersistence(testDb.db));
      await expect(resolver2.resolve(key)).rejects.toThrow(IdentityResolutionError);
      await expect(resolver2.resolve(key)).rejects.toMatchObject({
        reason: 'revoked_session',
      });
    });

    it('allows a fresh session after re-enabling', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const key = { issuer: ISSUER_A, subject: 're-enable-session-test' };
      const ctx = await resolver.resolve(key);

      // Revoke
      await testDb.db
        .update(schema.sessions)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(schema.sessions.userId, ctx.ownerId));

      // Verify rejected
      const resolver2 = new IdentityResolver(createDatabaseIdentityPersistence(testDb.db));
      await expect(resolver2.resolve(key)).rejects.toThrow(IdentityResolutionError);

      // Re-activate the existing session (update status, not insert new)
      await testDb.db
        .update(schema.sessions)
        .set({ status: 'active', revokedAt: null })
        .where(eq(schema.sessions.userId, ctx.ownerId));

      // Now resolution should work again
      const resolver3 = new IdentityResolver(createDatabaseIdentityPersistence(testDb.db));
      const ctx2 = await resolver3.resolve(key);
      expect(ctx2.ownerId).toBe(ctx.ownerId);
    });
  });

  // ── G05: Persistence integrity ─────────────────────────────────────

  describe('persistence integrity', () => {
    it('writes user with default active status to database', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const key = { issuer: ISSUER_A, subject: 'integrity-check' };
      const ctx = await resolver.resolve(key);

      const [user] = await testDb.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ctx.ownerId))
        .limit(1);

      expect(user!.status).toBe('active');
      expect(user!.id).toBe(ctx.ownerId);
    });

    it('writes external_identities row with correct values', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const key = { issuer: 'https://ext-id.test', subject: 'ext-subject' };
      const ctx = await resolver.resolve(key);

      const [extId] = await testDb.db
        .select()
        .from(schema.externalIdentities)
        .where(eq(schema.externalIdentities.userId, ctx.ownerId))
        .limit(1);

      expect(extId!.issuer).toBe(key.issuer);
      expect(extId!.subject).toBe(key.subject);
      expect(extId!.userId).toBe(ctx.ownerId);
    });

    it('creates a session row on first login', async () => {
      const persistence = createDatabaseIdentityPersistence(testDb.db);
      const resolver = new IdentityResolver(persistence);

      const key = { issuer: ISSUER_A, subject: 'session-creation-test' };
      const ctx = await resolver.resolve(key);

      const sessionRows = await testDb.db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, ctx.ownerId));

      expect(sessionRows.length).toBeGreaterThanOrEqual(1);
      expect(sessionRows[0]!.status).toBe('active');
      expect(sessionRows[0]!.issuer).toBe(key.issuer);
      expect(sessionRows[0]!.subject).toBe(key.subject);
    });
  });
});
