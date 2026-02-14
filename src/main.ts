import type { Person, Song } from './utils/ct-types';
import { churchtoolsClient } from '@churchtools/churchtools-client';
import { generatePDF } from './utils/pdfExport';
import { getDefaultArrangement } from './utils/songDetails';
import { applySettings, buildSettings } from './utils/settings';

// only import reset.css in development mode to keep the production bundle small and to simulate CT environment
if (import.meta.env.MODE === 'development') {
    import('./utils/reset.css');
}

declare const window: Window &
    typeof globalThis & {
        settings: {
            base_url?: string;
        };
    };

const baseUrl = window.settings?.base_url ?? import.meta.env.VITE_BASE_URL;
churchtoolsClient.setBaseUrl(baseUrl);

const username = import.meta.env.VITE_USERNAME;
const password = import.meta.env.VITE_PASSWORD;
if (import.meta.env.MODE === 'development' && username && password) {
    await churchtoolsClient.post('/login', { username, password });
}

const KEY = import.meta.env.VITE_KEY;
export { KEY };

// Get user info
const user = await churchtoolsClient.get<Person>(`/whoami`);

// Function to load all songs with pagination
async function loadAllSongs(): Promise<Array<Song>> {
  const allSongs: Array<Song> = [];
  const limit = 200; // Max per request
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await churchtoolsClient.get(`/songs?include=tags&limit=${limit}&page=${page}`);
    const songs = Array.isArray(response) ? response : ((response as any)?.data || []);
    
    if (songs.length > 0) {
      allSongs.push(...songs);
      console.log(`Loaded page ${page}: ${songs.length} songs (total: ${allSongs.length})`);
      page++;
      
      // If we get less than limit, we've reached the end
      if (songs.length < limit) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }
  
  return allSongs;
}

// Load data in parallel (tags and masterdata, songs separately due to pagination)
const [tagsResponse, masterDataResponse] = await Promise.all([
  churchtoolsClient.get('/tags/song'),
  churchtoolsClient.get('/event/masterdata')
]);

// Load all songs with pagination
console.log('Loading all songs with pagination...');
const songs = await loadAllSongs();
console.log(`Total songs loaded: ${songs.length}`);

console.log('Raw API response (tags):', tagsResponse);
console.log('Raw API response (masterdata):', masterDataResponse);

// Extract categories directly from masterdata
const categories = ((masterDataResponse as any)?.songCategories || [])
  .filter((cat: any) => cat.id !== undefined && cat.name)
  .sort((a: any, b: any) => a.name.localeCompare(b.name));
console.log('Categories:', categories);

// Extract tags directly from API (already an array)
const tags = (Array.isArray(tagsResponse) ? tagsResponse : [])
  .filter((tag: any) => tag.id !== undefined && tag.name)
  .sort((a: any, b: any) => a.name.localeCompare(b.name));
console.log('Tags:', tags);

// Track selected categories (initially all selected)
const selectedCategoryIds = new Set<number>(categories.map((c: any) => c.id));

// Track selected tags for export structure with order (initially all selected)
// Using array instead of Set to maintain order for drag-and-drop
const orderedTags = [...tags]; // Array of all tags in current order
const selectedTagIds = new Set<number>(tags.map(t => t.id));

// Track if "All Songs" list should be included in export
let includeAllSongsList = true;

// Track alphabetical grouping per context (tag ID or 'allSongs')
const alphabeticalGroupingPerContext = new Map<string, boolean>();
alphabeticalGroupingPerContext.set('allSongs', false); // Default for "Alle Lieder"
tags.forEach(tag => {
  alphabeticalGroupingPerContext.set(`tag_${tag.id}`, false); // Default per tag
});

// Track header style options
const headerStyleOptions = {
  alignment: 'left' as 'left' | 'center',
  fontSize: 16,
  bold: true,
  italic: false,
  underline: false,
  inBox: false
};

// Define available song details (order matters for drag-and-drop)
const availableDetails = [
  { id: 'name', label: 'Name' },
  { id: 'author', label: 'Author' },
  { id: 'category', label: 'Category' },
  { id: 'sourceReference', label: 'Song Number' },
  { id: 'ccli', label: 'CCLI' },
  { id: 'copyright', label: 'Copyright' },
  { id: 'tags', label: 'Tags' },
  { id: 'source', label: 'Source' },
  { id: 'key', label: 'Key' },
  { id: 'tempo', label: 'Tempo (BPM)' },
  { id: 'duration', label: 'Duration' },
  { id: 'description', label: 'Description' }
];

