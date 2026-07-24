(function () {
  'use strict';

  const seedPlants = Array.isArray(window.GREENSCAPE_PLANT_DATA) ? window.GREENSCAPE_PLANT_DATA : [];
  const seedImageById = new Map(seedPlants.map(plant => [plant.id, plant.image || '']));
  const sourceMeta = window.GREENSCAPE_PLANT_META || {};
  const STORAGE = {
    plants: 'greenscape-plant-library-plants-v1',
    projects: 'greenscape-plant-library-projects-v1',
    categories: 'greenscape-plant-library-categories-v1',
    moodboard: 'greenscape-plant-library-moodboard-v1'
  };
  const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_EXCEL_FILE_BYTES = 10 * 1024 * 1024;
  const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const titleByView = {
    dashboard: 'Dashboard',
    library: 'Plant Library',
    sheet: 'Plant List Editor',
    moodboard: 'Mood Board Creator',
    projects: 'Project Lists',
    schedule: 'Plant Schedule'
  };

  const categoryPrefixes = {
    'Palms': 'PAL',
    'Trees': 'TRE',
    'Bamboo': 'BAM',
    'Shrubs': 'SHR',
    'Climbers & Ferns': 'CLF',
    'Cycads, Agaves & Yuccas': 'CAY',
    'Indoor Plants': 'IND',
    'Heliconias & Aquatics': 'HEA',
    'Grasses & Groundcovers': 'GGC',
    'Landscape Materials': 'MAT'
  };

  let storageAvailable = true;
  let plants = sanitizePlants(hydratePlantImages(loadJSON(STORAGE.plants, null) || clone(seedPlants)));
  let projects = sanitizeProjects(loadJSON(STORAGE.projects, []));
  let customCategories = sanitizeCategories(loadJSON(STORAGE.categories, []));
  let moodboard = sanitizeMoodboard(loadJSON(STORAGE.moodboard, null));
  let state = {
    view: ['dashboard', 'library', 'sheet', 'moodboard', 'projects', 'schedule'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard',
    librarySearch: '',
    libraryCategory: 'All',
    libraryLimit: 48,
    sheetSearch: '',
    sheetCategory: 'All',
    moodboardSearch: '',
    moodboardCategory: 'All',
    selectedProjectId: null,
    scheduleProjectId: projects[0] ? projects[0].id : null
  };

  const content = document.getElementById('pageContent');
  const modalRoot = document.getElementById('modalRoot');
  const pageTitle = document.getElementById('pageTitle');
  const toastRoot = document.getElementById('toastRoot');
  let modalReturnFocus = null;

  // Save the cleaned records once so older local data no longer keeps removed fields.
  syncProjectPlantCodes();
  saveAll();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hydratePlantImages(records) {
    return (Array.isArray(records) ? records : []).map(plant => ({
      ...plant,
      image: plant.image || seedImageById.get(plant.id) || ''
    }));
  }

  function compactPlantsForStorage() {
    return plants.map(plant => ({
      ...plant,
      image: plant.image === (seedImageById.get(plant.id) || '') ? '' : plant.image
    }));
  }

  function sanitizePlants(records) {
    return (Array.isArray(records) ? records : []).map(plant => {
      const scientificName = String(plant.scientificName || plant.material || '').trim();
      const generatedCode = generatePlantCode(plant.commonName, scientificName, plant.code);
      return {
        ...plant,
        code: plant.codeManual ? normalizePlantCode(plant.code) || generatedCode : generatedCode,
        sizes: (Array.isArray(plant.sizes) ? plant.sizes : []).map(({ price, stock, ...size }) => ({ ...size }))
      };
    });
  }

  function sanitizeProjects(records) {
    return (Array.isArray(records) ? records : []).map(project => ({
      ...project,
      areaSize: String(project.areaSize || ''),
      projectType: String(project.projectType || ''),
      designCost: String(project.designCost || ''),
      landscapingCost: String(project.landscapingCost || ''),
      startDate: String(project.startDate || ''),
      deadline: String(project.deadline || ''),
      items: (Array.isArray(project.items) ? project.items : []).map(item => ({ ...item }))
    }));
  }

  function sanitizeCategories(records) {
    const seen = new Set();
    return (Array.isArray(records) ? records : [])
      .map(value => String(value || '').trim())
      .filter(value => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }

  function loadJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      storageAvailable = false;
      return fallback;
    }
  }

  function saveAll() {
    try {
      localStorage.setItem(STORAGE.plants, JSON.stringify(compactPlantsForStorage()));
      localStorage.setItem(STORAGE.projects, JSON.stringify(projects));
      localStorage.setItem(STORAGE.categories, JSON.stringify(customCategories));
      localStorage.setItem(STORAGE.moodboard, JSON.stringify(moodboard));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
      toast('Browser storage is full or unavailable. Export a backup.', true);
    }
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeImage(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(assets\/|https?:\/\/)/i.test(url) || /^data:image\/(?:gif|jpe?g|png|webp);base64,/i.test(url)) return escapeHTML(url);
    return '';
  }

  function imageFileError(file) {
    if (!file || !file.size) return 'Choose an image file.';
    const mimeType = String(file.type || '').toLowerCase();
    const filename = String(file.name || '').toLowerCase();
    const supportedMimeTypes = ['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!supportedMimeTypes.includes(mimeType) && !/\.(?:gif|heic|heif|jpe?g|png|webp)$/.test(filename)) {
      return 'Choose a JPG, PNG, WebP, GIF, HEIC, or HEIF image.';
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) return 'Choose an image that is 20 MB or smaller.';
    return '';
  }

  function excelFileError(file) {
    if (!file || !file.size) return 'Choose an Excel workbook.';
    const filename = String(file.name || '').toLowerCase();
    if (!filename.endsWith('.xlsx') && file.type !== EXCEL_MIME_TYPE) return 'Choose an .xlsx Excel workbook.';
    if (file.size > MAX_EXCEL_FILE_BYTES) return 'Choose an Excel workbook that is 10 MB or smaller.';
    return '';
  }

  function safeLink(value) {
    const url = String(value || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return '';
    return escapeHTML(url);
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function number(value) {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  function projectCost(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Not set';
    const amount = Number(raw);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(amount)
      : raw;
  }

  function projectDeadlineInfo(value) {
    const raw = String(value || '').trim();
    if (!raw) return { tone: 'neutral', display: 'Not set', status: 'Deadline not set', days: null };
    const deadline = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(deadline.getTime())) return { tone: 'neutral', display: raw, status: 'Deadline', days: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
    const tone = days <= 2 ? 'urgent' : days <= 7 ? 'warning' : 'safe';
    const status = days < 0
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
      : days === 0
        ? 'Due today'
        : `${days} day${days === 1 ? '' : 's'} left`;
    return { tone, display: formatDate(raw), status, days };
  }

  function slug(value) {
    return String(value || 'plant-schedule')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'plant-schedule';
  }

  function initials(name) {
    return String(name || 'PL').split(/\s+/).slice(0, 2).map(v => v[0] || '').join('').toUpperCase();
  }

  function getPlant(id) {
    return plants.find(p => p.id === id);
  }

  function getProject(id) {
    return projects.find(p => p.id === id);
  }

  function projectTotals(project) {
    const items = Array.isArray(project?.items) ? project.items : [];
    const categoryNames = items.map(item => getPlant(item.plantId)?.category || item.category || '').filter(Boolean);
    return {
      species: new Set(items.map(i => i.plantId)).size,
      categories: new Set(categoryNames).size,
      quantity: items.reduce((sum, i) => sum + Number(i.quantity || 0), 0),
      lines: items.length
    };
  }

  function formatDate(value) {
    if (!value) return 'Not set';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Not set';
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function toast(message, isError) {
    const node = document.createElement('div');
    node.className = `toast${isError ? ' error' : ''}`;
    node.setAttribute('role', isError ? 'alert' : 'status');
    node.setAttribute('aria-atomic', 'true');
    node.textContent = message;
    toastRoot.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function setView(view) {
    if (!titleByView[view]) return;
    state.view = view;
    location.hash = view;
    render(true);
  }

  function render(focusHeading = false) {
    const currentTitle = titleByView[state.view] || 'Greenscape Plant Library';
    pageTitle.textContent = currentTitle;
    document.title = `${currentTitle} | Greenscape Plant Library`;
    document.querySelectorAll('.nav-item').forEach(button => {
      const isCurrent = button.dataset.view === state.view;
      button.classList.toggle('active', isCurrent);
      if (isCurrent) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (state.view === 'dashboard') renderDashboard();
    if (state.view === 'library') renderLibrary();
    if (state.view === 'sheet') renderPlantSheet();
    if (state.view === 'moodboard') renderMoodboard();
    if (state.view === 'projects') renderProjects();
    if (state.view === 'schedule') renderSchedule();
    if (focusHeading) requestAnimationFrame(() => pageTitle.focus({ preventScroll: true }));
  }

  function categoryColor(category) {
    const palette = {
      'Shrubs': '#7ea742',
      'Indoor Plants': '#2c8b75',
      'Palms': '#16704f',
      'Trees': '#386f42',
      'Climbers & Ferns': '#62a37f',
      'Bamboo': '#b69a3c',
      'Cycads, Agaves & Yuccas': '#8a9a42',
      'Grasses & Groundcovers': '#9aba58',
      'Heliconias & Aquatics': '#4b91a7',
      'Landscape Materials': '#b86d52'
    };
    if (palette[category]) return palette[category];
    let hash = 0;
    for (let i = 0; i < String(category).length; i++) hash = String(category).charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360} 38% 46%)`;
  }

  function renderDashboard() {
    const categoryCounts = plants.reduce((acc, plant) => {
      acc[plant.category] = (acc[plant.category] || 0) + 1;
      return acc;
    }, {});
    const maxCategory = Math.max(1, ...Object.values(categoryCounts));
    const withPhotos = plants.filter(p => p.image).length;
    const totalProjectPlants = projects.reduce((sum, p) => sum + (p.items || []).length, 0);
    const recentProjects = [...projects].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0, 4);
    const heroImage = safeImage((plants.find(plant => plant.image) || {}).image);

    content.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <span class="overline">Green today, greener tomorrow</span>
          <h2>Plan greener spaces with one organized plant library.</h2>
          <p>Browse Greenscape plants and garden essentials, prepare project lists, and produce clear planting schedules from one workspace.</p>
          <div class="hero-actions">
            <button type="button" class="button terracotta" data-view="library">Browse plants</button>
            <button type="button" class="button secondary greenscape-identifier-hero-button" data-action="open-google-lens-identifier">
              <span class="identifier-button-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h3l1.3-2h7.4l1.3 2h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.8 3.8c-2.4.1-4.1 1.1-4.8 2.8 1.9.2 3.6-.5 4.8-2.8Z" fill="currentColor"/></svg></span>
              <span>Plant Identifier</span>
            </button>
          </div>
        </div>
        <div class="hero-art">
          ${heroImage ? `<img class="hero-photo" src="${heroImage}" alt="Greenscape plant collection" width="960" height="640" loading="eager" fetchpriority="high" decoding="async">` : '<div class="leaf-shape"></div>'}
          <div class="hero-image-shade"></div>
        </div>
      </section>

      <section class="stat-grid">
        ${statCard('Library entries', plants.length, `${plants.filter(p => p.isPlant).length} plants · ${plants.filter(p => !p.isPlant).length} materials`)}
        ${statCard('With photos', withPhotos, `${Math.round((withPhotos / Math.max(plants.length, 1)) * 100)}% of the library`)}
        ${statCard('Project lists', projects.length, `${totalProjectPlants} schedule lines saved`)}
        ${statCard('Categories', Object.keys(categoryCounts).length, 'Searchable plant groups')}
      </section>

      <section class="two-column">
        <div class="panel">
          <div class="panel-header"><h2>Plant categories</h2><button type="button" class="button ghost small" data-view="library">View all</button></div>
          <div class="panel-body category-bars">
            ${Object.entries(categoryCounts).sort((a,b) => b[1]-a[1]).map(([category, count]) => `
              <button type="button" class="category-row" data-action="filter-category" data-category="${escapeHTML(category)}" title="${escapeHTML(category)}: ${count} entries" style="border:0;background:transparent;width:100%;padding:0;text-align:left;color:inherit;">
                <span>${escapeHTML(category)}</span>
                <span class="bar-track"><span class="bar-fill" style="width:${Math.max(6, (count/maxCategory)*100)}%;background:${categoryColor(category)}"></span></span>
                <span class="category-count" style="color:${categoryColor(category)};font-weight:800;">${count}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><h2>Recent projects</h2><button type="button" class="button ghost small" data-view="projects">Open lists</button></div>
          <div class="panel-body">
            ${recentProjects.length ? recentProjects.map(project => {
              const totals = projectTotals(project);
              return `<button type="button" data-action="open-project" data-project-id="${escapeHTML(project.id)}" style="display:block;width:100%;padding:12px 0;border:0;border-bottom:1px solid #e8ebe6;background:transparent;text-align:left;color:inherit;">
                <strong style="display:block;font-size:13px;">${escapeHTML(project.name)}</strong>
                <span style="display:block;margin-top:3px;color:var(--muted);font-size:10px;">${totals.categories} categories · ${number(totals.quantity)} total quantity</span>
              </button>`;
            }).join('') : emptyMini('No project lists yet', 'Create a project and start adding plants.')}
          </div>
        </div>
      </section>
      ${!storageAvailable ? '<p class="inline-note" style="margin-top:18px;">Browser storage is unavailable. Changes may not remain after closing the page.</p>' : ''}
    `;
  }

  function statCard(label, value, foot) {
    return `<div class="stat-card"><span class="stat-label">${escapeHTML(label)}</span><strong class="stat-value">${escapeHTML(value)}</strong><span class="stat-foot">${escapeHTML(foot)}</span></div>`;
  }

  function emptyMini(title, copy) {
    return `<div style="padding:24px 5px;text-align:center;"><strong style="display:block;font-size:13px;">${escapeHTML(title)}</strong><span style="display:block;margin-top:4px;color:var(--muted);font-size:11px;">${escapeHTML(copy)}</span></div>`;
  }

  function categories() {
    return [...new Set([
      ...plants.map(p => p.category).filter(Boolean),
      ...customCategories,
      'Heliconias & Aquatics'
    ])].sort((a, b) => a.localeCompare(b));
  }

  function filteredPlants() {
    const q = state.librarySearch.trim().toLowerCase();
    return plants.filter(plant => {
      const matchesCategory = state.libraryCategory === 'All' || plant.category === state.libraryCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      const haystack = [plant.code, plant.commonName, plant.scientificName, plant.category, plant.material, ...(plant.tags || [])].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  function renderLibrary() {
    const duplicates = duplicateCodeGroups();
    content.innerHTML = `
      <div class="toolbar library-toolbar">
        <div class="toolbar-group" style="flex:1;">
          <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="librarySearch" class="search-input" type="search" aria-label="Search plants" placeholder="Search common name, scientific name, or code" value="${escapeHTML(state.librarySearch)}"></label>
          <select id="categoryFilter" class="select-input" aria-label="Filter plants by category" style="width:auto;min-width:210px;">
            <option value="All">All categories</option>
            ${categories().map(category => `<option value="${escapeHTML(category)}"${state.libraryCategory === category ? ' selected' : ''}>${escapeHTML(category)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-group">
          <span id="resultCount" class="result-count" role="status" aria-live="polite"></span>
          <button type="button" class="button primary" data-action="new-plant">Add plant</button>
        </div>
      </div>
      <div id="plantGrid"></div>
    `;
    updateLibraryResults();
  }

  function updateLibraryResults() {
    const grid = document.getElementById('plantGrid');
    const count = document.getElementById('resultCount');
    if (!grid || !count) return;
    const results = filteredPlants();
    const shown = results.slice(0, state.libraryLimit);
    count.textContent = `${results.length} ${results.length === 1 ? 'entry' : 'entries'}`;
    if (!results.length) {
      grid.innerHTML = emptyState('No matching plants', 'Try another plant name or category.', '<button type="button" class="button secondary" data-action="clear-filter">Clear filters</button>');
      return;
    }
    grid.innerHTML = `
      <div class="plant-grid">${shown.map((plant, index) => plantCard(plant, index)).join('')}</div>
      ${shown.length < results.length ? `<div style="display:flex;justify-content:center;margin-top:22px;"><button type="button" class="button secondary" data-action="load-more">Show more (${results.length - shown.length} remaining)</button></div>` : ''}
    `;
  }

  function plantCard(plant, index = 0) {
    const image = safeImage(plant.image);
    const badges = plantBadgeValues(plant);
    const sizeCount = (plant.sizes || []).length;
    return `
      <article class="plant-card">
        <button class="plant-image" type="button" aria-label="View details for ${escapeHTML(plant.commonName || 'unnamed plant')}" data-action="plant-detail" data-plant-id="${escapeHTML(plant.id)}" style="width:100%;padding:0;border:0;text-align:left;">
          ${image ? `<img src="${image}" alt="${escapeHTML(plant.commonName)}" width="480" height="407" loading="${index < 5 ? 'eager' : 'lazy'}"${index === 0 ? ' fetchpriority="high"' : ''} decoding="async">` : `<div class="image-fallback">${escapeHTML(plant.code || '—')}</div>`}
          <span class="category-pill">${escapeHTML(plant.category)}</span>
        </button>
        <div class="plant-card-body">
          <div class="plant-code-row" title="Plant code"><span class="plant-code">${escapeHTML(plant.code)}</span></div>
          <h2>${escapeHTML(plant.commonName)}</h2>
          <p class="scientific">${escapeHTML(plant.scientificName || plant.material || ' ')}</p>
          ${badges.length ? `<div class="plant-badges">${badges.map(value => `<span class="plant-badge">${escapeHTML(value)}</span>`).join('')}</div>` : ''}
          <div class="plant-meta"><span>${sizeCount} available size${sizeCount === 1 ? '' : 's'}</span></div>
          <div class="plant-card-actions">
            <button type="button" class="button secondary small" data-action="plant-detail" data-plant-id="${escapeHTML(plant.id)}">View details</button>
            <button type="button" class="button primary small" data-action="add-to-project" data-plant-id="${escapeHTML(plant.id)}">Add to list</button>
          </div>
        </div>
      </article>`;
  }



  function filteredSheetPlants() {
    const q = String(state.sheetSearch || '').trim().toLowerCase();
    return plants.filter(plant => {
      if (state.sheetCategory !== 'All' && plant.category !== state.sheetCategory) return false;
      if (!q) return true;
      return [plant.code, plant.commonName, plant.scientificName, plant.category, plant.material, plant.sun, plant.water, plant.spacing, plant.landscapeUse, plant.growingCondition, plant.plantingNotes, plant.link, ...(plant.tags || [])]
        .join(' ').toLowerCase().includes(q);
    });
  }

  function sizesToSheetText(sizes) {
    return (Array.isArray(sizes) ? sizes : []).map(size => {
      const label = String(size.label || size.size || '').trim();
      const unit = String(size.unit || '').trim();
      return unit ? `${label} | ${unit}` : label;
    }).filter(Boolean).join('; ');
  }

  function parseSheetSizes(value) {
    return String(value || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const pieces = part.split('|');
      const label = String(pieces.shift() || '').trim();
      const unit = pieces.join('|').trim();
      return { label, size: label, variant: '', unit };
    }).filter(size => size.label || size.unit);
  }


  const EXCEL_HEADERS = [
    'Record ID', 'Code', 'Common Name', 'Scientific Name', 'Category',
    'Available Sizes', 'Sun', 'Water', 'Spacing', 'Mature Height',
    'Mature Spread', 'Landscape Use', 'Growing Condition', 'Planting Notes',
    'Tags', 'Photo', 'Link'
  ];

  function xmlEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function excelColumnName(index) {
    let value = Number(index) + 1;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function excelRows() {
    return [...plants]
      .sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.commonName || '').localeCompare(String(b.commonName || '')))
      .map(plant => [
        plant.id || '',
        plant.code || '',
        plant.commonName || '',
        plant.scientificName || plant.material || '',
        plant.category || 'Uncategorized',
        sizesToSheetText(plant.sizes),
        plant.sun || '',
        plant.water || '',
        plant.spacing || '',
        plant.matureHeight || '',
        plant.matureSpread || '',
        plant.landscapeUse || '',
        plant.growingCondition || '',
        plant.plantingNotes || '',
        (plant.tags || []).join(', '),
        plant.image ? 'Yes' : 'No',
        plant.link || (/^https?:\/\//i.test(String(plant.image || '')) ? plant.image : '')
      ]);
  }

  function makeExcelSheetXML(rows) {
    const allRows = [EXCEL_HEADERS, ...rows];
    const rowXML = allRows.map((row, rowIndex) => {
      const style = rowIndex === 0 ? ' s="1"' : '';
      const cells = EXCEL_HEADERS.map((_, colIndex) => {
        const reference = `${excelColumnName(colIndex)}${rowIndex + 1}`;
        const value = String(row[colIndex] ?? '');
        const preserve = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : '';
        return `<c r="${reference}" t="inlineStr"${style}><is><t${preserve}>${xmlEscape(value)}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="28" customHeight="1"' : ''}>${cells}</row>`;
    }).join('');
    const lastCell = `${excelColumnName(EXCEL_HEADERS.length - 1)}${Math.max(1, allRows.length)}`;
    const widths = [18, 10, 27, 28, 25, 30, 16, 16, 16, 18, 18, 28, 34, 38, 24, 10, 28];
    const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${columns}</cols>
  <sheetData>${rowXML}</sheetData>
  <autoFilter ref="A1:${lastCell}"/>
</worksheet>`;
  }

  function crc32(bytes) {
    if (!crc32.table) {
      crc32.table = Array.from({ length: 256 }, (_, value) => {
        let crc = value;
        for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
        return crc >>> 0;
      });
    }
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = crc32.table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31),
      date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
    };
  }

  function makeZipBlob(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const stamp = dosDateTime();
    const push = bytes => { chunks.push(bytes); offset += bytes.length; };
    const u16 = value => { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; };
    const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value >>> 0, true); return bytes; };

    Object.entries(files).forEach(([filename, content]) => {
      const name = encoder.encode(filename);
      const data = content instanceof Uint8Array ? content : encoder.encode(content);
      const checksum = crc32(data);
      const localOffset = offset;
      push(u32(0x04034b50));
      push(u16(20)); push(u16(0x0800)); push(u16(0));
      push(u16(stamp.time)); push(u16(stamp.date));
      push(u32(checksum)); push(u32(data.length)); push(u32(data.length));
      push(u16(name.length)); push(u16(0)); push(name); push(data);

      const record = [];
      const add = bytes => record.push(bytes);
      add(u32(0x02014b50)); add(u16(20)); add(u16(20)); add(u16(0x0800)); add(u16(0));
      add(u16(stamp.time)); add(u16(stamp.date)); add(u32(checksum)); add(u32(data.length)); add(u32(data.length));
      add(u16(name.length)); add(u16(0)); add(u16(0)); add(u16(0)); add(u16(0)); add(u32(0)); add(u32(localOffset)); add(name);
      central.push(...record);
    });

    const centralOffset = offset;
    central.forEach(push);
    const centralSize = offset - centralOffset;
    push(u32(0x06054b50)); push(u16(0)); push(u16(0));
    push(u16(Object.keys(files).length)); push(u16(Object.keys(files).length));
    push(u32(centralSize)); push(u32(centralOffset)); push(u16(0));
    return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function buildPlantWorkbook() {
    const now = new Date().toISOString();
    const files = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
      'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Greenscape Plant Library</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Plant List</vt:lpstr></vt:vector></TitlesOfParts></Properties>`,
      'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Greenscape Plant Library</dc:title><dc:creator>Greenscape Landscaping Services</dc:creator><cp:lastModifiedBy>Greenscape Plant Library</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="22000" windowHeight="12000"/></bookViews><sheets><sheet name="Plant List" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos Display"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176342"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E3DC"/></left><right style="thin"><color rgb="FFD9E3DC"/></right><top style="thin"><color rgb="FFD9E3DC"/></top><bottom style="thin"><color rgb="FFD9E3DC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      'xl/worksheets/sheet1.xml': makeExcelSheetXML(excelRows())
    };
    return makeZipBlob(files);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportPlantExcel() {
    try {
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(buildPlantWorkbook(), `Greenscape-Plant-List-${date}.xlsx`);
      toast(`Excel file exported with ${plants.length} entries.`);
    } catch (error) {
      console.error(error);
      toast('The Excel file could not be created.', true);
    }
  }

  function findZipEnd(view) {
    const minimum = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= minimum; offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    return -1;
  }

  async function unzipExcel(buffer) {
    const view = new DataView(buffer);
    const end = findZipEnd(view);
    if (end < 0) throw new Error('Not a valid XLSX file');
    const entries = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const decoder = new TextDecoder('utf-8');
    const files = new Map();

    for (let index = 0; index < entries; index++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid XLSX directory');
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Invalid XLSX entry');
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
      let data;
      if (method === 0) {
        data = new Uint8Array(compressed);
      } else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress Excel files');
        let stream;
        try { stream = new DecompressionStream('deflate-raw'); }
        catch (error) { stream = new DecompressionStream('deflate'); }
        data = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(stream)).arrayBuffer());
      } else {
        throw new Error(`Unsupported Excel compression method ${method}`);
      }
      files.set(name.replace(/^\//, ''), data);
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return files;
  }

  function xmlDocument(bytes) {
    const xml = new TextDecoder('utf-8').decode(bytes);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid Excel XML');
    return doc;
  }

  function normalizeZipPath(path) {
    const parts = [];
    String(path || '').split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop();
      else parts.push(part);
    });
    return parts.join('/');
  }

  function cellColumnIndex(reference) {
    const letters = String(reference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
    let index = 0;
    for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
    return index - 1;
  }

  async function readPlantWorkbook(file) {
    const files = await unzipExcel(await file.arrayBuffer());
    const workbookBytes = files.get('xl/workbook.xml');
    const relsBytes = files.get('xl/_rels/workbook.xml.rels');
    if (!workbookBytes || !relsBytes) throw new Error('Workbook data is missing');
    const workbook = xmlDocument(workbookBytes);
    const relationships = xmlDocument(relsBytes);
    const relationshipMap = new Map([...relationships.getElementsByTagName('Relationship')].map(rel => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
    const sheets = [...workbook.getElementsByTagName('sheet')];
    const chosen = sheets.find(sheet => String(sheet.getAttribute('name') || '').toLowerCase() === 'plant list') || sheets[0];
    if (!chosen) throw new Error('No worksheet found');
    const relationshipId = chosen.getAttribute('r:id') || chosen.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = relationshipMap.get(relationshipId);
    const sheetPath = normalizeZipPath(target?.startsWith('/') ? target.slice(1) : `xl/${target || 'worksheets/sheet1.xml'}`);
    const sheetBytes = files.get(sheetPath);
    if (!sheetBytes) throw new Error('Plant List worksheet is missing');

    let sharedStrings = [];
    const sharedBytes = files.get('xl/sharedStrings.xml');
    if (sharedBytes) {
      const sharedDoc = xmlDocument(sharedBytes);
      sharedStrings = [...sharedDoc.getElementsByTagName('si')].map(item => [...item.getElementsByTagName('t')].map(node => node.textContent || '').join(''));
    }

    const sheet = xmlDocument(sheetBytes);
    const rows = [...sheet.getElementsByTagName('row')].map(row => {
      const values = [];
      [...row.getElementsByTagName('c')].forEach(cell => {
        const index = cellColumnIndex(cell.getAttribute('r'));
        const type = cell.getAttribute('t');
        let value = '';
        if (type === 'inlineStr') value = [...cell.getElementsByTagName('t')].map(node => node.textContent || '').join('');
        else {
          const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
          value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : raw;
        }
        values[index] = value;
      });
      return values;
    });
    return rows.filter(row => row.some(value => String(value || '').trim()));
  }

  function normalizeExcelHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function excelValue(record, aliases) {
    for (const alias of aliases) {
      const key = normalizeExcelHeader(alias);
      if (key in record) return String(record[key] ?? '').trim();
    }
    return '';
  }

  function excelRowsToRecords(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(normalizeExcelHeader);
    return rows.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
      .filter(record => excelValue(record, ['Common Name', 'Scientific Name', 'Code']));
  }

  function findPlantForImport(data) {
    const importedId = excelValue(data, ['Record ID', 'ID']);
    if (importedId) {
      const byId = plants.find(plant => plant.id === importedId);
      if (byId) return byId;
    }
    const code = normalizePlantCode(excelValue(data, ['Code', 'Plant Code']));
    if (code) {
      const codeMatches = plants.filter(plant => String(plant.code || '').toLowerCase() === code.toLowerCase());
      if (codeMatches.length === 1) return codeMatches[0];
    }
    const common = excelValue(data, ['Common Name', 'Name']).toLowerCase();
    const scientific = excelValue(data, ['Scientific Name', 'Botanical Name', 'Material']).toLowerCase();
    return plants.find(plant => String(plant.commonName || '').trim().toLowerCase() === common && String(plant.scientificName || plant.material || '').trim().toLowerCase() === scientific) || null;
  }

  function applyExcelRecords(records) {
    let updated = 0;
    let added = 0;
    let skipped = 0;
    records.forEach(data => {
      const commonName = excelValue(data, ['Common Name', 'Name']);
      const scientificName = excelValue(data, ['Scientific Name', 'Botanical Name', 'Material']);
      if (!commonName && !scientificName) { skipped++; return; }
      const existing = findPlantForImport(data);
      const category = excelValue(data, ['Category', 'Plant Category']) || existing?.category || 'Uncategorized';
      const importedCode = normalizePlantCode(excelValue(data, ['Code', 'Plant Code']));
      const validCode = /^[A-Z][A-Z][a-z]$/.test(importedCode) ? importedCode : generatePlantCode(commonName, scientificName, existing?.code);
      const link = excelValue(data, ['Link', 'URL', 'Website', 'Image URL']);
      const record = {
        ...(existing || {}),
        id: existing?.id || excelValue(data, ['Record ID', 'ID']) || uid('plant'),
        code: validCode,
        codeManual: /^[A-Z][A-Z][a-z]$/.test(importedCode),
        commonName,
        scientificName,
        category,
        isPlant: category !== 'Landscape Materials',
        material: category === 'Landscape Materials' ? scientificName : '',
        sizes: parseSheetSizes(excelValue(data, ['Available Sizes', 'Sizes', 'Size'])),
        sun: excelValue(data, ['Sun', 'Sun Requirement']),
        water: excelValue(data, ['Water', 'Water Requirement']),
        spacing: excelValue(data, ['Spacing', 'Recommended Spacing']),
        matureHeight: excelValue(data, ['Mature Height', 'Height']),
        matureSpread: excelValue(data, ['Mature Spread', 'Spread']),
        landscapeUse: excelValue(data, ['Landscape Use', 'Use']),
        growingCondition: excelValue(data, ['Growing Condition', 'Growing Conditions']),
        plantingNotes: excelValue(data, ['Planting Notes', 'Notes']),
        tags: excelValue(data, ['Tags']).split(/[,;]/).map(value => value.trim()).filter(Boolean),
        image: existing?.image || '',
        link,
        custom: existing?.custom ?? true
      };
      if (existing) {
        Object.assign(existing, record);
        updated++;
      } else {
        plants.push(record);
        added++;
      }
      if (!categories().some(value => value.toLowerCase() === category.toLowerCase())) customCategories.push(category);
    });
    customCategories = sanitizeCategories(customCategories);
    plants = sanitizePlants(plants);
    syncProjectPlantCodes();
    saveAll();
    return { updated, added, skipped };
  }

  async function importPlantExcel(file) {
    const validationError = excelFileError(file);
    if (validationError) {
      setSheetSaveStatus('Excel import blocked', 'error');
      toast(validationError, true);
      return;
    }
    setSheetSaveStatus('Reading Excel file…', 'saving');
    try {
      const rows = await readPlantWorkbook(file);
      const records = excelRowsToRecords(rows);
      if (!records.length) throw new Error('No plant rows found');
      const proceed = confirm(`Import ${records.length} Excel row${records.length === 1 ? '' : 's'}? Matching plants will be updated and new rows will be added. Plants missing from the Excel file will not be deleted.`);
      if (!proceed) { setSheetSaveStatus('All changes saved'); return; }
      const result = applyExcelRecords(records);
      renderPlantSheet();
      setSheetSaveStatus('All changes saved');
      toast(`Excel import complete: ${result.updated} updated, ${result.added} added${result.skipped ? `, ${result.skipped} skipped` : ''}.`);
    } catch (error) {
      console.error(error);
      setSheetSaveStatus('Excel import failed', 'error');
      toast('Could not import this Excel file. Use the exported Plant List .xlsx format.', true);
    }
  }


  let pendingSheetEdit = null;

  const sheetFieldLabels = {
    image: 'Photo',
    code: 'Code',
    commonName: 'Common name',
    scientificName: 'Scientific name',
    category: 'Category',
    sizes: 'Available sizes',
    sun: 'Sun',
    water: 'Water',
    spacing: 'Spacing',
    matureHeight: 'Mature height',
    matureSpread: 'Mature spread',
    landscapeUse: 'Landscape use',
    growingCondition: 'Growing condition',
    plantingNotes: 'Planting notes',
    tags: 'Tags',
    link: 'Reference'
  };

  function storedSheetFieldValue(plant, field) {
    if (!plant) return '';
    if (field === 'sizes') return sizesToSheetText(plant.sizes);
    if (field === 'tags') return (plant.tags || []).join(', ');
    if (field === 'scientificName') return plant.scientificName || plant.material || '';
    return String(plant[field] ?? '');
  }

  function normalizeSheetComparisonValue(field, value) {
    const stringValue = String(value ?? '');
    if (field === 'sizes') return stringValue.split(';').map(item => item.trim()).filter(Boolean).join('; ');
    if (field === 'tags') return stringValue.split(',').map(item => item.trim()).filter(Boolean).join(', ');
    return stringValue.trim();
  }

  function sheetEditValueHTML(value) {
    const display = String(value || '').trim() || 'Not specified';
    return escapeHTML(display);
  }

  function requestSheetFieldConfirmation(input) {
    const plant = getPlant(input.dataset.plantId);
    const field = input.dataset.sheetField;
    if (!plant || !field) return;
    const originalValue = storedSheetFieldValue(plant, field);
    const newValue = String(input.value ?? '');
    if (normalizeSheetComparisonValue(field, originalValue) === normalizeSheetComparisonValue(field, newValue)) {
      input.value = originalValue;
      input.classList.remove('pending-edit');
      return;
    }

    pendingSheetEdit = {
      type: 'field',
      plantId: plant.id,
      field,
      input,
      originalValue,
      newValue
    };
    input.classList.add('pending-edit');
    const fieldLabel = sheetFieldLabels[field] || field;
    openModal(
      'Save this change?',
      `${plant.commonName || 'Unnamed plant'} · ${fieldLabel}`,
      `<div class="sheet-edit-warning">
        <div class="sheet-edit-warning-icon">!</div>
        <p>This edit has not been saved. Choose <strong>Save changes</strong> to update the Plant Library, project lists, mood boards, and exports. Choose <strong>Cancel edit</strong> to restore the previous value.</p>
        <div class="sheet-edit-comparison">
          <div class="sheet-edit-value"><span>Previous value</span><div>${sheetEditValueHTML(originalValue)}</div></div>
          <div class="sheet-edit-value new-value"><span>New value</span><div>${sheetEditValueHTML(newValue)}</div></div>
        </div>
      </div>`,
      `<button type="button" class="button secondary" data-action="sheet-cancel-edit">Cancel edit</button><button type="button" class="button primary" data-action="sheet-confirm-edit">Save changes</button>`
    );
  }

  async function requestSheetImageConfirmation(input, file) {
    const plant = getPlant(input.dataset.sheetImage);
    if (!plant || !file) return;
    const validationError = imageFileError(file);
    if (validationError) {
      input.value = '';
      toast(validationError, true);
      return;
    }
    try {
      const resizedImage = await resizeImage(file);
      pendingSheetEdit = {
        type: 'image',
        plantId: plant.id,
        field: 'image',
        input,
        originalValue: plant.image || '',
        newValue: resizedImage
      };
      openModal(
        'Save this photo?',
        `${plant.commonName || 'Unnamed plant'} · Photo`,
        `<div class="sheet-edit-warning">
          <div class="sheet-edit-warning-icon">!</div>
          <p>The selected photo has not been saved. Save it to update the Plant Library, mood boards, and exports, or cancel to keep the existing photo.</p>
          <div class="sheet-edit-comparison">
            <div class="sheet-edit-value"><span>Current photo</span>${safeImage(plant.image) ? `<img class="sheet-edit-photo-preview" src="${safeImage(plant.image)}" alt="Current ${escapeHTML(plant.commonName)} photo">` : '<div>There is no current photo.</div>'}</div>
            <div class="sheet-edit-value new-value"><span>New photo</span><img class="sheet-edit-photo-preview" src="${safeImage(resizedImage)}" alt="New ${escapeHTML(plant.commonName)} photo"></div>
          </div>
        </div>`,
        `<button type="button" class="button secondary" data-action="sheet-cancel-edit">Cancel edit</button><button type="button" class="button primary" data-action="sheet-confirm-edit">Save changes</button>`
      );
    } catch (error) {
      input.value = '';
      toast('The selected image could not be processed.', true);
    }
  }

  function cancelPendingSheetEdit() {
    const pending = pendingSheetEdit;
    pendingSheetEdit = null;
    if (pending?.input?.isConnected) {
      if (pending.type === 'field') pending.input.value = pending.originalValue;
      if (pending.type === 'image') pending.input.value = '';
      pending.input.classList?.remove('pending-edit');
    }
    if (pending?.field === 'code') updateSheetDuplicateIndicators();
    closeModal();
    if (pending) toast('Edit cancelled.');
  }

  function confirmPendingSheetEdit() {
    const pending = pendingSheetEdit;
    if (!pending) { closeModal(); return; }

    if (pending.type === 'image') {
      const plant = getPlant(pending.plantId);
      if (!plant) { cancelPendingSheetEdit(); return; }
      plant.image = pending.newValue;
      saveAll();
      const thumb = document.querySelector(`[data-sheet-thumbnail="${CSS.escape(plant.id)}"]`);
      if (thumb) thumb.innerHTML = `<img src="${safeImage(plant.image)}" alt="${escapeHTML(plant.commonName)}" width="96" height="96" loading="lazy" decoding="async">`;
      if (pending.input?.isConnected) pending.input.value = '';
      pendingSheetEdit = null;
      closeModal();
      toast('Photo saved.');
      return;
    }

    const saved = saveSheetField(pending.input);
    if (saved === false) {
      pendingSheetEdit = null;
      closeModal();
      return;
    }
    pending.input?.classList?.remove('pending-edit');
    pendingSheetEdit = null;
    closeModal();
    toast(`${sheetFieldLabels[pending.field] || 'Edit'} saved.`);
  }

  function sheetField(plant, field, value, className) {
    const label = `${sheetFieldLabels[field] || field} for ${plant.commonName || 'unnamed plant'}`;
    return `<input class="sheet-cell-input ${className || ''}" aria-label="${escapeHTML(label)}" data-sheet-field="${escapeHTML(field)}" data-plant-id="${escapeHTML(plant.id)}" value="${escapeHTML(value || '')}">`;
  }

  function sheetTextarea(plant, field, value) {
    const label = `${sheetFieldLabels[field] || field} for ${plant.commonName || 'unnamed plant'}`;
    return `<textarea class="sheet-cell-textarea" aria-label="${escapeHTML(label)}" data-sheet-field="${escapeHTML(field)}" data-plant-id="${escapeHTML(plant.id)}">${escapeHTML(value || '')}</textarea>`;
  }

  function sheetLinkField(plant) {
    const href = safeLink(plant.link);
    return `<div class="sheet-link-cell">${sheetField(plant, 'link', plant.link || '')}${href ? `<a class="sheet-open-link" href="${href}" target="_blank" rel="noopener noreferrer" title="Open link">↗</a>` : ''}</div>`;
  }

  function sheetCategorySelect(plant) {
    const list = categories();
    if (!list.includes('Heliconias & Aquatics')) list.push('Heliconias & Aquatics');
    return `<select class="sheet-cell-select" aria-label="Category for ${escapeHTML(plant.commonName || 'unnamed plant')}" data-sheet-field="category" data-plant-id="${escapeHTML(plant.id)}"><option value=""${plant.category ? '' : ' selected'}></option>${list.sort().map(category => `<option value="${escapeHTML(category)}"${plant.category === category ? ' selected' : ''}>${escapeHTML(category)}</option>`).join('')}</select>`;
  }

  function renderPlantSheet() {
    const results = filteredSheetPlants();
    const grouped = results.reduce((groups, plant) => {
      const category = plant.category || 'Uncategorized';
      (groups[category] ||= []).push(plant);
      return groups;
    }, {});
    const duplicateCount = duplicateCodeGroups().size;
    const visibleCategories = state.sheetSearch.trim()
      ? Object.keys(grouped)
      : (state.sheetCategory === 'All' ? categories() : [state.sheetCategory]);
    visibleCategories.forEach(category => { if (!(category in grouped)) grouped[category] = []; });
    content.innerHTML = `
      <div class="toolbar sheet-toolbar">
        <div class="toolbar-group" style="flex:1;">
          <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="sheetSearch" class="search-input" type="search" aria-label="Search the plant list" placeholder="Search the plant list" value="${escapeHTML(state.sheetSearch)}"></label>
          <select id="sheetCategoryFilter" class="select-input" aria-label="Filter plant list by category" style="width:auto;min-width:210px;">
            <option value="All">All categories</option>
            ${categories().map(category => `<option value="${escapeHTML(category)}"${state.sheetCategory === category ? ' selected' : ''}>${escapeHTML(category)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-group">
          <span class="result-count">${results.length} ${results.length === 1 ? 'entry' : 'entries'}</span>
          <button type="button" class="button secondary" data-action="import-excel">Import Excel</button>
          <button type="button" class="button secondary" data-action="export-excel">Export Excel</button>
          <button type="button" class="button secondary" data-action="new-category">Add category</button>
          <button type="button" class="button primary" data-action="new-plant"${state.sheetCategory !== 'All' ? ` data-category="${escapeHTML(state.sheetCategory)}"` : ''}>Add plant</button>
          <input id="plantExcelInput" type="file" aria-label="Import plant list from Excel" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
        </div>
      </div>
      ${duplicateCount ? `<div class="duplicate-alert"><span>!</span><div><strong>${duplicateCount} duplicate code${duplicateCount === 1 ? '' : 's'} detected</strong>Duplicate code cells are marked in red. Enter a unique code using the AEg format.</div></div>` : ''}
      <div id="sheetCategoryGroups">
        ${Object.keys(grouped).sort((a,b) => a.localeCompare(b)).map(category => renderSheetCategory(category, grouped[category])).join('') || emptyState('No matching plants', 'Try another name or category.', '<button type="button" class="button secondary" data-action="clear-sheet-filter">Clear filters</button>')}
      </div>`;
  }

  function renderSheetCategory(category, records) {
    records.sort((a,b) => String(a.commonName || '').localeCompare(String(b.commonName || '')));
    return `<details class="sheet-category" open>
      <summary>
        <span>${escapeHTML(category)}</span>
        <span class="sheet-category-actions">
          <span class="sheet-category-count">${records.length} ${records.length === 1 ? 'entry' : 'entries'}</span>
          <button type="button" class="sheet-category-delete" data-action="delete-category" data-category="${escapeHTML(category)}" title="Delete ${escapeHTML(category)} category" aria-label="Delete ${escapeHTML(category)} category">×</button>
        </span>
      </summary>
      <div class="sheet-scroll">
        <table class="plant-sheet-table">
          <caption class="sr-only">${escapeHTML(category)} plant records</caption>
          <thead><tr>
            <th scope="col" class="sheet-photo-col">Photo</th>
            <th scope="col" class="sheet-code-col">Code</th>
            <th scope="col" class="sheet-name-col">Common name</th>
            <th scope="col" class="sheet-scientific-col">Scientific name</th>
            <th scope="col" class="sheet-category-col">Category</th>
            <th scope="col" class="sheet-sizes-col">Available sizes</th>
            <th scope="col" class="sheet-short-col">Sun</th>
            <th scope="col" class="sheet-short-col">Water</th>
            <th scope="col" class="sheet-short-col">Spacing</th>
            <th scope="col" class="sheet-short-col">Mature height</th>
            <th scope="col" class="sheet-short-col">Mature spread</th>
            <th scope="col" class="sheet-medium-col">Landscape use</th>
            <th scope="col" class="sheet-long-col">Growing condition</th>
            <th scope="col" class="sheet-long-col">Planting notes</th>
            <th scope="col" class="sheet-medium-col">Tags</th>
            <th scope="col" class="sheet-medium-col">Reference</th>
            <th scope="col" class="sheet-actions-col">Action</th>
          </tr></thead>
          <tbody>${records.length ? records.map(sheetPlantRow).join('') : `<tr><td colspan="17"><div class="sheet-empty-category">No plants in this category yet. <button type="button" class="button secondary small" data-action="new-plant" data-category="${escapeHTML(category)}">Add plant</button></div></td></tr>`}</tbody>
        </table>
      </div>
    </details>`;
  }

  function sheetPlantRow(plant) {
    const image = safeImage(plant.image);
    const duplicate = isDuplicateCode(plant.code);
    const duplicateHint = duplicateCodeTooltip(plant.code, plant.id);
    return `<tr data-sheet-row="${escapeHTML(plant.id)}">
      <td><div class="sheet-photo" data-sheet-thumbnail="${escapeHTML(plant.id)}">${image ? `<img src="${image}" alt="${escapeHTML(plant.commonName)}" width="96" height="96" loading="lazy" decoding="async">` : `<div class="image-fallback">${escapeHTML(plant.code || '—')}</div>`}</div></td>
      <td><div class="sheet-code-wrap${duplicate ? ' has-duplicate' : ''}" data-sheet-code-wrap="${escapeHTML(plant.id)}" title="${escapeHTML(duplicate ? duplicateHint : 'Plant code')}">${sheetField(plant, 'code', plant.code, `sheet-code-input${duplicate ? ' duplicate-code' : ''}`)}<span class="sheet-code-error${duplicate ? ' visible' : ''}" data-sheet-code-error="${escapeHTML(plant.id)}">${duplicate ? 'Duplicate code — hover to see matching plant' : ''}</span></div></td>
      <td>${sheetField(plant, 'commonName', plant.commonName)}</td>
      <td>${sheetField(plant, 'scientificName', plant.scientificName || plant.material)}</td>
      <td>${sheetCategorySelect(plant)}</td>
      <td>${sheetTextarea(plant, 'sizes', sizesToSheetText(plant.sizes))}<span class="sheet-help">Use semicolons between sizes.</span></td>
      <td>${sheetField(plant, 'sun', plant.sun)}</td>
      <td>${sheetField(plant, 'water', plant.water)}</td>
      <td>${sheetField(plant, 'spacing', plant.spacing)}</td>
      <td>${sheetField(plant, 'matureHeight', plant.matureHeight)}</td>
      <td>${sheetField(plant, 'matureSpread', plant.matureSpread)}</td>
      <td>${sheetTextarea(plant, 'landscapeUse', plant.landscapeUse)}</td>
      <td>${sheetTextarea(plant, 'growingCondition', plant.growingCondition)}</td>
      <td>${sheetTextarea(plant, 'plantingNotes', plant.plantingNotes)}</td>
      <td>${sheetTextarea(plant, 'tags', (plant.tags || []).join(', '))}</td>
      <td>${sheetLinkField(plant)}</td>
      <td><div class="sheet-row-actions"><button class="icon-button" type="button" aria-label="Open details for ${escapeHTML(plant.commonName || 'unnamed plant')}" title="Open card details" data-action="plant-detail" data-plant-id="${escapeHTML(plant.id)}">↗</button><button class="icon-button" type="button" aria-label="Delete ${escapeHTML(plant.commonName || 'unnamed plant')}" title="Delete plant" data-action="sheet-delete-plant" data-plant-id="${escapeHTML(plant.id)}">×</button></div></td>
    </tr>`;
  }

  function setSheetSaveStatus(message, mode) {
    const status = document.getElementById('sheetSaveStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('saving', mode === 'saving');
    status.classList.toggle('error', mode === 'error');
  }

  function updateSheetDuplicateIndicators() {
    document.querySelectorAll('[data-sheet-field="code"]').forEach(input => {
      const duplicate = isDuplicateCode(input.value);
      const hint = duplicateCodeTooltip(input.value, input.dataset.plantId);
      input.classList.toggle('duplicate-code', duplicate);
      input.title = duplicate ? hint : 'Plant code';
      const wrap = document.querySelector(`[data-sheet-code-wrap="${CSS.escape(input.dataset.plantId)}"]`);
      if (wrap) {
        wrap.classList.toggle('has-duplicate', duplicate);
        wrap.title = duplicate ? hint : 'Plant code';
      }
      const error = document.querySelector(`[data-sheet-code-error="${CSS.escape(input.dataset.plantId)}"]`);
      if (error) {
        error.textContent = duplicate ? 'Duplicate code — hover to see matching plant' : '';
        error.classList.toggle('visible', duplicate);
        error.title = duplicate ? hint : '';
      }
    });
  }

  function saveSheetField(input) {
    const plant = getPlant(input.dataset.plantId);
    const field = input.dataset.sheetField;
    if (!plant || !field) return false;
    setSheetSaveStatus('Saving…', 'saving');
    const rawValue = String(input.value || '').trim();

    if (field === 'code') {
      const code = normalizePlantCode(rawValue);
      const duplicate = plants.find(record => record.id !== plant.id && String(record.code || '').toLowerCase() === code.toLowerCase());
      if (!/^[A-Z][A-Z][a-z]$/.test(code)) {
        input.value = plant.code;
        input.classList.add('input-error');
        setSheetSaveStatus('Code was not saved', 'error');
        toast('Use three letters: first two uppercase and the third lowercase.', true);
        return false;
      }
      if (duplicate) {
        input.value = plant.code;
        input.classList.add('input-error');
        setSheetSaveStatus('Duplicate code not saved', 'error');
        toast(`Code ${code} is already used by ${duplicate.commonName}.`, true);
        return false;
      }
      input.classList.remove('input-error');
      plant.code = code;
      plant.codeManual = true;
    } else if (field === 'sizes') {
      plant.sizes = parseSheetSizes(rawValue);
    } else if (field === 'tags') {
      plant.tags = rawValue.split(',').map(value => value.trim()).filter(Boolean);
      syncPlantCareTags(plant, [plant.sun, plant.water]);
    } else {
      const previousCareTags = [plant.sun, plant.water];
      plant[field] = rawValue;
      if (field === 'sun' || field === 'water') {
        syncPlantCareTags(plant, previousCareTags);
        const tagsInput = document.querySelector(`[data-sheet-field="tags"][data-plant-id="${CSS.escape(plant.id)}"]`);
        if (tagsInput) tagsInput.value = (plant.tags || []).join(', ');
      }
      if (field === 'scientificName' && plant.category === 'Landscape Materials') plant.material = rawValue;
      if (field === 'category') {
        plant.isPlant = rawValue !== 'Landscape Materials';
        plant.material = rawValue === 'Landscape Materials' ? plant.scientificName : '';
      }
      if ((field === 'commonName' || field === 'scientificName') && !plant.codeManual) {
        plant.code = generatePlantCode(plant.commonName, plant.scientificName || plant.material, plant.code);
        const codeInput = document.querySelector(`[data-sheet-field="code"][data-plant-id="${CSS.escape(plant.id)}"]`);
        if (codeInput) codeInput.value = plant.code;
      }
    }

    syncProjectPlantCodes();
    saveAll();
    updateSheetDuplicateIndicators();
    setSheetSaveStatus('All changes saved');

    if (field === 'category') {
      const active = document.activeElement;
      renderPlantSheet();
      if (active && active.id) document.getElementById(active.id)?.focus();
    }
    return true;
  }


  function defaultMoodboard() {
    return {
      title: 'PLANT MATERIAL BOARD',
      projectName: '',
      location: '',
      footer: 'GREENSCAPE LANDSCAPING SERVICES',
      selectedIds: [],
      orientation: 'landscape',
      columns: 8,
      rows: 6,
      layoutDefaultVersion: 2,
      showCodes: true,
      showScientific: true,
      showCommon: true
    };
  }

  function sanitizeMoodboard(record) {
    const base = defaultMoodboard();
    const source = record && typeof record === 'object' ? record : {};
    return {
      ...base,
      ...source,
      title: String(source.title || base.title),
      projectName: String(source.projectName || ''),
      location: String(source.location || ''),
      footer: String(source.footer || base.footer),
      selectedIds: [...new Set(Array.isArray(source.selectedIds) ? source.selectedIds : [])].filter(id => plants.some(plant => plant.id === id)),
      orientation: String(source.orientation || base.orientation) === 'portrait' ? 'portrait' : 'landscape',
      columns: source.layoutDefaultVersion === 2 && [6,7,8,9,10].includes(Number(source.columns)) ? Number(source.columns) : base.columns,
      rows: source.layoutDefaultVersion === 2 && [6,7,8,9,10].includes(Number(source.rows)) ? Number(source.rows) : base.rows,
      layoutDefaultVersion: 2,
      showCodes: source.showCodes !== false,
      showScientific: source.showScientific !== false,
      showCommon: source.showCommon !== false
    };
  }

  function moodboardCategoryLabel(category) {
    const labels = {
      'Shrubs': 'SHRUBS & FOLIAGE',
      'Grasses & Groundcovers': 'GRASS / GROUNDCOVER',
      'Climbers & Ferns': 'CLIMBER & FERN',
      'Cycads, Agaves & Yuccas': 'CYCADS / AGAVES / YUCCAS',
      'Heliconias & Aquatics': 'HELICONIAS / AQUATICS',
      'Indoor Plants': 'INDOOR PLANTS',
      'Landscape Materials': 'LANDSCAPE MATERIALS'
    };
    return labels[category] || String(category || 'UNCATEGORIZED').toUpperCase();
  }

  function moodboardPlantColor(plant) {
    const palette = [
      ['#2d6b4f', '#ffffff'], ['#efd667', '#17372a'], ['#ef7f62', '#ffffff'],
      ['#78b8a6', '#ffffff'], ['#5b4ba3', '#ffffff'], ['#dda62b', '#ffffff'],
      ['#ef4564', '#ffffff'], ['#77a935', '#ffffff'], ['#9d6f4e', '#ffffff'],
      ['#52b979', '#ffffff'], ['#f58d2d', '#ffffff'], ['#6e9cd2', '#ffffff'],
      ['#c9df60', '#17372a'], ['#b5463f', '#ffffff'], ['#8a70c7', '#ffffff']
    ];
    const key = `${plant.id || ''}${plant.commonName || ''}`;
    let hash = 0;
    for (let index = 0; index < key.length; index++) hash = key.charCodeAt(index) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  }

  function selectedMoodboardPlants() {
    return moodboard.selectedIds.map(getPlant).filter(Boolean);
  }

  function filteredMoodboardPlants() {
    const query = state.moodboardSearch.trim().toLowerCase();
    return plants.filter(plant => {
      if (state.moodboardCategory !== 'All' && plant.category !== state.moodboardCategory) return false;
      if (!query) return true;
      return [plant.code, plant.commonName, plant.scientificName, plant.category, ...(plant.tags || [])]
        .join(' ').toLowerCase().includes(query);
    });
  }

  function renderMoodboard() {
    content.innerHTML = `
      <div class="moodboard-top-actions">
        <div>
          <strong>Mood board creator</strong>
          <span>Select plants from the library. Changes to plant names, codes, categories, and photos update here automatically.</span>
        </div>
        <div class="toolbar-group">
          <button type="button" class="button secondary" data-action="moodboard-print">Print / Save PDF</button>
          <button type="button" class="button primary" data-action="moodboard-export-png">Export PNG</button>
        </div>
      </div>

      <div class="moodboard-workspace">
        <aside class="moodboard-controls">
          <section class="moodboard-control-section">
            <h2>Board details</h2>
            <label class="field"><span>Board title</span><input class="input" data-moodboard-setting="title" value="${escapeHTML(moodboard.title)}" placeholder="PLANT MATERIAL BOARD"></label>
            <label class="field"><span>Project name</span><input class="input" data-moodboard-setting="projectName" value="${escapeHTML(moodboard.projectName)}" placeholder="Project name"></label>
            <label class="field"><span>Location or note</span><input class="input" data-moodboard-setting="location" value="${escapeHTML(moodboard.location)}" placeholder="Site location"></label>
            <label class="field"><span>Footer text</span><input class="input" data-moodboard-setting="footer" value="${escapeHTML(moodboard.footer)}" placeholder="GREENSCAPE LANDSCAPING SERVICES"></label>
          </section>

          <section class="moodboard-control-section">
            <h2>Board layout</h2>
            <label class="field"><span>Orientation</span><select class="select-input" data-moodboard-setting="orientation">
              <option value="landscape"${moodboard.orientation === 'landscape' ? ' selected' : ''}>Landscape</option>
              <option value="portrait"${moodboard.orientation === 'portrait' ? ' selected' : ''}>Portrait</option>
            </select></label>
            <label class="field"><span>Cards per row</span><select class="select-input" data-moodboard-setting="columns">
              ${[6,7,8,9,10].map(value => `<option value="${value}"${Number(moodboard.columns) === value ? ' selected' : ''}>${value} cards</option>`).join('')}
            </select></label>
            <label class="field"><span>Cards per column</span><select class="select-input" data-moodboard-setting="rows">
              ${[6,7,8,9,10].map(value => `<option value="${value}"${Number(moodboard.rows) === value ? ' selected' : ''}>${value} cards</option>`).join('')}
            </select></label>
            <label class="check-row"><input type="checkbox" data-moodboard-setting="showCommon"${moodboard.showCommon ? ' checked' : ''}> Show common name</label>
            <label class="check-row"><input type="checkbox" data-moodboard-setting="showScientific"${moodboard.showScientific ? ' checked' : ''}> Show scientific name</label>
            <label class="check-row"><input type="checkbox" data-moodboard-setting="showCodes"${moodboard.showCodes ? ' checked' : ''}> Show plant code</label>
          </section>

          <section class="moodboard-control-section">
            <h2>Load from project list</h2>
            <div class="moodboard-project-loader">
              <select id="moodboardProjectSelect" class="select-input" aria-label="Choose a project list to load">
                <option value="">Choose a project</option>
                ${projects.map(project => `<option value="${escapeHTML(project.id)}">${escapeHTML(project.name)}</option>`).join('')}
              </select>
              <button type="button" class="button secondary small" data-action="moodboard-load-project"${projects.length ? '' : ' disabled'}>Load plants</button>
            </div>
          </section>

          <section class="moodboard-control-section moodboard-library-section">
            <div class="moodboard-library-heading">
              <h2>Plant library</h2>
              <span id="moodboardSelectedCount" role="status" aria-live="polite">${moodboard.selectedIds.length} selected</span>
            </div>
            <label class="search-wrap compact"><span aria-hidden="true">⌕</span><input id="moodboardSearch" class="search-input" type="search" aria-label="Search mood board plants" placeholder="Search plants" value="${escapeHTML(state.moodboardSearch)}"></label>
            <select id="moodboardCategoryFilter" class="select-input" aria-label="Filter mood board plants by category">
              <option value="All">All categories</option>
              ${categories().map(category => `<option value="${escapeHTML(category)}"${state.moodboardCategory === category ? ' selected' : ''}>${escapeHTML(category)}</option>`).join('')}
            </select>
            <div class="moodboard-picker-actions">
              <button type="button" class="button ghost small" data-action="moodboard-add-visible">Add visible</button>
              <button type="button" class="button ghost small danger-text" data-action="moodboard-clear">Clear board</button>
            </div>
            <div id="moodboardPlantPicker" class="moodboard-plant-picker">${moodboardPickerHTML()}</div>
          </section>
        </aside>

        <section class="moodboard-stage">
          <div class="moodboard-stage-note"><span>A3 pages are created automatically when a board is full.</span><span>Click any board to view it full screen.</span></div>
          <div id="moodboardPreview">${moodboardBoardHTML()}</div>
        </section>
      </div>`;
  }

  function moodboardPickerHTML() {
    const records = filteredMoodboardPlants();
    if (!records.length) return `<div class="moodboard-picker-empty">No matching plants.</div>`;
    return records.map(plant => {
      const selected = moodboard.selectedIds.includes(plant.id);
      const image = safeImage(plant.image);
      return `<button type="button" class="moodboard-picker-item${selected ? ' selected' : ''}" data-action="moodboard-toggle-plant" data-plant-id="${escapeHTML(plant.id)}" title="${selected ? 'Remove from board' : 'Add to board'}">
        <span class="moodboard-picker-image">${image ? `<img src="${image}" alt="${escapeHTML(plant.commonName)}" width="96" height="96" loading="lazy" decoding="async">` : `<span>${escapeHTML(plant.code || '—')}</span>`}</span>
        <span class="moodboard-picker-copy"><strong>${escapeHTML(plant.commonName || 'Unnamed plant')}</strong><small>${escapeHTML(plant.scientificName || plant.material || plant.category)}</small></span>
        <span class="moodboard-picker-check">${selected ? '✓' : '+'}</span>
      </button>`;
    }).join('');
  }

  function moodboardGroupedPlants(selected = selectedMoodboardPlants()) {
    const groups = [];
    const groupMap = new Map();
    selected.forEach(plant => {
      const category = plant.category || 'Uncategorized';
      if (!groupMap.has(category)) {
        const group = { category, plants: [] };
        groupMap.set(category, group);
        groups.push(group);
      }
      groupMap.get(category).plants.push(plant);
    });
    return groups;
  }

  function moodboardPageMetrics() {
    const orientation = moodboard.orientation === 'portrait' ? 'portrait' : 'landscape';
    const columns = [6,7,8,9,10].includes(Number(moodboard.columns)) ? Number(moodboard.columns) : 6;
    const rows = [6,7,8,9,10].includes(Number(moodboard.rows)) ? Number(moodboard.rows) : 6;
    const width = orientation === 'portrait' ? 1000 : 1414;
    const height = orientation === 'portrait' ? 1414 : 1000;
    const sideWidth = orientation === 'portrait' ? 72 : 92;
    const pagePaddingX = orientation === 'portrait' ? 22 : 26;
    const pagePaddingY = orientation === 'portrait' ? 24 : 22;
    const labelWidth = orientation === 'portrait' ? 34 : 38;
    const labelGap = orientation === 'portrait' ? 8 : 10;
    const cardGap = orientation === 'portrait' ? 7 : 8;
    const groupGap = orientation === 'portrait' ? 14 : 16;
    const contentWidth = width - sideWidth - (pagePaddingX * 2);
    const gridWidth = contentWidth - labelWidth - labelGap;
    const bodyHeight = height - (pagePaddingY * 2);

    const maxByColumns = (gridWidth - cardGap * (columns - 1)) / columns;
    const maxByRows = (bodyHeight - cardGap * (rows - 1)) / rows;
    const cardWidth = Math.max(36, Math.min(maxByColumns, maxByRows));
    const cardHeight = cardWidth;
    const captionHeight = Math.max(17, Math.min(34, cardHeight * 0.25));
    const imageHeight = cardHeight - captionHeight;
    const commonFont = Math.max(4.8, Math.min(8.4, captionHeight * 0.235));
    const scientificFont = Math.max(4.1, Math.min(7.2, captionHeight * 0.19));
    const codeSize = Math.max(15, Math.min(28, captionHeight * 0.78));
    const codeFont = Math.max(4.2, Math.min(7.2, codeSize * 0.26));
    const captionPadding = Math.max(2.2, Math.min(5, captionHeight * 0.11));
    const captionGap = Math.max(1.5, Math.min(4, captionHeight * 0.08));
    const lineGap = Math.max(.8, Math.min(2.2, captionHeight * 0.05));
    const cardAspect = 1;
    const photoAspect = cardWidth / imageHeight;
    const captionShare = (captionHeight / cardHeight) * 100;

    return {
      orientation, columns, rows, width, height, sideWidth, pagePaddingX, pagePaddingY,
      labelWidth, labelGap, cardGap, groupGap, cardWidth, cardHeight, captionHeight,
      imageHeight, commonFont, scientificFont, codeSize, codeFont, captionPadding,
      captionGap, lineGap, cardAspect, photoAspect, captionShare, bodyHeight, gridWidth
    };
  }

  function paginateMoodboardPages(selected = selectedMoodboardPlants()) {
    const metrics = moodboardPageMetrics();
    const sourceGroups = moodboardGroupedPlants(selected);
    const pages = [];
    const newPage = () => ({ groups: [], usedHeight: 0 });
    let page = newPage();
    pages.push(page);

    sourceGroups.forEach(sourceGroup => {
      let offset = 0;
      while (offset < sourceGroup.plants.length) {
        const precedingGap = page.groups.length ? metrics.groupGap : 0;
        let remainingHeight = metrics.bodyHeight - page.usedHeight - precedingGap;
        const remainingRows = Math.ceil((sourceGroup.plants.length - offset) / metrics.columns);
        let rowsToTake = 0;
        for (let rows = remainingRows; rows >= 1; rows--) {
          const height = rows * metrics.cardHeight + Math.max(0, rows - 1) * metrics.cardGap;
          if (height <= remainingHeight + .5) { rowsToTake = rows; break; }
        }
        if (!rowsToTake) {
          if (page.groups.length) {
            page = newPage();
            pages.push(page);
            continue;
          }
          rowsToTake = 1;
          remainingHeight = metrics.bodyHeight;
        }
        const takeCount = Math.min(sourceGroup.plants.length - offset, rowsToTake * metrics.columns);
        const plantsForPage = sourceGroup.plants.slice(offset, offset + takeCount);
        const actualRows = Math.ceil(plantsForPage.length / metrics.columns);
        const groupHeight = actualRows * metrics.cardHeight + Math.max(0, actualRows - 1) * metrics.cardGap;
        page.groups.push({
          category: sourceGroup.category,
          plants: plantsForPage,
          continued: offset > 0,
          continues: offset + takeCount < sourceGroup.plants.length
        });
        page.usedHeight += precedingGap + groupHeight;
        offset += takeCount;
      }
    });

    if (!selected.length) return [{ groups: [], usedHeight: 0 }];
    return pages.filter(record => record.groups.length);
  }

  function moodboardBoardHTML() {
    const selected = selectedMoodboardPlants();
    const pages = paginateMoodboardPages(selected);
    const orientation = moodboard.orientation === 'portrait' ? 'portrait' : 'landscape';
    return `<div class="moodboard-pages">
      ${pages.map((page, pageIndex) => moodboardPageHTML(page, pageIndex, orientation)).join('')}
    </div>`;
  }

  function moodboardPageHTML(page, pageIndex, orientation) {
    const metrics = moodboardPageMetrics();
    const cqw = value => `${(Number(value || 0) / metrics.width * 100).toFixed(4)}cqw`;
    const boardStyle = [
      `--moodboard-columns:${metrics.columns}`,
      `--moodboard-card-width:${cqw(metrics.cardWidth)}`,
      `--moodboard-card-height:${cqw(metrics.cardHeight)}`,
      `--moodboard-image-height:${cqw(metrics.imageHeight)}`,
      `--moodboard-caption-height:${cqw(metrics.captionHeight)}`,
      `--moodboard-card-gap:${cqw(metrics.cardGap)}`,
      `--moodboard-common-font:${cqw(metrics.commonFont)}`,
      `--moodboard-scientific-font:${cqw(metrics.scientificFont)}`,
      `--moodboard-code-size:${cqw(metrics.codeSize)}`,
      `--moodboard-code-font:${cqw(metrics.codeFont)}`,
      `--moodboard-caption-padding:${cqw(metrics.captionPadding)}`,
      `--moodboard-caption-gap:${cqw(metrics.captionGap)}`,
      `--moodboard-line-gap:${cqw(metrics.lineGap)}`
    ].join(';');
    return `<section class="moodboard-page-preview" role="button" aria-label="Open mood board page ${pageIndex + 1} full screen" data-action="moodboard-fullscreen" data-page-index="${pageIndex}" data-orientation="${orientation}" tabindex="0" title="Click to view this A3 page full screen">
      <div class="moodboard-page-toolbar">
        <div class="moodboard-zoom-controls" aria-label="Board zoom controls">
          <button type="button" class="moodboard-zoom-button" data-action="moodboard-zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
          <button type="button" class="moodboard-zoom-level" data-action="moodboard-zoom-reset" title="Reset zoom" aria-label="Reset zoom"><span data-moodboard-zoom-label>100%</span></button>
          <button type="button" class="moodboard-zoom-button" data-action="moodboard-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
        </div>
      </div>
      <div class="moodboard-board-viewport">
      <article class="moodboard-board" data-moodboard-page="${pageIndex}" data-orientation="${orientation}" data-rows="${metrics.rows}" data-board-zoom="1" style="${boardStyle}">
        <aside class="moodboard-info-panel">
          <div class="moodboard-side-title">${escapeHTML(moodboard.title || 'PLANT MATERIAL BOARD')}</div>
          <div class="moodboard-side-footer">${escapeHTML(moodboard.footer || 'GREENSCAPE LANDSCAPING SERVICES')}</div>
          <div class="moodboard-side-project">
            <div class="moodboard-side-meta">
              <small>Project name</small>
              <strong>${escapeHTML(moodboard.projectName || 'Not set')}</strong>
            </div>
            <div class="moodboard-side-meta">
              <small>Location</small>
              <span>${escapeHTML(moodboard.location || 'Not set')}</span>
            </div>
          </div>
        </aside>
        <div class="moodboard-page">
          <div class="moodboard-board-body">
            ${page.groups.length ? page.groups.map(group => moodboardGroupHTML(group)).join('') : `
              <div class="moodboard-empty-board">
                <span>＋</span><strong>Add plants to start the mood board.</strong><p>Use the plant library panel on the left or load plants from a saved project list.</p>
              </div>`}
          </div>
          <footer class="moodboard-board-footer"></footer>
        </div>
      </article>
      </div>
    </section>`;
  }

  function moodboardGroupHTML(group) {
    return `<section class="moodboard-category-group" data-moodboard-category="${escapeHTML(group.category)}">
      <div class="moodboard-category-label"><span>${escapeHTML(moodboardCategoryLabel(group.category))}${group.continued ? ' · CONT.' : ''}</span></div>
      <div class="moodboard-card-grid">
        ${group.plants.map(plant => moodboardCardHTML(plant)).join('')}
      </div>
    </section>`;
  }

  function moodboardCardHTML(plant) {
    const image = safeImage(plant.image);
    const [background, foreground] = moodboardPlantColor(plant);
    return `<article class="moodboard-plant-card" draggable="true" data-moodboard-card="${escapeHTML(plant.id)}">
      <button type="button" class="moodboard-remove-card no-export" data-action="moodboard-remove-plant" data-plant-id="${escapeHTML(plant.id)}" title="Remove from board">×</button>
      <div class="moodboard-card-photo">${image ? `<img src="${image}" alt="${escapeHTML(plant.commonName)}" width="480" height="480" loading="lazy" decoding="async">` : `<div class="moodboard-card-fallback">${escapeHTML(plant.code || '—')}</div>`}</div>
      <div class="moodboard-card-caption" style="--moodboard-card-bg:${background};--moodboard-card-text:${foreground}">
        <div class="moodboard-card-names">
          ${moodboard.showCommon ? `<strong><span>CN:</span> ${escapeHTML(plant.commonName || 'Unnamed plant')}</strong>` : ''}
          ${moodboard.showScientific ? `<em><span>SN:</span> ${escapeHTML(plant.scientificName || plant.material || 'Not specified')}</em>` : ''}
        </div>
        ${moodboard.showCodes ? `<span class="moodboard-code-badge">${escapeHTML(plant.code || '—')}</span>` : ''}
      </div>
    </article>`;
  }

  function updateMoodboardPreview() {
    const preview = document.getElementById('moodboardPreview');
    if (preview) preview.innerHTML = moodboardBoardHTML();
    const count = document.getElementById('moodboardSelectedCount');
    if (count) count.textContent = `${moodboard.selectedIds.length} selected`;
  }

  function updateMoodboardPicker() {
    const picker = document.getElementById('moodboardPlantPicker');
    if (picker) picker.innerHTML = moodboardPickerHTML();
    const count = document.getElementById('moodboardSelectedCount');
    if (count) count.textContent = `${moodboard.selectedIds.length} selected`;
  }

  function toggleMoodboardPlant(plantId, force) {
    if (!getPlant(plantId)) return;
    const selected = moodboard.selectedIds.includes(plantId);
    const shouldAdd = force === undefined ? !selected : Boolean(force);
    if (shouldAdd && !selected) moodboard.selectedIds.push(plantId);
    if (!shouldAdd && selected) moodboard.selectedIds = moodboard.selectedIds.filter(id => id !== plantId);
    saveAll();
    updateMoodboardPicker();
    updateMoodboardPreview();
  }

  function setMoodboardPageZoom(page, nextZoom) {
    if (!page) return;
    const board = page.querySelector('.moodboard-board');
    const viewport = page.querySelector('.moodboard-board-viewport');
    if (!board || !viewport) return;
    const zoom = Math.max(0.5, Math.min(2, Number(nextZoom) || 1));
    board.dataset.boardZoom = String(zoom);
    board.style.width = `${zoom * 100}%`;
    board.style.maxWidth = 'none';
    board.style.marginInline = zoom <= 1 ? 'auto' : '0';
    const label = page.querySelector('[data-moodboard-zoom-label]');
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    if (zoom <= 1) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  function changeMoodboardPageZoom(button, delta) {
    const page = button?.closest('.moodboard-page-preview');
    const board = page?.querySelector('.moodboard-board');
    if (!page || !board) return;
    const current = Number(board.dataset.boardZoom || 1);
    setMoodboardPageZoom(page, delta === 0 ? 1 : current + delta);
  }

  let moodboardSaveTimer = 0;

  function flushMoodboardSave() {
    if (!moodboardSaveTimer) return;
    clearTimeout(moodboardSaveTimer);
    moodboardSaveTimer = 0;
    saveAll();
  }

  function scheduleMoodboardSave() {
    clearTimeout(moodboardSaveTimer);
    moodboardSaveTimer = window.setTimeout(() => {
      moodboardSaveTimer = 0;
      saveAll();
    }, 250);
  }

  function updateMoodboardSetting(input) {
    const key = input.dataset.moodboardSetting;
    if (!key || !(key in moodboard)) return;
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (key === 'columns' || key === 'rows') {
      const numericValue = Number(value);
      value = [6,7,8,9,10].includes(numericValue) ? numericValue : 6;
    }
    moodboard[key] = value;
    if (input.type === 'checkbox' || input.type === 'select-one') saveAll();
    else scheduleMoodboardSave();
    updateMoodboardPreview();
  }

  function loadProjectIntoMoodboard() {
    const projectId = document.getElementById('moodboardProjectSelect')?.value;
    const project = getProject(projectId);
    if (!project) {
      toast('Choose a project list first.', true);
      return;
    }
    moodboard.projectName = project.name || moodboard.projectName;
    moodboard.location = project.location || moodboard.location;
    moodboard.selectedIds = [...new Set((project.items || []).map(item => item.plantId).filter(id => getPlant(id)))];
    saveAll();
    renderMoodboard();
    toast(`${moodboard.selectedIds.length} plants loaded from ${project.name}.`);
  }

  function reorderMoodboardPlant(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const order = [...moodboard.selectedIds];
    const from = order.indexOf(sourceId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, sourceId);
    moodboard.selectedIds = order;
    saveAll();
    updateMoodboardPreview();
  }

  function moodboardCanvasImage(url) {
    return new Promise(resolve => {
      if (!url) { resolve(null); return; }
      const image = new Image();
      const timer = setTimeout(() => resolve(null), 12000);
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); resolve(null); };
      image.src = url;
    });
  }

  function canvasFitText(context, text, maxWidth) {
    const value = String(text || '');
    if (context.measureText(value).width <= maxWidth) return value;
    let result = value;
    while (result.length > 2 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
    return `${result}…`;
  }

  function wrapCanvasText(context, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${current} ${words[i]}`;
      if (context.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        lines.push(current);
        current = words[i];
        if (maxLines && lines.length === maxLines - 1) break;
      }
    }
    const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
    const remainingWords = words.slice(usedWords);
    if (remainingWords.length) {
      let last = remainingWords.join(' ');
      while (context.measureText(last + '…').width > maxWidth && last.includes(' ')) last = last.replace(/\s+\S+$/, '');
      lines.push((last || remainingWords[0]) + (usedWords + remainingWords.length < words.length ? '…' : ''));
    } else {
      lines.push(current);
    }
    return maxLines ? lines.slice(0, maxLines) : lines;
  }

  function roundRectFill(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
  }

  function drawMoodboardCoverImage(context, image, x, y, width, height) {
    if (!image) return false;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();
    return true;
  }

  async function renderMoodboardPageCanvas(page, pageIndex, pageCount, imageMap) {
    const base = moodboardPageMetrics();
    const orientation = base.orientation;
    const canvasWidth = orientation === 'portrait' ? 3508 : 4960;
    const canvasHeight = orientation === 'portrait' ? 4960 : 3508;
    const scale = canvasWidth / base.width;
    const sideWidth = base.sideWidth * scale;
    const pagePaddingX = base.pagePaddingX * scale;
    const pagePaddingY = base.pagePaddingY * scale;
    const labelWidth = base.labelWidth * scale;
    const labelGap = base.labelGap * scale;
    const cardGap = base.cardGap * scale;
    const groupGap = base.groupGap * scale;
    const cardWidth = base.cardWidth * scale;
    const cardHeight = base.cardHeight * scale;
    const imageHeight = base.imageHeight * scale;
    const captionHeight = base.captionHeight * scale;
    const commonFont = base.commonFont * scale;
    const scientificFont = base.scientificFont * scale;
    const codeSize = base.codeSize * scale;
    const codeFont = base.codeFont * scale;
    const captionPadding = base.captionPadding * scale;
    const selected = selectedMoodboardPlants();

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    context.fillStyle = '#1f5a43';
    context.fillRect(0, 0, sideWidth, canvasHeight);

    const title = String(moodboard.title || 'PLANT MATERIAL BOARD').toUpperCase();
    const footer = String(moodboard.footer || 'GREENSCAPE LANDSCAPING SERVICES').toUpperCase();

    context.save();
    context.translate(sideWidth * 0.55, canvasHeight * 0.18);
    context.rotate(-Math.PI / 2);
    context.fillStyle = '#ffffff';
    context.font = `800 ${Math.max(10, 8.5 * scale)}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(canvasFitText(context, title, canvasHeight * 0.26), 0, 0);
    context.restore();

    context.save();
    context.translate(sideWidth * 0.46, canvasHeight * 0.66);
    context.rotate(-Math.PI / 2);
    context.fillStyle = '#e7f3ee';
    context.font = `700 ${Math.max(6, 5 * scale)}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(canvasFitText(context, footer, canvasHeight * 0.22), 0, 0);
    context.restore();

    const drawVerticalMeta = (x, label, value) => {
      context.save();
      context.translate(x, canvasHeight * 0.91);
      context.rotate(-Math.PI / 2);
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillStyle = '#d8ece3';
      context.font = `800 ${Math.max(7, 5.5 * scale)}px Arial, sans-serif`;
      context.fillText(label, 0, 0);
      context.fillStyle = '#ffffff';
      context.font = `700 ${Math.max(8, 7 * scale)}px Arial, sans-serif`;
      context.fillText(canvasFitText(context, value || 'Not set', canvasHeight * 0.24), 58 * scale, 0);
      context.restore();
    };
    drawVerticalMeta(sideWidth * 0.34, 'PROJECT NAME', moodboard.projectName);
    drawVerticalMeta(sideWidth * 0.68, 'LOCATION', moodboard.location);

    const pageX = sideWidth + pagePaddingX;
    let y = pagePaddingY;
    page.groups.forEach((group, groupIndex) => {
      const rows = Math.ceil(group.plants.length / base.columns);
      const groupHeight = rows * cardHeight + Math.max(0, rows - 1) * cardGap;
      context.save();
      context.strokeStyle = '#2b6a4e';
      context.lineWidth = 1.5 * scale;
      context.setLineDash([7 * scale, 7 * scale]);
      context.beginPath();
      context.roundRect(pageX, y, labelWidth, groupHeight, labelWidth / 2);
      context.stroke();
      context.setLineDash([]);
      context.translate(pageX + labelWidth / 2, y + groupHeight / 2);
      context.rotate(-Math.PI / 2);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#235d45';
      context.font = `900 ${11 * scale}px Arial, sans-serif`;
      const label = `${moodboardCategoryLabel(group.category)}${group.continued ? ' · CONT.' : ''}`;
      context.fillText(canvasFitText(context, label, Math.max(120 * scale, groupHeight - 30 * scale)), 0, 0);
      context.restore();

      const gridX = pageX + labelWidth + labelGap;
      group.plants.forEach((plant, index) => {
        const column = index % base.columns;
        const row = Math.floor(index / base.columns);
        const x = gridX + column * (cardWidth + cardGap);
        const cardY = y + row * (cardHeight + cardGap);
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#dce3de';
        context.lineWidth = 1.4 * scale;
        context.fillRect(x, cardY, cardWidth, cardHeight);
        context.strokeRect(x, cardY, cardWidth, cardHeight);
        const image = imageMap.get(plant.id);
        if (!drawMoodboardCoverImage(context, image, x, cardY, cardWidth, imageHeight)) {
          context.fillStyle = '#edf2ee';
          context.fillRect(x, cardY, cardWidth, imageHeight);
          context.fillStyle = '#2d6b4f';
          context.font = `900 ${30 * scale}px Arial, sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(plant.code || '—', x + cardWidth / 2, cardY + imageHeight / 2);
          context.textAlign = 'left';
          context.textBaseline = 'alphabetic';
        }
        const [background, foreground] = moodboardPlantColor(plant);
        const captionY = cardY + imageHeight;
        context.fillStyle = background;
        context.fillRect(x, captionY, cardWidth, captionHeight);

        const codeReserve = moodboard.showCodes ? codeSize + captionPadding * 2.2 : 0;
        const textX = x + captionPadding;
        const textMaxWidth = Math.max(12 * scale, cardWidth - codeReserve - captionPadding * 1.8);
        context.fillStyle = foreground;
        context.textAlign = 'left';
        context.textBaseline = 'middle';

        if (moodboard.showCommon) {
          context.font = `900 ${commonFont}px Arial, sans-serif`;
          const commonY = captionY + captionHeight * (moodboard.showScientific ? 0.34 : 0.50);
          context.fillText(
            canvasFitText(context, `CN: ${String(plant.commonName || 'Unnamed plant').toUpperCase()}`, textMaxWidth),
            textX,
            commonY
          );
        }
        if (moodboard.showScientific) {
          context.font = `italic ${scientificFont}px Arial, sans-serif`;
          const scientificY = captionY + captionHeight * (moodboard.showCommon ? 0.72 : 0.50);
          context.fillText(
            canvasFitText(context, `SN: ${plant.scientificName || plant.material || 'Not specified'}`, textMaxWidth),
            textX,
            scientificY
          );
        }
        if (moodboard.showCodes) {
          const radius = codeSize / 2;
          const centerX = x + cardWidth - captionPadding - radius;
          const centerY = captionY + captionHeight / 2;
          context.strokeStyle = foreground;
          context.lineWidth = Math.max(1.2 * scale, codeSize * 0.055);
          context.setLineDash([Math.max(2 * scale, codeSize * 0.10), Math.max(2 * scale, codeSize * 0.10)]);
          context.beginPath();
          context.arc(centerX, centerY, radius, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
          context.fillStyle = foreground;
          context.font = `900 ${codeFont}px Arial, sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(canvasFitText(context, plant.code || '—', codeSize * 1.45), centerX, centerY + codeFont * 0.04);
          context.textAlign = 'left';
          context.textBaseline = 'alphabetic';
        }
      });
      y += groupHeight + (groupIndex < page.groups.length - 1 ? groupGap : 0);
    });
    return canvas;
  }

  async function exportMoodboardPNG() {
    const selected = selectedMoodboardPlants();
    if (!selected.length) {
      toast('Add at least one plant before exporting.', true);
      return;
    }
    const exportButton = document.querySelector('[data-action="moodboard-export-png"]');
    const originalText = exportButton?.textContent;
    if (exportButton) { exportButton.disabled = true; exportButton.textContent = 'Preparing A3 pages…'; }
    try {
      const pages = paginateMoodboardPages(selected);
      const imageMap = new Map();
      await Promise.all(selected.map(async plant => imageMap.set(plant.id, await moodboardCanvasImage(plant.image))));
      const basename = slug(moodboard.projectName || moodboard.title || 'greenscape-mood-board');
      const pageFiles = {};
      for (let index = 0; index < pages.length; index++) {
        if (exportButton) exportButton.textContent = `Exporting page ${index + 1} of ${pages.length}…`;
        const canvas = await renderMoodboardPageCanvas(pages[index], index, pages.length, imageMap);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png', .96));
        pageFiles[`${basename}-page-${String(index + 1).padStart(2, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      if (pages.length === 1) {
        const filename = Object.keys(pageFiles)[0];
        downloadBlob(new Blob([pageFiles[filename]], { type: 'image/png' }), filename);
      } else {
        const rawZip = makeZipBlob(pageFiles);
        const zipBlob = new Blob([await rawZip.arrayBuffer()], { type: 'application/zip' });
        downloadBlob(zipBlob, `${basename}-A3-pages.zip`);
      }
      toast(pages.length === 1 ? 'A3 mood board exported as PNG.' : `${pages.length} A3 mood board pages exported in a ZIP file.`);
    } catch (error) {
      console.error(error);
      toast('PNG export could not be completed. Use Print / Save PDF instead.', true);
    } finally {
      if (exportButton) { exportButton.disabled = false; exportButton.textContent = originalText || 'Export PNG'; }
    }
  }

  function printMoodboard() {
    if (!moodboard.selectedIds.length) {
      toast('Add at least one plant before printing.', true);
      return;
    }
    const printStyle = document.getElementById('moodboardPrintPageStyle') || (() => {
      const style = document.createElement('style');
      style.id = 'moodboardPrintPageStyle';
      document.head.appendChild(style);
      return style;
    })();
    printStyle.textContent = `@media print { @page { size: A3 ${moodboard.orientation === 'portrait' ? 'portrait' : 'landscape'}; margin: 8mm; } }`;
    document.body.classList.add('printing-moodboard');
    const cleanup = () => document.body.classList.remove('printing-moodboard');
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1200);
    }, 80);
  }


  function renderProjects() {
    if (state.selectedProjectId && getProject(state.selectedProjectId)) {
      renderProjectDetail(getProject(state.selectedProjectId));
      return;
    }
    state.selectedProjectId = null;
    content.innerHTML = `
      <div class="toolbar">
        <div><p class="muted" style="margin:0;font-size:12px;">Create a separate plant list for each landscape project or sector.</p></div>
        <button type="button" class="button primary" data-action="new-project">New project</button>
      </div>
      ${projects.length ? `<div class="project-grid">${projects.map(projectCard).join('')}</div>` : emptyState('No project plant lists', 'Create your first project, then add plants from the library.', '<button type="button" class="button primary" data-action="new-project">Create project</button>')}
    `;
  }

  function projectCard(project) {
    const totals = projectTotals(project);
    const deadline = projectDeadlineInfo(project.deadline);
    return `<article class="project-card">
      <div class="project-card-top">
        <div><h3>${escapeHTML(project.name)}</h3><p class="project-location">${escapeHTML(project.location || 'Location not set')}</p></div>
        <span class="badge">${formatDate(project.updatedAt)}</span>
      </div>
      <div class="project-stats">
        <div class="project-stat"><strong>${totals.categories}</strong><span>Categories</span></div>
        <div class="project-stat"><strong>${number(totals.quantity)}</strong><span>Quantity</span></div>
        <div class="project-stat project-deadline deadline-${deadline.tone}"><strong>${escapeHTML(deadline.display)}</strong><span>${escapeHTML(deadline.status)}</span></div>
      </div>
      <div class="project-card-actions">
        <button type="button" class="button primary small" data-action="open-project" data-project-id="${escapeHTML(project.id)}">Open list</button>
        <button type="button" class="button secondary small" data-action="add-to-project" data-project-id="${escapeHTML(project.id)}">Add plants</button>
      </div>
    </article>`;
  }

  function renderProjectDetail(project) {
    const totals = projectTotals(project);
    const items = project.items || [];
    const deadline = projectDeadlineInfo(project.deadline);
    content.innerHTML = `
      <div class="detail-header">
        <div>
          <button type="button" class="text-button project-back-button" data-action="back-projects">← All project lists</button>
          <p class="breadcrumb">Project plant list</p>
          <h2>${escapeHTML(project.name)}</h2>
          <p class="detail-subtitle">${escapeHTML(project.location || 'Location not set')}${project.client ? ` · ${escapeHTML(project.client)}` : ''}</p>
        </div>
        <div class="detail-actions no-print">
          <button type="button" class="button secondary" data-action="edit-project" data-project-id="${escapeHTML(project.id)}">Edit project</button>
          <button type="button" class="button secondary" data-action="project-schedule" data-project-id="${escapeHTML(project.id)}">View schedule</button>
          <button type="button" class="button primary" data-action="add-to-project" data-project-id="${escapeHTML(project.id)}">Add plant</button>
        </div>
      </div>
      <div class="project-info-grid">
        <div><span>Area size</span><strong>${escapeHTML(project.areaSize ? `${project.areaSize} sqm` : 'Not set')}</strong></div>
        <div><span>Project type</span><strong>${escapeHTML(project.projectType || 'Not set')}</strong></div>
        <div><span>Project start</span><strong>${escapeHTML(project.startDate ? formatDate(project.startDate) : 'Not set')}</strong></div>
        <div class="project-deadline deadline-${deadline.tone}"><span>Deadline</span><strong>${escapeHTML(deadline.display)}</strong><small>${escapeHTML(deadline.status)}</small></div>
        <div><span>Design cost</span><strong>${escapeHTML(projectCost(project.designCost))}</strong></div>
        <div><span>Landscaping cost</span><strong>${escapeHTML(projectCost(project.landscapingCost))}</strong></div>
      </div>
      ${project.siteConditions ? `<p class="inline-note"><strong>Site conditions:</strong> ${escapeHTML(project.siteConditions)}</p>` : ''}
      ${project.notes ? `<p class="inline-note"><strong>Project notes:</strong> ${escapeHTML(project.notes)}</p>` : ''}
      <div class="summary-strip project-summary-strip">
        ${summaryBox('Total categories', totals.categories)}
        ${summaryBox('Total quantity', number(totals.quantity))}
      </div>
      ${items.length ? projectItemsTable(project) : emptyState('This plant list is empty', 'Add plants from the library and select the size, quantity, spacing, and zone.', `<button type="button" class="button primary" data-action="add-to-project" data-project-id="${escapeHTML(project.id)}">Add first plant</button>`)}
      <div class="no-print" style="display:flex;justify-content:flex-end;margin-top:18px;"><button type="button" class="button ghost small" data-action="delete-project" data-project-id="${escapeHTML(project.id)}">Delete project</button></div>
    `;
  }

  function summaryBox(label, value) {
    return `<div class="summary-box"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
  }

  function projectItemsTable(project, scheduleMode) {
    const items = project.items || [];
    return `<div class="table-wrap">
      <table>
        <thead><tr>
          <th>Code</th><th>Plant</th><th>Size</th><th>Qty</th><th>Unit</th><th>Zone</th><th>Spacing</th><th>Planting notes</th>${scheduleMode ? '' : '<th class="no-print">Actions</th>'}
        </tr></thead>
        <tbody>${items.map(item => {
          const plant = getPlant(item.plantId);
          const common = plant?.commonName || item.commonName || 'Deleted plant';
          const scientific = plant?.scientificName || item.scientificName || '';
          return `<tr>
            <td><strong>${escapeHTML(plant?.code || item.plantCode || '—')}</strong></td>
            <td><span class="cell-title">${escapeHTML(common)}</span><span class="cell-subtitle">${escapeHTML(scientific)}</span></td>
            <td>${escapeHTML(item.sizeLabel || 'Unspecified')}</td>
            <td>${number(item.quantity)}</td>
            <td>${escapeHTML(item.unit || 'pc/s')}</td>
            <td>${escapeHTML(item.zone || '—')}</td>
            <td>${escapeHTML(item.spacing || '—')}</td>
            <td>${escapeHTML(item.notes || plant?.plantingNotes || '—')}</td>
            ${scheduleMode ? '' : `<td class="no-print"><div class="row-actions"><button type="button" class="icon-button" title="Edit" data-action="edit-project-item" data-project-id="${escapeHTML(project.id)}" data-item-id="${escapeHTML(item.id)}">✎</button><button type="button" class="icon-button" title="Remove" data-action="remove-project-item" data-project-id="${escapeHTML(project.id)}" data-item-id="${escapeHTML(item.id)}">×</button></div></td>`}
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  function renderSchedule() {
    if (!projects.length) {
      content.innerHTML = emptyState('No project schedule available', 'Create a project list and add plants before generating a schedule.', '<button type="button" class="button primary" data-action="new-project">Create project</button>');
      return;
    }
    if (!getProject(state.scheduleProjectId)) state.scheduleProjectId = projects[0].id;
    const project = getProject(state.scheduleProjectId);
    const totals = projectTotals(project);
    content.innerHTML = `
      <div class="toolbar no-print">
        <div class="toolbar-group">
          <select id="scheduleProjectSelect" class="select-input" aria-label="Choose project schedule" style="min-width:280px;">
            ${projects.map(p => `<option value="${escapeHTML(p.id)}"${p.id === project.id ? ' selected' : ''}>${escapeHTML(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-group">
          <button type="button" class="button secondary" data-action="export-csv" data-project-id="${escapeHTML(project.id)}">Export CSV</button>
          <button type="button" class="button primary" data-action="print-schedule">Print / Save PDF</button>
        </div>
      </div>
      <div class="detail-header">
        <div><p class="breadcrumb">Plant schedule</p><h2>${escapeHTML(project.name)}</h2><p class="detail-subtitle">${escapeHTML(project.location || 'Location not set')} · Prepared ${formatDate(new Date().toISOString())}</p></div>
      </div>
      ${project.siteConditions ? `<p class="inline-note"><strong>Site conditions:</strong> ${escapeHTML(project.siteConditions)}</p>` : ''}
      <div class="summary-strip">
        ${summaryBox('Total categories', totals.categories)}${summaryBox('Schedule lines', totals.lines)}${summaryBox('Total quantity', number(totals.quantity))}
      </div>
      ${(project.items || []).length ? projectItemsTable(project, true) : emptyState('This schedule is empty', 'Return to the project list and add plants.', `<button type="button" class="button primary" data-action="open-project" data-project-id="${escapeHTML(project.id)}">Open project</button>`)}
    `;
  }

  function emptyState(title, copy, actionHTML) {
    return `<div class="empty-state"><div class="empty-icon">⌁</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(copy)}</p>${actionHTML || ''}</div>`;
  }

  function openModal(title, subtitle, body, footer, large) {
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal${large ? ' large' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle" tabindex="-1">
      <div class="modal-header"><div><h2 id="modalTitle">${escapeHTML(title)}</h2>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div><button class="modal-close" type="button" data-action="close-modal" aria-label="Close dialog">X</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div></div>`;
    modalRoot.querySelector('.modal')?.focus({ preventScroll: true });
  }

  function closeModal() {
    modalRoot.innerHTML = '';
    const returnTarget = modalReturnFocus;
    modalReturnFocus = null;
    if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
  }

  function openPlantDetail(id) {
    const plant = getPlant(id);
    if (!plant) return;
    const image = safeImage(plant.image);
    const sizes = plant.sizes || [];
    const link = safeLink(plant.link);
    const tags = Array.isArray(plant.tags) ? plant.tags.filter(Boolean) : [];
    const body = `
      <div class="plant-detail-grid">
        <div class="detail-photo">${image ? `<img src="${image}" alt="${escapeHTML(plant.commonName)}" width="900" height="900" decoding="async">` : `<div class="image-fallback">${escapeHTML(plant.code || '—')}</div>`}</div>
        <div class="detail-info">
          <div class="plant-code-row" title="Plant code"><span class="plant-code">${escapeHTML(plant.code)}</span></div>
          <h3>${escapeHTML(plant.commonName)}</h3>
          <p class="scientific">${escapeHTML(plant.scientificName || plant.material || '')}</p>
          <div class="detail-content-stack">
            <section class="detail-panel">
              <span class="detail-panel-label">Planting notes</span>
              ${plant.plantingNotes ? `<p>${escapeHTML(plant.plantingNotes)}</p>` : `<span class="detail-empty">No planting notes added.</span>`}
            </section>
            <section class="detail-panel">
              <span class="detail-panel-label">Tags</span>
              ${tags.length ? `<div class="detail-tags">${tags.map(tag => `<span class="detail-tag">${escapeHTML(tag)}</span>`).join('')}</div>` : `<span class="detail-empty">No tags added.</span>`}
            </section>
            <section class="detail-panel">
              <span class="detail-panel-label">Link</span>
              ${link ? `<a class="detail-link" href="${link}" target="_blank" rel="noopener noreferrer">Open plant link <span aria-hidden="true">↗</span></a>` : `<span class="detail-empty">No link added.</span>`}
            </section>
          </div>
        </div>
      </div>
      <details class="plant-size-details">
        <summary>
          <span><strong>Available sizes</strong><small>${sizes.length ? `${sizes.length} recorded size${sizes.length === 1 ? '' : 's'}` : 'No sizes recorded'}</small></span>
          <span class="plant-size-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="table-wrap"><table><thead><tr><th>Available size</th><th>Unit</th></tr></thead><tbody>
          ${sizes.length ? sizes.map(size => `<tr><td>${escapeHTML(size.label || size.size || 'Unspecified')}</td><td>${escapeHTML(size.unit || '—')}</td></tr>`).join('') : '<tr><td colspan="2" class="muted">No size options recorded.</td></tr>'}
        </tbody></table></div>
      </details>
    `;
    openModal(plant.commonName, '', body,
      `<button type="button" class="button secondary" data-action="edit-plant" data-plant-id="${escapeHTML(plant.id)}">Edit plant</button><button type="button" class="button primary" data-action="add-to-project" data-plant-id="${escapeHTML(plant.id)}">Add to project</button>`, true);
    document.querySelector('#modalRoot .modal')?.classList.add('plant-detail-modal');
  }

  function infoItem(label, value) {
    return `<div class="info-item"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || 'Not specified')}</strong></div>`;
  }

  function sizeRow(size) {
    const s = size || {};
    return `<div class="size-row no-stock">
      <input class="text-input" name="sizeLabel" placeholder="Size, e.g. 100 cm" value="${escapeHTML(s.label || s.size || '')}">
      <input class="text-input" name="sizeUnit" placeholder="Unit" value="${escapeHTML(s.unit || '')}">
      <button type="button" class="icon-button remove-size" data-action="remove-size" title="Remove size">×</button>
    </div>`;
  }

  function openCategoryForm() {
    const body = `<form id="categoryForm" class="form-grid">
      <div class="form-field full"><label>Category name *</label><input class="text-input" required maxlength="80" name="categoryName" placeholder="e.g. Native Coastal Plants"></div>
      <div class="form-field full"><span class="form-help">The new category will appear in the Plant List Editor, Plant Library filters, and plant forms.</span></div>
    </form>`;
    openModal('Add category', 'Create a new group for your plant records.', body,
      `<button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" type="submit" form="categoryForm">Add category</button>`, true);
    document.getElementById('categoryForm').addEventListener('submit', saveCategoryForm);
    setTimeout(() => document.querySelector('#categoryForm [name="categoryName"]')?.focus(), 0);
  }

  function saveCategoryForm(event) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('categoryName') || '').trim();
    if (!name) return;
    const existing = categories().find(category => category.toLowerCase() === name.toLowerCase());
    if (existing) {
      toast(`Category “${existing}” already exists.`, true);
      return;
    }
    customCategories.push(name);
    customCategories = sanitizeCategories(customCategories);
    state.sheetCategory = name;
    saveAll();
    closeModal();
    if (state.view === 'sheet') renderPlantSheet();
    else render();
    toast(`Category “${name}” added.`);
  }

  function openDeleteCategoryDialog(category) {
    const name = String(category || '').trim();
    if (!name) return;
    const categoryPlants = plants.filter(plant => plant.category === name);
    const count = categoryPlants.length;
    const affectedProjects = projects.filter(project => (project.items || []).some(item => categoryPlants.some(plant => plant.id === item.plantId))).length;
    const body = `<form id="deleteCategoryForm">
      <div class="delete-category-warning">
        <strong>Safety check: this action cannot be undone.</strong>
        <p>${count
          ? `Deleting “${escapeHTML(name)}” will permanently delete ${count} plant ${count === 1 ? 'record' : 'records'} in this category.`
          : `Deleting “${escapeHTML(name)}” will remove this empty category.`}</p>
      </div>
      ${count ? `<ul class="delete-category-list">
        <li>The plants will be removed from the Plant Library and Plant List Editor.</li>
        <li>They will be removed from mood boards and ${affectedProjects} affected project ${affectedProjects === 1 ? 'list' : 'lists'}.</li>
        <li>Plant photos and edited information for these records will also be removed.</li>
      </ul>` : ''}
      <div class="form-field full" style="margin-top:16px;">
        <label>Type the category name to confirm</label>
        <input class="text-input" name="confirmCategory" autocomplete="off" placeholder="${escapeHTML(name)}" aria-label="Type category name to confirm deletion">
        <span class="form-help">Enter exactly: <strong>${escapeHTML(name)}</strong></span>
      </div>
      <input type="hidden" name="category" value="${escapeHTML(name)}">
    </form>`;
    openModal('Delete category?', `${count} ${count === 1 ? 'entry' : 'entries'} will be affected.`, body,
      `<button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button danger" type="submit" form="deleteCategoryForm">Delete category</button>`, true);
    document.getElementById('deleteCategoryForm').addEventListener('submit', deleteCategoryForm);
    setTimeout(() => document.querySelector('#deleteCategoryForm [name="confirmCategory"]')?.focus(), 0);
  }

  function deleteCategoryForm(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const category = String(data.get('category') || '').trim();
    const confirmation = String(data.get('confirmCategory') || '').trim();
    if (!category) return;
    if (confirmation !== category) {
      toast('Category name does not match. Nothing was deleted.', true);
      document.querySelector('#deleteCategoryForm [name="confirmCategory"]')?.focus();
      return;
    }

    const deletedIds = new Set(plants.filter(plant => plant.category === category).map(plant => plant.id));
    plants = plants.filter(plant => plant.category !== category);
    customCategories = customCategories.filter(name => name !== category);
    moodboard.selectedIds = moodboard.selectedIds.filter(id => !deletedIds.has(id));
    projects.forEach(project => {
      project.items = (project.items || []).filter(item => !deletedIds.has(item.plantId));
      project.updatedAt = new Date().toISOString();
    });
    if (state.sheetCategory === category) state.sheetCategory = 'All';
    if (state.libraryCategory === category) state.libraryCategory = 'All';
    if (state.moodboardCategory === category) state.moodboardCategory = 'All';
    saveAll();
    closeModal();
    renderPlantSheet();
    toast(`Category “${category}” deleted.`);
  }

  function openPlantForm(id, preferredCategory) {
    const plant = id ? getPlant(id) : null;
    const categoriesList = categories();
    if (!categoriesList.includes('Heliconias & Aquatics')) categoriesList.push('Heliconias & Aquatics');
    const startingCode = plant?.code || generatePlantCode('', '', 'PLx');
    const selectedCategory = plant?.category || preferredCategory || '';
    const body = `<form id="plantForm" class="form-grid" novalidate>
      <input type="hidden" name="id" value="${escapeHTML(plant?.id || '')}">
      <div id="plantFormAlert" class="plant-form-alert full" role="alert" aria-live="polite"><strong>Please correct the highlighted fields.</strong><span id="plantFormAlertText"></span></div>
      <div class="form-field" data-plant-field="code"><label for="plantCodeInput">Plant code *</label><div class="code-input-wrap"><input class="text-input" required maxlength="3" pattern="[A-Za-z]{3}" name="code" id="plantCodeInput" placeholder="AEg" value="${escapeHTML(startingCode)}" aria-describedby="plantCodeHelp plantCodeError"><span class="code-rule-label">3 letters</span></div><span class="form-help" id="plantCodeHelp">Common-name initial + genus initial + species initial. Example: African Oil Palm + Elaeis guineensis = AEg. You may edit the code to resolve a duplicate.</span><span class="form-error" id="plantCodeError"></span></div>
      <div class="form-field" data-plant-field="category"><label for="plantCategory">Category *</label><select class="select-input" required name="category" id="plantCategory" aria-describedby="plantCategoryError"><option value="">Select a category</option>${categoriesList.sort().map(c => `<option value="${escapeHTML(c)}"${selectedCategory === c ? ' selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select><span class="form-error" id="plantCategoryError"></span></div>
      <div class="form-field" data-plant-field="commonName"><label for="plantCommonName">Common name *</label><input class="text-input" required name="commonName" id="plantCommonName" value="${escapeHTML(plant?.commonName || '')}" aria-describedby="plantCommonNameError"><span class="form-error" id="plantCommonNameError"></span></div>
      <div class="form-field" data-plant-field="scientificName"><label for="plantScientificName">Scientific name *</label><input class="text-input" required name="scientificName" id="plantScientificName" value="${escapeHTML(plant?.scientificName || '')}" placeholder="Genus species" aria-describedby="plantScientificNameError"><span class="form-error" id="plantScientificNameError"></span></div>
      <div class="form-field"><label>Sun requirement</label><input class="text-input" name="sun" placeholder="e.g. Full sun, partial shade" value="${escapeHTML(plant?.sun || '')}"></div>
      <div class="form-field"><label>Water requirement</label><input class="text-input" name="water" placeholder="e.g. Low, moderate, high" value="${escapeHTML(plant?.water || '')}"></div>
      <div class="form-field"><label>Recommended spacing</label><input class="text-input" name="spacing" placeholder="e.g. 1.5 m O.C." value="${escapeHTML(plant?.spacing || '')}"></div>
      <div class="form-field"><label>Mature height</label><input class="text-input" name="matureHeight" value="${escapeHTML(plant?.matureHeight || '')}"></div>
      <div class="form-field"><label>Mature spread</label><input class="text-input" name="matureSpread" value="${escapeHTML(plant?.matureSpread || '')}"></div>
      <div class="form-field full"><label>Growing condition</label><input class="text-input" name="growingCondition" placeholder="Coastal, well-drained soil, sheltered shade" value="${escapeHTML(plant?.growingCondition || '')}"></div>
      <div class="form-field full"><label>Planting notes</label><textarea name="plantingNotes">${escapeHTML(plant?.plantingNotes || '')}</textarea></div>
      <div class="form-field full"><label>Tags</label><input class="text-input" name="tags" placeholder="Add manual tags separated by commas" value="${escapeHTML((plant?.tags || []).join(', '))}"><span class="form-help">Sun and water requirements are added automatically. You can also add manual tags.</span></div>
      <div class="form-field"><label>Link</label><input class="text-input" type="url" name="link" placeholder="Optional website or reference link" value="${escapeHTML(plant?.link || (plant?.image && /^https?:/i.test(plant.image) ? plant.image : ''))}"><span class="form-help">This link appears as a clickable reference in plant details.</span></div>
      <div class="form-field"><label>Upload image</label><input class="text-input" style="padding:8px;" name="imageFile" type="file" accept="image/*"><span class="form-help">Uploaded images are resized before saving.</span></div>
      <div class="form-section"><h3>Available sizes</h3><p>Add one row for each nursery size.</p><div id="sizeEditor" class="size-editor">${(plant?.sizes?.length ? plant.sizes : [{}]).map(sizeRow).join('')}</div><button type="button" class="button ghost small" style="margin-top:9px;" data-action="add-size-row">+ Add size</button></div>
    </form>`;
    openModal(plant ? 'Edit plant' : 'Add plant', plant ? 'Update the plant record and size options.' : 'Create a new record in your local plant library.', body,
      `<button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" type="submit" form="plantForm">${plant ? 'Save changes' : 'Add plant'}</button>`, true);
    const form = document.getElementById('plantForm');
    form.addEventListener('submit', savePlantForm);
    setupPlantCodeForm(form, plant);
    setupAutomaticPlantTags(form, plant);
  }

  async function savePlantForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    form.syncAutomaticTags?.();
    const initialData = new FormData(form);
    const existing = initialData.get('id') ? getPlant(initialData.get('id')) : null;
    if (!validatePlantForm(form, existing?.id, true)) return;

    const fd = new FormData(form);
    const category = String(fd.get('category') || '').trim();
    const commonName = String(fd.get('commonName') || '').trim();
    const scientificName = String(fd.get('scientificName') || '').trim();
    const generatedCode = generatePlantCode(commonName, scientificName, existing?.code);
    const code = normalizePlantCode(fd.get('code')) || generatedCode;
    let image = existing?.image || '';
    const link = String(fd.get('link') || '').trim();
    const file = fd.get('imageFile');
    if (file && file.size) {
      const validationError = imageFileError(file);
      if (validationError) {
        toast(validationError, true);
        return;
      }
      try { image = await resizeImage(file); }
      catch (error) {
        toast('The selected image could not be processed.', true);
        return;
      }
    }
    const labels = [...form.querySelectorAll('[name="sizeLabel"]')];
    const units = [...form.querySelectorAll('[name="sizeUnit"]')];
    const sizes = labels.map((input, index) => {
      const label = input.value.trim();
      const unit = units[index].value.trim();
      return { label: label || 'Unspecified', size: label, variant: '', unit };
    }).filter(size => size.label !== 'Unspecified' || size.unit);
    const record = {
      ...(existing || {}),
      id: existing?.id || uid('custom'),
      code,
      codeManual: code !== generatedCode,
      commonName,
      scientificName,
      category,
      isPlant: category !== 'Landscape Materials',
      material: category === 'Landscape Materials' ? scientificName : '',
      image,
      sizes,
      sun: String(fd.get('sun') || '').trim(),
      water: String(fd.get('water') || '').trim(),
      spacing: String(fd.get('spacing') || '').trim(),
      matureHeight: String(fd.get('matureHeight') || '').trim(),
      matureSpread: String(fd.get('matureSpread') || '').trim(),
      landscapeUse: existing?.landscapeUse || '',
      growingCondition: String(fd.get('growingCondition') || '').trim(),
      plantingNotes: String(fd.get('plantingNotes') || '').trim(),
      tags: String(fd.get('tags') || '').split(',').map(v => v.trim()).filter(Boolean),
      link,
      sourceSheet: existing?.sourceSheet || 'Custom',
      sourceNumber: existing?.sourceNumber || '',
      custom: existing?.custom ?? true
    };
    if (existing) plants = plants.map(p => p.id === existing.id ? record : p);
    else plants.push(record);
    plants.sort((a,b) => a.category.localeCompare(b.category) || a.commonName.localeCompare(b.commonName));
    syncProjectPlantCodes();
    saveAll();
    closeModal();
    render();
    toast(existing ? 'Plant record updated.' : 'Plant added to the library.');
  }

  function plantWords(value) {
    return String(value || '').match(/[A-Za-z]+/g) || [];
  }

  function normalizePlantCode(value) {
    const letters = String(value || '').replace(/[^A-Za-z]/g, '').slice(0, 3);
    if (!letters) return '';
    return `${(letters[0] || '').toUpperCase()}${(letters[1] || '').toUpperCase()}${(letters[2] || '').toLowerCase()}`;
  }

  function generatePlantCode(commonName, scientificName, fallback) {
    const common = plantWords(commonName);
    const scientific = plantWords(scientificName);
    const first = common[0]?.[0]?.toUpperCase();
    if (first && scientific.length >= 2) return `${first}${scientific[0][0].toUpperCase()}${scientific[1][0].toLowerCase()}`;
    if (first && scientific.length === 1) {
      const third = (common[1]?.[0] || common[0]?.[1] || 'x').toLowerCase();
      return `${first}${scientific[0][0].toUpperCase()}${third}`;
    }
    if (first) {
      const second = (common[1]?.[0] || common[0]?.[1] || 'X').toUpperCase();
      const third = (common[2]?.[0] || common[0]?.[2] || 'x').toLowerCase();
      return `${first}${second}${third}`;
    }
    return normalizePlantCode(fallback) || 'PLx';
  }

  function duplicateCodeGroups() {
    const groups = new Map();
    plants.forEach(plant => {
      const key = String(plant.code || '').toLowerCase();
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(plant);
    });
    return new Map([...groups].filter(([, records]) => records.length > 1));
  }

  function isDuplicateCode(code) {
    return (duplicateCodeGroups().get(String(code || '').toLowerCase()) || []).length > 1;
  }

  function duplicateCodeMatches(code, excludingId) {
    const key = String(code || '').toLowerCase();
    if (!key) return [];
    return plants.filter(plant => plant.id !== excludingId && String(plant.code || '').toLowerCase() === key);
  }

  function duplicateCodeTooltip(code, excludingId) {
    const matches = duplicateCodeMatches(code, excludingId);
    if (!matches.length) return '';
    return `Same code used by: ${matches.map(plant => {
      const scientific = String(plant.scientificName || plant.material || '').trim();
      return scientific ? `${plant.commonName} — ${scientific}` : plant.commonName;
    }).join('; ')}`;
  }

  function plantBadgeValues(plant) {
    const values = [plant.sun, plant.water, ...(plant.tags || [])]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    return [...new Set(values.map(value => value.toLowerCase()))]
      .map(key => values.find(value => value.toLowerCase() === key))
      .slice(0, 3);
  }

  function uniquePlantTags(values) {
    const seen = new Set();
    return values.map(value => String(value || '').trim()).filter(value => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function syncPlantCareTags(plant, previousCareTags) {
    const previous = new Set((previousCareTags || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
    const manual = (plant.tags || []).filter(tag => !previous.has(String(tag || '').trim().toLowerCase()));
    plant.tags = uniquePlantTags([plant.sun, plant.water, ...manual]);
    return plant.tags;
  }

  function setupAutomaticPlantTags(form, plant) {
    const tagsInput = form?.elements?.tags;
    const sunInput = form?.elements?.sun;
    const waterInput = form?.elements?.water;
    if (!tagsInput || !sunInput || !waterInput) return;

    let automaticTags = [plant?.sun, plant?.water].map(value => String(value || '').trim()).filter(Boolean);
    const sync = () => {
      const automaticKeys = new Set(automaticTags.map(value => value.toLowerCase()));
      const manualTags = String(tagsInput.value || '').split(/[,;]/).map(value => value.trim()).filter(value => value && !automaticKeys.has(value.toLowerCase()));
      automaticTags = [sunInput.value, waterInput.value].map(value => String(value || '').trim()).filter(Boolean);
      tagsInput.value = uniquePlantTags([...automaticTags, ...manualTags]).join(', ');
    };

    sunInput.addEventListener('input', sync);
    waterInput.addEventListener('input', sync);
    form.syncAutomaticTags = sync;
    sync();
  }

  function setPlantFieldError(form, fieldName, message) {
    const field = form.querySelector(`[data-plant-field="${fieldName}"]`);
    const input = field?.querySelector('input, select, textarea');
    const error = field?.querySelector('.form-error');
    const hasError = Boolean(message);
    field?.classList.toggle('has-error', hasError);
    input?.classList.toggle('input-error', hasError);
    if (input) input.setAttribute('aria-invalid', hasError ? 'true' : 'false');
    if (error) {
      error.textContent = message || '';
      error.classList.toggle('visible', hasError);
    }
  }

  function showPlantFormAlert(form, messages = []) {
    const alert = form.querySelector('#plantFormAlert');
    const text = form.querySelector('#plantFormAlertText');
    const unique = [...new Set(messages.filter(Boolean))];
    if (text) text.textContent = unique.join(' ');
    alert?.classList.toggle('visible', unique.length > 0);
  }

  function showPlantCodeError(form, message) {
    setPlantFieldError(form, 'code', message);
  }

  function validatePlantCode(form, excludingId, showAlert = false) {
    const input = form.querySelector('#plantCodeInput');
    if (!input) return true;
    const code = normalizePlantCode(input.value);
    input.value = code;
    let message = '';
    if (!code) message = 'Plant code is required.';
    else if (!/^[A-Z][A-Z][a-z]$/.test(code)) message = 'Use three letters: first two uppercase and the third lowercase.';
    else {
      const duplicates = duplicateCodeMatches(code, excludingId);
      if (duplicates.length) {
        message = `Duplicate code detected: ${code} is already used by ${duplicates.map(plant => plant.commonName).join(', ')}. Enter a unique code.`;
      }
    }
    showPlantCodeError(form, message);
    if (showAlert && message) showPlantFormAlert(form, [message]);
    return !message;
  }

  function validatePlantForm(form, excludingId, focusFirst = false) {
    const category = String(form.elements.category?.value || '').trim();
    const commonName = String(form.elements.commonName?.value || '').trim();
    const scientificName = String(form.elements.scientificName?.value || '').trim();
    const errors = [];

    const codeValid = validatePlantCode(form, excludingId, false);
    if (!codeValid) errors.push(form.querySelector('#plantCodeError')?.textContent || 'Check the plant code.');

    const requiredFields = [
      ['category', category, 'Select a category.'],
      ['commonName', commonName, 'Common name is required.'],
      ['scientificName', scientificName, 'Scientific name is required.']
    ];
    requiredFields.forEach(([name, value, message]) => {
      setPlantFieldError(form, name, value ? '' : message);
      if (!value) errors.push(message);
    });

    showPlantFormAlert(form, errors.length ? ['Complete all required fields and resolve any duplicate code before saving.'] : []);
    if (errors.length) {
      toast('Please correct the highlighted plant fields.', true);
      if (focusFirst) {
        const firstInvalid = form.querySelector('[aria-invalid="true"]');
        firstInvalid?.focus({ preventScroll: true });
        firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }
    return true;
  }

  function setupPlantCodeForm(form, plant) {
    const commonInput = form.querySelector('#plantCommonName');
    const scientificInput = form.querySelector('#plantScientificName');
    const categoryInput = form.querySelector('#plantCategory');
    const codeInput = form.querySelector('#plantCodeInput');
    let manual = Boolean(plant?.codeManual);
    const updateGenerated = () => {
      if (!manual) codeInput.value = generatePlantCode(commonInput.value, scientificInput.value, plant?.code);
      validatePlantCode(form, plant?.id);
    };
    commonInput.addEventListener('input', () => {
      if (commonInput.value.trim()) setPlantFieldError(form, 'commonName', '');
      updateGenerated();
      showPlantFormAlert(form, []);
    });
    scientificInput.addEventListener('input', () => {
      if (scientificInput.value.trim()) setPlantFieldError(form, 'scientificName', '');
      updateGenerated();
      showPlantFormAlert(form, []);
    });
    categoryInput.addEventListener('change', () => {
      if (categoryInput.value.trim()) setPlantFieldError(form, 'category', '');
      showPlantFormAlert(form, []);
    });
    codeInput.addEventListener('input', () => {
      manual = Boolean(codeInput.value.trim());
      validatePlantCode(form, plant?.id);
      showPlantFormAlert(form, []);
    });
    codeInput.addEventListener('blur', () => validatePlantCode(form, plant?.id));
    updateGenerated();
  }

  function syncProjectPlantCodes() {
    projects = (Array.isArray(projects) ? projects : []).map(project => ({
      ...project,
      items: (Array.isArray(project.items) ? project.items : []).map(item => {
        const plant = plants.find(record => record.id === item.plantId);
        return plant ? {
          ...item,
          plantCode: plant.code,
          commonName: plant.commonName,
          scientificName: plant.scientificName,
          category: plant.category
        } : item;
      })
    }));
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 900;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', .78));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function openProjectForm(id) {
    const project = id ? getProject(id) : null;
    const body = `<form id="projectForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHTML(project?.id || '')}">
      <div class="form-field full"><label>Project name *</label><input class="text-input" required name="name" value="${escapeHTML(project?.name || '')}" placeholder="e.g. Project M – Main Entrance"></div>
      <div class="form-field"><label>Location</label><input class="text-input" name="location" value="${escapeHTML(project?.location || '')}" placeholder="Palawan, Philippines"></div>
      <div class="form-field"><label>Client</label><input class="text-input" name="client" value="${escapeHTML(project?.client || '')}"></div>
      <div class="form-field"><label>Area size (sqm)</label><input class="text-input" type="number" min="0" step="0.01" name="areaSize" value="${escapeHTML(project?.areaSize || '')}" placeholder="e.g. 850"></div>
      <div class="form-field"><label>Project type</label><input class="text-input" name="projectType" value="${escapeHTML(project?.projectType || '')}" placeholder="e.g. Residential, resort, commercial"></div>
      <div class="form-field"><label>Project start date</label><input class="text-input" type="date" name="startDate" value="${escapeHTML(project?.startDate || '')}"></div>
      <div class="form-field"><label>Project deadline</label><input class="text-input" type="date" name="deadline" value="${escapeHTML(project?.deadline || '')}"></div>
      <div class="form-field"><label>Design cost</label><input class="text-input" type="number" min="0" step="0.01" name="designCost" value="${escapeHTML(project?.designCost || '')}" placeholder="PHP"></div>
      <div class="form-field"><label>Landscaping cost</label><input class="text-input" type="number" min="0" step="0.01" name="landscapingCost" value="${escapeHTML(project?.landscapingCost || '')}" placeholder="PHP"></div>
      <div class="form-field full"><label>Site conditions</label><textarea name="siteConditions" placeholder="Coastal site, full sun, sandy and well-drained soil">${escapeHTML(project?.siteConditions || '')}</textarea></div>
      <div class="form-field full"><label>Project notes</label><textarea name="notes">${escapeHTML(project?.notes || '')}</textarea></div>
    </form>`;
    openModal(project ? 'Edit project' : 'New project list', 'Store project details, costs, site conditions, and plants for one landscape project or sector.', body,
      `<button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" type="submit" form="projectForm">${project ? 'Save changes' : 'Create project'}</button>`, true);
    document.getElementById('projectForm').addEventListener('submit', saveProjectForm);
  }

  function saveProjectForm(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const existing = fd.get('id') ? getProject(fd.get('id')) : null;
    const now = new Date().toISOString();
    const project = {
      ...(existing || {}),
      id: existing?.id || uid('project'),
      name: String(fd.get('name') || '').trim(),
      location: String(fd.get('location') || '').trim(),
      client: String(fd.get('client') || '').trim(),
      areaSize: String(fd.get('areaSize') || '').trim(),
      projectType: String(fd.get('projectType') || '').trim(),
      startDate: String(fd.get('startDate') || '').trim(),
      deadline: String(fd.get('deadline') || '').trim(),
      designCost: String(fd.get('designCost') || '').trim(),
      landscapingCost: String(fd.get('landscapingCost') || '').trim(),
      siteConditions: String(fd.get('siteConditions') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
      items: existing?.items || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    if (existing) projects = projects.map(p => p.id === existing.id ? project : p);
    else projects.unshift(project);
    state.selectedProjectId = project.id;
    state.scheduleProjectId = project.id;
    saveAll();
    closeModal();
    setView('projects');
    toast(existing ? 'Project updated.' : 'Project list created.');
  }

  function filteredProjectPlants(searchValue, categoryValue) {
    const query = String(searchValue || '').trim().toLowerCase();
    const category = String(categoryValue || 'All');
    return plants.filter(plant => {
      if (category !== 'All' && plant.category !== category) return false;
      if (!query) return true;
      return [plant.code, plant.commonName, plant.scientificName, plant.category, ...(plant.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  function projectPlantOptionHTML(plant, selectedId) {
    const label = [plant.code, plant.commonName].filter(Boolean).join(' — ');
    const category = plant.category ? ` · ${plant.category}` : '';
    return `<option value="${escapeHTML(plant.id)}"${plant.id === selectedId ? ' selected' : ''}>${escapeHTML(label || 'Unnamed plant')}${escapeHTML(category)}</option>`;
  }

  function projectSizeReferencePrice(size) {
    const raw = size?.price ?? size?.unitPrice ?? '';
    const value = Number(String(raw).replace(/,/g, '').trim());
    return Number.isFinite(value) && value > 0 ? value : '';
  }

  function openAddToProject(options) {
    options = options || {};
    if (!projects.length) {
      toast('Create a project list first.');
      openProjectForm();
      return;
    }
    const project = options.projectId ? getProject(options.projectId) : null;
    const editingItem = project && options.itemId ? (project.items || []).find(i => i.id === options.itemId) : null;
    const selectedPlantId = options.plantId || editingItem?.plantId || plants[0]?.id;
    const selectedPlant = getPlant(selectedPlantId) || plants[0];
    const sizeOptions = selectedPlant?.sizes?.length ? selectedPlant.sizes : [{label:'Unspecified', unit:'pc/s'}];
    const selectedSizeIndex = editingItem ? Math.max(0, sizeOptions.findIndex(s => (s.label || s.size) === editingItem.sizeLabel)) : 0;
    const selectedSize = sizeOptions[selectedSizeIndex] || sizeOptions[0] || {};
    const initialReferencePrice = editingItem?.referencePrice ?? projectSizeReferencePrice(selectedSize);
    const plantCategories = [...new Set(plants.map(plant => String(plant.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const body = `<form id="addToProjectForm" class="form-grid">
      <input type="hidden" name="itemId" value="${escapeHTML(editingItem?.id || '')}">
      <div class="form-field full"><label>Project list *</label><select class="select-input" name="projectId" id="addProjectSelect" ${project ? 'disabled' : ''}>${projects.map(p => `<option value="${escapeHTML(p.id)}"${p.id === (project?.id || options.projectId) ? ' selected' : ''}>${escapeHTML(p.name)}</option>`).join('')}</select>${project ? `<input type="hidden" name="projectIdHidden" value="${escapeHTML(project.id)}">` : ''}</div>
      <div class="form-field full"><label for="addPlantSearch">Search plants</label><input class="text-input" type="search" id="addPlantSearch" placeholder="Search code, common name, scientific name, or category" autocomplete="off"><span class="form-help">The plant list updates while you type.</span></div>
      <div class="form-field"><label for="addPlantCategoryFilter">Plant category</label><select class="select-input" id="addPlantCategoryFilter"><option value="All">All categories</option>${plantCategories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('')}</select></div>
      <div class="form-field"><label for="addPlantSelect">Plant * <span id="addPlantResultCount" class="form-help" role="status" aria-live="polite">${plants.length} available</span></label><select class="select-input" name="plantId" id="addPlantSelect">${plants.map(plant => projectPlantOptionHTML(plant, selectedPlant?.id)).join('')}</select></div>
      <div class="form-field"><label>Available size</label><select class="select-input" name="sizeIndex" id="addSizeSelect">${sizeOptions.map((s,i) => sizeOptionHTML(s, i, i === selectedSizeIndex)).join('')}</select></div>
      <div class="form-field"><label>Quantity *</label><input class="number-input" required min="0.01" step="0.01" type="number" name="quantity" value="${editingItem?.quantity ?? 1}"></div>
      <div class="form-field"><label>Planting zone / sector</label><input class="text-input" name="zone" value="${escapeHTML(editingItem?.zone || '')}" placeholder="e.g. Main Entrance"></div>
      <div class="form-field"><label>Spacing</label><input class="text-input" name="spacing" id="addSpacing" value="${escapeHTML(editingItem?.spacing || selectedPlant?.spacing || '')}" placeholder="e.g. 1.5 m O.C."></div>
      <div class="form-field full"><label>BOQ reference material price (PHP / unit)</label><input class="number-input" min="0" step="0.01" type="number" name="referencePrice" id="addReferencePrice" value="${escapeHTML(initialReferencePrice)}" placeholder="0.00"><span class="form-help">This becomes the starting material unit cost when a BOQ is created or reset from the Project List. It can still be edited inside the BOQ.</span></div>
      <div class="form-field full"><label>Project planting notes</label><textarea name="notes" id="addProjectPlantNotes" placeholder="Project-specific planting instruction">${escapeHTML(editingItem?.notes || selectedPlant?.plantingNotes || '')}</textarea></div>
    </form>`;
    openModal(editingItem ? 'Edit project plant' : 'Add plant to project', selectedPlant ? `${selectedPlant.commonName} · ${selectedPlant.scientificName || selectedPlant.category}` : '', body,
      `<button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" type="submit" form="addToProjectForm">${editingItem ? 'Save changes' : 'Add to project'}</button>`, true);
    const form = document.getElementById('addToProjectForm');
    form.addEventListener('submit', saveProjectItem);
    document.getElementById('addPlantSearch').addEventListener('input', refreshAddPlantPicker);
    document.getElementById('addPlantCategoryFilter').addEventListener('change', refreshAddPlantPicker);
    document.getElementById('addPlantSelect').addEventListener('change', () => refreshAddPlantSizes(true));
    document.getElementById('addSizeSelect').addEventListener('change', refreshAddReferencePriceFromSize);
    requestAnimationFrame(() => document.getElementById('addPlantSearch')?.focus({ preventScroll: true }));
  }

  function sizeOptionHTML(size, index, selected) {
    const label = size.label || size.size || 'Unspecified';
    return `<option value="${index}"${selected ? ' selected' : ''}>${escapeHTML(label)}</option>`;
  }

  function refreshAddPlantPicker() {
    const searchInput = document.getElementById('addPlantSearch');
    const categoryInput = document.getElementById('addPlantCategoryFilter');
    const plantSelect = document.getElementById('addPlantSelect');
    const countNode = document.getElementById('addPlantResultCount');
    if (!searchInput || !categoryInput || !plantSelect) return;

    const previousPlantId = plantSelect.value;
    const results = filteredProjectPlants(searchInput.value, categoryInput.value);
    plantSelect.innerHTML = results.map(plant => projectPlantOptionHTML(plant, previousPlantId)).join('');
    plantSelect.disabled = results.length === 0;
    if (countNode) countNode.textContent = `${results.length} available`;

    if (!results.length) {
      const sizeSelect = document.getElementById('addSizeSelect');
      if (sizeSelect) { sizeSelect.innerHTML = ''; sizeSelect.disabled = true; }
      const spacing = document.getElementById('addSpacing');
      const price = document.getElementById('addReferencePrice');
      if (spacing) spacing.value = '';
      if (price) price.value = '';
      return;
    }

    const nextPlantId = results.some(plant => plant.id === previousPlantId) ? previousPlantId : results[0].id;
    plantSelect.value = nextPlantId;
    if (nextPlantId !== previousPlantId) refreshAddPlantSizes(true);
  }

  function refreshAddPlantSizes(resetReferencePrice = false) {
    const plantSelect = document.getElementById('addPlantSelect');
    const plant = getPlant(plantSelect?.value);
    const sizes = plant?.sizes?.length ? plant.sizes : [{label:'Unspecified', unit:'pc/s'}];
    const select = document.getElementById('addSizeSelect');
    if (!select) return;
    select.disabled = false;
    select.innerHTML = sizes.map((s,i) => sizeOptionHTML(s, i, i === 0)).join('');
    const spacing = document.getElementById('addSpacing');
    const notes = document.getElementById('addProjectPlantNotes');
    if (spacing) spacing.value = plant?.spacing || '';
    if (notes) notes.value = plant?.plantingNotes || '';
    if (resetReferencePrice) {
      const price = document.getElementById('addReferencePrice');
      if (price) price.value = projectSizeReferencePrice(sizes[0]);
    }
  }

  function refreshAddReferencePriceFromSize() {
    const plant = getPlant(document.getElementById('addPlantSelect')?.value);
    const sizes = plant?.sizes?.length ? plant.sizes : [{label:'Unspecified', unit:'pc/s'}];
    const sizeIndex = Number(document.getElementById('addSizeSelect')?.value || 0);
    const suggestedPrice = projectSizeReferencePrice(sizes[sizeIndex] || sizes[0]);
    if (suggestedPrice === '') return;
    const input = document.getElementById('addReferencePrice');
    if (input) input.value = suggestedPrice;
  }

  function saveProjectItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const projectId = String(fd.get('projectIdHidden') || fd.get('projectId') || '');
    const project = getProject(projectId);
    const plant = getPlant(String(fd.get('plantId') || ''));
    if (!project || !plant) return;
    const sizes = plant.sizes?.length ? plant.sizes : [{label:'Unspecified', unit:'pc/s'}];
    const size = sizes[Number(fd.get('sizeIndex') || 0)] || sizes[0];
    const itemId = String(fd.get('itemId') || '');
    const existing = itemId ? (project.items || []).find(i => i.id === itemId) : null;
    const item = {
      ...(existing || {}),
      id: existing?.id || uid('item'),
      plantId: plant.id,
      plantCode: plant.code,
      commonName: plant.commonName,
      scientificName: plant.scientificName,
      category: plant.category,
      sizeLabel: size.label || size.size || 'Unspecified',
      unit: size.unit || 'pc/s',
      quantity: Number(fd.get('quantity') || 0),
      zone: String(fd.get('zone') || '').trim(),
      spacing: String(fd.get('spacing') || '').trim(),
      referencePrice: Math.max(0, Number(fd.get('referencePrice') || 0)),
      notes: String(fd.get('notes') || '').trim(),
      updatedAt: new Date().toISOString()
    };
    project.items = project.items || [];
    if (existing) project.items = project.items.map(i => i.id === existing.id ? item : i);
    else project.items.push(item);
    project.updatedAt = new Date().toISOString();
    state.selectedProjectId = project.id;
    state.scheduleProjectId = project.id;
    saveAll();
    closeModal();
    if (state.view === 'projects') render();
    toast(existing ? 'Project plant updated.' : 'Plant added to project list.');
  }

  function exportCSV(projectId) {
    const project = getProject(projectId);
    if (!project) return;
    const headers = ['Code','Common Name','Scientific Name','Category','Size','Quantity','Unit','Zone/Sector','Spacing','BOQ Reference Price','Planting Notes'];
    const rows = (project.items || []).map(item => {
      const plant = getPlant(item.plantId) || {};
      return [plant.code || item.plantCode, plant.commonName || item.commonName, plant.scientificName || item.scientificName, plant.category || '', item.sizeLabel, item.quantity, item.unit, item.zone, item.spacing, item.referencePrice || 0, item.notes || plant.plantingNotes || ''];
    });
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    downloadBlob(`\ufeff${csv}`, `${slug(project.name)}-plant-schedule.csv`, 'text/csv;charset=utf-8');
    toast('Plant schedule exported as CSV.');
  }

  function csvCell(value) {
    const text = String(value ?? '');
    const safeText = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  }

  function downloadBlob(contentValue, filename, type) {
    const blob = new Blob([contentValue], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    const backup = { version: 3, app: 'Greenscape Plant Library', exportedAt: new Date().toISOString(), plants, projects, categories: customCategories, moodboard };
    downloadBlob(JSON.stringify(backup, null, 2), `greenscape-plant-library-backup-${new Date().toISOString().slice(0,10)}.json`, 'application/json');
    toast('Backup exported.');
  }

  async function restoreBackup(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.plants) || !Array.isArray(parsed.projects)) throw new Error('Invalid backup');
      plants = sanitizePlants(parsed.plants);
      projects = sanitizeProjects(parsed.projects);
      customCategories = sanitizeCategories(parsed.categories || []);
      moodboard = sanitizeMoodboard(parsed.moodboard || null);
      syncProjectPlantCodes();
      state.selectedProjectId = null;
      state.scheduleProjectId = projects[0]?.id || null;
      saveAll();
      render();
      toast('Backup restored.');
    } catch (error) {
      toast('This is not a valid Greenscape Plant Library backup.', true);
    }
  }

  document.addEventListener('click', event => {
    if (event.target.classList.contains('modal-backdrop')) {
      if (pendingSheetEdit) cancelPendingSheetEdit();
      else closeModal();
      return;
    }

    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      state.selectedProjectId = null;
      setView(viewButton.dataset.view);
      return;
    }
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'close-modal') { if (pendingSheetEdit) cancelPendingSheetEdit(); else closeModal(); }
    if (action === 'sheet-confirm-edit') confirmPendingSheetEdit();
    if (action === 'sheet-cancel-edit') cancelPendingSheetEdit();
    if (action === 'new-plant') openPlantForm(null, target.dataset.category || (state.view === 'sheet' && state.sheetCategory !== 'All' ? state.sheetCategory : ''));
    if (action === 'new-category') openCategoryForm();
    if (action === 'delete-category') {
      event.preventDefault();
      event.stopPropagation();
      openDeleteCategoryDialog(target.dataset.category);
    }
    if (action === 'export-excel') exportPlantExcel();
    if (action === 'import-excel') document.getElementById('plantExcelInput')?.click();
    if (action === 'moodboard-toggle-plant') toggleMoodboardPlant(target.dataset.plantId);
    if (action === 'moodboard-remove-plant') toggleMoodboardPlant(target.dataset.plantId, false);
    if (action === 'moodboard-add-visible') {
      filteredMoodboardPlants().forEach(plant => {
        if (!moodboard.selectedIds.includes(plant.id)) moodboard.selectedIds.push(plant.id);
      });
      saveAll(); updateMoodboardPicker(); updateMoodboardPreview(); toast('Visible plants added to the mood board.');
    }
    if (action === 'moodboard-clear' && moodboard.selectedIds.length && confirm('Remove all plants from this mood board?')) {
      moodboard.selectedIds = []; saveAll(); updateMoodboardPicker(); updateMoodboardPreview(); toast('Mood board cleared.');
    }
    if (action === 'moodboard-load-project') loadProjectIntoMoodboard();
    if (action === 'moodboard-export-png') exportMoodboardPNG();
    if (action === 'moodboard-print') printMoodboard();
    if (action === 'moodboard-zoom-in') {
      event.preventDefault();
      event.stopPropagation();
      changeMoodboardPageZoom(target, 0.1);
    }
    if (action === 'moodboard-zoom-out') {
      event.preventDefault();
      event.stopPropagation();
      changeMoodboardPageZoom(target, -0.1);
    }
    if (action === 'moodboard-zoom-reset') {
      event.preventDefault();
      event.stopPropagation();
      changeMoodboardPageZoom(target, 0);
    }
    if (action === 'moodboard-fullscreen') {
      if (event.target.closest('[data-action="moodboard-remove-plant"]')) return;
      const page = target.closest('.moodboard-page-preview');
      if (!page) return;
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else if (page.requestFullscreen) {
        page.requestFullscreen().catch(() => toast('Full-screen view is not available in this browser.', true));
      } else {
        toast('Full-screen view is not available in this browser.', true);
      }
    }
    if (action === 'edit-plant') openPlantForm(target.dataset.plantId);
    if (action === 'plant-detail') openPlantDetail(target.dataset.plantId);
    if (action === 'new-project') openProjectForm();
    if (action === 'edit-project') openProjectForm(target.dataset.projectId);
    if (action === 'open-project') { state.selectedProjectId = target.dataset.projectId; setView('projects'); }
    if (action === 'back-projects') { state.selectedProjectId = null; render(); }
    if (action === 'project-schedule') { state.scheduleProjectId = target.dataset.projectId; state.selectedProjectId = null; setView('schedule'); }
    if (action === 'add-to-project') openAddToProject({ plantId: target.dataset.plantId, projectId: target.dataset.projectId });
    if (action === 'edit-project-item') openAddToProject({ projectId: target.dataset.projectId, itemId: target.dataset.itemId });
    if (action === 'add-size-row') document.getElementById('sizeEditor').insertAdjacentHTML('beforeend', sizeRow({}));
    if (action === 'remove-size') target.closest('.size-row')?.remove();
    if (action === 'load-more') { state.libraryLimit += 48; updateLibraryResults(); }
    if (action === 'clear-filter') { state.librarySearch = ''; state.libraryCategory = 'All'; state.libraryLimit = 48; renderLibrary(); }
    if (action === 'clear-sheet-filter') { state.sheetSearch = ''; state.sheetCategory = 'All'; renderPlantSheet(); }
    if (action === 'filter-category') { state.libraryCategory = target.dataset.category; state.librarySearch = ''; state.libraryLimit = 48; setView('library'); }
    if (action === 'export-csv') exportCSV(target.dataset.projectId);
    if (action === 'print-schedule') window.print();

    if (action === 'remove-project-item') {
      const project = getProject(target.dataset.projectId);
      if (project && confirm('Remove this plant from the project list?')) {
        project.items = (project.items || []).filter(i => i.id !== target.dataset.itemId);
        project.updatedAt = new Date().toISOString();
        saveAll(); render(); toast('Plant removed from project list.');
      }
    }
    if (action === 'delete-project') {
      const project = getProject(target.dataset.projectId);
      if (project && confirm(`Delete “${project.name}” and its plant list?`)) {
        projects = projects.filter(p => p.id !== project.id);
        state.selectedProjectId = null;
        state.scheduleProjectId = projects[0]?.id || null;
        saveAll(); render(); toast('Project deleted.');
      }
    }
    if (action === 'sheet-delete-plant') {
      const plant = getPlant(target.dataset.plantId);
      if (plant && confirm(`Delete “${plant.commonName}” from the plant library?`)) {
        plants = plants.filter(record => record.id !== plant.id);
        moodboard.selectedIds = moodboard.selectedIds.filter(id => id !== plant.id);
        saveAll(); renderPlantSheet(); toast('Plant deleted.');
      }
    }

  });


  let draggedMoodboardPlantId = '';
  document.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-moodboard-card]');
    if (!card) return;
    draggedMoodboardPlantId = card.dataset.moodboardCard || '';
    card.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedMoodboardPlantId);
    }
  });

  document.addEventListener('dragover', event => {
    if (event.target.closest('[data-moodboard-card]')) event.preventDefault();
  });

  document.addEventListener('drop', event => {
    const targetCard = event.target.closest('[data-moodboard-card]');
    if (!targetCard) return;
    event.preventDefault();
    const sourceId = draggedMoodboardPlantId || event.dataTransfer?.getData('text/plain');
    reorderMoodboardPlant(sourceId, targetCard.dataset.moodboardCard);
  });

  document.addEventListener('dragend', event => {
    event.target.closest('[data-moodboard-card]')?.classList.remove('dragging');
    draggedMoodboardPlantId = '';
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalRoot.innerHTML) { if (pendingSheetEdit) cancelPendingSheetEdit(); else closeModal(); }
    if (event.key === 'Tab' && modalRoot.innerHTML) {
      const dialog = modalRoot.querySelector('.modal');
      const focusable = Array.from(dialog?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
        .filter(element => !element.hidden && element.getClientRects().length);
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
      } else {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.moodboard-page-preview')) {
      event.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen?.();
      else event.target.requestFullscreen?.().catch(() => toast('Full-screen view is not available in this browser.', true));
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'librarySearch') {
      state.librarySearch = event.target.value;
      state.libraryLimit = 48;
      updateLibraryResults();
    }
    if (event.target.id === 'sheetSearch') {
      state.sheetSearch = event.target.value;
      renderPlantSheet();
      const search = document.getElementById('sheetSearch');
      if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    }
    if (event.target.id === 'moodboardSearch') {
      state.moodboardSearch = event.target.value;
      updateMoodboardPicker();
    }
    if (event.target.matches('[data-moodboard-setting]') && !['checkbox', 'select-one'].includes(event.target.type)) {
      updateMoodboardSetting(event.target);
    }
  });

  document.addEventListener('change', async event => {
    if (event.target.id === 'plantExcelInput') {
      const file = event.target.files && event.target.files[0];
      if (file) await importPlantExcel(file);
      event.target.value = '';
      return;
    }
    if (event.target.matches('[data-sheet-field]')) {
      requestSheetFieldConfirmation(event.target);
    }
    if (event.target.matches('[data-sheet-image]')) {
      const file = event.target.files && event.target.files[0];
      if (file) await requestSheetImageConfirmation(event.target, file);
      else event.target.value = '';
    }
    if (event.target.id === 'categoryFilter') {
      state.libraryCategory = event.target.value;
      state.libraryLimit = 48;
      updateLibraryResults();
    }
    if (event.target.id === 'sheetCategoryFilter') {
      state.sheetCategory = event.target.value;
      renderPlantSheet();
    }
    if (event.target.id === 'moodboardCategoryFilter') {
      state.moodboardCategory = event.target.value;
      updateMoodboardPicker();
    }
    if (event.target.matches('[data-moodboard-setting]')) {
      updateMoodboardSetting(event.target);
    }
    if (event.target.id === 'scheduleProjectSelect') {
      state.scheduleProjectId = event.target.value;
      renderSchedule();
    }
  });

  document.getElementById('quickPlantBtn')?.addEventListener('click', () => openPlantForm());
  document.getElementById('quickProjectBtn')?.addEventListener('click', () => openProjectForm());
  window.addEventListener('beforeunload', event => {
    flushMoodboardSave();
    if (!pendingSheetEdit) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('hashchange', () => {
    const view = location.hash.slice(1);
    if (titleByView[view] && state.view !== view) {
      state.view = view;
      render(true);
    }
  });

  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
  render();
})();


(() => {
  const widget = document.getElementById('feedbackWidget');
  const toggle = document.getElementById('feedbackToggle');
  const panel = document.getElementById('feedbackPanel');
  const closeButton = document.getElementById('feedbackClose');
  const cancelButton = document.getElementById('feedbackCancel');
  const form = document.getElementById('feedbackForm');
  const messageInput = document.getElementById('feedbackMessage');

  if (!widget || !toggle || !panel || !form) return;

  function openFeedback() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => messageInput?.focus(), 40);
  }

  function closeFeedback() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) openFeedback();
    else closeFeedback();
  });
  closeButton?.addEventListener('click', closeFeedback);
  cancelButton?.addEventListener('click', closeFeedback);

  document.addEventListener('click', event => {
    if (!panel.hidden && !widget.contains(event.target)) closeFeedback();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) closeFeedback();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const message = messageInput?.value.trim() || '';
    const pageTitle = document.getElementById('pageTitle')?.textContent?.trim() || 'Unknown page';
    const pageUrl = window.location.href;
    const browser = navigator.userAgent;

    const subject = `[Greenscape Beta] Website feedback — ${pageTitle}`;
    const body = [
      'GREENSCAPE PLANT LIBRARY FEEDBACK',
      '',
      `Page: ${pageTitle}`,
      `URL: ${pageUrl}`,
      '',
      'MESSAGE',
      message,
      '',
      'TECHNICAL DETAILS',
      browser
    ].join('\n');

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent('nyxdcz@gmail.com')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailtoUrl = `mailto:nyxdcz@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    const gmailWindow = window.open(gmailUrl, '_blank');
    if (!gmailWindow) window.location.href = mailtoUrl;

    closeFeedback();
  });
})();

/* Consolidated page enhancements. */

/* Migrated index script block 2. */
/* Apple-style interactive Liquid Glass controller.
       Delegated events also cover buttons rendered later by app.js. */
    (() => {
      const selector = [
        '.button',
        '.icon-button',
        '.feedback-launcher',
        '.feedback-close',
        '.sheet-category-delete',
        '.moodboard-zoom-controls button',
        'button[data-action]:not(.plant-image):not([style*="background:transparent"]):not([style*="background: transparent"])'
      ].join(',');

      const animationFrames = new WeakMap();

      function glassButtonFrom(target) {
        if (!(target instanceof Element)) return null;
        const button = target.closest(selector);
        if (!button || button.disabled) return null;
        return button;
      }

      function updateOptics(button, clientX, clientY) {
        const previousFrame = animationFrames.get(button);
        if (previousFrame) cancelAnimationFrame(previousFrame);

        const frame = requestAnimationFrame(() => {
          const rect = button.getBoundingClientRect();
          if (!rect.width || !rect.height) return;

          const localX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
          const localY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
          const xPercent = localX * 100;
          const yPercent = localY * 100;
          const tiltX = (localX - .5) * 2.2;
          const tiltY = (.5 - localY) * 1.8;

          button.style.setProperty('--glass-x', `${xPercent.toFixed(1)}%`);
          button.style.setProperty('--glass-y', `${yPercent.toFixed(1)}%`);
          button.style.setProperty('--glass-tilt-x', `${tiltX.toFixed(2)}deg`);
          button.style.setProperty('--glass-tilt-y', `${tiltY.toFixed(2)}deg`);
          animationFrames.delete(button);
        });

        animationFrames.set(button, frame);
      }

      function resetOptics(button) {
        button.style.setProperty('--glass-x', '50%');
        button.style.setProperty('--glass-y', '18%');
        button.style.setProperty('--glass-tilt-x', '0deg');
        button.style.setProperty('--glass-tilt-y', '0deg');
      }

      document.addEventListener('pointerover', event => {
        const button = glassButtonFrom(event.target);
        if (!button || button.contains(event.relatedTarget)) return;
        button.classList.add('is-glass-hovered');
        updateOptics(button, event.clientX, event.clientY);
      }, { passive: true });

      document.addEventListener('pointermove', event => {
        const button = glassButtonFrom(event.target);
        if (!button || event.pointerType === 'touch') return;
        updateOptics(button, event.clientX, event.clientY);
      }, { passive: true });

      document.addEventListener('pointerout', event => {
        const button = glassButtonFrom(event.target);
        if (!button || button.contains(event.relatedTarget)) return;
        button.classList.remove('is-glass-hovered');
        resetOptics(button);
      }, { passive: true });

      document.addEventListener('pointerdown', event => {
        const button = glassButtonFrom(event.target);
        if (!button) return;
        updateOptics(button, event.clientX, event.clientY);
        button.classList.add('is-glass-pressed');
      }, { passive: true });

      const release = event => {
        const pressedButtons = document.querySelectorAll('.is-glass-pressed');
        pressedButtons.forEach(button => {
          button.classList.remove('is-glass-pressed');
          if (event.pointerType === 'touch') resetOptics(button);
        });
      };

      document.addEventListener('pointerup', release, { passive: true });
      document.addEventListener('pointercancel', release, { passive: true });
      window.addEventListener('blur', () => {
        document.querySelectorAll('.is-glass-hovered, .is-glass-pressed').forEach(button => {
          button.classList.remove('is-glass-hovered', 'is-glass-pressed');
          resetOptics(button);
        });
      });
    })();

/* Migrated index script block 3. */
/* Add a stronger glass state only when the Plant List Editor toolbar is actually stuck. */
    (() => {
      const root = document.documentElement;
      const content = document.getElementById('pageContent');
      let frame = 0;

      const update = () => {
        frame = 0;
        const toolbar = document.querySelector('.sheet-toolbar');
        if (!toolbar) return;

        const rawOffset = getComputedStyle(root).getPropertyValue('--sheet-sticky-top');
        const stickyTop = Number.parseFloat(rawOffset) || 0;
        const stuck = window.scrollY > 4 && toolbar.getBoundingClientRect().top <= stickyTop + 1;
        toolbar.classList.toggle('is-stuck', stuck);
      };

      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(update);
      };

      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      window.addEventListener('hashchange', schedule, { passive: true });

      if (content && 'MutationObserver' in window) {
        const observer = new MutationObserver(schedule);
        observer.observe(content, { childList: true, subtree: true });
      }

      schedule();
    })();

/* Migrated index script block 4. */
/* Keep the sticky Plant Library and Plant List Editor toolbars below the real header height. */
    (() => {
      const root = document.documentElement;
      const header = document.querySelector('.topbar');
      if (!header) return;

      const updateStickyOffsets = () => {
        if (window.matchMedia('(max-width: 760px)').matches) {
          root.style.setProperty('--library-sticky-top', '46px');
          root.style.setProperty('--sheet-sticky-top', '46px');
          return;
        }
        const headerHeight = Math.ceil(header.getBoundingClientRect().height);
        const offset = `${headerHeight + 8}px`;
        root.style.setProperty('--library-sticky-top', offset);
        root.style.setProperty('--sheet-sticky-top', offset);
      };

      updateStickyOffsets();
      window.addEventListener('resize', updateStickyOffsets, { passive: true });
      window.addEventListener('load', updateStickyOffsets, { once: true });

      if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(updateStickyOffsets);
        observer.observe(header);
      }
    })();

/* Migrated index script block 5. */
(() => {
      const content = document.getElementById('pageContent');
      let bypassAddVisible = false;
      let bypassClearBoard = false;
      let activeSourceButton = null;

      const escapeText = value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      function ensureDialog() {
        let backdrop = document.getElementById('moodboardActionBackdrop');
        if (backdrop) return backdrop;

        backdrop = document.createElement('div');
        backdrop.id = 'moodboardActionBackdrop';
        backdrop.className = 'moodboard-action-backdrop';
        backdrop.hidden = true;
        backdrop.innerHTML = '<section class="moodboard-action-dialog" role="dialog" aria-modal="true" aria-labelledby="moodboardActionTitle" tabindex="-1"><div id="moodboardActionContent"></div></section>';
        document.body.appendChild(backdrop);
        return backdrop;
      }

      function closeDialog() {
        const backdrop = ensureDialog();
        const returnTarget = activeSourceButton;
        backdrop.hidden = true;
        activeSourceButton = null;
        if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
      }

      function openAddDialog(button) {
        activeSourceButton = button;
        const select = document.getElementById('moodboardCategoryFilter');
        const categories = select
          ? Array.from(select.options).map(option => option.value).filter(value => value && value !== 'All')
          : [];
        const backdrop = ensureDialog();
        const contentRoot = document.getElementById('moodboardActionContent');
        contentRoot.innerHTML = `
          <header class="moodboard-action-header">
            <div><strong id="moodboardActionTitle">Add plants to mood board</strong><span>Add the complete library or choose one plant category.</span></div>
            <button type="button" class="moodboard-action-close" data-moodboard-dialog-close aria-label="Close">×</button>
          </header>
          <div class="moodboard-action-body">
            <button type="button" class="button primary moodboard-add-all" data-moodboard-add-category="All">Add all plants</button>
            <span class="moodboard-category-choice-label">Add one category</span>
            <div class="moodboard-category-choice-grid">
              ${categories.map(category => `<button type="button" class="button secondary moodboard-category-choice" data-moodboard-add-category="${escapeText(category)}">${escapeText(category)}</button>`).join('')}
            </div>
          </div>`;
        backdrop.hidden = false;
        contentRoot.querySelector('[data-moodboard-add-category]')?.focus();
      }

      function openClearDialog(button) {
        const countText = document.getElementById('moodboardSelectedCount')?.textContent || '0 selected';
        const count = Number.parseInt(countText, 10) || 0;
        if (!count) return;

        activeSourceButton = button;
        const backdrop = ensureDialog();
        const contentRoot = document.getElementById('moodboardActionContent');
        contentRoot.innerHTML = `
          <header class="moodboard-action-header">
            <div><strong id="moodboardActionTitle">Clear the mood board?</strong><span>This action removes every selected plant from the board.</span></div>
            <button type="button" class="moodboard-action-close" data-moodboard-dialog-close aria-label="Close">×</button>
          </header>
          <div class="moodboard-action-body">
            <div class="moodboard-clear-warning">
              <div class="moodboard-clear-warning-icon">!</div>
              <div><strong>${count} selected ${count === 1 ? 'plant' : 'plants'} will be removed.</strong><p>This cannot be undone automatically. Choose Cancel to keep the current mood board.</p></div>
            </div>
            <div class="moodboard-action-footer">
              <button type="button" class="button secondary" data-moodboard-dialog-close>Cancel</button>
              <button type="button" class="button danger" data-moodboard-confirm-clear>Clear board</button>
            </div>
          </div>`;
        backdrop.hidden = false;
        contentRoot.querySelector('[data-moodboard-dialog-close]')?.focus();
      }

      function dispatchValue(element, value, eventName) {
        if (!element) return;
        element.value = value;
        element.dispatchEvent(new Event(eventName, { bubbles: true }));
      }

      function addCategoryToBoard(category) {
        const button = activeSourceButton || document.querySelector('[data-action="moodboard-add-visible"]');
        const categorySelect = document.getElementById('moodboardCategoryFilter');
        const searchInput = document.getElementById('moodboardSearch');
        if (!button || !categorySelect || !searchInput) return closeDialog();

        const previousCategory = categorySelect.value;
        const previousSearch = searchInput.value;

        dispatchValue(searchInput, '', 'input');
        dispatchValue(categorySelect, category, 'change');

        bypassAddVisible = true;
        button.click();
        bypassAddVisible = false;

        dispatchValue(categorySelect, previousCategory, 'change');
        dispatchValue(searchInput, previousSearch, 'input');
        closeDialog();
        requestAnimationFrame(syncMoodboardUI);
      }

      function confirmClearBoard() {
        const button = activeSourceButton || document.querySelector('[data-action="moodboard-clear"]');
        if (!button) return closeDialog();

        const originalConfirm = window.confirm;
        try {
          window.confirm = () => true;
          bypassClearBoard = true;
          button.click();
        } finally {
          bypassClearBoard = false;
          window.confirm = originalConfirm;
          closeDialog();
        }
      }

      function syncMoodboardUI() {
        const input = document.getElementById('moodboardSearch');
        const picker = document.getElementById('moodboardPlantPicker');
        const addButton = document.querySelector('[data-action="moodboard-add-visible"]');
        if (!input || !picker) return;

        const active = Boolean(input.value.trim());
        picker.classList.toggle('is-search-active', active);

        let hint = document.querySelector('.moodboard-picker-hint');
        if (!hint) {
          hint = document.createElement('div');
          hint.className = 'moodboard-picker-hint';
          hint.textContent = 'Type a plant name in the search field to show matching plants.';
          picker.before(hint);
        }
        hint.hidden = active;

        if (addButton) {
          if (addButton.textContent.trim() !== 'Add plants') addButton.textContent = 'Add plants';
          if (addButton.title !== 'Add all plants or choose a category') addButton.title = 'Add all plants or choose a category';
        }
      }

      document.addEventListener('click', event => {
        const categoryChoice = event.target.closest('[data-moodboard-add-category]');
        if (categoryChoice) {
          event.preventDefault();
          event.stopImmediatePropagation();
          addCategoryToBoard(categoryChoice.dataset.moodboardAddCategory || 'All');
          return;
        }

        if (event.target.closest('[data-moodboard-confirm-clear]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          confirmClearBoard();
          return;
        }

        if (event.target.closest('[data-moodboard-dialog-close]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeDialog();
          return;
        }

        const backdrop = event.target.closest('#moodboardActionBackdrop');
        if (backdrop && event.target === backdrop) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeDialog();
          return;
        }

        const addButton = event.target.closest('[data-action="moodboard-add-visible"]');
        if (addButton && !bypassAddVisible) {
          event.preventDefault();
          event.stopImmediatePropagation();
          openAddDialog(addButton);
          return;
        }

        const clearButton = event.target.closest('[data-action="moodboard-clear"]');
        if (clearButton && !bypassClearBoard) {
          event.preventDefault();
          event.stopImmediatePropagation();
          openClearDialog(clearButton);
        }
      }, true);

      document.addEventListener('input', event => {
        if (event.target.id === 'moodboardSearch') requestAnimationFrame(syncMoodboardUI);
      });

      document.addEventListener('keydown', event => {
        const backdrop = document.getElementById('moodboardActionBackdrop');
        if (!backdrop || backdrop.hidden) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          closeDialog();
          return;
        }
        if (event.key !== 'Tab') return;
        const dialog = backdrop.querySelector('.moodboard-action-dialog');
        const focusable = Array.from(dialog?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
          .filter(element => !element.hidden && element.getClientRects().length);
        if (!focusable.length) {
          event.preventDefault();
          dialog?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });

      if (content && 'MutationObserver' in window) {
        const observer = new MutationObserver(() => requestAnimationFrame(syncMoodboardUI));
        observer.observe(content, { childList: true, subtree: true });
      }

      window.addEventListener('hashchange', () => requestAnimationFrame(syncMoodboardUI));
      requestAnimationFrame(syncMoodboardUI);
    })();

/* Migrated index script block 6. */
/* =========================================================
       GREENSCAPE GOOGLE AI OVERVIEW REFERENCE
       Uses only Common Name + Scientific Name.
       Also adds View Details reference, image download,
       current-image preview, and replacement confirmation.
       ========================================================= */
    (() => {
      'use strict';

      const PLANT_STORAGE_KEY = 'greenscape-plant-library-plants-v1';
      const capturedImages = new Map();

      const cleanUrl = value => {
        const url = String(value || '').trim();
        return /^https?:\/\//i.test(url) ? url : '';
      };

      const escapeAttribute = value => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const googleAIReference = (commonName, scientificName) => {
        const query = [commonName, scientificName]
          .map(value => String(value || '').trim())
          .filter(Boolean)
          .join(' ');
        return query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : '';
      };

      const readStoredPlants = () => {
        try {
          const records = JSON.parse(localStorage.getItem(PLANT_STORAGE_KEY) || '[]');
          return Array.isArray(records) ? records : [];
        } catch (error) {
          return [];
        }
      };

      const storedPlant = plantId => readStoredPlants().find(record => String(record?.id || '') === String(plantId || ''));

      const plantNamesFromForm = form => ({
        commonName: String(form.querySelector('#plantCommonName')?.value || '').trim(),
        scientificName: String(form.querySelector('#plantScientificName')?.value || '').trim()
      });

      const updateReferenceOpenButton = form => {
        const input = form.querySelector('[data-plant-reference-input]');
        const anchor = form.querySelector('.plant-reference-open');
        if (!input || !anchor) return;
        const url = cleanUrl(input.value);
        anchor.href = url || '#';
        anchor.classList.toggle('is-ready', Boolean(url));
        anchor.setAttribute('aria-disabled', url ? 'false' : 'true');
        anchor.tabIndex = url ? 0 : -1;
      };

      const setReferenceStatus = (form, message, isError = false) => {
        const status = form.querySelector('[data-reference-status]');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('is-error', Boolean(isError));
      };

      const refreshReference = form => {
        const input = form.querySelector('[data-plant-reference-input]');
        if (!input) return;
        const { commonName, scientificName } = plantNamesFromForm(form);
        const url = googleAIReference(commonName, scientificName);
        input.value = url;
        updateReferenceOpenButton(form);
        setReferenceStatus(
          form,
          url
            ? 'Reference ready using Common Name + Scientific Name.'
            : 'Enter the common and scientific names to create the reference.',
          !url
        );
      };

      const referenceFieldTemplate = value => {
        const url = cleanUrl(value);
        return `
          <div class="plant-reference-heading">
            <div>
              <label>Reference</label>
              <p>Google AI Overview search using only Common Name + Scientific Name.</p>
            </div>
            <button class="button ghost small" type="button" data-reference-search>Refresh reference</button>
          </div>
          <div class="plant-reference-input-wrap">
            <input
              class="text-input"
              type="url"
              name="link"
              data-plant-reference-input
              value="${escapeAttribute(url)}"
              placeholder="Google AI Overview reference"
              autocomplete="off">
            <a class="plant-reference-open${url ? ' is-ready' : ''}"
               href="${url || '#'}"
               target="_blank"
               rel="noopener noreferrer"
               title="Open Google AI Overview reference"
               aria-label="Open Google AI Overview reference"
               aria-disabled="${url ? 'false' : 'true'}"
               tabindex="${url ? '0' : '-1'}">↗</a>
          </div>
          <div class="plant-reference-status" data-reference-status aria-live="polite"></div>
        `;
      };

      const currentImageForForm = form => {
        const plantId = String(form.elements.id?.value || '').trim();
        return capturedImages.get(plantId) || cleanUrl(storedPlant(plantId)?.image) || String(storedPlant(plantId)?.image || '').trim();
      };

      const renderImagePreview = (field, src, title, copy) => {
        let preview = field.querySelector('.plant-image-edit-preview');
        if (!preview) {
          preview = document.createElement('div');
          preview.className = 'plant-image-edit-preview';
          field.insertBefore(preview, field.querySelector('input[name="imageFile"]'));
        }
        preview.innerHTML = src
          ? `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(title)}"><div class="plant-image-edit-copy"><strong>${escapeAttribute(title)}</strong><small>${escapeAttribute(copy)}</small></div>`
          : `<div class="plant-image-edit-placeholder">No image</div><div class="plant-image-edit-copy"><strong>${escapeAttribute(title)}</strong><small>${escapeAttribute(copy)}</small></div>`;
      };

      const installImageEditor = form => {
        const fileInput = form.querySelector('input[name="imageFile"]');
        const field = fileInput?.closest('.form-field');
        if (!fileInput || !field || field.dataset.imageEditorInstalled === 'true') return;
        field.dataset.imageEditorInstalled = 'true';

        const currentImage = currentImageForForm(form);
        renderImagePreview(
          field,
          currentImage,
          currentImage ? 'Current image' : 'No image uploaded',
          currentImage ? 'Choose a new file only when you need to replace this image.' : 'Choose an image to add it to this plant.'
        );

        fileInput.addEventListener('change', () => {
          const file = fileInput.files?.[0];
          if (!file) return;

          if (currentImage) {
            const confirmed = window.confirm('Replace the current plant image? The existing image will be replaced after you save changes.');
            if (!confirmed) {
              fileInput.value = '';
              renderImagePreview(field, currentImage, 'Current image', 'Image replacement cancelled.');
              return;
            }
          }

          const reader = new FileReader();
          reader.onload = () => renderImagePreview(
            field,
            String(reader.result || ''),
            'New image selected',
            'This image will replace the current image after you save changes.'
          );
          reader.readAsDataURL(file);
        });
      };

      const installPlantReferenceForm = form => {
        if (!form || form.dataset.referencesInstalled === 'true') return;
        const originalInput = form.querySelector('input[name="link"]');
        const originalField = originalInput?.closest('.form-field');
        if (!originalInput || !originalField) return;

        form.dataset.referencesInstalled = 'true';
        const { commonName, scientificName } = plantNamesFromForm(form);
        const generated = googleAIReference(commonName, scientificName);
        const existing = /google\./i.test(String(originalInput.value || '')) ? cleanUrl(originalInput.value) : '';

        originalField.classList.add('plant-reference-field', 'full');
        originalField.innerHTML = referenceFieldTemplate(generated || existing);

        originalField.querySelector('[data-reference-search]')?.addEventListener('click', () => refreshReference(form));
        originalField.querySelector('[data-plant-reference-input]')?.addEventListener('input', () => updateReferenceOpenButton(form));

        let timer = 0;
        const scheduleRefresh = () => {
          clearTimeout(timer);
          timer = setTimeout(() => refreshReference(form), 550);
        };
        form.querySelector('#plantCommonName')?.addEventListener('input', scheduleRefresh);
        form.querySelector('#plantScientificName')?.addEventListener('input', scheduleRefresh);

        updateReferenceOpenButton(form);
        setReferenceStatus(form, generated ? 'Reference ready using Common Name + Scientific Name.' : 'Enter the plant names to create the reference.');
        installImageEditor(form);
      };

      const detailNames = modal => ({
        commonName: String(modal.querySelector('.detail-info h3')?.textContent || modal.querySelector('.modal-header h2')?.textContent || '').trim(),
        scientificName: String(modal.querySelector('.detail-info .scientific')?.textContent || '').trim()
      });

      const reorderDetailPanels = (modal, referencePanel) => {
        const stack = modal.querySelector('.detail-content-stack');
        if (!stack || !referencePanel) return;
        const panels = [...stack.querySelectorAll(':scope > .detail-panel')];
        const tags = panels.find(panel => /tags/i.test(String(panel.querySelector('.detail-panel-label')?.textContent || '')));
        const notes = panels.find(panel => /planting notes/i.test(String(panel.querySelector('.detail-panel-label')?.textContent || '')));
        const others = panels.filter(panel => panel !== referencePanel && panel !== tags && panel !== notes);
        [referencePanel, tags, notes, ...others].filter(Boolean).forEach(panel => stack.appendChild(panel));
      };

      const installImageDownload = modal => {
        const photo = modal.querySelector('.detail-photo');
        const image = photo?.querySelector('img');
        if (!photo || !image || photo.querySelector('[data-plant-image-download]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'plant-image-download';
        button.dataset.plantImageDownload = 'true';
        button.innerHTML = '<span aria-hidden="true">↓</span> Download image';
        photo.appendChild(button);
      };

      const installPlantDetailReference = modal => {
        if (!modal || modal.dataset.referenceDetailsInstalled === 'true') return;
        const editButton = modal.querySelector('button[data-action="edit-plant"][data-plant-id]');
        if (!editButton) return;

        const { commonName, scientificName } = detailNames(modal);
        const url = googleAIReference(commonName, scientificName);
        let linkPanel = [...modal.querySelectorAll('.detail-panel')].find(panel => {
          const label = panel.querySelector('.detail-panel-label');
          return /^(link|reference links?|reference)$/i.test(String(label?.textContent || '').trim());
        });

        if (!linkPanel) {
          linkPanel = document.createElement('section');
          linkPanel.className = 'detail-panel';
          modal.querySelector('.detail-content-stack')?.prepend(linkPanel);
        }

        linkPanel.innerHTML = `
          <span class="detail-panel-label">Reference</span>
          ${url ? `
            <a class="plant-reference-detail-link is-direct" href="${url}" target="_blank" rel="noopener noreferrer" title="Open Google AI Overview">
              <span>Google AI Overview<small>${escapeAttribute([commonName, scientificName].filter(Boolean).join(' '))}</small></span>
              <span aria-hidden="true">↗</span>
            </a>
          ` : '<span class="detail-empty">No plant name available for the reference.</span>'}
        `;

        reorderDetailPanels(modal, linkPanel);
        installImageDownload(modal);
        modal.dataset.referenceDetailsInstalled = 'true';
      };

      const safeFilename = value => String(value || 'plant-image')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'plant-image';

      const imageExtension = type => {
        if (/png/i.test(type)) return 'png';
        if (/webp/i.test(type)) return 'webp';
        if (/gif/i.test(type)) return 'gif';
        return 'jpg';
      };

      const downloadPlantImage = async button => {
        const modal = button.closest('.modal');
        const image = button.closest('.detail-photo')?.querySelector('img');
        const src = image?.currentSrc || image?.src || '';
        if (!src) return;
        const { commonName } = detailNames(modal || document);

        try {
          const response = await fetch(src);
          if (!response.ok) throw new Error('Image download failed');
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `${safeFilename(commonName)}.${imageExtension(blob.type)}`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
        } catch (error) {
          const anchor = document.createElement('a');
          anchor.href = src;
          anchor.download = `${safeFilename(commonName)}.jpg`;
          anchor.target = '_blank';
          anchor.rel = 'noopener';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }
      };

      document.addEventListener('click', event => {
        const editButton = event.target.closest('button[data-action="edit-plant"][data-plant-id]');
        if (editButton) {
          const image = editButton.closest('.modal')?.querySelector('.detail-photo img');
          if (image?.src) capturedImages.set(String(editButton.dataset.plantId || ''), image.src);
        }

        const downloadButton = event.target.closest('[data-plant-image-download]');
        if (downloadButton) {
          event.preventDefault();
          event.stopPropagation();
          downloadPlantImage(downloadButton);
        }
      }, true);

      const scan = root => {
        const form = root?.matches?.('#plantForm') ? root : root?.querySelector?.('#plantForm');
        if (form) installPlantReferenceForm(form);

        const modal = root?.matches?.('.modal') ? root : root?.querySelector?.('.modal');
        if (modal) installPlantDetailReference(modal);
      };

      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node instanceof Element) scan(node);
          });
        });
      });

      observer.observe(document.getElementById('modalRoot') || document.body, {
        childList: true,
        subtree: true
      });

      scan(document);
    })();

/* Migrated index script block 7. */
(() => {
      const statusByName = {
        code: 'automatic',
        category: 'required',
        commonName: 'required',
        scientificName: 'required',
        sun: 'optional',
        water: 'optional',
        spacing: 'optional',
        matureHeight: 'optional',
        matureSpread: 'optional',
        growingCondition: 'optional',
        plantingNotes: 'optional',
        tags: 'automatic',
        imageFile: 'optional',
        sizeLabel: 'optional',
        sizeUnit: 'optional'
      };

      const statusText = {
        automatic: 'Automatic',
        required: 'Required',
        optional: 'Optional'
      };

      function addStatus(label, status) {
        if (!label || !status || label.querySelector(':scope > .field-status-label')) return;
        const badge = document.createElement('span');
        badge.className = `field-status-label is-${status}`;
        badge.textContent = statusText[status];
        badge.setAttribute('aria-label', statusText[status]);
        label.appendChild(badge);
      }

      function decoratePlantForm(form) {
        if (!form || form.dataset.fieldStatusesInstalled === 'true') return;

        form.querySelectorAll('.form-field').forEach(field => {
          const input = field.querySelector('input[name], select[name], textarea[name]');
          const label = field.querySelector(':scope > label');
          const name = input?.getAttribute('name');
          if (label && name) addStatus(label, statusByName[name] || 'optional');
        });

        const referenceLabel = form.querySelector('.plant-reference-heading label');
        if (referenceLabel) addStatus(referenceLabel, 'automatic');

        form.querySelectorAll('.form-section').forEach(section => {
          const heading = section.querySelector(':scope > h3');
          if (/available sizes/i.test(String(heading?.textContent || ''))) addStatus(heading, 'optional');
        });

        form.dataset.fieldStatusesInstalled = 'true';
      }

      function scan(root = document) {
        if (root instanceof Element && root.matches('#plantForm')) decoratePlantForm(root);
        root.querySelectorAll?.('#plantForm').forEach(decoratePlantForm);
      }

      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
          if (node instanceof Element) scan(node);
        }));
      });

      observer.observe(document.getElementById('modalRoot') || document.body, {
        childList: true,
        subtree: true
      });

      scan();
    })();

/* Migrated index script block 8. */
(() => {
      'use strict';

      const fieldByName = (form, name) =>
        form.querySelector(`[name="${name}"]`)?.closest('.form-field') || null;

      const cardHeader = (index, title, description) => {
        const header = document.createElement('div');
        header.className = 'plant-form-card-header';
        header.innerHTML = `<div><h3>${title}</h3><p>${description}</p></div><span class="plant-form-card-index">${index}</span>`;
        return header;
      };

      const createCard = (className, index, title, description, gridClass) => {
        const card = document.createElement('section');
        card.className = `plant-form-card ${className}`;
        card.appendChild(cardHeader(index, title, description));
        const grid = document.createElement('div');
        grid.className = `plant-form-card-grid ${gridClass}`;
        card.appendChild(grid);
        return { card, grid };
      };

      function move(grid, nodes) {
        nodes.filter(Boolean).forEach(node => {
          node.classList.remove('full', 'plant-form-image-top', 'plant-form-reference-top');
          grid.appendChild(node);
        });
      }

      function organizePlantForm(form) {
        if (!form || form.dataset.compactOrganizationInstalled === 'true') return;

        const referenceField = form.querySelector('.plant-reference-field') || fieldByName(form, 'link');
        const imageField = fieldByName(form, 'imageFile');
        const sizesSection = [...form.querySelectorAll(':scope > .form-section')]
          .find(section => /available sizes/i.test(String(section.querySelector(':scope > h3')?.textContent || '')));

        // Wait for the automatic reference and image tools to finish installing.
        if (!referenceField || !imageField || !sizesSection) return;

        const alert = form.querySelector(':scope > .plant-form-alert');

        const media = createCard(
          'plant-form-media-card', '01', 'Image & reference',
          'Current image, replacement upload, and automatic Google reference.',
          'plant-form-media-grid'
        );
        move(media.grid, [imageField, referenceField]);

        const identity = createCard(
          'plant-form-identity-card', '02', 'Plant identity',
          'Code, category, and plant names.',
          'plant-form-identity-grid'
        );
        move(identity.grid, [
          fieldByName(form, 'code'),
          fieldByName(form, 'category'),
          fieldByName(form, 'commonName'),
          fieldByName(form, 'scientificName')
        ]);

        const care = createCard(
          'plant-form-care-card', '04', 'Use & care',
          'Light, water, and recommended spacing.',
          'plant-form-care-grid'
        );
        move(care.grid, [
          fieldByName(form, 'sun'),
          fieldByName(form, 'water'),
          fieldByName(form, 'spacing')
        ]);

        const notes = createCard(
          'plant-form-notes-card', '03', 'Tags & planting notes',
          'Search labels and practical planting instructions.',
          'plant-form-notes-grid'
        );
        move(notes.grid, [
          fieldByName(form, 'tags'),
          fieldByName(form, 'plantingNotes')
        ]);

        const growth = createCard(
          'plant-form-growth-card', '05', 'Growth details',
          'Mature dimensions and preferred growing conditions.',
          'plant-form-growth-grid'
        );
        move(growth.grid, [
          fieldByName(form, 'matureHeight'),
          fieldByName(form, 'matureSpread'),
          fieldByName(form, 'growingCondition')
        ]);

        sizesSection.classList.add('plant-form-card', 'plant-form-sizes-card');
        const sizesHeader = cardHeader('06', 'Available sizes', 'Add one row for each nursery size and unit.');
        sizesSection.insertBefore(sizesHeader, sizesSection.firstChild);

        // Keep the form clean and predictable: alert first, then grouped sections.
        [media.card, identity.card, notes.card, care.card, growth.card, sizesSection]
          .forEach(card => form.appendChild(card));
        if (alert) form.insertBefore(alert, form.firstChild);

        form.classList.add('plant-form-organized');
        form.dataset.compactOrganizationInstalled = 'true';
        form.closest('.modal')?.classList.add('plant-form-modal');
      }

      function schedule(form) {
        if (!form) return;
        requestAnimationFrame(() => organizePlantForm(form));
        setTimeout(() => organizePlantForm(form), 60);
        setTimeout(() => organizePlantForm(form), 220);
      }

      function scan(root = document) {
        if (root instanceof Element && root.matches('#plantForm')) schedule(root);
        root.querySelectorAll?.('#plantForm').forEach(schedule);
      }

      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
          if (node instanceof Element) scan(node);
        }));
      });

      observer.observe(document.getElementById('modalRoot') || document.body, {
        childList: true,
        subtree: true
      });

      scan();
    })();

