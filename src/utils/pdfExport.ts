import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { Song, Tag } from './ct-types';
import { getDetailValue } from './songDetails';

// Register fonts (correct way)
(pdfMake as any).vfs = pdfFonts;

interface ExportOptions {
  songs: Song[];
  selectedTags: Tag[];
  selectedDetails: Array<{ id: string; bold: boolean; italic: boolean; fontSize: number }>; // Array with formatting
  includeAllSongsList?: boolean;
  alphabeticalGroupingPerContext?: Map<string, boolean>; // Per-context grouping
  headerStyle?: {
    alignment: 'left' | 'center';
    fontSize: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    inBox: boolean;
  };
}

export function generatePDF(options: ExportOptions) {
  const { 
    songs, 
    selectedTags, 
    selectedDetails, 
    includeAllSongsList = false,
    alphabeticalGroupingPerContext = new Map(),
    headerStyle = { alignment: 'left', fontSize: 16, bold: true, italic: false, underline: false, inBox: false }
  } = options;
  
  // Group songs by tags
  const songsByTag = groupSongsByTags(songs, selectedTags);
  
  // Build PDF content
  const content: any[] = [];
  let isFirstSection = true; // Track if this is the first section
  
  // Add "All Songs" list if requested
  if (includeAllSongsList) {
    // Add page break before section (except first)
    if (!isFirstSection) {
      content.push({ text: '', pageBreak: 'before' });
    }
    isFirstSection = false;
    
    content.push(formatTagHeader('Alle Lieder', headerStyle));
    content.push({ text: '\n' });
    
    const useGrouping = alphabeticalGroupingPerContext.get('allSongs') || false;
    content.push(formatSongsTable(songs, selectedDetails, useGrouping));
    
    content.push({ text: '\n' });
    content.push({ text: '\n' });
  }
  
  // Add songs grouped by tags
  if (selectedTags.length > 0 && songsByTag.size > 0) {
    songsByTag.forEach((tagSongs, tagName) => {
      // Add page break before section (except first)
      if (!isFirstSection) {
        content.push({ text: '', pageBreak: 'before' });
      }
      isFirstSection = false;
      
      content.push(formatTagHeader(tagName, headerStyle));
      content.push({ text: '\n' });
      
      // Find the tag ID for this tag name to get grouping setting
      const tag = selectedTags.find(t => t.name === tagName);
      const useGrouping = tag ? (alphabeticalGroupingPerContext.get(`tag_${tag.id}`) || false) : false;
      
      content.push(formatSongsTable(tagSongs, selectedDetails, useGrouping));
      
      content.push({ text: '\n' });
    });
  } else if (!includeAllSongsList) {
    // No tags selected AND no "all songs" list - show fallback
    content.push(formatTagHeader('All Songs', headerStyle));
    content.push({ text: '\n' });
    
    const useGrouping = alphabeticalGroupingPerContext.get('allSongs') || false;
    content.push(formatSongsTable(songs, selectedDetails, useGrouping));
  }
  
  // Define document
  const docDefinition = {
    content,
    footer: function(_currentPage: number, _pageCount: number) {
      return {
        text: `Generated: ${new Date().toLocaleDateString('de-DE')}`,
        alignment: 'right',
        fontSize: 8,
        color: '#666',
        margin: [40, 10, 40, 10]
      };
    },
    styles: {
      songTitle: {
        fontSize: 14,
        bold: true,
        margin: [0, 5, 0, 3]
      },
      songDetail: {
        fontSize: 10,
        color: '#333',
        margin: [10, 1, 0, 1]
      }
    },
    defaultStyle: {
      font: 'Roboto'
    }
  };
  
  // Generate and download PDF
  pdfMake.createPdf(docDefinition as any).download('songs_export.pdf');
}

function formatTagHeader(tagName: string, style: { alignment: 'left' | 'center'; fontSize: number; bold: boolean; italic: boolean; underline: boolean; inBox: boolean }): any {
  const headerObj: any = {
    text: tagName,
    fontSize: style.fontSize,
    bold: style.bold,
    italics: style.italic,
    color: '#000000',
    alignment: style.alignment,
    margin: [0, 10, 0, 5]
  };
  
  if (style.underline) {
    headerObj.decoration = 'underline';
  }
  
  if (style.inBox) {
    return {
      table: {
        widths: ['*'],
        body: [[{
          text: tagName,
          fontSize: style.fontSize,
          bold: style.bold,
          italics: style.italic,
          color: '#000000',
          alignment: style.alignment,
          fillColor: '#e0e0e0',
          border: [true, true, true, true]
        }]]
      },
      margin: [0, 10, 0, 5]
    };
  }
  
  return headerObj;
}

function groupSongsByTags(songs: Song[], selectedTags: Tag[]): Map<string, Song[]> {
  const songsByTag = new Map<string, Song[]>();
  
  // If no tags selected, return empty map
  if (selectedTags.length === 0) {
    return songsByTag;
  }
  
  selectedTags.forEach(tag => {
    const tagSongs = songs.filter(song => 
      song.tags && song.tags.some((t: any) => t.id === tag.id)
    );
    
    if (tagSongs.length > 0) {
      songsByTag.set(tag.name, tagSongs);
    }
  });
  
  return songsByTag;
}

function formatSongsTable(songs: Song[], selectedDetails: Array<{ id: string; bold: boolean; italic: boolean; fontSize: number }>, alphabeticalGrouping: boolean = false): any {
  // Sort songs alphabetically by name if grouping is enabled
  const sortedSongs = alphabeticalGrouping 
    ? [...songs].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    : songs;
  
  // Build table body using selected details (already in order, max 4)
  const tableBody: any[] = [];
  let lastInitial = '';
  
  sortedSongs.forEach((song, index) => {
    const songName = song.name || '';
    const currentInitial = songName.charAt(0).toUpperCase();
    
    // Add empty row if initial letter changes (and grouping is enabled)
    if (alphabeticalGrouping && index > 0 && currentInitial !== lastInitial && currentInitial !== '') {
      const emptyRow: any[] = [];
      selectedDetails.forEach((_detail) => {
        emptyRow.push({ text: ' ', fontSize: 6 }); // Small empty cell
      });
      tableBody.push(emptyRow);
    }
    
    lastInitial = currentInitial;
    
    const row: any[] = [];
    
    selectedDetails.forEach((detail) => {
      const value = getDetailValue(song, detail.id);
      const cellFormat: any = { 
        text: value, 
        fontSize: detail.fontSize, 
        color: '#000000'
      };
      
      if (detail.bold) cellFormat.bold = true;
      if (detail.italic) cellFormat.italics = true;
      
      row.push(cellFormat);
    });
    
    tableBody.push(row);
  });
  
  // Determine column widths: Name column gets '*' (flexible/wide), others 'auto' (fit content)
  const widths: any[] = [];
  selectedDetails.forEach((detail) => {
    widths.push(detail.id === 'name' ? '*' : 'auto');
  });
  
  return {
    table: {
      widths: widths,
      body: tableBody
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 10]
  };
}

