import { z } from 'zod';
import { MeetingIdSchema, Sha256Schema } from '../meeting/schemas.js';

const TimestampSchema = z.string().datetime();
const RangeSchema = z
  .object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() })
  .strict()
  .refine((range) => range.endMs > range.startMs, 'range end must be after start');

const ProvenanceRecordSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['run', 'part', 'event', 'source_segment']),
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    finalizationManifestHash: Sha256Schema,
    audioManifestHash: Sha256Schema,
    finalizationVersion: z.number().int().positive(),
    locality: z.enum(['local', 'cloud', 'source']),
    provider: z.string().min(1),
    modelId: z.string().min(1).nullable(),
    parentId: z.string().min(1).nullable(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  })
  .strict()
  .refine((record) => record.endMs > record.startMs, 'provenance range end must be after start');
export type TranscriptProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

const TranscriptProvenanceSchema = z
  .object({
    run: ProvenanceRecordSchema,
    part: ProvenanceRecordSchema,
    event: ProvenanceRecordSchema,
    sourceSegment: ProvenanceRecordSchema,
  })
  .strict();

export const TranscriptProjectionRefSchema = z
  .object({
    version: z.literal(1),
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    runId: z.string().min(1),
    partId: z.string().min(1),
    eventId: z.string().min(1),
    finalizationManifestHash: Sha256Schema,
    audioManifestHash: Sha256Schema,
    reconciliationAlgorithmVersion: z.string().min(1),
    sourceSegmentId: z.string().min(1),
    sourceRevisionId: z.string().min(1).nullable(),
    sourceRange: RangeSchema,
    speakerMappingVersion: z.number().int().nonnegative(),
    translationVersionId: z.string().min(1).nullable(),
    provenance: TranscriptProvenanceSchema,
  })
  .strict()
  .superRefine((ref, context) => {
    const records: ReadonlyArray<[string, z.infer<typeof ProvenanceRecordSchema>, string]> = [
      ['run', ref.provenance.run, ref.runId],
      ['part', ref.provenance.part, ref.partId],
      ['event', ref.provenance.event, ref.eventId],
      ['source_segment', ref.provenance.sourceSegment, ref.sourceSegmentId],
    ];
    for (const [kind, record, expectedId] of records) {
      if (record.kind !== kind || record.id !== expectedId)
        context.addIssue({ code: 'custom', message: `${kind} provenance identity mismatch` });
      if (record.ownerId !== ref.ownerId || record.meetingId !== ref.meetingId)
        context.addIssue({
          code: 'custom',
          message: 'provenance crosses owner or meeting lineage',
        });
      if (
        record.finalizationManifestHash !== ref.finalizationManifestHash ||
        record.audioManifestHash !== ref.audioManifestHash
      )
        context.addIssue({
          code: 'custom',
          message: 'provenance has incompatible manifest lineage',
        });
      if (record.finalizationVersion !== ref.provenance.run.finalizationVersion)
        context.addIssue({
          code: 'custom',
          message: 'provenance has incompatible finalization version',
        });
    }
    if (
      ref.provenance.sourceSegment.startMs !== ref.sourceRange.startMs ||
      ref.provenance.sourceSegment.endMs !== ref.sourceRange.endMs
    )
      context.addIssue({
        code: 'custom',
        message: 'source provenance range does not match source range',
      });
    const processingRecords = [ref.provenance.run, ref.provenance.part, ref.provenance.event];
    for (const record of processingRecords) {
      if (
        record.finalizationVersion !== ref.provenance.run.finalizationVersion ||
        record.locality !== ref.provenance.run.locality ||
        record.provider !== ref.provenance.run.provider ||
        record.modelId !== ref.provenance.run.modelId
      )
        context.addIssue({ code: 'custom', message: 'provenance metadata is inconsistent' });
    }
    if (
      ref.provenance.run.parentId !== null ||
      ref.provenance.part.parentId !== ref.runId ||
      ref.provenance.event.parentId !== ref.partId ||
      ref.provenance.sourceSegment.parentId !== ref.eventId
    )
      context.addIssue({ code: 'custom', message: 'provenance parent relationship is invalid' });
  });
export type TranscriptProjectionRef = z.infer<typeof TranscriptProjectionRefSchema>;