/* Migrated index script block 9. */
/* Temporarily hide Help while scrolling, then restore it when scrolling stops. */
    (() => {
      const launcher = document.getElementById('feedbackToggle');
      const panel = document.getElementById('feedbackPanel');
      if (!launcher) return;

      let revealTimer = 0;
      const revealDelay = 260;

      function helpIsOpen() {
        return launcher.getAttribute('aria-expanded') === 'true' || (panel && !panel.hidden);
      }

      function revealHelp() {
        window.clearTimeout(revealTimer);
        launcher.classList.remove('help-hidden-while-scrolling');
      }

      function handleScrolling() {
        window.clearTimeout(revealTimer);

        if (helpIsOpen()) {
          revealHelp();
          return;
        }

        launcher.classList.add('help-hidden-while-scrolling');
        revealTimer = window.setTimeout(revealHelp, revealDelay);
      }

      // Capture scrolls from the page, modal content, and other nested scroll areas.
      document.addEventListener('scroll', handleScrolling, { passive: true, capture: true });
      window.addEventListener('scroll', handleScrolling, { passive: true });

      // Keep the launcher visible whenever Help is opened or keyboard-focused.
      launcher.addEventListener('click', revealHelp);
      launcher.addEventListener('focus', revealHelp);
      document.getElementById('feedbackClose')?.addEventListener('click', revealHelp);
      document.getElementById('feedbackCancel')?.addEventListener('click', revealHelp);
    })();

