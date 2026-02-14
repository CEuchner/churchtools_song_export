export interface HeaderStyleOptions {
  alignment: 'left' | 'center';
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  inBox: boolean;
}

export interface DetailFormatting {
  bold: boolean;
  italic: boolean;
  fontSize: number;
}

export interface DetailItem {
  id: string;
  label: string;
}

export interface TagItem {
  id: number;
  name: string;
}

export interface SettingsData {
  version: string;
  timestamp: string;
  selectedCategoryIds: number[];
  selectedTagIds: number[];
  orderedTags: number[];
  selectedDetails: string[];
  orderedDetails: string[];
  detailFormatting: Array<[string, DetailFormatting]>;
  alphabeticalGroupingPerContext: Array<[string, boolean]>;
  includeAllSongsList: boolean;
  headerStyleOptions: HeaderStyleOptions;
}

export interface SettingsState {
  selectedCategoryIds: Set<number>;
  selectedTagIds: Set<number>;
  orderedTags: TagItem[];
  selectedDetails: Set<string>;
  orderedDetails: DetailItem[];
  detailFormatting: Map<string, DetailFormatting>;
  alphabeticalGroupingPerContext: Map<string, boolean>;
  includeAllSongsList: boolean;
  headerStyleOptions: HeaderStyleOptions;
  availableDetails: DetailItem[];
  tags: TagItem[];
}

export function buildSettings(
  state: Omit<SettingsState, 'availableDetails' | 'tags'>,
  options?: { timestamp?: string }
): SettingsData {
  const timestamp = options?.timestamp ?? new Date().toISOString();

  return {
    version: '1.0',
    timestamp,
    selectedCategoryIds: Array.from(state.selectedCategoryIds),
    selectedTagIds: Array.from(state.selectedTagIds),
    orderedTags: state.orderedTags.map((t) => t.id),
    selectedDetails: Array.from(state.selectedDetails),
    orderedDetails: state.orderedDetails.map((d) => d.id),
    detailFormatting: Array.from(state.detailFormatting.entries()),
    alphabeticalGroupingPerContext: Array.from(state.alphabeticalGroupingPerContext.entries()),
    includeAllSongsList: state.includeAllSongsList,
    headerStyleOptions: state.headerStyleOptions
  };
}

export function applySettings(settings: Partial<SettingsData>, state: SettingsState) {
  if (settings.selectedCategoryIds && Array.isArray(settings.selectedCategoryIds)) {
    state.selectedCategoryIds.clear();
    settings.selectedCategoryIds.forEach((id) => state.selectedCategoryIds.add(id));
  }

  if (settings.selectedTagIds && Array.isArray(settings.selectedTagIds)) {
    state.selectedTagIds.clear();
    settings.selectedTagIds.forEach((id) => state.selectedTagIds.add(id));
  }

  if (settings.orderedTags && Array.isArray(settings.orderedTags)) {
    const newOrder: TagItem[] = [];
    settings.orderedTags.forEach((tagId) => {
      const tag = state.tags.find((t) => t.id === tagId);
      if (tag) newOrder.push(tag);
    });

    state.tags.forEach((tag) => {
      if (!newOrder.find((t) => t.id === tag.id)) {
        newOrder.push(tag);
      }
    });

    state.orderedTags.length = 0;
    state.orderedTags.push(...newOrder);
  }

  if (settings.selectedDetails && Array.isArray(settings.selectedDetails)) {
    state.selectedDetails.clear();
    settings.selectedDetails.forEach((id) => {
      if (state.availableDetails.find((d) => d.id === id)) {
        state.selectedDetails.add(id);
      }
    });
  }

  if (settings.orderedDetails && Array.isArray(settings.orderedDetails)) {
    const newOrder: DetailItem[] = [];
    settings.orderedDetails.forEach((detailId) => {
      const detail = state.availableDetails.find((d) => d.id === detailId);
      if (detail) newOrder.push(detail);
    });

    state.availableDetails.forEach((detail) => {
      if (!newOrder.find((d) => d.id === detail.id)) {
        newOrder.push(detail);
      }
    });

    state.orderedDetails.length = 0;
    state.orderedDetails.push(...newOrder);
  }

  if (settings.detailFormatting && Array.isArray(settings.detailFormatting)) {
    state.detailFormatting.clear();
    settings.detailFormatting.forEach(([key, value]) => {
      if (state.availableDetails.find((d) => d.id === key)) {
        state.detailFormatting.set(key, value);
      }
    });
  }

  if (
    settings.alphabeticalGroupingPerContext &&
    Array.isArray(settings.alphabeticalGroupingPerContext)
  ) {
    state.alphabeticalGroupingPerContext.clear();
    settings.alphabeticalGroupingPerContext.forEach(([key, value]) => {
      state.alphabeticalGroupingPerContext.set(key, value);
    });
  }

  if (typeof settings.includeAllSongsList === 'boolean') {
    state.includeAllSongsList = settings.includeAllSongsList;
  }

  if (settings.headerStyleOptions && typeof settings.headerStyleOptions === 'object') {
    Object.assign(state.headerStyleOptions, settings.headerStyleOptions);
  }
}
