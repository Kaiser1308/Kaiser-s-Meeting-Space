export const MAX_DRAFT_BYTES = 100_000;
export const MAX_DRAFT_DEPTH = 12;
export const MAX_CLAIMS = 10_000;
export const MAX_CLAIM_TEXT_LENGTH = 20_000;
export const MAX_CONTEXT_LENGTH = 100_000;

export interface Citation {
  readonly segmentId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly quoteHash?: string;
}

export type ClaimStatus = 'supported' | 'unknown' | 'conflicted';
export type UnknownClaimField = 'owner' | 'dueDate' | 'speaker' | 'decision';

export interface MinutesClaim {
  readonly id: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly needsConfirmation: boolean;
  readonly status?: ClaimStatus;
  readonly owner?: string | null;
  readonly dueDate?: string | null;
  readonly unknownFields?: readonly UnknownClaimField[];
}

export interface DetailedMinutesDraftV1 {
  readonly version: 1;
  readonly id: string;
  readonly meetingId: string;
  readonly ownerId: string;
  readonly projectionVersion: number;
  readonly completenessVersion: number;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly detailLevel: 'concise' | 'detailed';
  readonly outputLanguage: 'vi' | 'en';
  readonly context: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly configVersion: string;
  readonly inputHash: string;
  readonly usage: Readonly<{
    inputTokens: number;
    outputTokens: number;
    costMicrounits: number;
  }>;
  readonly evaluation: Readonly<{
    status: 'passed' | 'failed' | 'pending';
    citationCoverage: number;
    unsupportedClaimCount: number;
    confirmationCount: number;
    claimCount: number;
  }>;
  readonly discussion: readonly MinutesClaim[];
  readonly viewpoints: readonly MinutesClaim[];
  readonly proposals: readonly MinutesClaim[];
  readonly agreements: readonly MinutesClaim[];
  readonly unresolvedItems: readonly MinutesClaim[];
  readonly decisions: readonly MinutesClaim[];
  readonly actions: readonly MinutesClaim[];
  readonly risks: readonly MinutesClaim[];
  readonly followUps: readonly MinutesClaim[];
}

export interface RuntimeSchema<T> {
  readonly parse: (value: unknown) => T;
  readonly safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: Error };
}

const SECTION_KEYS = [
  'discussion',
  'viewpoints',
  'proposals',
  'agreements',
  'unresolvedItems',
  'decisions',
  'actions',
  'risks',
  'followUps',
] as const;
const ROOT_KEYS = new Set([
  'version',
  'id',
  'meetingId',
  'ownerId',
  'projectionVersion',
  'completenessVersion',
  'templateId',
  'templateVersion',
  'detailLevel',
  'outputLanguage',
  'context',
  'provider',
  'model',
  'promptVersion',
  'schemaVersion',
  'configVersion',
  'inputHash',
  'usage',
  'evaluation',
  ...SECTION_KEYS,
]);
const CLAIM_KEYS = new Set([
  'id',
  'text',
  'citations',
  'needsConfirmation',
  'status',
  'owner',
  'dueDate',
  'unknownFields',
]);
const CITATION_KEYS = new Set(['segmentId', 'startMs', 'endMs', 'quoteHash']);
const USAGE_KEYS = new Set(['inputTokens', 'outputTokens', 'costMicrounits']);
const EVALUATION_KEYS = new Set([
  'status',
  'citationCoverage',
  'unsupportedClaimCount',
  'confirmationCount',
  'claimCount',
]);
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HASH = /^[a-fA-F0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validSafeString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0) &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function validNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day
  );
}

function exceedsDepth(value: unknown, depth = 0, seen = new WeakSet<object>()): boolean {
  if (!isRecord(value) && !Array.isArray(value)) return false;
  if (depth > MAX_DRAFT_DEPTH) return true;
  if (seen.has(value)) return true;
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => exceedsDepth(child, depth + 1, seen));
}

function validateCitation(value: unknown): value is Citation {
  if (!isRecord(value) || !hasOnlyKeys(value, CITATION_KEYS)) return false;
  if (
    !validSafeString(value.segmentId, 256) ||
    !validNonnegativeInteger(value.startMs) ||
    !validNonnegativeInteger(value.endMs) ||
    value.endMs <= value.startMs
  )
    return false;
  return (
    value.quoteHash === undefined ||
    (typeof value.quoteHash === 'string' && HASH.test(value.quoteHash))
  );
}

