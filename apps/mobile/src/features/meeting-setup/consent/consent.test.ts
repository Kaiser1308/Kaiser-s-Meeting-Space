import { describe, it, expect } from 'vitest';
import { createConsentRecord, CONSENT_COPY_VERSION } from './consent.js';

describe('consent', () => {
  it('creates a consent record with placeholder copy version', () => {
    const record = createConsentRecord('ProviderX', 'final');
    expect(record.copyVersion).toBe(CONSENT_COPY_VERSION);
    expect(record.scope).toBe('final');
    expect(record.providerName).toBe('ProviderX');
    expect(record.policyVersion).toBe(1);
    expect(record.grantedAt).toBeDefined();
  });

  it('no field authorizes generative AI', () => {
    const record = createConsentRecord('ProviderX', 'final');
    // Types explicitly don't have minutes_ai or auto_record scope
    expect(record.scope).not.toBe('minutes_ai');
    expect(record.scope).not.toBe('auto_record');
  });
});