// Track ordered details for drag-and-drop (maintain order)
const orderedDetails = [...availableDetails];

// Track selected details (initially Name, Author, Category)
const selectedDetails = new Set<string>(['name', 'author', 'category']);

// Track formatting for each detail (bold/italic/fontSize)
const detailFormatting: Map<string, { bold: boolean; italic: boolean; fontSize: number }> = new Map();
availableDetails.forEach(detail => {
  detailFormatting.set(detail.id, { bold: false, italic: false, fontSize: 11 });
});

// Update Details List HTML (for reordering after import)
const updateDetailsList = () => {
  const container = document.getElementById('detailListContainer');
  if (!container) return;
  
  container.innerHTML = orderedDetails.map(detail => {
    const formatting = detailFormatting.get(detail.id) ?? { bold: false, italic: false, fontSize: 11 };
    const fontSizeOptions = [8, 9, 10, 11, 12, 13, 14, 16]
      .map(size => `<option value="${size}" ${formatting.fontSize === size ? 'selected' : ''}>${size}</option>`)
      .join('');

    return `
    <div class="detail-item" draggable="true" data-detail-id="${detail.id}" 
         style="display: flex; align-items: center; padding: 0.5rem; background: ${detail.id === 'name' ? '#fff9e6' : 'white'}; border: 1px solid ${detail.id === 'name' ? '#ffa500' : '#ddd'}; border-radius: 4px; cursor: move; user-select: none;">
      <span style="margin-right: 0.5rem; color: #999; font-size: 1.2rem;">≡</span>
      <input type="checkbox" class="detail-checkbox" data-detail-id="${detail.id}" 
             ${selectedDetails.has(detail.id) ? 'checked' : ''}
             ${detail.id === 'name' ? 'disabled checked' : ''}
             style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: ${detail.id === 'name' ? 'not-allowed' : 'pointer'};">
      <span style="font-size: 0.9rem; flex: 1; ${detail.id === 'name' ? 'font-weight: bold;' : ''}">${detail.label}</span>
      <select class="font-size-select" data-detail-id="${detail.id}" title="Font Size">
        ${fontSizeOptions}
      </select>
      <button class="format-btn bold-btn ${formatting.bold ? 'active' : ''}" data-detail-id="${detail.id}" title="Bold">B</button>
      <button class="format-btn italic-btn ${formatting.italic ? 'active' : ''}" data-detail-id="${detail.id}" title="Italic" style="font-style: italic;">I</button>
    </div>
  `;
  }).join('');
  
  // Re-attach event listeners
  attachDetailEventListeners();
};

// Update Tags List HTML (for reordering after import)
const updateTagsList = () => {
  const tagsContainer = document.getElementById('tagListContainer');
  if (!tagsContainer) return;
  
  // Generate new tag items HTML
  const tagItemsHtml = orderedTags.map(tag => `
    <div class="tag-item" draggable="true" data-tag-id="${tag.id}" 
         style="display: flex; align-items: center; padding: 0.5rem; background: white; border: 1px solid #ddd; border-radius: 4px; cursor: move; user-select: none;">
      <span style="margin-right: 0.5rem; color: #999; font-size: 1.2rem;">≡</span>
      <input type="checkbox" class="tag-checkbox" data-tag-id="${tag.id}" ${selectedTagIds.has(tag.id) ? 'checked' : ''} 
             style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
      <span style="font-size: 0.9rem; flex: 1;">${tag.name}</span>
      <label style="display: flex; align-items: center; margin-left: 0.5rem; cursor: pointer;" title="Alphabetische Gruppierung">
        <span style="font-size: 0.8rem; margin-right: 0.25rem;">ABC</span>
        <input type="checkbox" class="alpha-group-checkbox" data-context="tag_${tag.id}" 
               ${alphabeticalGroupingPerContext.get(`tag_${tag.id}`) ? 'checked' : ''}
               style="width: 14px; height: 14px; cursor: pointer;">
      </label>
    </div>
  `).join('');
  
  // Remove all existing tag items
  const existingTagItems = Array.from(tagsContainer.querySelectorAll('.tag-item'));
  existingTagItems.forEach(item => item.remove());
  
  // Insert new tag items at the end (after "Select All Tags" checkbox)
  const selectAllCheckboxParent = tagsContainer.querySelector('#selectAllTagsCheckbox')?.parentElement?.parentElement;
  if (selectAllCheckboxParent) {
    selectAllCheckboxParent.insertAdjacentHTML('afterend', tagItemsHtml);
  }
  
  // Re-attach tag event listeners
  attachTagEventListeners();
};

