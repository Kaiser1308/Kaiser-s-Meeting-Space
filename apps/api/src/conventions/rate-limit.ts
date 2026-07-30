import type { RateLimiter } from './types.js';

export function createRateLimiter(options: { max: number; windowMs: number }): RateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();
  return (key) => {
    const now = Date.now();
    const current = entries.get(key);
    if (!current || current.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    current.count += 1;
    return current.count <= options.max
      ? { allowed: true, retryAfterSeconds: 0 }
      : {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
  };
}
