import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Checksum } from '../contracts/checksum.js';
import type { Sha256 } from '@kms/domain';

export class NodeChecksum implements Checksum {
  async compute(path: string): Promise<Sha256> {
    const data = await readFile(path);
    const hash = createHash('sha256');
    hash.update(new Uint8Array(data));
    return hash.digest('hex') as Sha256;
  }

  async verify(path: string, expected: Sha256): Promise<boolean> {
    const actual = await this.compute(path);
    return actual === expected;
  }
}