// Render UI
const renderSongs = () => {
  const filteredSongs = songs.filter(song => 
    song.category?.id === undefined || selectedCategoryIds.has(song.category.id)
  );
  
  document.querySelector<HTMLDivElement>('#songList')!.innerHTML = filteredSongs.length > 0
    ? filteredSongs.map(song => {
        // Build details array based on selected details
        const details: string[] = [];
        
        if (selectedDetails.has('author')) {
          details.push(`${song.author || 'Unknown'}`);
        }
        if (selectedDetails.has('copyright') && song.copyright) {
          details.push(`© ${song.copyright}`);
        }
        if (selectedDetails.has('ccli') && song.ccli) {
          details.push(`CCLI: ${song.ccli}`);
        }
        if (selectedDetails.has('category')) {
          details.push(`${song.category?.name || 'None'}`);
        }
        if (selectedDetails.has('tags') && song.tags && song.tags.length > 0) {
          const tagNames = song.tags.map((t: any) => t.name).join(', ');
          details.push(`${tagNames}`);
        }
        
        // Get arrangement details if available
        const arrangement = getDefaultArrangement(song);
        if (arrangement) {
          if (selectedDetails.has('source') && arrangement.source) {
            details.push(`${arrangement.source.name || arrangement.source}`);
          }
          if (selectedDetails.has('sourceReference') && arrangement.sourceReference) {
            details.push(`${arrangement.sourceReference}`);
          }
          if (selectedDetails.has('key') && arrangement.key) {
            details.push(`${arrangement.key}`);
          }
          if (selectedDetails.has('tempo') && arrangement.tempo) {
            details.push(`${arrangement.tempo} BPM`);
          }
          if (selectedDetails.has('duration') && arrangement.duration) {
            const minutes = Math.floor(arrangement.duration / 60);
            const seconds = arrangement.duration % 60;
            details.push(`${minutes}:${seconds.toString().padStart(2, '0')}`);
          }
          if (selectedDetails.has('description') && arrangement.description) {
            details.push(`${arrangement.description}`);
          }
        }
        
        return `
          <li style="padding: 1rem; margin: 0.5rem 0; border: 1px solid #ccc; border-radius: 4px;">
            <strong style="font-size: 1.1rem;">${song.name || 'Untitled'}</strong><br>
            ${details.length > 0 
              ? `<small style="color: #666;">${details.join(' | ')}</small>` 
              : ''}
          </li>
        `;
      }).join('')
    : '<p style="color: #666;">No songs match the selected categories.</p>';
  
  document.getElementById('songCount')!.textContent = `${filteredSongs.length} song(s)`;
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <style>
    .main-grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 2rem;
      margin-top: 2rem;
    }
    
    .tag-item:hover, .detail-item:hover {
      background-color: #f0f0f0 !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .tag-item:active, .detail-item:active {
      cursor: grabbing !important;
    }
    
    .format-btn {
      width: 24px;
      height: 24px;
      border: 1px solid #999;
      border-radius: 3px;
      background: white;
      cursor: pointer;
      font-size: 11px;
      font-weight: bold;
      color: #666;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
    }
    
    .format-btn.active {
      background: #007bff;
      color: white;
      border-color: #007bff;
    }
    
    .font-size-select {
      width: 50px;
      height: 24px;
      border: 1px solid #999;
      border-radius: 3px;
      background: white;
      cursor: pointer;
      font-size: 11px;
      margin-left: 4px;
      padding: 0 4px;
    }
    
    /* Smartphone: Linke Spalte auf volle Breite über der Song-Liste */
    @media (max-width: 768px) {
      .main-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      
      .sidebar-box {
        margin-bottom: 1rem;
      }
    }
  </style>
  
  <div style="padding: 2rem; max-width: 1400px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif;">
    <h1>Song Export - Welcome ${user.firstName} ${user.lastName}</h1>
    
    <div class="main-grid">
      <!-- Left column: Categories & Details -->
      <div>
        <h2 style="margin-top: 0;">Filter by Category</h2>
        <div class="sidebar-box" style="border: 1px solid #ccc; border-radius: 4px; padding: 1rem; background: #f8f9fa; margin-bottom: 2rem;">
          ${categories.length > 0
            ? categories.map((cat: any) => `
              <div style="margin-bottom: 0.5rem;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                  <input type="checkbox" class="category-checkbox" data-category-id="${cat.id}" checked 
                         style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
                  <span style="font-size: 0.9rem;">${cat.name}</span>
                </label>
              </div>
              `).join('')
            : '<p style="color: #666;">No categories found</p>'
          }
        </div>
        
        <h2>PDF Columns (Drag to Reorder)</h2>
        <div class="sidebar-box" style="border: 1px solid #ccc; border-radius: 4px; padding: 1rem; background: #e7f3ff;">
          <div id="detailListContainer" style="display: flex; flex-direction: column; gap: 0.25rem;">
            ${availableDetails.map(detail => `
              <div class="detail-item" draggable="true" data-detail-id="${detail.id}" 
                   style="display: flex; align-items: center; padding: 0.5rem; background: ${detail.id === 'name' ? '#fff9e6' : 'white'}; border: 1px solid ${detail.id === 'name' ? '#ffa500' : '#ddd'}; border-radius: 4px; cursor: move; user-select: none;">
                <span style="margin-right: 0.5rem; color: #999; font-size: 1.2rem;">≡</span>
                <input type="checkbox" class="detail-checkbox" data-detail-id="${detail.id}" 
                       ${selectedDetails.has(detail.id) ? 'checked' : ''}
                       ${detail.id === 'name' ? 'disabled checked' : ''}
                       style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: ${detail.id === 'name' ? 'not-allowed' : 'pointer'};">
                <span style="font-size: 0.9rem; flex: 1; ${detail.id === 'name' ? 'font-weight: bold;' : ''}">${detail.label}</span>
                <select class="font-size-select" data-detail-id="${detail.id}" title="Font Size">
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10</option>
                  <option value="11" selected>11</option>
                  <option value="12">12</option>
                  <option value="13">13</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                </select>
                <button class="format-btn bold-btn" data-detail-id="${detail.id}" title="Bold">B</button>
                <button class="format-btn italic-btn" data-detail-id="${detail.id}" title="Italic" style="font-style: italic;">I</button>
              </div>
            `).join('')}
          </div>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.85rem; color: #666;">
            <em><strong>Name</strong> ist immer ausgewählt (Hauptspalte) • Max 3 weitere Details wählbar (4 Spalten total)<br>
            Drag-Drop: Position ändern • Dropdown: Schriftgröße • <strong>B</strong>/<strong>I</strong>: Formatierung<br>
            <strong>Hinweis:</strong> Arrangement-Details (Source, Song Number, Key, Tempo, Duration, Description) verwenden immer das als Standard markierte Arrangement</em>
          </div>
        </div>
      </div>
      
      <!-- Right column: Export Button, Tags, Songs -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <h2 style="margin: 0;">Songs (<span id="songCount">${songs.length}</span>)</h2>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button id="exportSettingsBtn" style="padding: 0.5rem 1rem; font-size: 0.9rem; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Export Settings">
              ⚙️ Export Settings
            </button>
            <button id="importSettingsBtn" style="padding: 0.5rem 1rem; font-size: 0.9rem; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Import Settings">
              📥 Import Settings
            </button>
            <input type="file" id="importSettingsFile" accept=".json" style="display: none;">
            <button id="exportBtn" style="padding: 0.75rem 1.5rem; font-size: 1rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
              📄 Export PDF
            </button>
          </div>
        </div>
        
        <div style="border: 1px solid #ccc; border-radius: 4px; padding: 1rem; background: #fff3cd; margin-bottom: 1.5rem;">
          <h3 id="tagSectionHeader" style="margin-top: 0; margin-bottom: 0.75rem; cursor: pointer; user-select: none; display: flex; justify-content: space-between; align-items: center;">
            <span>Export Structure (Tags)</span>
            <span id="tagToggleIcon" style="font-size: 1.2rem;">▶</span>
          </h3>
          <div id="tagList" style="display: none;">
            <div style="display: flex; align-items: center; padding: 0.5rem; margin-bottom: 0.75rem; background: #ffe69c; border-radius: 4px;">
              <input type="checkbox" id="allSongsCheckbox" checked 
                     style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
              <span style="font-weight: bold; flex: 1;">Alle Lieder (Complete List)</span>
              <label style="display: flex; align-items: center; margin-left: 1rem; cursor: pointer;" title="Alphabetische Gruppierung">
                <span style="font-size: 0.85rem; margin-right: 0.25rem;">ABC</span>
                <input type="checkbox" class="alpha-group-checkbox" data-context="allSongs" 
                       style="width: 16px; height: 16px; cursor: pointer;">
              </label>
            </div>
            <label style="display: flex; align-items: center; padding: 0.5rem; margin-bottom: 0.75rem; background: #e0f0ff; border-radius: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="selectAllTagsCheckbox" checked 
                     style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
              <span style="font-weight: bold;">Alle Tags auswählen</span>
            </label>
            <div id="tagListContainer" style="display: flex; flex-direction: column; gap: 0.25rem;">
              ${tags.length > 0 
                ? tags.map(tag => `
                    <div class="tag-item" draggable="true" data-tag-id="${tag.id}" 
                         style="display: flex; align-items: center; padding: 0.5rem; background: white; border: 1px solid #ddd; border-radius: 4px; cursor: move; user-select: none;">
                      <span style="margin-right: 0.5rem; color: #999; font-size: 1.2rem;">≡</span>
                      <input type="checkbox" class="tag-checkbox" data-tag-id="${tag.id}" checked 
                             style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
                      <span style="font-size: 0.9rem; flex: 1;">${tag.name}</span>
                      <label style="display: flex; align-items: center; margin-left: 0.5rem; cursor: pointer;" title="Alphabetische Gruppierung">
                        <span style="font-size: 0.8rem; margin-right: 0.25rem;">ABC</span>
                        <input type="checkbox" class="alpha-group-checkbox" data-context="tag_${tag.id}" 
                               style="width: 14px; height: 14px; cursor: pointer;">
                      </label>
                    </div>
                  `).join('')
                : '<p style="color: #666;">No tags found</p>'
              }
            </div>
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #ddd; font-size: 0.85rem; color: #666;">
              <em>Drag tags to reorder • <strong>ABC</strong> checkbox: alphabetische Gruppierung mit Leerzeilen</em>
            </div>
            
            <h4 style="margin-top: 1.5rem; margin-bottom: 0.75rem;">Section Headers (PDF)</h4>
            <div style="border: 1px solid #ccc; border-radius: 4px; padding: 1rem; background: #fff3e0; margin-bottom: 0.5rem;">
              <label style="display: block; margin-bottom: 0.75rem;">
                <span style="display: block; margin-bottom: 0.25rem; font-weight: bold;">Ausrichtung:</span>
                <select id="headerAlignment" style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">
                  <option value="left">Links</option>
                  <option value="center">Zentriert</option>
                </select>
              </label>
              
              <label style="display: block; margin-bottom: 0.75rem;">
                <span style="display: block; margin-bottom: 0.25rem; font-weight: bold;">Schriftgröße:</span>
                <input type="number" id="headerFontSize" value="16" min="10" max="30" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
              </label>
              
              <label style="display: flex; align-items: center; padding: 0.5rem; cursor: pointer; user-select: none;">
                <input type="checkbox" id="headerBold" checked 
                       style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
                <span>Fett</span>
              </label>
              
              <label style="display: flex; align-items: center; padding: 0.5rem; cursor: pointer; user-select: none;">
                <input type="checkbox" id="headerItalic" 
                       style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
                <span>Kursiv</span>
              </label>
              
              <label style="display: flex; align-items: center; padding: 0.5rem; cursor: pointer; user-select: none;">
                <input type="checkbox" id="headerUnderline" 
                       style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
                <span>Unterstrichen</span>
              </label>
              
              <label style="display: flex; align-items: center; padding: 0.5rem; cursor: pointer; user-select: none;">
                <input type="checkbox" id="headerInBox" 
                       style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
                <span>Im Kasten</span>
              </label>
              
              <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.85rem; color: #666;">
                <em>Formatting for tag section headers in PDF</em>
              </div>
            </div>
          </div>
        </div>
        
        <ul id="songList" style="list-style: none; padding: 0;">
          <!-- Will be filled by renderSongs() -->
        </ul>
      </div>
    </div>
  </div>
