import { describe, expect, it } from 'vitest';
import {
  DENIED_RESOURCE,
  MODELED_RESOURCE_CLASSES,
  OwnerAuthorizationPolicy,
  type OwnerContext,
  type ResourceClass,
  type ResourceRecord,
} from '../../../packages/auth/src/policies/owner-policy.js';

const OWNER_A: OwnerContext = { ownerId: 'owner-a' };
const OWNER_B: OwnerContext = { ownerId: 'owner-b' };
const RESOURCE_CLASSES: readonly ResourceClass[] = ['meeting', 'job', 'export', 'object_metadata'];

function resource(resourceClass: ResourceClass, ownerId = OWNER_A.ownerId): ResourceRecord {
  return { resourceClass, id: `${resourceClass}-synthetic`, ownerId };
}

describe('OwnerAuthorizationPolicy', () => {
  const policy = new OwnerAuthorizationPolicy();

  it.each(RESOURCE_CLASSES)('allows the owner for %s', (resourceClass) => {
    expect(policy.authorize(OWNER_A, resource(resourceClass))).toEqual({
      allowed: true,
      status: 200,
    });
  });

  it.each(RESOURCE_CLASSES)('hides an existing %s from a different owner', (resourceClass) => {
    expect(policy.authorize(OWNER_B, resource(resourceClass))).toEqual(DENIED_RESOURCE);
  });

  it.each(RESOURCE_CLASSES)('hides a nonexistent %s', (_resourceClass) => {
    expect(policy.authorize(OWNER_A, null)).toEqual(DENIED_RESOURCE);
  });

  it('uses the same denial shape for wrong-owner and nonexistent resources', () => {
    const wrongOwner = policy.authorize(OWNER_B, resource('meeting'));
    const nonexistent = policy.authorize(OWNER_A, null);

    expect(wrongOwner).toEqual(nonexistent);
    expect(wrongOwner).not.toHaveProperty('resource');
  });

  it.each([
    ['missing context', undefined],
    ['empty owner id', { ownerId: '' }],
    ['whitespace owner id', { ownerId: '   ' }],
  ])('denies by default when context is %s', (_label, context) => {
    expect(policy.authorize(context as OwnerContext | undefined, resource('meeting'))).toEqual(
      DENIED_RESOURCE,
    );
  });

  it('denies resource classes outside the modeled inventory', () => {
    expect(
      policy.authorize(OWNER_A, {
        resourceClass: 'transcript' as ResourceClass,
        id: 'transcript-synthetic',
        ownerId: OWNER_A.ownerId,
      }),
    ).toEqual(DENIED_RESOURCE);
  });

  it('publishes the complete current personal resource inventory', () => {
    expect(MODELED_RESOURCE_CLASSES).toEqual(RESOURCE_CLASSES);
  });

  it('requires owner context before an entry point can proceed', () => {
    expect(() => policy.requireContext(undefined)).toThrow('AUTHENTICATION_REQUIRED');
    expect(policy.requireContext(OWNER_A)).toEqual(OWNER_A);
  });
});