const TranscriptAlternativeSchema = z
  .object({
    id: z.string().min(1),
    text: z.string(),
    ref: TranscriptProjectionRefSchema,
  })
  .strict();
export type TranscriptAlternative = z.infer<typeof TranscriptAlternativeSchema>;

const ProjectionSegmentSchema = z
  .object({
    id: z.string().min(1),
    ref: TranscriptProjectionRefSchema,
    sourceText: z.string(),
    sourceSpeakerId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    alternatives: z.array(TranscriptAlternativeSchema),
  })
  .strict()
  .refine((segment) => segment.endMs > segment.startMs, 'segment end must be after start');

const ProjectionDecisionSchema = z
  .object({
    id: z.string().min(1),
    segmentId: z.string().min(1),
    alternativeId: z.string().min(1),
    baseDecisionId: z.string().min(1).nullable(),
    actorId: z.string().min(1),
    baseProjectionVersion: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
  })
  .strict();

const ProjectionRevisionSchema = z
  .object({
    id: z.string().min(1),
    segmentId: z.string().min(1),
    baseRevisionId: z.string().min(1).nullable(),
    revisedText: z.string().min(1),
    revisedSpeakerId: z.string().min(1).optional(),
    actorId: z.string().min(1),
    reason: z.string().min(1).optional(),
    baseProjectionVersion: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
  })
  .strict();

const SpeakerMappingSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    fromSpeakerId: z.string().min(1),
    toSpeakerId: z.string().min(1),
  })
  .strict()
  .refine(
    (mapping) => mapping.fromSpeakerId !== mapping.toSpeakerId,
    'speaker mapping is self-cyclic',
  );

export const ProjectionHistorySchema = z
  .object({
    version: z.literal(1),
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    projectionVersion: z.number().int().nonnegative(),
    segments: z.array(ProjectionSegmentSchema),
    decisions: z.array(ProjectionDecisionSchema),
    revisions: z.array(ProjectionRevisionSchema),
    speakerMappings: z.array(SpeakerMappingSchema),
  })
  .strict();
export type ProjectionHistory = z.infer<typeof ProjectionHistorySchema>;

export interface TranscriptProjectionSegment {
  readonly id: string;
  readonly sourceText: string;
  readonly currentText: string;
  readonly sourceSpeakerId: string;
  readonly currentSpeakerId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly ref: TranscriptProjectionRef;
  readonly currentRef: TranscriptProjectionRef;
  readonly alternatives: readonly TranscriptAlternative[];
  readonly selectedAlternativeId: string | null;
  readonly currentRevisionId: string | null;
  readonly reviewRequired: boolean;
}

export interface TranscriptProjection {
  readonly version: 1;
  readonly ownerId: string;
  readonly meetingId: string;
  readonly projectionVersion: number;
  readonly segments: readonly TranscriptProjectionSegment[];
}

function compareHistoryItems(
  left: { id: string; createdAt?: string },
  right: { id: string; createdAt?: string },
): number {
  return (
    (left.createdAt ?? '').localeCompare(right.createdAt ?? '') || left.id.localeCompare(right.id)
  );
}

function assertSameLineage(
  root: TranscriptProjectionRef,
  candidate: TranscriptProjectionRef,
  label: string,
): void {
  if (candidate.ownerId !== root.ownerId || candidate.meetingId !== root.meetingId) {
    throw new Error(`${label} crosses owner or meeting lineage`);
  }
  if (
    candidate.finalizationManifestHash !== root.finalizationManifestHash ||
    candidate.audioManifestHash !== root.audioManifestHash ||
    candidate.reconciliationAlgorithmVersion !== root.reconciliationAlgorithmVersion
  ) {
    throw new Error(`${label} has incompatible manifest lineage`);
  }
}

function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`duplicate ${label} id ${item.id}`);
    seen.add(item.id);
  }
}

function assertProvenanceRanges(ref: TranscriptProjectionRef, label: string): void {
  const { run, part, event, sourceSegment } = ref.provenance;
  const nested = [
    [run, part, 'part'],
    [part, event, 'event'],
    [event, sourceSegment, 'source segment'],
  ] as const;
  for (const [parent, child, childLabel] of nested) {
    if (child.startMs < parent.startMs || child.endMs > parent.endMs)
      throw new Error(`${label} ${childLabel} provenance range is outside its parent`);
  }
}