`;

// Initial render
renderSongs();

// Toggle tags section
document.getElementById('tagSectionHeader')!.addEventListener('click', () => {
  const tagList = document.getElementById('tagList')!;
  const icon = document.getElementById('tagToggleIcon')!;
  
  if (tagList.style.display === 'none') {
    tagList.style.display = 'block';
    icon.textContent = '▼';
  } else {
    tagList.style.display = 'none';
    icon.textContent = '▶';
  }
});

// Category checkbox change event
document.querySelectorAll('.category-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const categoryId = parseInt(target.dataset.categoryId || '0');
    
    if (target.checked) {
      selectedCategoryIds.add(categoryId);
    } else {
      selectedCategoryIds.delete(categoryId);
    }
    
    renderSongs();
  });
});

// "All Songs" checkbox change event
document.getElementById('allSongsCheckbox')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  includeAllSongsList = target.checked;
  console.log('Include all songs list:', includeAllSongsList);
});

// Export Settings Button
document.getElementById('exportSettingsBtn')!.addEventListener('click', () => {
  const settings = buildSettings({
    selectedCategoryIds,
    selectedTagIds,
    orderedTags,
    selectedDetails,
    orderedDetails,
    detailFormatting,
    alphabeticalGroupingPerContext,
    includeAllSongsList,
    headerStyleOptions
  });
  
  // Create JSON file and download
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `song-export-settings_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('Settings exported:', settings);
});

