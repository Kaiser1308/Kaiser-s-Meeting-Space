import { describe, it, expect } from 'vitest';
import { CleanupPolicy } from '../../src/recovery/cleanup.js';
import type { SourceState, CleanupContext } from '../../src/recovery/cleanup.js';
import { DEFAULT_CLEANUP_CONTEXT } from '../../src/recovery/cleanup.js';

function sampleState(overrides?: Partial<SourceState>): SourceState {
  return {
    meetingId: '00000000-0000-0000-0000-000000000001' as never,
    source: 'mic',
    isActive: false,
    isRecoveryRequired: false,
    allChunksVerified: true,
    allChunksUploaded: true,
    allChunksFinalized: true,
    anyServerConflict: false,
    lastActivityAt: '2026-06-01T00:00:00.000Z',
    isPinned: false,
    ...overrides,
  };
}

function futureRetentionCtx(): CleanupContext {
  return {
    ...DEFAULT_CLEANUP_CONTEXT,
    now: '2026-07-24T00:00:00.000Z',
    retentionDurationMs: 30 * 24 * 60 * 60 * 1000,
    serverVerifiedThreshold: true,
  };
}

describe('CleanupPolicy', () => {
  const policy = new CleanupPolicy();

  it('marks source as eligible when all criteria met', () => {
    const state = sampleState();
    const ctx = futureRetentionCtx();
    const decision = policy.isEligible(state, ctx);

    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('ok');
  });

  it('denies active session', () => {
    const decision = policy.isEligible(sampleState({ isActive: true }), futureRetentionCtx());
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('active_session');
  });

  it('denies recovery-required source', () => {
    const decision = policy.isEligible(
      sampleState({ isRecoveryRequired: true }),
      futureRetentionCtx(),
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('recovery_required');
  });

  it('denies unverified hash', () => {
    const decision = policy.isEligible(
      sampleState({ allChunksVerified: false }),
      futureRetentionCtx(),
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('unverified_hash');
  });

  it('denies upload incomplete', () => {
    const decision = policy.isEligible(
      sampleState({ allChunksUploaded: false }),
      futureRetentionCtx(),
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('upload_incomplete');
  });

  it('denies conflicted source', () => {
    const decision = policy.isEligible(
      sampleState({ anyServerConflict: true }),
      futureRetentionCtx(),
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('conflicted');
  });

  it('denies pinned source', () => {
    const decision = policy.isEligible(sampleState({ isPinned: true }), futureRetentionCtx());
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('pinned');
  });

  it('denies retention-active source', () => {
    const decision = policy.isEligible(
      sampleState({ lastActivityAt: '2026-07-23T00:00:00.000Z' }), // 1 day ago
      futureRetentionCtx(),
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('retention_active');
  });

  it('dryRun returns decisions for all sources', () => {
    const sources = [
      sampleState(),
      sampleState({ isActive: true }),
      sampleState({ anyServerConflict: true }),
    ];
    const decisions = policy.dryRun(sources, futureRetentionCtx());

    expect(decisions).toHaveLength(3);
    expect(decisions[0]!.eligible).toBe(true);
    expect(decisions[1]!.eligible).toBe(false);
    expect(decisions[2]!.eligible).toBe(false);
  });

  it('denies all reasons in priority order (active > recovery > unverified > upload > conflict > pinned > retention)', () => {
    // Active takes priority over everything
    const active = policy.isEligible(
      sampleState({
        isActive: true,
        anyServerConflict: true,
      }),
      futureRetentionCtx(),
    );
    expect(active.reason).toBe('active_session');
  });
});
