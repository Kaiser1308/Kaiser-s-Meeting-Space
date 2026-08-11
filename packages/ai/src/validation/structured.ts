export interface StructuredSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
function containsForbidden(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || typeof value !== 'object') return depth > 12;
  if (Array.isArray(value)) return value.some((item) => containsForbidden(item, depth + 1));
  return Object.entries(value).some(
    ([key, entry]) => forbiddenKeys.has(key) || containsForbidden(entry, depth + 1),
  );
}
export function validateStructuredOutput<T>(
  value: unknown,
  schema: StructuredSchema<T>,
  limits = { maxBytes: 1_000_000 },
): { ok: true; value: T } | { ok: false; reason: 'invalid' | 'unsafe' | 'oversized' } {
  let bytes = 0;
  try {
    bytes = JSON.stringify(value).length;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (bytes > limits.maxBytes) return { ok: false, reason: 'oversized' };
  if (containsForbidden(value)) return { ok: false, reason: 'unsafe' };
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data as T } : { ok: false, reason: 'invalid' };
}
export async function repairStructuredOutput<T>(
  raw: unknown,
  schema: StructuredSchema<T>,
  repair: (value: unknown, attempt: number) => Promise<unknown>,
  options: { maxAttempts: number },
): Promise<T> {
  let candidate = raw;
  for (let attempt = 0; attempt <= options.maxAttempts; attempt += 1) {
    const result = validateStructuredOutput(candidate, schema);
    if (result.ok) return result.value;
    if (attempt === options.maxAttempts) break;
    candidate = await repair(candidate, attempt + 1);
  }
  throw new Error('structured output could not be validated');
}