// Import Settings Button
document.getElementById('importSettingsBtn')!.addEventListener('click', () => {
  document.getElementById('importSettingsFile')!.click();
});

// Import Settings File Handler
document.getElementById('importSettingsFile')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const settingsText = event.target?.result as string;
      console.log('Raw settings file:', settingsText);
      
      const settings = JSON.parse(settingsText);
      console.log('Parsed settings:', settings);
      
      // Validate settings format
      if (!settings || typeof settings !== 'object') {
        throw new Error('Invalid settings format: not an object');
      }
      
      const settingsState = {
        selectedCategoryIds,
        selectedTagIds,
        orderedTags,
        selectedDetails,
        orderedDetails,
        detailFormatting,
        alphabeticalGroupingPerContext,
        includeAllSongsList,
        headerStyleOptions,
        availableDetails,
        tags
      };

      applySettings(settings, settingsState);
      includeAllSongsList = settingsState.includeAllSongsList;

      document.querySelectorAll('.category-checkbox').forEach(cb => {
        const checkbox = cb as HTMLInputElement;
        const catId = parseInt(checkbox.dataset.categoryId || '0');
        checkbox.checked = selectedCategoryIds.has(catId);
      });

      const allSongsCheckbox = document.getElementById('allSongsCheckbox') as HTMLInputElement;
      if (allSongsCheckbox) {
        allSongsCheckbox.checked = includeAllSongsList;
      }

      const alignmentSelect = document.getElementById('headerAlignment') as HTMLSelectElement;
      const fontSizeInput = document.getElementById('headerFontSize') as HTMLInputElement;
      const fontSizeValue = document.getElementById('headerFontSizeValue') as HTMLSpanElement;
      const boldInput = document.getElementById('headerBold') as HTMLInputElement;
      const italicInput = document.getElementById('headerItalic') as HTMLInputElement;
      const underlineInput = document.getElementById('headerUnderline') as HTMLInputElement;
      const inBoxInput = document.getElementById('headerInBox') as HTMLInputElement;

      if (alignmentSelect) alignmentSelect.value = headerStyleOptions.alignment;
      if (fontSizeInput) fontSizeInput.value = headerStyleOptions.fontSize.toString();
      if (fontSizeValue) fontSizeValue.textContent = headerStyleOptions.fontSize.toString();
      if (boldInput) boldInput.checked = headerStyleOptions.bold;
      if (italicInput) italicInput.checked = headerStyleOptions.italic;
      if (underlineInput) underlineInput.checked = headerStyleOptions.underline;
      if (inBoxInput) inBoxInput.checked = headerStyleOptions.inBox;
      
      // Re-render song list AND update Tags/Details UI with new order
      updateTagsList();
      updateDetailsList();

      const selectAllCheckbox = document.getElementById('selectAllTagsCheckbox') as HTMLInputElement;
      if (selectAllCheckbox) {
        const allChecked = orderedTags.every(tag => selectedTagIds.has(tag.id));
        selectAllCheckbox.checked = allChecked;
      }

      document.querySelectorAll('.alpha-group-checkbox').forEach(cb => {
        const checkbox = cb as HTMLInputElement;
        const context = checkbox.dataset.context || '';
        checkbox.checked = alphabeticalGroupingPerContext.get(context) || false;
      });

      renderSongs();
      
      alert('Settings imported successfully!');
      console.log('Import completed successfully');
      
    } catch (error) {
      console.error('Error importing settings:', error);
      alert(`Error importing settings: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`);
    }
  };
  
  reader.onerror = () => {
    console.error('FileReader error');
    alert('Error reading file. Please try again.');
  };
  
  reader.readAsText(file);
  
  // Reset file input
  target.value = '';
});

