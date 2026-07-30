import { describe, it, expect } from 'vitest';
import { FakeClock } from '../../src/adapters/fake-clock.js';
import type { Clock } from '../../src/contracts/clock.js';

describe('Clock contract (fake adapter)', () => {
  it('now() returns an ISO 8601 string', async () => {
    const clock: Clock = new FakeClock(1700000000000, 0);
    const iso = clock.now();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('now() advances after tick', async () => {
    const clock = new FakeClock(1700000000000, 0);
    const t1 = clock.now();
    clock.tick(5000);
    const t2 = clock.now();
    expect(new Date(t2).getTime()).toBeGreaterThan(new Date(t1).getTime());
  });

  it('monotonicNow() returns a number', async () => {
    const clock = new FakeClock(1700000000000, 0);
    const m = clock.monotonicNow();
    expect(typeof m).toBe('number');
    expect(m).toBeGreaterThanOrEqual(0);
  });

  it('monotonicNow() increases after tick', async () => {
    const clock = new FakeClock(1700000000000, 0);
    const m1 = clock.monotonicNow();
    clock.tick(100);
    const m2 = clock.monotonicNow();
    expect(m2).toBeGreaterThan(m1);
  });

  it('sleep() advances both clocks', async () => {
    const clock = new FakeClock(1700000000000, 0);
    const m1 = clock.monotonicNow();
    const t1 = clock.now();

    await clock.sleep(50);

    const m2 = clock.monotonicNow();
    const t2 = clock.now();
    expect(m2).toBeGreaterThan(m1);
    expect(new Date(t2).getTime()).toBeGreaterThan(new Date(t1).getTime());
  });

  it('tick advances both wall and monotonic time', () => {
    const clock = new FakeClock(1700000000000, 0);
    const wallBefore = clock.getWallTime();
    const monoBefore = clock.getMonotonicTime();
    clock.tick(1234);
    expect(clock.getWallTime()).toBe(wallBefore + 1234);
    expect(clock.getMonotonicTime()).toBe(monoBefore + 1234);
  });

  it('setWallTime changes wall clock', () => {
    const clock = new FakeClock(1700000000000, 0);
    clock.setWallTime(9999999999999);
    expect(clock.getWallTime()).toBe(9999999999999);
  });
});
