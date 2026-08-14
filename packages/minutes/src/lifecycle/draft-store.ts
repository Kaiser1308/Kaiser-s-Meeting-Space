export type DraftStoreErrorCode =
  'not_found' | 'idempotency_conflict' | 'stale_projection' | 'version_conflict' | 'immutable';

export class DraftStoreError extends Error {
  readonly code: DraftStoreErrorCode;

  constructor(code: DraftStoreErrorCode) {
    super(code);
    this.name = 'DraftStoreError';
    this.code = code;
  }
}

export interface DraftProvenance {
  readonly meetingId: string;
  readonly projectionVersion: number;
  readonly completenessVersion: number;
  readonly templateId: string;
  readonly detailLevel: 'concise' | 'detailed';
  readonly outputLanguage: 'vi' | 'en';
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
}

export interface DraftRequest extends DraftProvenance {
  readonly ownerId: string;
  readonly idempotencyKey: string;
}

export interface DraftJob extends DraftRequest {
  readonly id: string;
  readonly status: 'pending' | 'completed';
}

export interface DraftVersion<T = unknown> extends DraftProvenance {
  readonly id: string;
  readonly ownerId: string;
  readonly version: number;
  readonly content: T;
  readonly createdAt: string;
}

type CommitInput<T> = DraftJob & {
  readonly versionId: string;
  readonly content: T;
};

function cloneFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneFreeze(item))) as T;
  }
  const copy = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneFreeze(item)]),
  );
  return Object.freeze(copy) as T;
}

function equalRequest(a: DraftRequest, b: DraftRequest): boolean {
  return (
    a.meetingId === b.meetingId &&
    a.projectionVersion === b.projectionVersion &&
    a.completenessVersion === b.completenessVersion &&
    a.templateId === b.templateId &&
    a.detailLevel === b.detailLevel &&
    a.outputLanguage === b.outputLanguage &&
    a.provider === b.provider &&
    a.model === b.model &&
    a.promptVersion === b.promptVersion &&
    a.schemaVersion === b.schemaVersion &&
    a.configVersion === b.configVersion &&
    a.inputHash === b.inputHash
  );
}

export class DraftStore {
  private readonly jobs = new Map<string, DraftJob>();
  private readonly versions = new Map<string, DraftVersion>();
  private readonly currentByMeeting = new Map<string, string>();

  request(input: DraftRequest): DraftJob {
    const existing = [...this.jobs.values()].find(
      (job) => job.ownerId === input.ownerId && job.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (!equalRequest(existing, input)) throw new DraftStoreError('idempotency_conflict');
      return existing;
    }
    const job: DraftJob = Object.freeze({
      ...input,
      id: `minutes-job-${this.jobs.size + 1}`,
      status: 'pending',
      usage: Object.freeze({ ...input.usage }),
    });
    this.jobs.set(job.id, job);
    return job;
  }

  commit<T>(input: CommitInput<T>): DraftVersion<T> {
    const job = this.jobs.get(input.id);
    if (!job || job.ownerId !== input.ownerId) throw new DraftStoreError('not_found');
    if (
      job.projectionVersion !== input.projectionVersion ||
      job.completenessVersion !== input.completenessVersion
    )
      throw new DraftStoreError('stale_projection');
    const existing = this.versions.get(input.versionId);
    if (existing) {
      if (existing.ownerId === input.ownerId && existing.inputHash === input.inputHash)
        return existing as DraftVersion<T>;
      throw new DraftStoreError('immutable');
    }
    const version =
      [...this.versions.values()].filter(
        (item) => item.ownerId === input.ownerId && item.meetingId === input.meetingId,
      ).length + 1;
    const draft: DraftVersion<T> = Object.freeze({
      ...input,
      id: input.versionId,
      version,
      content: cloneFreeze(input.content),
      createdAt: new Date().toISOString(),
      usage: Object.freeze({ ...input.usage }),
    });
    this.versions.set(draft.id, draft);
    this.currentByMeeting.set(`${input.ownerId}:${input.meetingId}`, draft.id);
    this.jobs.set(job.id, Object.freeze({ ...job, status: 'completed' }));
    return draft;
  }

  current<T = unknown>(ownerId: string, meetingId: string): DraftVersion<T> {
    const id = this.currentByMeeting.get(`${ownerId}:${meetingId}`);
    const version = id ? this.versions.get(id) : undefined;
    if (!version || version.ownerId !== ownerId) throw new DraftStoreError('not_found');
    return version as DraftVersion<T>;
  }

  selectCurrent<T = unknown>(ownerId: string, versionId: string, expectedVersion: number) {
    const version = this.versions.get(versionId);
    if (!version || version.ownerId !== ownerId) throw new DraftStoreError('not_found');
    const currentId = this.currentByMeeting.get(`${ownerId}:${version.meetingId}`);
    const current = currentId ? this.versions.get(currentId) : undefined;
    if ((current?.version ?? 0) !== expectedVersion) throw new DraftStoreError('version_conflict');
    this.currentByMeeting.set(`${ownerId}:${version.meetingId}`, versionId);
    return version as DraftVersion<T>;
  }

  replace(ownerId: string, versionId: string, _content: unknown): never {
    const version = this.versions.get(versionId);
    if (!version || version.ownerId !== ownerId) throw new DraftStoreError('not_found');
    throw new DraftStoreError('immutable');
  }

  listJobs(ownerId: string): readonly DraftJob[] {
    return [...this.jobs.values()].filter((job) => job.ownerId === ownerId);
  }
}
