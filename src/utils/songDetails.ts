import type { Song } from './ct-types';

export function getDefaultArrangement(song: Song) {
  if (!song.arrangements || song.arrangements.length === 0) {
    return null;
  }
  return song.arrangements.find((a: any) => a.isDefault) || song.arrangements[0];
}

export function getDetailValue(song: Song, detailId: string): string {
  switch (detailId) {
    case 'author':
      return song.author || '';
    case 'copyright':
      return song.copyright ? `© ${song.copyright}` : '';
    case 'ccli':
      return song.ccli ? `CCLI: ${song.ccli}` : '';
    case 'category':
      return song.category?.name || '';
    case 'name':
      return song.name || 'Untitled';
    case 'tags':
      if (song.tags && song.tags.length > 0) {
        return song.tags.map((t: any) => t.name).join(', ');
      }
      return '';
    case 'source': {
      const arrangement = getDefaultArrangement(song);
      if (arrangement && arrangement.source) {
        return typeof arrangement.source === 'string'
          ? arrangement.source
          : arrangement.source.name || '';
      }
      return '';
    }
    case 'sourceReference':
      return getDefaultArrangement(song)?.sourceReference || '';
    case 'key':
      return getDefaultArrangement(song)?.key || '';
    case 'tempo': {
      const tempoArrangement = getDefaultArrangement(song);
      return tempoArrangement?.tempo ? `${tempoArrangement.tempo} BPM` : '';
    }
    case 'duration': {
      const durationArrangement = getDefaultArrangement(song);
      if (durationArrangement?.duration) {
        const minutes = Math.floor(durationArrangement.duration / 60);
        const seconds = durationArrangement.duration % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
      return '';
    }
    case 'description':
      return getDefaultArrangement(song)?.description || '';
    default:
      return '';
  }
}
