import type { CloudConsentRecord } from './types';

export const CONSENT_COPY_VERSION = 'v0.1-placeholder';

export function createConsentRecord(
  providerName: string,
  scope: 'live' | 'final' | 'cloud_check',
  cloudCheckApproval?: 'uncertain_ranges' | 'full',
  providerRegion?: string,
): CloudConsentRecord {
  return {
    providerName,
    providerRegion,
    scope,
    cloudCheckApproval,
    copyVersion: CONSENT_COPY_VERSION,
    policyVersion: 1,
    grantedAt: new Date().toISOString(),
  };
}
