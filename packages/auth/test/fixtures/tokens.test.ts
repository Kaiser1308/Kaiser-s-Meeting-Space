import { describe, it, expect } from 'vitest';
import { generateToken, getAllTokenScenarios, getTokenScenario, verifyToken } from '@kms/auth';

describe('tokens.ts - Token fixture generation', () => {
  describe('generateToken scenarios', () => {
    it('should generate valid token with correct claims', async () => {
      const token = await generateToken('valid', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.claims?.sub).toBe('user123');
    });

    it('should generate expired token that fails verification', async () => {
      const token = await generateToken('expired', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('expired');
    });

    it('should generate future token that fails verification', async () => {
      const token = await generateToken('future', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('future');
    });

    it('should generate token with wrong audience', async () => {
      const token = await generateToken('wrong-audience', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('audience');
    });

    it('should generate token with wrong issuer', async () => {
      const token = await generateToken('wrong-issuer', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('issuer');
    });

    it('should generate token with wrong algorithm', async () => {
      const token = await generateToken('wrong-algorithm', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('algorithm');
    });

    it('should generate token signed with wrong key', async () => {
      const token = await generateToken('wrong-key', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('signature');
    });

    it('should generate revoked token', async () => {
      const token = await generateToken('revoked', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('revoked');
    });

    it('should generate token for disabled issuer', async () => {
      const token = await generateToken('disabled-issuer', 'user123');

      expect(token).toBeDefined();
      const verification = await verifyToken(token);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('disabled');
    });
  });

  describe('getAllTokenScenarios', () => {
    it('should return all required token scenarios', async () => {
      const scenarios = await getAllTokenScenarios();

      expect(scenarios).toBeDefined();
      expect(Array.isArray(scenarios)).toBe(true);

      const scenarioNames = scenarios.map((s) => s.name);
      expect(scenarioNames).toContain('valid');
      expect(scenarioNames).toContain('expired');
      expect(scenarioNames).toContain('future');
      expect(scenarioNames).toContain('wrong-audience');
      expect(scenarioNames).toContain('wrong-issuer');
      expect(scenarioNames).toContain('wrong-algorithm');
      expect(scenarioNames).toContain('wrong-key');
      expect(scenarioNames).toContain('revoked');
      expect(scenarioNames).toContain('disabled-issuer');
    });

    it('should provide tokens for each scenario', async () => {
      const scenarios = await getAllTokenScenarios();

      scenarios.forEach((scenario) => {
        expect(scenario.name).toBeDefined();
        expect(scenario.token).toBeDefined();
        expect(typeof scenario.token).toBe('string');
        expect(scenario.token.split('.')).toHaveLength(3);
      });
    });

    it('should provide description for each scenario', async () => {
      const scenarios = await getAllTokenScenarios();

      scenarios.forEach((scenario) => {
        expect(scenario.description).toBeDefined();
        expect(typeof scenario.description).toBe('string');
        expect(scenario.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getTokenScenario', () => {
    it('should return specific scenario by name', async () => {
      const scenario = await getTokenScenario('valid');

      expect(scenario).toBeDefined();
      expect(scenario?.name).toBe('valid');
      expect(scenario?.token).toBeDefined();
    });

    it('should return undefined for unknown scenario', async () => {
      const scenario = await getTokenScenario('unknown-scenario');

      expect(scenario).toBeUndefined();
    });

    it('should return deterministic scenarios', async () => {
      const scenario1 = await getTokenScenario('valid');
      const scenario2 = await getTokenScenario('valid');

      expect(scenario1?.token).toBe(scenario2?.token);
    });
  });

  describe('deterministic token generation', () => {
    it('should generate the same token for same inputs', async () => {
      const token1 = await generateToken('valid', 'user123');
      const token2 = await generateToken('valid', 'user123');

      expect(token1).toBe(token2);
    });

    it('should generate different tokens for different subjects', async () => {
      const token1 = await generateToken('valid', 'user123');
      const token2 = await generateToken('valid', 'user456');

      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for different scenarios', async () => {
      const token1 = await generateToken('valid', 'user123');
      const token2 = await generateToken('expired', 'user123');

      expect(token1).not.toBe(token2);
    });
  });

  describe('synthetic token properties', () => {
    it('should prove tokens are synthetic by checking issuer claim', async () => {
      const scenarios = await getAllTokenScenarios();

      scenarios.forEach((scenario) => {
        const parts = scenario.token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

        expect(payload.iss).toMatch(/test-issuer/);
        expect(payload.iss).not.toMatch(
          /accounts\.google\.com|login\.microsoftonline\.com|api\.auth0\.com/,
        );
      });
    });

    it('should prove tokens use synthetic keys', async () => {
      const scenarios = await getAllTokenScenarios();

      scenarios.forEach((scenario) => {
        const parts = scenario.token.split('.');
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());

        expect(header.kid).toMatch(/test-issuer-synthetic/);
        expect(header.kid).not.toMatch(/prod|production|real|live/);
      });
    });

    it('should have clear indication tokens are test fixtures', async () => {
      const scenarios = await getAllTokenScenarios();

      scenarios.forEach((scenario) => {
        const parts = scenario.token.split('.');
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

        // Check issuer is synthetic
        expect(payload.iss).toMatch(/test/);

        // Check key ID is synthetic
        expect(header.kid).toMatch(/synthetic|test/);
      });
    });
  });

  describe('rotation cache behavior', () => {
    it('should prove deterministic key rotation behavior', async () => {
      const token1 = await generateToken('valid', 'user123');
      const token2 = await generateToken('valid', 'user123');

      expect(token1).toBe(token2);

      const parts1 = token1.split('.');
      const parts2 = token2.split('.');
      const header1 = JSON.parse(Buffer.from(parts1[0], 'base64').toString());
      const header2 = JSON.parse(Buffer.from(parts2[0], 'base64').toString());

      expect(header1.kid).toBe(header2.kid);
    });

    it('should generate tokens with consistent key IDs', async () => {
      const scenarios = await getAllTokenScenarios();

      scenarios.forEach((scenario) => {
        const parts = scenario.token.split('.');
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());

        expect(header.kid).toBeDefined();
        expect(typeof header.kid).toBe('string');
      });
    });
  });
});
