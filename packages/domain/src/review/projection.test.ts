import { describe, expect, it } from 'vitest';
import { replayTranscriptProjection, type ProjectionHistory } from './projection.js';

const ref = (overrides: Record<string, unknown> = {}) => {
  const values = {
    version: 1 as const,
    ownerId: 'owner-1',
    meetingId: '00000000-0000-4000-8000-000000000001',
    runId: 'run-1',
    partId: 'part-1',
    eventId: 'event-1',
    finalizationManifestHash: 'a'.repeat(64),
    audioManifestHash: 'b'.repeat(64),
    reconciliationAlgorithmVersion: 'reconcile-v1',
    sourceSegmentId: 'segment-1',
    sourceRevisionId: null,
    speakerMappingVersion: 1,
    translationVersionId: null,
    sourceRange: { startMs: 0, endMs: 1000 },
    ...overrides,
  } as Record<string, any>;
  return {
    ...values,
    provenance: values.provenance ?? {
      run: {
        id: values.runId,
        kind: 'run',
        ownerId: values.ownerId,
        meetingId: values.meetingId,
        finalizationManifestHash: 'a'.repeat(64),
        audioManifestHash: 'b'.repeat(64),
        finalizationVersion: 1,
        locality: 'local',
        provider: 'synthetic-provider',
        modelId: 'synthetic-model',
        parentId: null,
        startMs: values.sourceRange.startMs,
        endMs: 2000,
      },
      part: {
        id: values.partId,
        kind: 'part',
        ownerId: values.ownerId,
        meetingId: values.meetingId,
        finalizationManifestHash: 'a'.repeat(64),
        audioManifestHash: 'b'.repeat(64),
        finalizationVersion: 1,
        locality: 'local',
        provider: 'synthetic-provider',
        modelId: 'synthetic-model',
        parentId: values.runId,
        startMs: values.sourceRange.startMs,
        endMs: 2000,
      },
      event: {
        id: values.eventId,
        kind: 'event',
        ownerId: values.ownerId,
        meetingId: values.meetingId,
        finalizationManifestHash: 'a'.repeat(64),
        audioManifestHash: 'b'.repeat(64),
        finalizationVersion: 1,
        locality: 'local',
        provider: 'synthetic-provider',
        modelId: 'synthetic-model',
        parentId: values.partId,
        startMs: values.sourceRange.startMs,
        endMs: values.sourceRange.endMs,
      },
      sourceSegment: {
        id: values.sourceSegmentId,
        kind: 'source_segment',
        ownerId: values.ownerId,
        meetingId: values.meetingId,
        finalizationManifestHash: 'a'.repeat(64),
        audioManifestHash: 'b'.repeat(64),
        finalizationVersion: 1,
        locality: 'source',
        provider: 'synthetic-source',
        modelId: null,
        parentId: values.eventId,
        startMs: values.sourceRange.startMs,
        endMs: values.sourceRange.endMs,
      },
    },
  } as unknown as ProjectionHistory['segments'][number]['ref'];
};

const history = (): ProjectionHistory =>
  ({
    version: 1,
    ownerId: 'owner-1',
    meetingId: '00000000-0000-4000-8000-000000000001',
    projectionVersion: 8,
    segments: [
      {
        id: 'segment-2',
        ref: {
          ...ref({
            sourceSegmentId: 'segment-2',
            eventId: 'event-2',
            sourceRange: { startMs: 1000, endMs: 2000 },
          }),
        },
        sourceText: 'Second',
        sourceSpeakerId: 'speaker-2',
        startMs: 1000,
        endMs: 2000,
        alternatives: [],
      },
      {
        id: 'segment-1',
        ref: ref(),
        sourceText: 'Original decision',
        sourceSpeakerId: 'speaker-1',
        startMs: 0,
        endMs: 1000,
        alternatives: [
          {
            id: 'alternative-1',
            text: 'Original alternative',
            ref: ref({
              eventId: 'event-alt-1',
              sourceSegmentId: 'segment-1',
              runId: 'run-cloud',
            }),
          },
        ],
      },
    ],
    decisions: [
      {
        id: 'decision-1',
        segmentId: 'segment-1',
        alternativeId: 'alternative-1',
        baseDecisionId: null,
        actorId: 'reviewer-1',
        baseProjectionVersion: 7,
        createdAt: '2026-08-11T10:00:00.000Z',
      },
    ],
    revisions: [
      {
        id: 'revision-1',
        segmentId: 'segment-1',
        baseRevisionId: null,
        revisedText: 'Corrected decision',
        actorId: 'reviewer-1',
        reason: 'clarification',
        baseProjectionVersion: 8,
        createdAt: '2026-08-11T10:01:00.000Z',
      },
    ],
    speakerMappings: [],
  }) as unknown as ProjectionHistory;

