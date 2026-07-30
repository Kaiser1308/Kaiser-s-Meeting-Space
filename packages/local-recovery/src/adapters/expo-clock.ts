import type { Clock } from '../contracts/clock.js';

/**
 * Clock adapter for Expo/React Native.
 * Uses Date for wall-clock and performance.now() for monotonic time.
 */
export class ExpoClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }

  monotonicNow(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
