import { describe, it, expect } from 'vitest';
import {
  applySettings,
  buildSettings,
  type DetailFormatting,
  type DetailItem,
  type HeaderStyleOptions,
  type SettingsState,
  type TagItem
} from './settings';

const makeState = () => {
  const availableDetails: DetailItem[] = [
    { id: 'name', label: 'Name' },
    { id: 'author', label: 'Author' },
    { id: 'tempo', label: 'Tempo' }
  ];

  const tags: TagItem[] = [
    { id: 1, name: 'Praise' },
    { id: 2, name: 'Worship' }
  ];

  const detailFormatting = new Map<string, DetailFormatting>([
    ['name', { bold: false, italic: false, fontSize: 11 }],
    ['tempo', { bold: true, italic: false, fontSize: 12 }]
  ]);

  const headerStyleOptions: HeaderStyleOptions = {
    alignment: 'left',
    fontSize: 16,
    bold: true,
    italic: false,
    underline: false,
    inBox: false
  };

  const state: SettingsState = {
    selectedCategoryIds: new Set([10, 20]),
    selectedTagIds: new Set([1]),
    orderedTags: [...tags],
    selectedDetails: new Set(['name', 'author']),
    orderedDetails: [...availableDetails],
    detailFormatting,
    alphabeticalGroupingPerContext: new Map([['allSongs', false]]),
    includeAllSongsList: true,
    headerStyleOptions,
    availableDetails,
    tags
  };

  return state;
};

describe('buildSettings', () => {
  it('builds settings from current state', () => {
    const state = makeState();

    const settings = buildSettings(state, { timestamp: '2026-02-14T00:00:00.000Z' });

    expect(settings.version).toBe('1.0');
    expect(settings.timestamp).toBe('2026-02-14T00:00:00.000Z');
    expect(settings.selectedCategoryIds).toEqual([10, 20]);
    expect(settings.selectedTagIds).toEqual([1]);
    expect(settings.orderedTags).toEqual([1, 2]);
    expect(settings.selectedDetails).toEqual(['name', 'author']);
    expect(settings.orderedDetails).toEqual(['name', 'author', 'tempo']);
    expect(settings.includeAllSongsList).toBe(true);
  });

  it('includes formatting and grouping maps', () => {
    const state = makeState();
    state.alphabeticalGroupingPerContext.set('tag_1', true);

    const settings = buildSettings(state, { timestamp: '2026-02-14T00:00:00.000Z' });

    expect(settings.detailFormatting).toEqual([
      ['name', { bold: false, italic: false, fontSize: 11 }],
      ['tempo', { bold: true, italic: false, fontSize: 12 }]
    ]);
    expect(settings.alphabeticalGroupingPerContext).toEqual([
      ['allSongs', false],
      ['tag_1', true]
    ]);
  });
});

describe('applySettings', () => {
  it('applies settings while filtering unknown ids', () => {
    const state = makeState();

    const settings = {
      version: '1.0',
      timestamp: '2026-02-14T00:00:00.000Z',
      selectedCategoryIds: [20],
      selectedTagIds: [2],
      orderedTags: [2, 99],
      selectedDetails: ['tempo', 'unknown', 'name'],
      orderedDetails: ['tempo'],
      detailFormatting: [
        ['tempo', { bold: false, italic: true, fontSize: 14 }],
        ['unknown', { bold: true, italic: true, fontSize: 12 }]
      ],
      alphabeticalGroupingPerContext: [
        ['allSongs', true],
        ['tag_2', true]
      ],
      includeAllSongsList: false,
      headerStyleOptions: {
        alignment: 'center',
        fontSize: 18,
        bold: false,
        italic: true,
        underline: true,
        inBox: true
      }
    };

    applySettings(settings, state);

    expect(Array.from(state.selectedCategoryIds)).toEqual([20]);
    expect(Array.from(state.selectedTagIds)).toEqual([2]);
    expect(state.orderedTags.map((tag) => tag.id)).toEqual([2, 1]);
    expect(Array.from(state.selectedDetails)).toEqual(['tempo', 'name']);
    expect(state.orderedDetails.map((detail) => detail.id)).toEqual(['tempo', 'name', 'author']);
    expect(state.detailFormatting.get('tempo')).toEqual({ bold: false, italic: true, fontSize: 14 });
    expect(state.detailFormatting.has('unknown')).toBe(false);
    expect(state.alphabeticalGroupingPerContext.get('allSongs')).toBe(true);
    expect(state.alphabeticalGroupingPerContext.get('tag_2')).toBe(true);
    expect(state.includeAllSongsList).toBe(false);
    expect(state.headerStyleOptions.alignment).toBe('center');
    expect(state.headerStyleOptions.fontSize).toBe(18);
    expect(state.headerStyleOptions.bold).toBe(false);
    expect(state.headerStyleOptions.italic).toBe(true);
    expect(state.headerStyleOptions.underline).toBe(true);
    expect(state.headerStyleOptions.inBox).toBe(true);
  });
});
