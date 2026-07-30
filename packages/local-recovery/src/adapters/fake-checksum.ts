import type { Checksum } from '../contracts/checksum.js';
import type { Sha256 } from '@kms/domain';

export class FakeChecksum implements Checksum {
  private computed = new Map<string, Sha256>();
  private mismatchPaths = new Set<string>();

  injectMismatch(path: string): void {
    this.mismatchPaths.add(path.replace(/\\/g, '/'));
  }

  async compute(path: string): Promise<Sha256> {
    const p = path.replace(/\\/g, '/');
    // Generate a deterministic hash from the path, simulating a real hash
    let hash = 0;
    for (let i = 0; i < p.length; i++) {
      const ch = p.charCodeAt(i);
      hash = ((hash << 5) - hash + ch) | 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(64, '0');
    const result = hex as Sha256;
    this.computed.set(p, result);
    return result;
  }

  async verify(path: string, expected: Sha256): Promise<boolean> {
    const p = path.replace(/\\/g, '/');
    if (this.mismatchPaths.has(p)) {
      this.mismatchPaths.delete(p);
      return false;
    }
    // Verify against the last computed hash for this path
    const lastComputed = this.computed.get(p);
    return lastComputed === expected;
  }
}