// Attach Detail Event Listeners (called after rendering detail list)
const attachDetailEventListeners = () => {
  // Detail checkbox change event
  document.querySelectorAll('.detail-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const detailId = target.dataset.detailId || '';
      
      if (target.checked) {
        // Check if already at max (4 total: Name + 3 others)
        if (selectedDetails.size >= 4) {
          target.checked = false;
          alert('Max 3 Liedinfos zusätzlich zu Name');
          return;
        }
        selectedDetails.add(detailId);
      } else {
        selectedDetails.delete(detailId);
      }
      
      console.log('Selected details:', Array.from(selectedDetails));
      renderSongs();
    });
  });
  
  // Bold button click events
  document.querySelectorAll('.bold-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLButtonElement;
      const detailId = target.dataset.detailId || '';
      const formatting = detailFormatting.get(detailId);
      
      if (formatting) {
        formatting.bold = !formatting.bold;
        target.classList.toggle('active', formatting.bold);
        console.log(`Detail ${detailId} bold:`, formatting.bold);
      }
    });
  });
  
  // Italic button click events
  document.querySelectorAll('.italic-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLButtonElement;
      const detailId = target.dataset.detailId || '';
      const formatting = detailFormatting.get(detailId);
      
      if (formatting) {
        formatting.italic = !formatting.italic;
        target.classList.toggle('active', formatting.italic);
        console.log(`Detail ${detailId} italic:`, formatting.italic);
      }
    });
  });
  
  // Font size dropdown change events
  document.querySelectorAll('.font-size-select').forEach(select => {
    select.addEventListener('change', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLSelectElement;
      const detailId = target.dataset.detailId || '';
      const formatting = detailFormatting.get(detailId);
      
      if (formatting) {
        formatting.fontSize = parseInt(target.value) || 11;
        console.log(`Detail ${detailId} fontSize:`, formatting.fontSize);
      }
    });
  });
  
  // Drag-and-Drop for detail reordering
  let draggedDetailElement: HTMLElement | null = null;
  
  document.querySelectorAll('.detail-item').forEach(item => {
    const element = item as HTMLElement;
    
    element.addEventListener('dragstart', () => {
      draggedDetailElement = element;
      element.style.opacity = '0.4';
    });
    
    element.addEventListener('dragend', () => {
      element.style.opacity = '1';
      draggedDetailElement = null;
    });
    
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedDetailElement && draggedDetailElement !== element) {
        const container = document.getElementById('detailListContainer')!;
        const allItems = Array.from(container.querySelectorAll('.detail-item'));
        const draggedIndex = allItems.indexOf(draggedDetailElement);
        const targetIndex = allItems.indexOf(element);
        
        if (draggedIndex < targetIndex) {
          element.parentNode?.insertBefore(draggedDetailElement, element.nextSibling);
        } else {
          element.parentNode?.insertBefore(draggedDetailElement, element);
        }
      }
    });
    
    element.addEventListener('drop', () => {
      if (draggedDetailElement) {
        const container = document.getElementById('detailListContainer')!;
        const allItems = Array.from(container.querySelectorAll('.detail-item'));
        
        orderedDetails.length = 0;
        allItems.forEach(item => {
          const detailId = (item as HTMLElement).dataset.detailId || '';
          const detail = availableDetails.find(d => d.id === detailId);
          if (detail) {
            orderedDetails.push(detail);
          }
        });
        
        console.log('New detail order:', orderedDetails.map(d => d.label));
      }
    });
  });
};

