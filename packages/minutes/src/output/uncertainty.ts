import type { MinutesClaim } from './schema.js';
export function preserveUncertainty(claim: MinutesClaim): MinutesClaim {
  return claim.owner || claim.dueDate ? claim : { ...claim, needsConfirmation: true };
}
