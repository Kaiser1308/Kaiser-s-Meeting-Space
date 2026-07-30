import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, findByType, getText } from '../../../test-utils';
import { CallbackScreen, processCallback } from './callback';
import type { ClientAuth } from '../../../auth/auth-client';

describe('processCallback', () => {
  it('calls completeLogin with provided code, state, and nonce', async () => {
    const completeLogin = vi.fn(async () => ({ expiresAt: Date.now() + 300000 }));
    const mockClient = { completeLogin } as unknown as ClientAuth;
    const onComplete = vi.fn();

    await processCallback('test-code', 'test-state', 'test-nonce', mockClient, onComplete);

    expect(completeLogin).toHaveBeenCalledWith({
      code: 'test-code',
      state: 'test-state',
      nonce: 'test-nonce',
    });
  });

  it('calls onComplete(true) when completeLogin succeeds', async () => {
    const completeLogin = vi.fn(async () => ({ expiresAt: Date.now() + 300000 }));
    const mockClient = { completeLogin } as unknown as ClientAuth;
    const onComplete = vi.fn();

    const result = await processCallback(
      'test-code',
      'test-state',
      'test-nonce',
      mockClient,
      onComplete,
    );

    expect(result).toBeNull();
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('returns offline key when completeLogin throws offline error', async () => {
    const completeLogin = vi.fn(async () => {
      throw new Error('offline');
    });
    const mockClient = { completeLogin } as unknown as ClientAuth;
    const onComplete = vi.fn();

    const result = await processCallback(
      'test-code',
      'test-state',
      'test-nonce',
      mockClient,
      onComplete,
    );

    expect(result).toBe('offline');
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('returns expired key when completeLogin throws expired error', async () => {
    const completeLogin = vi.fn(async () => {
      throw new Error('expired');
    });
    const mockClient = { completeLogin } as unknown as ClientAuth;
    const onComplete = vi.fn();

    const result = await processCallback(
      'test-code',
      'test-state',
      'test-nonce',
      mockClient,
      onComplete,
    );

    expect(result).toBe('expired');
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('returns revoked key when completeLogin throws revoked error', async () => {
    const completeLogin = vi.fn(async () => {
      throw new Error('revoked');
    });
    const mockClient = { completeLogin } as unknown as ClientAuth;
    const onComplete = vi.fn();

    const result = await processCallback(
      'test-code',
      'test-state',
      'test-nonce',
      mockClient,
      onComplete,
    );

    expect(result).toBe('revoked');
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('returns generic key when completeLogin throws unknown error', async () => {
    const completeLogin = vi.fn(async () => {
      throw new Error('unknown error');
    });
    const mockClient = { completeLogin } as unknown as ClientAuth;
    const onComplete = vi.fn();

    const result = await processCallback(
      'test-code',
      'test-state',
      'test-nonce',
      mockClient,
      onComplete,
    );

    expect(result).toBe('generic');
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('returns generic key when nonce is missing', async () => {
    const completeLogin = vi.fn(async () => ({ expiresAt: Date.now() + 300000 }));
    const mockClient = { completeLogin } as unknown as ClientAuth;
    const onComplete = vi.fn();

    const result = await processCallback(
      'test-code',
      'test-state',
      undefined,
      mockClient,
      onComplete,
    );

    expect(result).toBe('generic');
    expect(onComplete).toHaveBeenCalledWith(false);
  });
});

describe('CallbackScreen', () => {
  it('shows loading text when no error', () => {
    const mockClient = {} as ClientAuth;
    const onComplete = vi.fn();

    const node = render(
      <CallbackScreen
        code="test-code"
        state="test-state"
        nonce="test-nonce"
        onComplete={onComplete}
        client={mockClient}
      />,
    );

    const textElements = findByType(node, 'Text');
    const loadingText = getText(textElements[0]);
    expect(loadingText).toBe('Loading...');
  });

  it('shows offline error when errorKey is offline', () => {
    const mockClient = {} as ClientAuth;
    const onComplete = vi.fn();

    const node = render(
      <CallbackScreen
        code="test-code"
        state="test-state"
        nonce="test-nonce"
        onComplete={onComplete}
        client={mockClient}
        errorKey="offline"
      />,
    );

    const textElements = findByType(node, 'Text');
    const errorText = getText(textElements[0]);
    expect(errorText).toContain('offline');
  });

  it('shows expired error when errorKey is expired', () => {
    const mockClient = {} as ClientAuth;
    const onComplete = vi.fn();

    const node = render(
      <CallbackScreen
        code="test-code"
        state="test-state"
        nonce="test-nonce"
        onComplete={onComplete}
        client={mockClient}
        errorKey="expired"
      />,
    );

    const textElements = findByType(node, 'Text');
    const errorText = getText(textElements[0]);
    expect(errorText).toContain('expired');
  });

  it('shows revoked error when errorKey is revoked', () => {
    const mockClient = {} as ClientAuth;
    const onComplete = vi.fn();

    const node = render(
      <CallbackScreen
        code="test-code"
        state="test-state"
        nonce="test-nonce"
        onComplete={onComplete}
        client={mockClient}
        errorKey="revoked"
      />,
    );

    const textElements = findByType(node, 'Text');
    const errorText = getText(textElements[0]);
    expect(errorText).toContain('revoked');
  });

  it('shows generic error when errorKey is generic', () => {
    const mockClient = {} as ClientAuth;
    const onComplete = vi.fn();

    const node = render(
      <CallbackScreen
        code="test-code"
        state="test-state"
        nonce="test-nonce"
        onComplete={onComplete}
        client={mockClient}
        errorKey="generic"
      />,
    );

    const textElements = findByType(node, 'Text');
    const errorText = getText(textElements[0]);
    expect(errorText).toContain('error');
  });
});