function assertProvenanceMetadata(ref: TranscriptProjectionRef, label: string): void {
  const { run, part, event, sourceSegment } = ref.provenance;
  if (run.locality === 'source' || part.locality === 'source' || event.locality === 'source')
    throw new Error(`${label} has invalid source locality metadata`);
  if (sourceSegment.locality !== 'source' || sourceSegment.modelId !== null)
    throw new Error(`${label} has invalid source segment metadata`);
}

function assertNoSpeakerCycles(mappings: readonly z.infer<typeof SpeakerMappingSchema>[]): void {
  const edges = new Map<string, string>();
  for (const mapping of mappings) {
    const existing = edges.get(mapping.fromSpeakerId);
    if (existing && existing !== mapping.toSpeakerId) {
      throw new Error('speaker mapping has conflicting lineage');
    }
    edges.set(mapping.fromSpeakerId, mapping.toSpeakerId);
  }
  for (const start of edges.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current && edges.has(current)) {
      if (seen.has(current)) throw new Error('speaker mapping cycle detected');
      seen.add(current);
      current = edges.get(current);
    }
  }
}

function currentSpeakerMappings(
  mappings: readonly z.infer<typeof SpeakerMappingSchema>[],
  pinnedVersion: number,
): z.infer<typeof SpeakerMappingSchema>[] {
  const bySource = new Map<string, z.infer<typeof SpeakerMappingSchema>>();
  for (const mapping of [...mappings]
    .filter((mapping) => mapping.version <= pinnedVersion)
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const existing = bySource.get(mapping.fromSpeakerId);
    if (!existing || mapping.version > existing.version)
      bySource.set(mapping.fromSpeakerId, mapping);
    else if (mapping.version === existing.version && mapping.toSpeakerId !== existing.toSpeakerId)
      throw new Error('speaker mapping has conflicting lineage');
  }
  const current = [...bySource.values()];
  assertNoSpeakerCycles(current);
  return current;
}

function assertRevisionLineage(
  revisions: readonly z.infer<typeof ProjectionRevisionSchema>[],
  segmentById: ReadonlyMap<string, z.infer<typeof ProjectionSegmentSchema>>,
): ReadonlyMap<string, z.infer<typeof ProjectionRevisionSchema>> {
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  for (const revision of revisions) {
    if (!segmentById.has(revision.segmentId))
      throw new Error(`revision ${revision.id} references an unknown segment`);
    if (revision.baseRevisionId) {
      const parent = byId.get(revision.baseRevisionId);
      if (!parent) throw new Error(`revision lineage is broken at ${revision.baseRevisionId}`);
      if (parent.segmentId !== revision.segmentId)
        throw new Error('revision lineage crosses segments');
    }
  }
  const leaves = new Map<string, z.infer<typeof ProjectionRevisionSchema>>();
  for (const [segmentId, segmentRevisions] of groupBySegment(revisions)) {
    for (const revision of segmentRevisions) {
      const seen = new Set<string>();
      let current: z.infer<typeof ProjectionRevisionSchema> | undefined = revision;
      while (current?.baseRevisionId) {
        if (seen.has(current.id)) throw new Error('revision cycle detected');
        seen.add(current.id);
        current = byId.get(current.baseRevisionId);
      }
    }
    const roots = segmentRevisions.filter((revision) => revision.baseRevisionId === null);
    if (roots.length !== 1) throw new Error(`segment ${segmentId} must have one revision root`);
    const children = new Map<string, string>();
    for (const revision of segmentRevisions) {
      if (!revision.baseRevisionId) continue;
      const parent = byId.get(revision.baseRevisionId)!;
      const existingChild = children.get(parent.id);
      if (existingChild) throw new Error('revision lineage branches');
      if (revision.baseProjectionVersion <= parent.baseProjectionVersion)
        throw new Error('revision ancestry has invalid projection version');
      children.set(parent.id, revision.id);
    }
    const visited = new Set<string>();
    let current = roots[0]!;
    while (true) {
      if (visited.has(current.id)) throw new Error('revision cycle detected');
      visited.add(current.id);
      const childId = children.get(current.id);
      if (!childId) break;
      current = byId.get(childId)!;
    }
    if (visited.size !== segmentRevisions.length)
      throw new Error(`segment ${segmentId} has disconnected revision lineage`);
    leaves.set(segmentId, current);
  }
  return leaves;
}

