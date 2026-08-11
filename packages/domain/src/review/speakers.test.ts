import { describe, expect, it } from 'vitest';
import {
  SpeakerMappingCommandSchema,
  mergeSpeakers,
  renameSpeaker,
  replaySpeakerMappings,
  type SpeakerMappingHistory,
} from './speakers.js';

const meetingId = '00000000-0000-4000-8000-000000000001' as any;
const base = (): SpeakerMappingHistory => ({
  ownerId: 'owner-1',
  meetingId,
  version: 2,
  rawLabels: [
    { speakerId: 'speaker-a', providerLabel: 'spk_0', sessionLabel: 'Alice' },
    { speakerId: 'speaker-b', providerLabel: 'spk_1', sessionLabel: 'Bob' },
    { speakerId: 'speaker-c', providerLabel: 'spk_2', sessionLabel: 'Carol' },
  ],
  mappings: [
    {
      id: 'mapping-1',
      ownerId: 'owner-1',
      meetingId,
      version: 1,
      fromSpeakerId: 'speaker-a',
      toSpeakerId: 'speaker-b',
      operation: 'merge',
      mergeConfirmed: true,
      actorId: 'actor-1',
      baseVersion: 0,
      idempotencyKey: 'mapping-key-1',
      createdAt: '2026-08-12T00:00:00.000Z',
    },
    {
      id: 'mapping-2',
      ownerId: 'owner-1',
      meetingId,
      version: 2,
      fromSpeakerId: 'speaker-c',
      toSpeakerId: 'speaker-b',
      operation: 'rename',
      actorId: 'actor-1',
      baseVersion: 1,
      idempotencyKey: 'mapping-key-2',
      createdAt: '2026-08-12T00:01:00.000Z',
    },
  ],
});

describe('versioned speaker mappings', () => {
  it('rebuilds a deterministic rename/merge projection without changing raw labels', () => {
    const history = base();
    const reversed = { ...history, mappings: [...history.mappings].reverse() };
    const first = replaySpeakerMappings(history);
    const second = replaySpeakerMappings(reversed);
    expect(second.ownerId).toBe(first.ownerId);
    expect(second.meetingId).toBe(first.meetingId);
    expect(second.version).toBe(first.version);
    expect(second.mappings).toEqual(first.mappings);
    expect(replaySpeakerMappings(history).rawLabels).toEqual(history.rawLabels);
    expect(() => {
      (replaySpeakerMappings(history).rawLabels[0] as { sessionLabel: string }).sessionLabel =
        'changed';
    }).toThrow();
    expect(() => {
      (replaySpeakerMappings(history).rawLabels[1] as { providerLabel: string }).providerLabel =
        'changed';
    }).toThrow();
    expect(replaySpeakerMappings(history).resolve('speaker-a')).toBe('speaker-b');
    const renamed = renameSpeaker(history, {
      id: 'mapping-3',
      ownerId: 'owner-1',
      meetingId,
      fromSpeakerId: 'speaker-b',
      toSpeakerId: 'speaker-c',
      operation: 'rename',
      actorId: 'actor-1',
      baseVersion: 2,
      idempotencyKey: 'mapping-key-3',
      createdAt: '2026-08-12T00:02:00.000Z',
    });
    expect(renamed.mappings.at(-1)?.operation).toBe('rename');
    const merged = mergeSpeakers(history, {
      id: 'mapping-3',
      ownerId: 'owner-1',
      meetingId,
      fromSpeakerId: 'speaker-c',
      toSpeakerId: 'speaker-b',
      operation: 'merge',
      mergeConfirmed: true,
      actorId: 'actor-1',
      baseVersion: 2,
      idempotencyKey: 'mapping-key-4',
      createdAt: '2026-08-12T00:02:00.000Z',
    });
    expect(merged.mappings.at(-1)?.operation).toBe('merge');
    expect(() =>
      SpeakerMappingCommandSchema.parse({
        id: 'merge-no-confirmation',
        ownerId: 'owner-1',
        meetingId,
        fromSpeakerId: 'speaker-a',
        toSpeakerId: 'speaker-b',
        operation: 'merge',
        actorId: 'actor-1',
        baseVersion: 0,
        idempotencyKey: 'merge-no-confirmation',
        createdAt: '2026-08-12T00:00:00.000Z',
      }),
    ).toThrow(/confirmation/i);
  });

  it('rejects cycles, unknown speakers, and stale command versions', () => {
    const cycle = base();
    cycle.mappings = [
      ...cycle.mappings,
      {
        ...cycle.mappings[0]!,
        id: 'mapping-3',
        version: 3,
        fromSpeakerId: 'speaker-b',
        toSpeakerId: 'speaker-a',
        baseVersion: 2,
      },
    ];
    const cycleWithVersion = { ...cycle, version: 3 };
    expect(() => replaySpeakerMappings(cycleWithVersion)).toThrow(/cycle/i);
    expect(() => replaySpeakerMappings({ ...base(), version: 3 })).toThrow(/gap/i);
    expect(() =>
      replaySpeakerMappings({
        ...base(),
        mappings: [...base().mappings, { ...base().mappings[0]!, id: 'mapping-1' }],
      }),
    ).toThrow(/duplicate/i);
    expect(() => replaySpeakerMappings({ ...base(), ownerId: 'owner-2' })).toThrow(
      /owner|meeting/i,
    );
    expect(() =>
      replaySpeakerMappings({
        ...base(),
        meetingId: '00000000-0000-4000-8000-000000000002' as any,
      }),
    ).toThrow(/owner|meeting/i);
    expect(() =>
      replaySpeakerMappings({
        ...base(),
        version: 1,
        mappings: [{ ...base().mappings[0]!, fromSpeakerId: 'unknown' }],
      }),
    ).toThrow(/unknown/i);
    expect(() =>
      SpeakerMappingCommandSchema.parse({
        id: 'mapping-2',
        ownerId: 'owner-1',
        meetingId: base().meetingId,
        fromSpeakerId: 'speaker-a',
        toSpeakerId: 'speaker-b',
        operation: 'rename',
        actorId: 'actor-1',
        baseVersion: 2,
        idempotencyKey: 'key',
        createdAt: '2026-08-12T00:00:00.000Z',
      }),
    ).not.toThrow();
    expect(() =>
      SpeakerMappingCommandSchema.parse({
        id: 'self',
        ownerId: 'owner-1',
        meetingId: base().meetingId,
        fromSpeakerId: 'speaker-a',
        toSpeakerId: 'speaker-a',
        operation: 'rename',
        actorId: 'actor-1',
        baseVersion: 0,
        idempotencyKey: 'self',
        createdAt: '2026-08-12T00:00:00.000Z',
      }),
    ).toThrow(/cyclic/i);
    expect(() =>
      SpeakerMappingCommandSchema.parse({
        id: 'bad',
        ownerId: ' ',
        meetingId: base().meetingId,
        fromSpeakerId: 'speaker-a',
        toSpeakerId: 'speaker-b',
        operation: 'rename',
        actorId: 'actor-1',
        baseVersion: 0,
        idempotencyKey: 'bad',
        createdAt: '2026-08-12T00:00:00.000Z',
      }),
    ).toThrow();
  });
});
