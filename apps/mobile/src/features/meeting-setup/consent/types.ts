export type CloudConsentScope = 'live' | 'final' | 'cloud_check';
export type CloudCheckApproval = 'uncertain_ranges' | 'full';

export interface CloudConsentRecord {
  providerName: string;
  providerRegion?: string;
  scope: CloudConsentScope;
  cloudCheckApproval?: CloudCheckApproval;
  copyVersion: string;
  policyVersion: 1;
  grantedAt: string;
}