function groupBySegment<T extends { segmentId: string }>(items: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items)
    grouped.set(item.segmentId, [...(grouped.get(item.segmentId) ?? []), item]);
  return grouped;
}

function assertDecisionHistory(
  decisions: readonly z.infer<typeof ProjectionDecisionSchema>[],
  segmentById: ReadonlyMap<string, z.infer<typeof ProjectionSegmentSchema>>,
  projectionVersion: number,
): Map<string, z.infer<typeof ProjectionDecisionSchema>> {
  const selected = new Map<string, z.infer<typeof ProjectionDecisionSchema>>();
  for (const [segmentId, segmentDecisions] of groupBySegment(decisions)) {
    const segment = segmentById.get(segmentId);
    if (!segment) throw new Error(`decision references an unknown segment ${segmentId}`);
    const ordered = [...segmentDecisions].sort(compareHistoryItems);
    let previous: z.infer<typeof ProjectionDecisionSchema> | undefined;
    for (const decision of ordered) {
      if (decision.baseProjectionVersion > projectionVersion)
        throw new Error('decision base projection version is invalid');
      if (!segment.alternatives.some((alternative) => alternative.id === decision.alternativeId))
        throw new Error(`decision ${decision.id} references an unknown alternative`);
      if (!previous) {
        if (decision.baseDecisionId !== null)
          throw new Error('decision ancestry must start at a root decision');
      } else if (decision.baseProjectionVersion === previous.baseProjectionVersion) {
        throw new Error('decision history conflict');
      } else if (decision.baseDecisionId !== previous.id) {
        throw new Error('decision progression has broken ancestry');
      }
      previous = decision;
    }
    if (previous) selected.set(segmentId, previous);
  }
  return selected;
}

function assertGlobalMutationTimeline(
  decisions: readonly z.infer<typeof ProjectionDecisionSchema>[],
  revisions: readonly z.infer<typeof ProjectionRevisionSchema>[],
  baseProjectionVersion: number,
): void {
  const mutations = [...decisions, ...revisions].sort(
    (left, right) =>
      left.baseProjectionVersion - right.baseProjectionVersion || compareHistoryItems(left, right),
  );
  if (mutations.some((mutation) => mutation.baseProjectionVersion > baseProjectionVersion))
    throw new Error('mutation history contains a future projection version');
  let expectedVersion = mutations[0]?.baseProjectionVersion ?? baseProjectionVersion;
  for (const mutation of mutations) {
    if (mutation.baseProjectionVersion !== expectedVersion)
      throw new Error('mutation history has a broken projection-version timeline');
    expectedVersion += 1;
  }
}

function resolveSpeaker(
  speakerId: string,
  mappings: readonly z.infer<typeof SpeakerMappingSchema>[],
): string {
  const bySource = new Map(mappings.map((mapping) => [mapping.fromSpeakerId, mapping.toSpeakerId]));
  let current = speakerId;
  const seen = new Set<string>();
  while (bySource.has(current)) {
    if (seen.has(current)) throw new Error('speaker mapping cycle detected');
    seen.add(current);
    current = bySource.get(current)!;
  }
  return current;
}