// Attach Tag Event Listeners (called after rendering tag list)
const attachTagEventListeners = () => {
  // Alphabetical grouping checkbox change events
  document.querySelectorAll('.alpha-group-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLInputElement;
      const context = target.dataset.context || '';
      
      alphabeticalGroupingPerContext.set(context, target.checked);
      console.log(`Alphabetical grouping for ${context}:`, target.checked);
    });
  });
  
  // "Select All Tags" checkbox
  const selectAllCheckbox = document.getElementById('selectAllTagsCheckbox')!;
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const isChecked = target.checked;
      
      document.querySelectorAll('.tag-checkbox').forEach(checkbox => {
        (checkbox as HTMLInputElement).checked = isChecked;
        const tagId = parseInt((checkbox as HTMLElement).dataset.tagId || '0');
        
        if (isChecked) {
          selectedTagIds.add(tagId);
        } else {
          selectedTagIds.delete(tagId);
        }
      });
      
      console.log('Selected tags for export:', Array.from(selectedTagIds));
    });
  }
  
  // Tag checkbox change event
  document.querySelectorAll('.tag-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const tagId = parseInt(target.dataset.tagId || '0');
      
      if (target.checked) {
        selectedTagIds.add(tagId);
      } else {
        selectedTagIds.delete(tagId);
      }
      
      // Update "Select All" checkbox status
      const selectAllCheckbox = document.getElementById('selectAllTagsCheckbox') as HTMLInputElement;
      if (selectAllCheckbox) {
        const allChecked = Array.from(document.querySelectorAll('.tag-checkbox')).every(
          cb => (cb as HTMLInputElement).checked
        );
        selectAllCheckbox.checked = allChecked;
      }
      
      console.log('Selected tags for export:', Array.from(selectedTagIds));
    });
  });
  
  // Drag-and-Drop for tag reordering
  let draggedTagElement: HTMLElement | null = null;
  
  document.querySelectorAll('.tag-item').forEach(item => {
    const element = item as HTMLElement;
    
    element.addEventListener('dragstart', () => {
      draggedTagElement = element;
      element.style.opacity = '0.4';
    });
    
    element.addEventListener('dragend', () => {
      element.style.opacity = '1';
      draggedTagElement = null;
    });
    
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedTagElement && draggedTagElement !== element) {
        const container = document.getElementById('tagListContainer')!;
        const allItems = Array.from(container.querySelectorAll('.tag-item'));
        const draggedIndex = allItems.indexOf(draggedTagElement);
        const targetIndex = allItems.indexOf(element);
        
        if (draggedIndex < targetIndex) {
          element.parentNode?.insertBefore(draggedTagElement, element.nextSibling);
        } else {
          element.parentNode?.insertBefore(draggedTagElement, element);
        }
      }
    });
    
    element.addEventListener('drop', () => {
      if (draggedTagElement) {
        const container = document.getElementById('tagListContainer')!;
        const allItems = Array.from(container.querySelectorAll('.tag-item'));
        
        orderedTags.length = 0;
        
        allItems.forEach(item => {
          const tagId = parseInt((item as HTMLElement).dataset.tagId || '0');
          const tag = tags.find(t => t.id === tagId);
          if (tag) {
            orderedTags.push(tag);
          }
        });
        
        console.log('New tag order:', orderedTags.map(t => t.name));
      }
    });
  });
};

