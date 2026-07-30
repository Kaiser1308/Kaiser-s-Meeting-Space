/** The owner identity carried from the authenticated request boundary. */
export interface OwnerContext {
  readonly ownerId: string;
}

/** Resource classes that exist in the current personal data model. */
export type ResourceClass = 'meeting' | 'job' | 'export' | 'object_metadata';

/** The minimum data required to make an ownership decision. */
export interface ResourceRecord {
  readonly resourceClass: ResourceClass;
  readonly id: string;
  readonly ownerId: string;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly status: 200 | 404;
}

/** One safe response for both missing and cross-owner resources. */
export const DENIED_RESOURCE: AuthorizationDecision = Object.freeze({
  allowed: false,
  status: 404,
});

export const MODELED_RESOURCE_CLASSES: readonly ResourceClass[] = [
  'meeting',
  'job',
  'export',
  'object_metadata',
];

const MODELED_RESOURCE_CLASS_SET: ReadonlySet<string> = new Set(MODELED_RESOURCE_CLASSES);

const AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED';

export class OwnerAuthorizationPolicy {
  requireContext(context: OwnerContext | undefined): OwnerContext {
    if (!context || typeof context.ownerId !== 'string' || context.ownerId.trim().length === 0) {
      throw new Error(AUTHENTICATION_REQUIRED);
    }
    return context;
  }

  authorize(
    context: OwnerContext | undefined,
    resource: ResourceRecord | null,
  ): AuthorizationDecision {
    if (!this.hasValidContext(context)) return DENIED_RESOURCE;
    if (!resource || !MODELED_RESOURCE_CLASS_SET.has(resource.resourceClass)) {
      return DENIED_RESOURCE;
    }
    if (resource.id.length === 0 || resource.ownerId !== context.ownerId) {
      return DENIED_RESOURCE;
    }
    return { allowed: true, status: 200 };
  }

  private hasValidContext(context: OwnerContext | undefined): context is OwnerContext {
    return Boolean(
      context && typeof context.ownerId === 'string' && context.ownerId.trim().length > 0,
    );
  }
}

export { AUTHENTICATION_REQUIRED };
