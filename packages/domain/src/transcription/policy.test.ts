import { describe, it, expect } from 'vitest';
import {
  TranscriptionPolicyV1Schema,
  DEFAULT_TRANSCRIPTION_POLICY,
  policyFromLegacySpeechMode,
} from './policy.js';
import type { TranscriptionPolicyV1 } from './policy.js';

describe('TranscriptionPolicyV1', () => {
  describe('DEFAULT_TRANSCRIPTION_POLICY', () => {
    it('should be valid', () => {
      const result = TranscriptionPolicyV1Schema.safeParse(DEFAULT_TRANSCRIPTION_POLICY);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.final).toBe('local');
        expect(result.data.cloudConsent).toBe('not_required');
      }
    });
  });

  describe('policyFromLegacySpeechMode', () => {
    it('should map local mode without consent', () => {
      const policy = policyFromLegacySpeechMode('local', 'vi');
      expect(policy.final).toBe('local');
      expect(policy.live).toBe('off');
      expect(policy.cloudCheckScope).toBe('off');
      expect(policy.cloudConsent).toBe('not_required');

      const result = TranscriptionPolicyV1Schema.safeParse(policy);
      expect(result.success).toBe(true);
    });

    it('should map api mode with consent required', () => {
      const policy = policyFromLegacySpeechMode('api', 'vi');
      expect(policy.final).toBe('cloud');
      expect(policy.live).toBe('off');
      expect(policy.cloudCheckScope).toBe('off');
      expect(policy.cloudConsent).toBe('required');

      const result = TranscriptionPolicyV1Schema.safeParse(policy);
      expect(result.success).toBe(true);
    });
  });

  describe('TranscriptionPolicyV1Schema invariants', () => {
    const basePolicy: TranscriptionPolicyV1 = {
      version: 1,
      language: 'vi',
      live: 'off',
      final: 'local',
      cloudCheckScope: 'off',
      cloudConsent: 'not_required',
    };

    it('allows valid local policy', () => {
      expect(TranscriptionPolicyV1Schema.safeParse(basePolicy).success).toBe(true);
    });

    it('Rule 1: final !== "local_cloud_check" requires cloudCheckScope === "off"', () => {
      const p = { ...basePolicy, final: 'local' as const, cloudCheckScope: 'full' as const };
      const result = TranscriptionPolicyV1Schema.safeParse(p);
      expect(result.success).toBe(false);
    });

    it('Rule 2: final === "local_cloud_check" requires cloudCheckScope !== "off"', () => {
      const p1 = {
        ...basePolicy,
        final: 'local_cloud_check' as const,
        cloudCheckScope: 'off' as const,
      };
      const result1 = TranscriptionPolicyV1Schema.safeParse(p1);
      expect(result1.success).toBe(false);

      const p2 = {
        ...basePolicy,
        final: 'local_cloud_check' as const,
        cloudCheckScope: 'full' as const,
        cloudConsent: 'granted' as const,
      };
      const result2 = TranscriptionPolicyV1Schema.safeParse(p2);
      expect(result2.success).toBe(true);

      const p3 = {
        ...basePolicy,
        final: 'local_cloud_check' as const,
        cloudCheckScope: 'uncertain_ranges' as const,
        cloudConsent: 'granted' as const,
      };
      const result3 = TranscriptionPolicyV1Schema.safeParse(p3);
      expect(result3.success).toBe(true);
    });

    it('Rule 3: any cloud path requires cloudConsent "required" or "granted"', () => {
      // live = cloud, final = local -> requires consent
      const p1 = { ...basePolicy, live: 'cloud' as const, cloudConsent: 'not_required' as const };
      const result1 = TranscriptionPolicyV1Schema.safeParse(p1);
      expect(result1.success).toBe(false);

      const p1Valid = { ...p1, cloudConsent: 'required' as const };
      expect(TranscriptionPolicyV1Schema.safeParse(p1Valid).success).toBe(true);

      // final = cloud -> requires consent
      const p2 = { ...basePolicy, final: 'cloud' as const, cloudConsent: 'not_required' as const };
      const result2 = TranscriptionPolicyV1Schema.safeParse(p2);
      expect(result2.success).toBe(false);

      const p2Valid = { ...p2, cloudConsent: 'granted' as const };
      expect(TranscriptionPolicyV1Schema.safeParse(p2Valid).success).toBe(true);

      // cloudCheckScope !== off -> requires consent
      const p3 = {
        ...basePolicy,
        final: 'local_cloud_check' as const,
        cloudCheckScope: 'uncertain_ranges' as const,
        cloudConsent: 'not_required' as const,
      };
      const result3 = TranscriptionPolicyV1Schema.safeParse(p3);
      expect(result3.success).toBe(false);

      const p3Valid = { ...p3, cloudConsent: 'granted' as const };
      expect(TranscriptionPolicyV1Schema.safeParse(p3Valid).success).toBe(true);
    });
  });
});
