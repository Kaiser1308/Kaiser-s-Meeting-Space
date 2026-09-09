import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { bearerAuth } from './bearer-auth.js';

describe('bearerAuth plugin', () => {
  describe('authMode: "local"', () => {
    it('allows unauthenticated requests and attaches local-dev-user context', async () => {
      const app = Fastify();
      const mockIdentityResolver = {
        resolve: vi.fn().mockResolvedValue({
          issuer: 'local',
          subject: 'local-dev-user',
          ownerId: 'owner-local-123',
        }),
      };
      const mockVerifier = {
        verify: vi.fn(),
      };

      await app.register(bearerAuth, {
        verifier: mockVerifier as any,
        identity: mockIdentityResolver as any,
        authMode: 'local',
      });

      app.get('/test', async (req) => {
        return {
          ownerContext: req.authenticatedOwnerContext,
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ownerContext: {
          issuer: 'local',
          subject: 'local-dev-user',
          ownerId: 'owner-local-123',
        },
      });
      expect(mockIdentityResolver.resolve).toHaveBeenCalledWith({
        issuer: 'local',
        subject: 'local-dev-user',
      });
      expect(mockVerifier.verify).not.toHaveBeenCalled();
    });

    it('allows requests with an Authorization header in local mode', async () => {
      const app = Fastify();
      const mockIdentityResolver = {
        resolve: vi.fn().mockResolvedValue({
          issuer: 'local',
          subject: 'local-dev-user',
          ownerId: 'owner-local-123',
        }),
      };
      const mockVerifier = {
        verify: vi.fn(),
      };

      await app.register(bearerAuth, {
        verifier: mockVerifier as any,
        identity: mockIdentityResolver as any,
        authMode: 'local',
      });

      app.get('/test', async (req) => {
        return {
          ownerContext: req.authenticatedOwnerContext,
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer local-dev-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ownerContext: {
          issuer: 'local',
          subject: 'local-dev-user',
          ownerId: 'owner-local-123',
        },
      });
    });
  });

  describe('authMode: "oidc" (or undefined)', () => {
    it('rejects unauthenticated requests with 401 when authMode is oidc', async () => {
      const app = Fastify();
      const mockIdentityResolver = {
        resolve: vi.fn(),
      };
      const mockVerifier = {
        verify: vi.fn(),
      };

      await app.register(bearerAuth, {
        verifier: mockVerifier as any,
        identity: mockIdentityResolver as any,
        authMode: 'oidc',
      });

      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'UNAUTHENTICATED' });
    });

    it('rejects unauthenticated requests with 401 when authMode is undefined', async () => {
      const app = Fastify();
      const mockIdentityResolver = {
        resolve: vi.fn(),
      };
      const mockVerifier = {
        verify: vi.fn(),
      };

      await app.register(bearerAuth, {
        verifier: mockVerifier as any,
        identity: mockIdentityResolver as any,
      });

      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'UNAUTHENTICATED' });
    });

    it('accepts valid bearer token and attaches resolved context', async () => {
      const app = Fastify();
      const mockIdentityResolver = {
        resolve: vi.fn().mockResolvedValue({
          issuer: 'https://oidc.example.com',
          subject: 'sub-456',
          ownerId: 'owner-456',
        }),
      };
      const mockVerifier = {
        verify: vi.fn(),
      };
      mockVerifier.verify = vi.fn().mockResolvedValue({
        valid: true,
        issuer: 'https://oidc.example.com',
        subject: 'sub-456',
      });

      await app.register(bearerAuth, {
        verifier: mockVerifier as any,
        identity: mockIdentityResolver as any,
        authMode: 'oidc',
      });

      app.get('/test', async (req) => ({
        ownerContext: req.authenticatedOwnerContext,
      }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ownerContext: {
          issuer: 'https://oidc.example.com',
          subject: 'sub-456',
          ownerId: 'owner-456',
        },
      });
      expect(mockVerifier.verify).toHaveBeenCalledWith({ token: 'valid-jwt-token' });
      expect(mockIdentityResolver.resolve).toHaveBeenCalledWith({
        issuer: 'https://oidc.example.com',
        subject: 'sub-456',
      });
    });
  });
});
