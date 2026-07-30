import type { Clock } from '../contracts/clock.js';

export class FakeClock implements Clock {
  private wallTime: number;
  private monotonicTime: number;

  constructor(initialTime: number = 1700000000000, initialMonotonic: number = 0) {
    this.wallTime = initialTime;
    this.monotonicTime = initialMonotonic;
  }

  now(): string {
    return new Date(this.wallTime).toISOString();
  }

  monotonicNow(): number {
    return this.monotonicTime;
  }

  async sleep(ms: number): Promise<void> {
    this.tick(ms);
  }

  tick(ms: number): void {
    this.wallTime += ms;
    this.monotonicTime += ms;
  }

  setWallTime(ms: number): void {
    this.wallTime = ms;
  }

  getWallTime(): number {
    return this.wallTime;
  }

  getMonotonicTime(): number {
    return this.monotonicTime;
  }
}