function validateClaim(
  value: unknown,
  section: (typeof SECTION_KEYS)[number],
  ids: Set<string>,
): value is MinutesClaim {
  if (!isRecord(value) || !hasOnlyKeys(value, CLAIM_KEYS)) return false;
  if (
    !validSafeString(value.id, 256) ||
    ids.has(value.id) ||
    !validSafeString(value.text, MAX_CLAIM_TEXT_LENGTH) ||
    !Array.isArray(value.citations) ||
    value.citations.length === 0 ||
    value.citations.some((citation) => !validateCitation(citation)) ||
    typeof value.needsConfirmation !== 'boolean' ||
    !['supported', 'unknown', 'conflicted'].includes(String(value.status))
  )
    return false;

  const status = value.status as ClaimStatus;
  if (value.needsConfirmation !== (status !== 'supported')) return false;
  if (value.owner !== undefined && value.owner !== null && !validSafeString(value.owner, 512))
    return false;
  if (value.dueDate !== undefined && value.dueDate !== null && !validDate(value.dueDate))
    return false;

  if (status !== 'supported') {
    if (
      !Array.isArray(value.unknownFields) ||
      value.unknownFields.length === 0 ||
      new Set(value.unknownFields).size !== value.unknownFields.length ||
      value.unknownFields.some(
        (field) => !['owner', 'dueDate', 'speaker', 'decision'].includes(field),
      )
    )
      return false;
  } else if (value.unknownFields !== undefined) {
    return false;
  }

  if (section === 'actions') {
    const ownerUnknown = value.owner === undefined || value.owner === null;
    const dateUnknown = value.dueDate === undefined || value.dueDate === null;
    if (status === 'supported' && (ownerUnknown || dateUnknown)) return false;
    if (status !== 'supported') {
      const unknownFields = value.unknownFields ?? [];
      if (
        (ownerUnknown && !unknownFields.includes('owner')) ||
        (dateUnknown && !unknownFields.includes('dueDate'))
      )
        return false;
    }
  }

  ids.add(value.id);
  return true;
}

function validateDraft(value: unknown): DetailedMinutesDraftV1 {
  if (!isRecord(value)) throw new Error('draft must be an object');
  if (exceedsDepth(value)) throw new Error('draft exceeds maximum depth');
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('draft is not serializable');
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_DRAFT_BYTES)
    throw new Error('draft exceeds maximum size');
  if (!hasOnlyKeys(value, ROOT_KEYS)) throw new Error('unsupported draft section content');
  if (
    value.version !== 1 ||
    !validSafeString(value.id, 256) ||
    !validSafeString(value.meetingId, 256) ||
    !validSafeString(value.ownerId, 256) ||
    !validSafeString(value.templateId, 256) ||
    !validSafeString(value.provider, 256) ||
    !validSafeString(value.model, 256) ||
    !validSafeString(value.promptVersion, 256) ||
    !validSafeString(value.schemaVersion, 256) ||
    !validSafeString(value.configVersion, 256) ||
    typeof value.inputHash !== 'string' ||
    !HASH.test(value.inputHash) ||
    !validNonnegativeInteger(value.projectionVersion) ||
    value.projectionVersion < 1 ||
    !validNonnegativeInteger(value.completenessVersion) ||
    value.completenessVersion < 1 ||
    !Number.isSafeInteger(value.templateVersion) ||
    (value.templateVersion as number) < 1 ||
    !['concise', 'detailed'].includes(String(value.detailLevel)) ||
    !['vi', 'en'].includes(String(value.outputLanguage)) ||
    !validSafeString(value.context, MAX_CONTEXT_LENGTH)
  )
    throw new Error('missing or invalid draft provenance');

  const usage = value.usage as Record<string, unknown> | undefined;
  if (!isRecord(usage) || !hasOnlyKeys(usage, USAGE_KEYS)) throw new Error('invalid usage');
  if (
    ['inputTokens', 'outputTokens', 'costMicrounits'].some(
      (key) => !validNonnegativeInteger(usage[key]),
    )
  )
    throw new Error('invalid usage');

  if (!isRecord(value.evaluation) || !hasOnlyKeys(value.evaluation, EVALUATION_KEYS))
    throw new Error('invalid evaluation');
  if (
    !['passed', 'failed', 'pending'].includes(String(value.evaluation.status)) ||
    typeof value.evaluation.citationCoverage !== 'number' ||
    !Number.isFinite(value.evaluation.citationCoverage) ||
    value.evaluation.citationCoverage < 0 ||
    value.evaluation.citationCoverage > 1 ||
    !validNonnegativeInteger(value.evaluation.unsupportedClaimCount) ||
    !validNonnegativeInteger(value.evaluation.confirmationCount) ||
    !validNonnegativeInteger(value.evaluation.claimCount)
  )
    throw new Error('invalid evaluation');

  const ids = new Set<string>();
  let claimCount = 0;
  for (const section of SECTION_KEYS) {
    const items = value[section];
    if (!Array.isArray(items)) throw new Error('missing draft section');
    claimCount += items.length;
    if (claimCount > MAX_CLAIMS) throw new Error('draft exceeds maximum claim count');
    for (const item of items) {
      if (!validateClaim(item, section, ids)) throw new Error('invalid claim or citation');
    }
  }
  return value as unknown as DetailedMinutesDraftV1;
}