/** Rebuilds the review read model exclusively from immutable source and append-only history. */
export function replayTranscriptProjection(input: ProjectionHistory): TranscriptProjection {
  const history = ProjectionHistorySchema.parse(input);
  assertUniqueIds(history.segments, 'segment');
  assertUniqueIds(history.decisions, 'decision');
  assertUniqueIds(history.revisions, 'revision');
  assertUniqueIds(history.speakerMappings, 'speaker mapping');
  const orderedSegments = [...history.segments].sort(
    (left, right) =>
      left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id),
  );
  const segmentById = new Map(orderedSegments.map((segment) => [segment.id, segment]));
  for (const segment of orderedSegments) {
    assertUniqueIds(segment.alternatives, `alternative for segment ${segment.id}`);
  }
  currentSpeakerMappings(
    history.speakerMappings,
    Math.max(0, ...history.speakerMappings.map((mapping) => mapping.version)),
  );
  const revisionLeaves = assertRevisionLineage(history.revisions, segmentById);
  const selected = assertDecisionHistory(history.decisions, segmentById, history.projectionVersion);
  assertGlobalMutationTimeline(history.decisions, history.revisions, history.projectionVersion);
  const root = orderedSegments[0]?.ref;
  const refs = orderedSegments.flatMap((segment) => [
    segment.ref,
    ...segment.alternatives.map((alternative) => alternative.ref),
  ]);
  if (root) {
    if (root.ownerId !== history.ownerId || root.meetingId !== history.meetingId)
      throw new Error('segment lineage does not match projection owner or meeting');
    for (const segment of orderedSegments) {
      assertSameLineage(root, segment.ref, `segment ${segment.id}`);
      assertProvenanceRanges(segment.ref, `segment ${segment.id}`);
      assertProvenanceMetadata(segment.ref, `segment ${segment.id}`);
      if (segment.ref.sourceSegmentId !== segment.id)
        throw new Error(`segment ${segment.id} source lineage mismatch`);
      if (
        segment.ref.sourceRange.startMs !== segment.startMs ||
        segment.ref.sourceRange.endMs !== segment.endMs
      )
        throw new Error(`segment ${segment.id} provenance range mismatch`);
      for (const alternative of segment.alternatives) {
        assertSameLineage(root, alternative.ref, `alternative ${alternative.id}`);
        assertProvenanceRanges(alternative.ref, `alternative ${alternative.id}`);
        assertProvenanceMetadata(alternative.ref, `alternative ${alternative.id}`);
        if (alternative.ref.sourceSegmentId !== segment.id)
          throw new Error(`alternative ${alternative.id} source lineage mismatch`);
        if (
          alternative.ref.sourceRange.startMs !== segment.startMs ||
          alternative.ref.sourceRange.endMs !== segment.endMs
        )
          throw new Error(`alternative ${alternative.id} provenance range mismatch`);
      }
    }
    for (const ref of refs) {
      if (ref.ownerId !== history.ownerId || ref.meetingId !== history.meetingId)
        throw new Error('provenance does not match projection owner or meeting');
    }
  }
  if (!root) {
    if (history.decisions.length > 0 || history.revisions.length > 0)
      throw new Error('empty projection cannot contain decisions or revisions');
    return {
      version: 1,
      ownerId: history.ownerId,
      meetingId: history.meetingId,
      projectionVersion: history.projectionVersion,
      segments: [],
    };
  }
  return {
    version: 1,
    ownerId: history.ownerId,
    meetingId: history.meetingId,
    projectionVersion:
      history.projectionVersion + history.decisions.length + history.revisions.length,
    segments: orderedSegments.map((segment) => {
      const currentRevision = revisionLeaves.get(segment.id);
      const selectedAlternative = segment.alternatives.find(
        (alternative) => alternative.id === selected.get(segment.id)?.alternativeId,
      );
      return {
        id: segment.id,
        sourceText: segment.sourceText,
        currentText:
          currentRevision?.revisedText ?? selectedAlternative?.text ?? segment.sourceText,
        sourceSpeakerId: segment.sourceSpeakerId,
        currentSpeakerId:
          currentRevision?.revisedSpeakerId ??
          resolveSpeaker(
            segment.sourceSpeakerId,
            currentSpeakerMappings(history.speakerMappings, segment.ref.speakerMappingVersion),
          ),
        startMs: segment.startMs,
        endMs: segment.endMs,
        ref: segment.ref,
        currentRef: currentRevision
          ? { ...segment.ref, sourceRevisionId: currentRevision.id }
          : (selectedAlternative?.ref ?? segment.ref),
        alternatives: segment.alternatives,
        selectedAlternativeId: selected.get(segment.id)?.alternativeId ?? null,
        currentRevisionId: currentRevision?.id ?? null,
        reviewRequired: segment.alternatives.length > 0 && !selected.has(segment.id),
      };
    }),
  };
}