/* Migrated index script block 11. */
(() => {
      'use strict';

      const LENS_URL = 'https://www.google.com/?olud=';
      const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
      const MODEL_ID = 'onnx-community/FloraSense-ONNX';
      const PLANT_STORAGE_KEY = 'greenscape-plant-library-plants-v1';
      const MAX_FILE_BYTES = 20 * 1024 * 1024;
      const pageContent = document.getElementById('pageContent');
      const pageTitle = document.getElementById('pageTitle');
      let identifierOpen = false;
      let selectedImage = null;
      let classifierPromise = null;
      let isAnalyzing = false;
      let latestResults = [];

      const escapeHTML = value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      function cameraLeafIcon() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h3l1.3-2h7.4l1.3 2h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.8 3.8c-2.4.1-4.1 1.1-4.8 2.8 1.9.2 3.6-.5 4.8-2.8Z" fill="currentColor"/></svg>`;
      }

      function identifierPageHTML() {
        return `
          <section class="lens-identifier-page" aria-label="Google Lens Plant Identifier">
            <header class="lens-identifier-intro">
              <div>
                <h2>Identify a plant on this device.</h2>
                <p>Upload a plant photo to see possible common name and scientific name matches, then verify the selected result with Google Lens.</p>
              </div>
            </header>

            <div class="lens-identifier-workspace">
              <section class="lens-identifier-card lens-identifier-upload-card">
                <header class="lens-identifier-card-header">
                  <div><h3>Choose plant photo</h3><p>Use the same photo again when Google Lens asks you to select an image.</p></div>
                  <span class="lens-identifier-step">01</span>
                </header>
                <div class="lens-identifier-upload-body">
                  <div class="lens-identifier-dropzone" id="lensIdentifierDropzone">
                    <div id="lensIdentifierEmptyUpload">
                      <span class="lens-identifier-camera-icon">${cameraLeafIcon()}</span>
                      <strong>Choose a plant photo</strong>
                      <p>JPG, PNG, WEBP, or supported phone image · maximum 20 MB</p>
                      <div class="lens-identifier-upload-actions">
                        <button class="button primary" type="button" data-lens-identifier-action="choose-photo">Choose photo</button>
                      </div>
                    </div>
                    <div class="lens-identifier-preview" id="lensIdentifierPreview" hidden>
                      <img id="lensIdentifierPreviewImage" alt="Selected plant photo">
                      <div class="lens-identifier-preview-actions">
                        <button class="button secondary small" type="button" data-lens-identifier-action="replace-photo">Replace</button>
                        <button class="button secondary small" type="button" data-lens-identifier-action="remove-photo">Remove</button>
                      </div>
                    </div>
                  </div>
                  <input id="lensIdentifierGalleryInput" type="file" aria-label="Choose a plant photo" accept="image/*" hidden>
                  <div class="lens-identifier-tip"><strong>Tip</strong><span>Choose a clear leaf, flower, fruit, bark, or full-plant photo against a simple background.</span></div>
                  <div class="lens-identifier-analysis-actions">
                    <button class="button primary lens-identifier-open-button" id="lensIdentifierAnalyzeButton" type="button" data-lens-identifier-action="analyze-photo" disabled>Analyze on this device</button>
                    <button class="button secondary" id="lensIdentifierOpenButton" type="button" disabled>Verify with Google Lens</button>
                  </div>
                  <div class="lens-identifier-status" id="lensIdentifierStatus" hidden aria-live="polite">
                    <strong id="lensIdentifierStatusTitle">Preparing identifier</strong>
                    <span id="lensIdentifierStatusText">The first use downloads approximately 225 MB and may take several minutes on mobile data.</span>
                    <div class="lens-identifier-progress"><span id="lensIdentifierProgressBar"></span></div>
                  </div>
                  <p class="lens-identifier-privacy-copy">Google Lens opens in a new tab. For browser security, choose the same photo again when Google Lens asks for it.</p>
                </div>
              </section>

              <section class="lens-identifier-card">
                <header class="lens-identifier-card-header">
                  <div><h3>Possible plant matches</h3><p>Review possible common name and scientific name matches.</p></div>
                  <span class="lens-identifier-step">02</span>
                </header>
                <div class="lens-identifier-details-body">
                  <div class="lens-identifier-warning"><strong>Important</strong><span>The local research model and Google Lens provide suggestions, not guaranteed identification. Confirm edible, toxic, medicinal, or important plants with a qualified plant professional.</span></div>

                  <div class="lens-identifier-results" id="lensIdentifierResults">
                    <div class="lens-identifier-results-empty">Possible plant common name and scientific name matches will appear here after analysis.</div>
                  </div>

                  <div class="lens-identifier-error" id="lensIdentifierError" hidden></div>
                </div>
              </section>
            </div>
          </section>`;
      }

      function showIdentifierPage(pushHistory = true) {
        if (!pageContent || !pageTitle) return;
        identifierOpen = true;
        document.querySelectorAll('.nav-item').forEach(button => {
          button.classList.remove('active');
          button.removeAttribute('aria-current');
        });
        pageTitle.textContent = 'Plant Identifier';
        document.title = 'Plant Identifier | Greenscape Plant Library';
        pageContent.innerHTML = identifierPageHTML();
        bindIdentifierPage();
        if (pushHistory && location.hash !== '#identifier') history.pushState({ greenscapeIdentifier: true }, '', '#identifier');
        requestAnimationFrame(() => pageTitle.focus({ preventScroll: true }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function bindIdentifierPage() {
        const galleryInput = document.getElementById('lensIdentifierGalleryInput');
        const openButton = document.getElementById('lensIdentifierOpenButton');
        const dropzone = document.getElementById('lensIdentifierDropzone');
        galleryInput?.addEventListener('change', event => handleFiles(event.target.files));
        openButton?.addEventListener('click', openGoogleLens);
        ['lensIdentifierCommonName', 'lensIdentifierScientificName'].forEach(id => {
          document.getElementById(id)?.addEventListener('input', updateDuplicateWarning);
        });
        if (dropzone) {
          ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
            event.preventDefault();
            dropzone.classList.add('is-dragging');
          }));
          ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => {
            event.preventDefault();
            dropzone.classList.remove('is-dragging');
          }));
          dropzone.addEventListener('drop', event => handleFiles(event.dataTransfer?.files));
        }
        renderSelectedImage();
      }

      async function handleFiles(fileList) {
        const file = fileList?.[0];
        if (!file) return;
        clearError();
        if (!String(file.type || '').startsWith('image/')) {
          showError('Choose an image file such as JPG, PNG, WEBP, HEIC, or HEIF.');
          clearFileInput();
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          showError('Choose a photo smaller than 20 MB.');
          clearFileInput();
          return;
        }
        try {
          selectedImage = await prepareImage(file);
          latestResults = [];
          renderSelectedImage();
          renderIdentifierResults();
          hideIdentifierStatus();
        } catch (error) {
          selectedImage = null;
          renderSelectedImage();
          showError('This browser could not preview the selected image. Try a JPG or PNG version.');
        }
      }

      function prepareImage(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const image = new Image();
            image.onerror = reject;
            image.onload = () => {
              const maxSide = 1600;
              const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
              const width = Math.max(1, Math.round(image.naturalWidth * scale));
              const height = Math.max(1, Math.round(image.naturalHeight * scale));
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const context = canvas.getContext('2d', { alpha: false });
              context.fillStyle = '#ffffff';
              context.fillRect(0, 0, width, height);
              context.drawImage(image, 0, 0, width, height);
              canvas.toBlob(blob => {
                if (!blob) {
                  resolve({ file, dataUrl, originalName: file.name });
                  return;
                }
                const optimizedFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'plant-photo'}.jpg`, {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });
                resolve({
                  file: optimizedFile,
                  dataUrl: canvas.toDataURL('image/jpeg', .88),
                  originalName: file.name
                });
              }, 'image/jpeg', .88);
            };
            image.src = dataUrl;
          };
          reader.readAsDataURL(file);
        });
      }

      function renderSelectedImage() {
        const empty = document.getElementById('lensIdentifierEmptyUpload');
        const preview = document.getElementById('lensIdentifierPreview');
        const image = document.getElementById('lensIdentifierPreviewImage');
        const lensButton = document.getElementById('lensIdentifierOpenButton');
        const analyzeButton = document.getElementById('lensIdentifierAnalyzeButton');
        if (!empty || !preview || !image || !lensButton || !analyzeButton) return;
        if (selectedImage?.dataUrl) {
          empty.hidden = true;
          preview.hidden = false;
          image.src = selectedImage.dataUrl;
          lensButton.disabled = false;
          analyzeButton.disabled = isAnalyzing;
        } else {
          empty.hidden = false;
          preview.hidden = true;
          image.removeAttribute('src');
          lensButton.disabled = true;
          analyzeButton.disabled = true;
        }
      }

      function clearFileInput() {
        const input = document.getElementById('lensIdentifierGalleryInput');
        if (input) input.value = '';
      }

      function removeSelectedImage() {
        selectedImage = null;
        latestResults = [];
        clearFileInput();
        renderSelectedImage();
        renderIdentifierResults();
        hideIdentifierStatus();
        clearError();
      }

      function openGoogleLens() {
        if (!selectedImage) {
          showError('Choose a plant photo first.');
          return;
        }
        const opened = window.open(LENS_URL, '_blank', 'noopener,noreferrer');
        if (!opened) window.location.href = LENS_URL;
      }

      function setIdentifierStatus(title, text, progress = 0) {
        const status = document.getElementById('lensIdentifierStatus');
        const titleElement = document.getElementById('lensIdentifierStatusTitle');
        const textElement = document.getElementById('lensIdentifierStatusText');
        const progressBar = document.getElementById('lensIdentifierProgressBar');
        if (!status || !titleElement || !textElement || !progressBar) return;
        status.hidden = false;
        titleElement.textContent = title;
        textElement.textContent = text;
        progressBar.style.width = `${Math.max(0, Math.min(100, Number(progress) || 0))}%`;
      }

      function hideIdentifierStatus() {
        const status = document.getElementById('lensIdentifierStatus');
        if (status) status.hidden = true;
      }

      function modelProgress(update) {
        if (!update || typeof update !== 'object') return;
        if (update.status === 'progress') {
          const percent = Number(update.progress) || 0;
          const file = String(update.file || '').split('/').pop() || 'model file';
          setIdentifierStatus('Downloading plant model', `${file} · ${Math.round(percent)}%`, percent);
          return;
        }
        if (update.status === 'ready') {
          setIdentifierStatus('Plant model ready', 'Analyzing the selected photo on this device…', 100);
          return;
        }
        if (update.status === 'initiate' || update.status === 'download') {
          setIdentifierStatus('Preparing plant model', 'Downloading and caching the on-device identifier for first use…', 4);
        }
      }

      async function getPlantClassifier() {
        if (!classifierPromise) {
          classifierPromise = (async () => {
            const { pipeline } = await import(TRANSFORMERS_URL);
            return pipeline('image-classification', MODEL_ID, {
              dtype: 'q4',
              progress_callback: modelProgress
            });
          })().catch(error => {
            classifierPromise = null;
            throw error;
          });
        }
        return classifierPromise;
      }

      function normalizeScientific(value) {
        return String(value || '')
          .toLowerCase()
          .replace(/[^a-z\s-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .slice(0, 2)
          .join(' ');
      }

      function scientificFromModelLabel(label) {
        const words = String(label || '')
          .replace(/_+/g, ' ')
          .replace(/[^A-Za-z\s-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .filter(Boolean);
        if (!words.length) return 'Unknown plant';
        const genus = words[0];
        const species = words.find((word, index) => index > 0 && /^[a-z][a-z-]+$/.test(word));
        return [genus, species].filter(Boolean).join(' ');
      }

      function availablePlants() {
        const stored = readStoredPlants();
        const seeded = Array.isArray(window.GREENSCAPE_PLANT_DATA) ? window.GREENSCAPE_PLANT_DATA : [];
        const source = stored.length ? stored : seeded;
        return source.filter(plant => plant && plant.isPlant !== false);
      }

      function enrichModelResult(result, index) {
        const scientificName = scientificFromModelLabel(result?.label);
        const scientificKey = normalizeScientific(scientificName);
        const libraryMatch = availablePlants().find(plant => normalizeScientific(plant.scientificName) === scientificKey);
        return {
          rank: index + 1,
          score: Math.max(0, Math.min(1, Number(result?.score) || 0)),
          commonName: String(libraryMatch?.commonName || '').trim(),
          scientificName,
          inLibrary: Boolean(libraryMatch),
          image: String(libraryMatch?.image || '').trim()
        };
      }

      function safeIdentifierImage(value) {
        const source = String(value || '').trim();
        return /^(?:assets\/images\/|https?:\/\/|blob:)/i.test(source) || /^data:image\/(?:gif|jpe?g|png|webp);base64,/i.test(source) ? source : '';
      }

      async function wikipediaPlantImage(scientificName) {
        const title = String(scientificName || '').trim();
        if (!title) return '';
        const endpoint = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=320&titles=${encodeURIComponent(title)}`;
        try {
          const response = await fetch(endpoint);
          if (!response.ok) return '';
          const data = await response.json();
          const pages = Object.values(data?.query?.pages || {});
          return safeIdentifierImage(pages[0]?.thumbnail?.source || '');
        } catch (error) {
          return '';
        }
      }

      async function iNaturalistPlantDetails(scientificName) {
        const title = String(scientificName || '').trim();
        if (!title) return { image: '', commonName: '' };
        const endpoint = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(title)}&rank=species&per_page=5`;
        try {
          const response = await fetch(endpoint);
          if (!response.ok) return { image: '', commonName: '' };
          const data = await response.json();
          const taxa = Array.isArray(data?.results) ? data.results : [];
          const exact = taxa.find(taxon => normalizeScientific(taxon?.name) === normalizeScientific(title));
          const match = exact || taxa[0] || {};
          return {
            image: safeIdentifierImage(match?.default_photo?.medium_url || match?.default_photo?.square_url || ''),
            commonName: String(match?.preferred_common_name || '').trim()
          };
        } catch (error) {
          return { image: '', commonName: '' };
        }
      }

      async function loadIdentifierResultImages() {
        const resultSet = latestResults;
        await Promise.all(resultSet.map(async (result, index) => {
          const details = await iNaturalistPlantDetails(result.scientificName);
          if (latestResults !== resultSet) return;
          if (!result.commonName && details.commonName) {
            result.commonName = details.commonName;
            const commonName = document.querySelector(`[data-identifier-result-common="${index}"]`);
            const note = document.querySelector(`[data-identifier-result-note="${index}"]`);
            if (commonName) commonName.textContent = details.commonName;
            if (note) note.textContent = 'Common name supplied by iNaturalist. Confirm important identifications.';
          }
          const source = safeIdentifierImage(result.image) || details.image || await wikipediaPlantImage(result.scientificName);
          if (!source || latestResults !== resultSet || safeIdentifierImage(result.image)) return;
          result.image = source;
          const holder = document.querySelector(`[data-identifier-result-photo="${index}"]`);
          if (!holder) return;
          const rank = holder.querySelector('.lens-identifier-result-rank');
          const image = document.createElement('img');
          image.src = source;
          image.alt = `${result.commonName || result.scientificName} plant`;
          holder.replaceChildren(image);
          if (rank) holder.appendChild(rank);
        }));
      }

      function confidenceClass(score) {
        if (score >= .75) return 'high';
        if (score < .45) return 'low';
        return 'medium';
      }

      function renderIdentifierResults() {
        const container = document.getElementById('lensIdentifierResults');
        if (!container) return;
        if (!latestResults.length) {
          container.innerHTML = '<div class="lens-identifier-results-empty">Possible common and scientific name matches will appear here after local analysis.</div>';
          return;
        }
        container.innerHTML = latestResults.map((result, index) => {
          const percentage = Math.max(1, Math.round(result.score * 100));
          const commonName = result.commonName || 'Common name not found in Greenscape library';
          const image = safeIdentifierImage(result.image);
          return `<article class="lens-identifier-result">
            <div class="lens-identifier-result-image" data-identifier-result-photo="${index}">
              ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(commonName)} plant">` : cameraLeafIcon()}
              <span class="lens-identifier-result-rank">${result.rank}</span>
            </div>
            <div class="lens-identifier-result-copy">
              <strong data-identifier-result-common="${index}">${escapeHTML(commonName)}</strong>
              <em>${escapeHTML(result.scientificName)}</em>
              <span class="lens-identifier-confidence ${confidenceClass(result.score)}">${percentage}% model confidence</span>
              <small data-identifier-result-note="${index}">${result.inLibrary ? 'Common name matched from the Greenscape library.' : 'Checking botanical references for the common name and photo.'}</small>
            </div>
          </article>`;
        }).join('');
        loadIdentifierResultImages();
      }

      function selectIdentifierResult(index) {
        const result = latestResults[Number(index)];
        if (!result) return;
        const commonInput = document.getElementById('lensIdentifierCommonName');
        const scientificInput = document.getElementById('lensIdentifierScientificName');
        if (commonInput) commonInput.value = result.commonName || '';
        if (scientificInput) scientificInput.value = result.scientificName || '';
        updateDuplicateWarning();
        clearError();
        if (!result.commonName) showError('Scientific name selected. Verify and enter its common name before opening the Add Plant form.');
        commonInput?.focus();
      }

      async function analyzeSelectedImage() {
        if (!selectedImage?.dataUrl || isAnalyzing) {
          if (!selectedImage?.dataUrl) showError('Choose a plant photo first.');
          return;
        }
        clearError();
        latestResults = [];
        renderIdentifierResults();
        isAnalyzing = true;
        renderSelectedImage();
        const button = document.getElementById('lensIdentifierAnalyzeButton');
        if (button) button.textContent = 'Loading plant model…';
        setIdentifierStatus('Preparing plant model', 'First use downloads approximately 225 MB. Keep this page open while the model is cached.', 2);
        try {
          const classifier = await getPlantClassifier();
          if (button) button.textContent = 'Analyzing photo…';
          setIdentifierStatus('Analyzing photo', 'The selected image is now being processed locally in this browser.', 100);
          const output = await classifier(selectedImage.dataUrl, { top_k: 5 });
          latestResults = (Array.isArray(output) ? output : []).map(enrichModelResult);
          renderIdentifierResults();
          setIdentifierStatus('Analysis complete', `${latestResults.length} possible matches found. Select one and verify it with Google Lens.`, 100);
          if (!latestResults.length) showError('No plant matches were returned. Try a clearer photo or use Google Lens.');
        } catch (error) {
          console.error('Local plant identification failed.', error);
          classifierPromise = null;
          setIdentifierStatus('Identifier unavailable', 'The model could not load or analyze this photo. Check the internet connection and try again.', 0);
          showError('Local identification failed. Retry on a stable connection or use Google Lens instead.');
        } finally {
          isAnalyzing = false;
          if (button) button.textContent = 'Analyze on this device';
          renderSelectedImage();
        }
      }

      function readStoredPlants() {
        try {
          const value = JSON.parse(localStorage.getItem(PLANT_STORAGE_KEY) || '[]');
          return Array.isArray(value) ? value : [];
        } catch (error) {
          return [];
        }
      }

      function enteredNames() {
        return {
          commonName: String(document.getElementById('lensIdentifierCommonName')?.value || '').trim(),
          scientificName: String(document.getElementById('lensIdentifierScientificName')?.value || '').trim()
        };
      }

      function duplicateMatches() {
        const { commonName, scientificName } = enteredNames();
        const common = commonName.toLowerCase();
        const scientific = scientificName.toLowerCase();
        return readStoredPlants().filter(plant => {
          const existingCommon = String(plant.commonName || '').trim().toLowerCase();
          const existingScientific = String(plant.scientificName || '').trim().toLowerCase();
          return (common && common === existingCommon) || (scientific && scientific === existingScientific);
        });
      }

      function updateDuplicateWarning() {
        const warning = document.getElementById('lensIdentifierDuplicate');
        if (!warning) return;
        const matches = duplicateMatches();
        if (!matches.length) {
          warning.hidden = true;
          warning.textContent = '';
          return;
        }
        warning.hidden = false;
        warning.innerHTML = `<strong>Possible duplicate:</strong> ${escapeHTML(matches.slice(0, 3).map(plant => `${plant.commonName || 'Unnamed'} (${plant.scientificName || 'no scientific name'})`).join(', '))}.`;
      }

      function googleNameSearch(commonName, scientificName) {
        const query = [commonName, scientificName].filter(Boolean).join(' ');
        return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      }

      function verifyEnteredNames() {
        clearError();
        const { commonName, scientificName } = enteredNames();
        if (!commonName && !scientificName) {
          showError('Enter a common name or scientific name first.');
          return;
        }
        const url = googleNameSearch(commonName, scientificName);
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) window.location.href = url;
      }

      function openAddPlantForm() {
        clearError();
        const { commonName, scientificName } = enteredNames();
        if (!commonName || !scientificName) {
          showError('Enter both the common name and scientific name before opening the Add Plant form.');
          return;
        }
        const duplicates = duplicateMatches();
        if (duplicates.length && !window.confirm('A plant with the same common or scientific name may already exist. Open the Add Plant form anyway?')) return;

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.dataset.action = 'new-plant';
        trigger.hidden = true;
        document.body.appendChild(trigger);
        trigger.click();
        trigger.remove();

        waitForPlantForm().then(form => {
          if (!form) return;
          const commonInput = form.querySelector('[name="commonName"]');
          const scientificInput = form.querySelector('[name="scientificName"]');
          const tagsInput = form.querySelector('[name="tags"]');
          const linkInput = form.querySelector('[name="link"], [data-plant-reference-input]');
          if (commonInput) {
            commonInput.value = commonName;
            commonInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (scientificInput) {
            scientificInput.value = scientificName;
            scientificInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (tagsInput) tagsInput.value = 'google lens, plant identifier';
          if (linkInput) {
            linkInput.value = googleNameSearch(commonName, scientificName);
            linkInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          setTimeout(() => attachImageToPlantForm(form), 260);
          commonInput?.focus();
        });
      }

      function waitForPlantForm() {
        return new Promise(resolve => {
          const existing = document.getElementById('plantForm');
          if (existing) {
            resolve(existing);
            return;
          }
          const observer = new MutationObserver(() => {
            const form = document.getElementById('plantForm');
            if (!form) return;
            observer.disconnect();
            resolve(form);
          });
          observer.observe(document.getElementById('modalRoot') || document.body, { childList: true, subtree: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(document.getElementById('plantForm'));
          }, 1800);
        });
      }

      function attachImageToPlantForm(form) {
        const imageInput = form?.querySelector('input[name="imageFile"]');
        if (!imageInput || !selectedImage?.file || typeof DataTransfer === 'undefined') return;
        try {
          const transfer = new DataTransfer();
          transfer.items.add(selectedImage.file);
          imageInput.files = transfer.files;
          imageInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (error) {
          console.warn('The selected identifier image could not be attached automatically.', error);
        }
      }

      function showError(message) {
        const error = document.getElementById('lensIdentifierError');
        if (!error) return;
        error.hidden = false;
        error.textContent = message;
      }

      function clearError() {
        const error = document.getElementById('lensIdentifierError');
        if (!error) return;
        error.hidden = true;
        error.textContent = '';
      }

      document.addEventListener('click', event => {
        const dashboardButton = event.target.closest('[data-action="open-google-lens-identifier"]');
        if (dashboardButton) {
          event.preventDefault();
          showIdentifierPage(true);
          return;
        }

        const viewButton = event.target.closest('[data-view]');
        if (viewButton && identifierOpen) identifierOpen = false;

        const actionTarget = event.target.closest('[data-lens-identifier-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.lensIdentifierAction;
        if (action === 'choose-photo' || action === 'replace-photo') document.getElementById('lensIdentifierGalleryInput')?.click();
        if (action === 'remove-photo') removeSelectedImage();
        if (action === 'analyze-photo') analyzeSelectedImage();
      }, true);

      window.addEventListener('popstate', () => {
        if (location.hash === '#identifier') {
          showIdentifierPage(false);
          return;
        }
        identifierOpen = false;
        const view = location.hash.slice(1) || 'dashboard';
        const nav = document.querySelector(`[data-view="${CSS.escape(view)}"]`) || document.querySelector('[data-view="dashboard"]');
        nav?.click();
      });

      requestAnimationFrame(() => {
        if (location.hash === '#identifier') showIdentifierPage(false);
      });
    })();

/* GREENSCAPE_DIALOG_KEYBOARD_SUPPORT_START */
(() => {
  'use strict';

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function visibleDialog() {
    return Array.from(document.querySelectorAll('[role="dialog"]'))
      .reverse()
      .find(dialog => {
        if (!(dialog instanceof HTMLElement) || dialog.hidden) return false;
        const style = window.getComputedStyle(dialog);
        const rect = dialog.getBoundingClientRect();
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;
      });
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;

    const dialog = visibleDialog();
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll(focusableSelector))
      .filter(element => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;
      });

    if (!focusable.length) {
      event.preventDefault();
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
      dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
/* GREENSCAPE_DIALOG_KEYBOARD_SUPPORT_END */