describe('replayTranscriptProjection', () => {
  it('replays shuffled immutable reads into a stable projection and preserves raw alternatives', () => {
    const first = replayTranscriptProjection(history());
    const shuffled = history();
    shuffled.segments.reverse();
    shuffled.decisions.reverse();
    shuffled.revisions.reverse();
    const second = replayTranscriptProjection(shuffled);

    expect(second).toEqual(first);
    expect(first.segments[0]).toMatchObject({
      id: 'segment-1',
      sourceText: 'Original decision',
      currentText: 'Corrected decision',
      selectedAlternativeId: 'alternative-1',
      currentRevisionId: 'revision-1',
      currentRef: { runId: 'run-1' },
    });
    expect(first.segments[0]?.alternatives).toHaveLength(1);
    expect(first.segments[0]?.alternatives[0]).toMatchObject({
      text: 'Original alternative',
      ref: { runId: 'run-cloud' },
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(replayTranscriptProjection(history())));
  });

  it('rejects cross-meeting or incompatible manifest lineage before projecting', () => {
    const crossMeeting = history();
    (crossMeeting.segments[0]!.ref as unknown as { meetingId: string }).meetingId =
      '00000000-0000-4000-8000-000000000002';
    expect(() => replayTranscriptProjection(crossMeeting)).toThrow(/meeting/i);

    const incompatibleManifest = history();
    (
      incompatibleManifest.segments[0]!.ref as unknown as { audioManifestHash: string }
    ).audioManifestHash = 'c'.repeat(64);
    expect(() => replayTranscriptProjection(incompatibleManifest)).toThrow(/manifest/i);
  });

  it('rejects cyclic revision and speaker mapping lineage', () => {
    const cyclicRevision = history();
    cyclicRevision.revisions = [
      { ...cyclicRevision.revisions[0]!, id: 'revision-a', baseRevisionId: 'revision-b' },
      { ...cyclicRevision.revisions[0]!, id: 'revision-b', baseRevisionId: 'revision-a' },
    ];
    expect(() => replayTranscriptProjection(cyclicRevision)).toThrow(/revision.*cycle/i);

    const cyclicSpeakerMapping = history();
    cyclicSpeakerMapping.speakerMappings = [
      { id: 'mapping-a', version: 2, fromSpeakerId: 'speaker-1', toSpeakerId: 'speaker-2' },
      { id: 'mapping-b', version: 2, fromSpeakerId: 'speaker-2', toSpeakerId: 'speaker-1' },
    ];
    expect(() => replayTranscriptProjection(cyclicSpeakerMapping)).toThrow(/speaker.*cycle/i);
  });

  it('rejects a revision base that belongs to another segment', () => {
    const crossSegment = history();
    crossSegment.revisions = [
      {
        ...crossSegment.revisions[0]!,
        id: 'revision-a',
        segmentId: 'segment-1',
        baseRevisionId: 'revision-b',
      },
      {
        ...crossSegment.revisions[0]!,
        id: 'revision-b',
        segmentId: 'segment-2',
        baseRevisionId: null,
      },
    ];
    expect(() => replayTranscriptProjection(crossSegment)).toThrow(/crosses segments/i);
  });

  it('replays speaker mappings by version, independent of input order', () => {
    const withMappings = history();
    withMappings.speakerMappings = [
      { id: 'mapping-v2', version: 2, fromSpeakerId: 'speaker-1', toSpeakerId: 'speaker-3' },
      { id: 'mapping-v1', version: 1, fromSpeakerId: 'speaker-1', toSpeakerId: 'speaker-2' },
    ];
    withMappings.segments = withMappings.segments.map((segment) => ({
      ...segment,
      ref: { ...segment.ref, speakerMappingVersion: 2 },
    }));
    const shuffled = {
      ...withMappings,
      speakerMappings: [...withMappings.speakerMappings].reverse(),
    };

    expect(replayTranscriptProjection(withMappings)).toEqual(replayTranscriptProjection(shuffled));
    expect(replayTranscriptProjection(withMappings).segments[0]?.currentSpeakerId).toBe(
      'speaker-3',
    );
  });

  it('validates malformed history even when there are no segments', () => {
    const empty = history();
    empty.segments = [];
    empty.revisions = [
      { ...empty.revisions[0]!, id: 'broken', baseRevisionId: 'missing', segmentId: 'segment-1' },
    ];
    expect(() => replayTranscriptProjection(empty)).toThrow(/broken|unknown segment/i);

    const malformedMapping = history();
    malformedMapping.segments = [];
    malformedMapping.speakerMappings = [
      { id: 'mapping-a', version: 1, fromSpeakerId: 'speaker-1', toSpeakerId: 'speaker-2' },
      { id: 'mapping-b', version: 1, fromSpeakerId: 'speaker-1', toSpeakerId: 'speaker-3' },
    ];
    expect(() => replayTranscriptProjection(malformedMapping)).toThrow(/conflicting/i);

    const malformedDecision = history();
    malformedDecision.segments = [];
    malformedDecision.decisions = [malformedDecision.decisions[0]!];
    expect(() => replayTranscriptProjection(malformedDecision)).toThrow(/unknown segment|empty/i);

    const malformedRevision = history();
    malformedRevision.segments = [];
    malformedRevision.revisions = [malformedRevision.revisions[0]!];
    expect(() => replayTranscriptProjection(malformedRevision)).toThrow(/unknown segment|empty/i);
  });

  it('rejects broken and branched revision ancestry', () => {
    const broken = history();
    broken.revisions = [{ ...broken.revisions[0]!, baseRevisionId: 'missing' }];
    expect(() => replayTranscriptProjection(broken)).toThrow(/broken/i);

    const branched = history();
    branched.revisions = [
      { ...branched.revisions[0]!, id: 'root', baseRevisionId: null },
      {
        ...branched.revisions[0]!,
        id: 'child-a',
        baseRevisionId: 'root',
        baseProjectionVersion: 9,
        createdAt: '2026-08-11T10:02:00.000Z',
      },
      {
        ...branched.revisions[0]!,
        id: 'child-b',
        baseRevisionId: 'root',
        baseProjectionVersion: 10,
        createdAt: '2026-08-11T10:03:00.000Z',
      },
    ];
    expect(() => replayTranscriptProjection(branched)).toThrow(/branch|conflict/i);
  });

  it('rejects duplicate ids and conflicting decisions at one base version', () => {
    const duplicate = history();
    duplicate.decisions = [duplicate.decisions[0]!, { ...duplicate.decisions[0]! }];
    expect(() => replayTranscriptProjection(duplicate)).toThrow(/duplicate/i);

    const conflicting = history();
    conflicting.segments
      .find((segment) => segment.id === 'segment-1')!
      .alternatives.push({
        id: 'alternative-2',
        text: 'Another alternative',
        ref: ref({ eventId: 'event-alt-2' }),
      });
    conflicting.decisions = [
      conflicting.decisions[0]!,
      {
        ...conflicting.decisions[0]!,
        id: 'decision-2',
        alternativeId: 'alternative-2',
        baseDecisionId: null,
      },
    ];
    expect(() => replayTranscriptProjection(conflicting)).toThrow(/decision.*conflict/i);
  });

  it('rejects cross-owner, manifest, and range provenance', () => {
    const crossOwner = history();
    (
      crossOwner.segments[0]!.ref.provenance.sourceSegment as unknown as { ownerId: string }
    ).ownerId = 'owner-2';
    expect(() => replayTranscriptProjection(crossOwner)).toThrow(/owner|lineage/i);

    const crossManifest = history();
    (
      crossManifest.segments[0]!.ref.provenance.event as unknown as { audioManifestHash: string }
    ).audioManifestHash = 'c'.repeat(64);
    expect(() => replayTranscriptProjection(crossManifest)).toThrow(/manifest/i);

    const invalidRange = history();
    (invalidRange.segments[0]!.ref.provenance.sourceSegment as unknown as { endMs: number }).endMs =
      3000;
    expect(() => replayTranscriptProjection(invalidRange)).toThrow(/range|provenance/i);
  });

  it('rejects alternatives with duplicate ids or foreign segment provenance', () => {
    const duplicate = history();
    const alternatives = duplicate.segments.find(
      (segment) => segment.id === 'segment-1',
    )!.alternatives;
    alternatives.push({ ...alternatives[0]! });
    expect(() => replayTranscriptProjection(duplicate)).toThrow(/duplicate alternative/i);

    const foreign = history();
    const alternative = foreign.segments.find((segment) => segment.id === 'segment-1')!
      .alternatives[0]!;
    (alternative.ref as { sourceSegmentId: string }).sourceSegmentId = 'segment-2';
    expect(() => replayTranscriptProjection(foreign)).toThrow(
      /provenance.*identity|alternative.*lineage/i,
    );
  });

  it('rejects multiple revision roots and preserves deterministic linear replay', () => {
    const multipleRoots = history();
    multipleRoots.revisions = [
      { ...multipleRoots.revisions[0]!, id: 'root-a', baseRevisionId: null },
      { ...multipleRoots.revisions[0]!, id: 'root-b', baseRevisionId: null },
    ];
    expect(() => replayTranscriptProjection(multipleRoots)).toThrow(/one revision root/i);

    const linear = history();
    linear.projectionVersion = 9;
    linear.revisions = [
      { ...linear.revisions[0]!, id: 'root', baseRevisionId: null, baseProjectionVersion: 8 },
      {
        ...linear.revisions[0]!,
        id: 'leaf',
        baseRevisionId: 'root',
        baseProjectionVersion: 9,
        revisedText: 'Deterministic leaf',
      },
    ];
    const shuffled = { ...linear, revisions: [...linear.revisions].reverse() };
    expect(replayTranscriptProjection(shuffled).segments[0]?.currentText).toBe(
      'Deterministic leaf',
    );
  });

  it('rejects decision conflicts without explicit progression ancestry', () => {
    const conflicting = history();
    conflicting.segments
      .find((segment) => segment.id === 'segment-1')!
      .alternatives.push({
        id: 'alternative-2',
        text: 'Another alternative',
        ref: ref({ eventId: 'event-alt-2', sourceSegmentId: 'segment-1' }),
      });
    conflicting.decisions = [
      conflicting.decisions[0]!,
      {
        ...conflicting.decisions[0]!,
        id: 'decision-2',
        alternativeId: 'alternative-2',
        baseProjectionVersion: 8,
        baseDecisionId: null,
      },
    ];
    conflicting.projectionVersion = 8;
    expect(() => replayTranscriptProjection(conflicting)).toThrow(/broken ancestry|conflict/i);

    const progressed = structuredClone(conflicting);
    progressed.decisions[1]!.baseDecisionId = progressed.decisions[0]!.id;
    progressed.revisions = [];
    expect(() => replayTranscriptProjection(progressed)).not.toThrow();
  });
});
