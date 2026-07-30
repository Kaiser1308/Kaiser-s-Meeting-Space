import { describe, it, expect } from 'vitest';
import { computeHealthSnapshot } from './health-monitor.js';

describe('HealthMonitor (P09-T06)', () => {
  describe('computeHealthSnapshot', () => {
    it('returns ok when storage is abundant', () => {
      const snap = computeHealthSnapshot(500_000_000, 1_000_000_000);
      expect(snap.storageWarning).toBe('ok');
      expect(snap.percentRemaining).toBe(50);
    });

    it('returns warning at 10% remaining', () => {
      const snap = computeHealthSnapshot(100_000_000, 1_000_000_000);
      expect(snap.storageWarning).toBe('warning');
      expect(snap.percentRemaining).toBe(10);
    });

    it('returns critical at 5% remaining', () => {
      const snap = computeHealthSnapshot(50_000_000, 1_000_000_000);
      expect(snap.storageWarning).toBe('critical');
      expect(snap.percentRemaining).toBe(5);
    });

    it('returns critical at 1% remaining', () => {
      const snap = computeHealthSnapshot(10_000_000, 1_000_000_000);
      expect(snap.storageWarning).toBe('critical');
    });

    it('estimates remaining minutes correctly', () => {
      const bytesPerMinute = 720_000;
      // 60 minutes worth of storage
      const snap = computeHealthSnapshot(bytesPerMinute * 60, bytesPerMinute * 120);
      expect(snap.estimatedRemainingMinutes).toBe(60);
    });

    it('returns 0 minutes when storage is exhausted', () => {
      const snap = computeHealthSnapshot(0, 1_000_000_000);
      expect(snap.storageWarning).toBe('critical');
      expect(snap.estimatedRemainingMinutes).toBe(0);
    });

    it('handles zero total bytes gracefully', () => {
      const snap = computeHealthSnapshot(0, 0);
      expect(snap.percentRemaining).toBe(100);
      expect(snap.storageWarning).toBe('ok');
    });

    it('respects custom threshold configurations', () => {
      const snap = computeHealthSnapshot(200_000_000, 1_000_000_000, {
        warningThresholdBytes: 300_000_000, // 30%
        criticalThresholdBytes: 150_000_000, // 15%
      });
      // 20% is below 30% warning but above 15% critical
      expect(snap.storageWarning).toBe('warning');
    });

    it('respects custom bytes per minute', () => {
      const snap = computeHealthSnapshot(1_000_000, 1_000_000_000, {
        bytesPerMinute: 100_000,
      });
      expect(snap.estimatedRemainingMinutes).toBe(10); // 1_000_000 / 100_000
    });
  });
});
