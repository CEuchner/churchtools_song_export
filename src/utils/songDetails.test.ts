import { describe, it, expect } from 'vitest';
import type { Song } from './ct-types';
import { getDefaultArrangement, getDetailValue } from './songDetails';

const makeSong = (partial: Partial<Song>) => partial as Song;

describe('getDefaultArrangement', () => {
  it('returns the default arrangement when present', () => {
    const song = makeSong({
      arrangements: [{ id: 1 }, { id: 2, isDefault: true }] as any
    });

    expect(getDefaultArrangement(song)?.id).toBe(2);
  });

  it('falls back to the first arrangement', () => {
    const song = makeSong({
      arrangements: [{ id: 1 }, { id: 2 }] as any
    });

    expect(getDefaultArrangement(song)?.id).toBe(1);
  });

  it('returns null when no arrangements exist', () => {
    const song = makeSong({ arrangements: [] as any });

    expect(getDefaultArrangement(song)).toBeNull();
  });
});

describe('getDetailValue', () => {
  it('formats tempo with BPM', () => {
    const song = makeSong({
      arrangements: [{ tempo: 120, isDefault: true }] as any
    });

    expect(getDetailValue(song, 'tempo')).toBe('120 BPM');
  });

  it('formats duration as mm:ss', () => {
    const song = makeSong({
      arrangements: [{ duration: 305, isDefault: true }] as any
    });

    expect(getDetailValue(song, 'duration')).toBe('5:05');
  });

  it('formats CCLI with prefix', () => {
    const song = makeSong({ ccli: '1234567' });

    expect(getDetailValue(song, 'ccli')).toBe('CCLI: 1234567');
  });

  it('joins tag names', () => {
    const song = makeSong({
      tags: [{ name: 'Praise' }, { name: 'Worship' }] as any
    });

    expect(getDetailValue(song, 'tags')).toBe('Praise, Worship');
  });

  it('uses source name for arrangement sources', () => {
    const song = makeSong({
      arrangements: [{ source: { name: 'Feiert Jesus' }, isDefault: true }] as any
    });

    expect(getDetailValue(song, 'source')).toBe('Feiert Jesus');
  });
});