export const DetailedMinutesDraftV1Schema: RuntimeSchema<DetailedMinutesDraftV1> = {
  parse(value: unknown): DetailedMinutesDraftV1 {
    return validateDraft(value);
  },
  safeParse(value: unknown) {
    try {
      return { success: true, data: validateDraft(value) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('invalid detailed minutes draft'),
      };
    }
  },
};

export function validateDetailedMinutesDraft(
  value: unknown,
): { ok: true; value: DetailedMinutesDraftV1 } | { ok: false; reason: string } {
  const parsed = DetailedMinutesDraftV1Schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: parsed.error.message };
}

export interface EditorDocumentNode {
  readonly type: 'heading' | 'paragraph' | 'citation' | 'confirmation' | 'custom';
  readonly id: string;
  readonly level?: 1 | 2 | 3;
  readonly text?: string;
  readonly segmentId?: string;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly quoteHash?: string;
  readonly needsConfirmation?: true;
  readonly field?: 'owner' | 'deadline' | 'speaker' | 'decision' | 'other';
  readonly key?: string;
  readonly value?: string;
}

export interface MinutesDocumentV1 {
  readonly version: 1;
  readonly id: string;
  readonly ownerId: string;
  readonly meetingId: string;
  readonly nodes: readonly EditorDocumentNode[];
}

export function toMinutesDocumentV1(draft: DetailedMinutesDraftV1): MinutesDocumentV1 {
  const nodes: EditorDocumentNode[] = [
    { type: 'heading', id: `${draft.id}:context`, level: 1, text: 'Context' },
    { type: 'paragraph', id: `${draft.id}:context:text`, text: draft.context },
  ];
  const sections: readonly [string, readonly MinutesClaim[]][] = [
    ['Discussion', draft.discussion],
    ['Viewpoints', draft.viewpoints],
    ['Proposals', draft.proposals],
    ['Agreements', draft.agreements],
    ['Unresolved items', draft.unresolvedItems],
    ['Decisions', draft.decisions],
    ['Actions', draft.actions],
    ['Risks', draft.risks],
    ['Follow-ups', draft.followUps],
  ];
  for (const [heading, claims] of sections) {
    if (claims.length === 0) continue;
    nodes.push({ type: 'heading', id: `${draft.id}:${heading.toLowerCase().replaceAll(' ', '-')}`, level: 2, text: heading });
    for (const claim of claims) {
      nodes.push({ type: 'paragraph', id: claim.id, text: claim.text });
      for (const [index, citation] of claim.citations.entries()) {
        nodes.push({ type: 'citation', id: `${claim.id}:citation:${index}`, segmentId: citation.segmentId, startMs: citation.startMs, endMs: citation.endMs, ...(citation.quoteHash ? { quoteHash: citation.quoteHash } : {}) });
      }
      if (claim.needsConfirmation) nodes.push({ type: 'confirmation', id: `${claim.id}:confirmation`, text: claim.text, needsConfirmation: true, field: claim.unknownFields?.[0] ?? 'other' });
      if (claim.owner !== undefined && claim.owner !== null) nodes.push({ type: 'custom', id: `${claim.id}:owner`, key: 'owner', value: claim.owner });
      if (claim.dueDate !== undefined && claim.dueDate !== null) nodes.push({ type: 'custom', id: `${claim.id}:dueDate`, key: 'dueDate', value: claim.dueDate });
    }
  }
  return Object.freeze({ version: 1, id: draft.id, ownerId: draft.ownerId, meetingId: draft.meetingId, nodes: Object.freeze(nodes.map((node) => Object.freeze(node))) });
}
