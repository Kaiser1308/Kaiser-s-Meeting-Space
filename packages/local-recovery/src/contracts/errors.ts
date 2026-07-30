export type LocalRecoveryErrorCategory =
  'MANIFEST' | 'QUEUE' | 'RECONCILIATION' | 'RECOVERY' | 'CLEANUP';

export class LocalRecoveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly category: LocalRecoveryErrorCategory,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LocalRecoveryError';
  }
}

export class ManifestError extends LocalRecoveryError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, 'MANIFEST', message, cause);
    this.name = 'ManifestError';
  }
}

export class QueueError extends LocalRecoveryError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, 'QUEUE', message, cause);
    this.name = 'QueueError';
  }
}

export class ReconciliationError extends LocalRecoveryError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, 'RECONCILIATION', message, cause);
    this.name = 'ReconciliationError';
  }
}

export class RecoveryError extends LocalRecoveryError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, 'RECOVERY', message, cause);
    this.name = 'RecoveryError';
  }
}

export class CleanupError extends LocalRecoveryError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, 'CLEANUP', message, cause);
    this.name = 'CleanupError';
  }
}
