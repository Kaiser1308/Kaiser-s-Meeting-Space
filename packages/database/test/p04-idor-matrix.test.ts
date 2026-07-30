import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { startPostgres, type TestDb } from './harness.js';
import {
  OwnerAuthorizationPolicy,
  DENIED_RESOURCE,
  type OwnerContext,
} from '../../packages/auth/src/policies/owner-policy.js';
import { MeetingsRepository } from '../src/repositories/meetings.js';
import { JobsMetadataRepository } from '../src/repositories/jobs.js';
import { createHash } from 'node:crypto';
import { schema } from '@kms/database';

function ownerId(label: string): string {
  return `oidc_${createHash('sha256').update(`test-${label}`).digest('hex')}`;
}

const OWNER_A: OwnerContext = { ownerId: ownerId('owner-a') };
const OWNER_B: OwnerContext = { ownerId: ownerId('owner-b') };
const NX_ID = '00000000-0000-0000-0000-000000000000';

function captureProfile() {
  return {
    container: 'webm',
    codec: 'opus',
    sampleRate: 48000,
    bitDepth: 16,
    channels: 1,
    bitrate: 96000,
    opusFrameDurationMs: 20,
    complexity: 5,
  };
}

async function insertMeeting(db: TestDb, meetingId: string, owner: OwnerContext, title: string) {
  await db.db.insert(schema.meetings).values({
    id: meetingId,
    ownerId: owner.ownerId,
    title,
    language: 'en',
    mode: 'meeting_only',
    speechMode: 'api',
    timezone: 'UTC',
    version: 1,
    state: 'draft',
    captureProfile: captureProfile(),
    createdAt: new Date(),
  });
  await db.db.insert(schema.meetingCaptureSources).values({
    meetingId,
    source: 'mic',
  });
}

describe('P04 IDOR matrix (real PostgreSQL)', () => {
  let testDb: TestDb;
  const policy = new OwnerAuthorizationPolicy();
  const meetingsRepo = new MeetingsRepository();
  const jobsRepo = new JobsMetadataRepository();

  beforeAll(async () => {
    testDb = await startPostgres();
    await testDb.db.insert(schema.users).values({ id: OWNER_A.ownerId }).onConflictDoNothing();
    await testDb.db.insert(schema.users).values({ id: OWNER_B.ownerId }).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await testDb.close();
  }, 30_000);

  // ── 1. Meeting resource IDOR ─────────────────────────────────────

  describe('meeting resource', () => {
    const meetingIdA = crypto.randomUUID();

    beforeAll(async () => {
      await insertMeeting(testDb, meetingIdA, OWNER_A, 'Owner A meeting');
    });

    it('returns the meeting for owner A', async () => {
      const meeting = await meetingsRepo.get(OWNER_A, testDb.db, meetingIdA);
      expect(meeting).not.toBeNull();
      expect(meeting!.title).toBe('Owner A meeting');
    });

    it('hides the meeting from owner B (returns null)', async () => {
      const meeting = await meetingsRepo.get(OWNER_B, testDb.db, meetingIdA);
      expect(meeting).toBeNull();
    });

    it('returns null for nonexistent meeting (same shape as denied)', async () => {
      const meeting = await meetingsRepo.get(OWNER_A, testDb.db, NX_ID);
      expect(meeting).toBeNull();
    });

    it('enforces consistent null across wrong-owner and nonexistent', async () => {
      const wrongOwner = await meetingsRepo.get(OWNER_B, testDb.db, meetingIdA);
      const nonexistent = await meetingsRepo.get(OWNER_A, testDb.db, NX_ID);
      expect(wrongOwner).toBeNull();
      expect(nonexistent).toBeNull();
    });
  });

  // ── 2. Job resource IDOR ─────────────────────────────────────────

  describe('job resource', () => {
    const jobIdA = crypto.randomUUID();
    const jobMeetingId = crypto.randomUUID();

    beforeAll(async () => {
      // Job FK requires a meeting; create one first
      await insertMeeting(testDb, jobMeetingId, OWNER_A, 'Job parent meeting');
      await testDb.db.insert(schema.jobs).values({
        id: jobIdA,
        ownerId: OWNER_A.ownerId,
        meetingId: jobMeetingId,
        type: 'minutes_generation',
        state: 'pending',
        maxAttempts: 3,
        createdAt: new Date(),
      });
    });

    it('returns the job for owner A', async () => {
      const job = await jobsRepo.get(OWNER_A, testDb.db, jobIdA);
      expect(job).not.toBeNull();
      expect(job!.id).toBe(jobIdA);
    });

    it('hides the job from owner B', async () => {
      const job = await jobsRepo.get(OWNER_B, testDb.db, jobIdA);
      expect(job).toBeNull();
    });

    it('returns null for nonexistent job', async () => {
      const job = await jobsRepo.get(OWNER_A, testDb.db, NX_ID);
      expect(job).toBeNull();
    });
  });

  // ── 3. Meeting listing scope ─────────────────────────────────────

  describe('meeting listing scope', () => {
    beforeAll(async () => {
      await insertMeeting(testDb, crypto.randomUUID(), OWNER_A, 'A meeting list');
      await insertMeeting(testDb, crypto.randomUUID(), OWNER_B, 'B meeting list');
    });

    it('owner A list contains only A meetings', async () => {
      const aList = await meetingsRepo.list(OWNER_A, testDb.db, { limit: 10 });
      expect(aList.items.length).toBeGreaterThanOrEqual(1);
      const foreign = aList.items.find((m) => m.ownerId !== OWNER_A.ownerId);
      expect(foreign).toBeUndefined();
    });

    it('owner B list contains only B meetings', async () => {
      const bList = await meetingsRepo.list(OWNER_B, testDb.db, { limit: 10 });
      expect(bList.items.length).toBeGreaterThanOrEqual(1);
      const foreign = bList.items.find((m) => m.ownerId !== OWNER_B.ownerId);
      expect(foreign).toBeUndefined();
    });
  });

  // ── 4. Policy invariants ─────────────────────────────────────────

  describe('policy invariants', () => {
    it.each(['meeting', 'job', 'export', 'object_metadata'] as const)(
      'ALLOW owner A / DENY owner B / DENY nonexistent for %s',
      (resourceClass) => {
        expect(
          policy.authorize(OWNER_A, {
            resourceClass,
            id: 'r-1',
            ownerId: OWNER_A.ownerId,
          }),
        ).toEqual({ allowed: true, status: 200 });

        expect(
          policy.authorize(OWNER_B, {
            resourceClass,
            id: 'r-1',
            ownerId: OWNER_A.ownerId,
          }),
        ).toEqual(DENIED_RESOURCE);

        expect(policy.authorize(OWNER_A, null)).toEqual(DENIED_RESOURCE);
      },
    );

    it('wrong-owner and nonexistent share identical denial shape', () => {
      const wrongOwner = policy.authorize(OWNER_B, {
        resourceClass: 'meeting',
        id: 'm-1',
        ownerId: OWNER_A.ownerId,
      });
      const nonexistent = policy.authorize(OWNER_A, null);
      expect(wrongOwner).toEqual(nonexistent);
      expect(wrongOwner).not.toHaveProperty('resource');
    });
  });
});
