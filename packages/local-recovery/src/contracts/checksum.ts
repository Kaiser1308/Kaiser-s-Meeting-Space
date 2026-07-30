import type { Sha256 } from '@kms/domain';

export interface Checksum {
  /** Compute SHA-256 of file at path. Returns lowercase hex string. */
  compute(path: string): Promise<Sha256>;

  /** Verify file at path matches expected SHA-256. Returns true iff match. */
  verify(path: string, expected: Sha256): Promise<boolean>;
}
