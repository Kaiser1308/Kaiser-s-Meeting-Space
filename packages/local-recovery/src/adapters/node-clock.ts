import { performance } from 'node:perf_hooks';
import type { Clock } from '../contracts/clock.js';

export class NodeClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }

  monotonicNow(): number {
    return performance.now();
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