// Call attachment functions on initial page load
attachTagEventListeners();
attachDetailEventListeners();

// Header style option change events
document.getElementById('headerAlignment')!.addEventListener('change', (e) => {
  const target = e.target as HTMLSelectElement;
  headerStyleOptions.alignment = target.value as 'left' | 'center';
  console.log('Header alignment:', headerStyleOptions.alignment);
});

document.getElementById('headerFontSize')!.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement;
  headerStyleOptions.fontSize = parseInt(target.value) || 16;
  console.log('Header font size:', headerStyleOptions.fontSize);
});

document.getElementById('headerBold')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  headerStyleOptions.bold = target.checked;
  console.log('Header bold:', headerStyleOptions.bold);
});

document.getElementById('headerItalic')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  headerStyleOptions.italic = target.checked;
  console.log('Header italic:', headerStyleOptions.italic);
});

document.getElementById('headerUnderline')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  headerStyleOptions.underline = target.checked;
  console.log('Header underline:', headerStyleOptions.underline);
});

document.getElementById('headerInBox')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  headerStyleOptions.inBox = target.checked;
  console.log('Header in box:', headerStyleOptions.inBox);
});

// Export button
document.getElementById('exportBtn')!.addEventListener('click', () => {
  const filteredSongs = songs.filter(song => 
    song.category?.id === undefined || selectedCategoryIds.has(song.category.id)
  );
  
  if (filteredSongs.length === 0) {
    alert('No songs to export. Please select at least one category.');
    return;
  }
  
  // Use orderedTags array (maintains drag-drop order) filtered by selected tags
  const selectedTagsList = orderedTags.filter(tag => selectedTagIds.has(tag.id));
  
  // Get selected details in order (max 4) with formatting
  // Name is always included (can't be unchecked), but position is via drag-drop
  const selectedDetailsInOrder = orderedDetails
    .filter(detail => selectedDetails.has(detail.id))
    .slice(0, 4)
    .map(d => ({
      id: d.id,
      bold: detailFormatting.get(d.id)?.bold || false,
      italic: detailFormatting.get(d.id)?.italic || false,
      fontSize: detailFormatting.get(d.id)?.fontSize || 11
    }));
  
  console.log('Exporting songs:', filteredSongs);
  console.log('Using tags for structure (in order):', selectedTagsList);
  console.log('Selected details in order:', selectedDetailsInOrder);
  console.log('Header style:', headerStyleOptions);
  
  // Generate PDF
  try {
    generatePDF({
      songs: filteredSongs,
      selectedTags: selectedTagsList,
      selectedDetails: selectedDetailsInOrder,
      includeAllSongsList: includeAllSongsList,
      alphabeticalGroupingPerContext: alphabeticalGroupingPerContext,
      headerStyle: headerStyleOptions
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    alert('Error generating PDF. Check console for details.');
  }
});
