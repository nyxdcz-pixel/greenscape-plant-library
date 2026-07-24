(function () {
  'use strict';

  const PROJECT_STORAGE_KEY = 'greenscape-plant-library-projects-v1';
  const PLANT_STORAGE_KEY = 'greenscape-plant-library-plants-v1';
  const BOQ_STORAGE_KEY = 'greenscape-plant-library-boq-v1';
  const BOQ_ZOOM_KEY = 'greenscape-plant-library-boq-zoom-v1';
  const DENSITY_IDS = ['100', '50', '35'];
  const DEFAULT_ZOOM = 88;
  const MIN_ZOOM = 60;
  const MAX_ZOOM = 140;
  const ZOOM_STEP = 10;

  let zoomPercent = readStoredZoom();
  let pendingSyncCount = 0;
  let enhancementFrame = 0;
  let helpScrollTimer = 0;
  let helpVisibilityFrame = 0;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function numberValue(value) {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function readStoredZoom() {
    try {
      const stored = Number(localStorage.getItem(BOQ_ZOOM_KEY));
      return Number.isFinite(stored) ? clamp(Math.round(stored), MIN_ZOOM, MAX_ZOOM) : DEFAULT_ZOOM;
    } catch (error) {
      return DEFAULT_ZOOM;
    }
  }

  function saveZoom() {
    try {
      localStorage.setItem(BOQ_ZOOM_KEY, String(zoomPercent));
    } catch (error) {
      // Zoom still works for the current session.
    }
  }

  function projects() {
    const records = readJSON(PROJECT_STORAGE_KEY, []);
    return Array.isArray(records) ? records : [];
  }

  function plants() {
    const stored = readJSON(PLANT_STORAGE_KEY, null);
    if (Array.isArray(stored)) return stored;
    return Array.isArray(window.GREENSCAPE_PLANT_DATA) ? window.GREENSCAPE_PLANT_DATA : [];
  }

  function projectById(projectId) {
    return projects().find(project => String(project?.id || '') === String(projectId || ''));
  }

  function plantById(plantId) {
    return plants().find(plant => String(plant?.id || '') === String(plantId || ''));
  }

  function sectionForCategory(category) {
    const value = String(category || '').toLowerCase();
    if (value.includes('palm') || value.includes('tree') || value.includes('bamboo')) return 'PALMS AND TREES';
    if (value.includes('cycad') || value.includes('agave') || value.includes('yucca')) return 'AGAVE / CYCAD / YUCCA';
    if (value.includes('grass') || value.includes('groundcover')) return 'GRASS / GROUND COVER';
    if (value.includes('material')) return 'EARTHWORKS AND OTHER LANDSCAPING MATERIALS';
    if (
      value.includes('shrub') ||
      value.includes('climber') ||
      value.includes('fern') ||
      value.includes('indoor') ||
      value.includes('heliconia') ||
      value.includes('aquatic')
    ) return 'SHRUBS / FOLIAGE / CLIMBERS';
    return 'OTHER LANDSCAPE ITEMS';
  }

  function scaleMeasurement(value, factorPercent) {
    const raw = String(value || '').trim();
    if (!raw || numberValue(factorPercent) === 100) return raw;
    const factor = numberValue(factorPercent) / 100;
    return raw.replace(/\d+(?:\.\d+)?/g, match => {
      const scaled = numberValue(match) * factor;
      const rounded = Math.abs(scaled) >= 100
        ? Math.round(scaled / 10) * 10
        : Math.round(scaled * 10) / 10;
      return String(rounded).replace(/\.0$/, '');
    });
  }

  function defaultPreset(id) {
    const presets = {
      '100': { label: '100% Density and Specs', densityPercent: 100, specPercent: 100, spacingPercent: 100, pricePercent: 100 },
      '50': { label: '50% Density and Specs', densityPercent: 50, specPercent: 83, spacingPercent: 115, pricePercent: 85 },
      '35': { label: '35% Density and Specs', densityPercent: 35, specPercent: 67, spacingPercent: 130, pricePercent: 70 }
    };
    return presets[id];
  }

  function scenarioFromBase(row, preset) {
    const safePreset = { ...defaultPreset('100'), ...(preset || {}) };
    const isDensityItem = ![
      'PRELIMINARIES',
      'EARTHWORKS AND OTHER LANDSCAPING MATERIALS'
    ].includes(row.section);
    const densityFactor = isDensityItem ? numberValue(safePreset.densityPercent) / 100 : 1;
    const priceFactor = isDensityItem ? numberValue(safePreset.pricePercent) / 100 : 1;

    return {
      spec: scaleMeasurement(row.base.spec, safePreset.specPercent),
      height: scaleMeasurement(row.base.height, safePreset.specPercent),
      spread: scaleMeasurement(row.base.spread, safePreset.specPercent),
      area: row.base.area || '',
      spacing: scaleMeasurement(row.base.spacing, safePreset.spacingPercent),
      quantity: isDensityItem
        ? Math.ceil(numberValue(row.base.quantity) * densityFactor)
        : numberValue(row.base.quantity),
      unit: row.base.unit || 'pc/s',
      materialCost: Math.round(numberValue(row.base.materialCost) * priceFactor * 100) / 100,
      laborCost: Math.round(numberValue(row.base.laborCost) * priceFactor * 100) / 100
    };
  }

  function referencePrice(item, plant) {
    const directCandidates = [
      item?.boqReferencePrice,
      item?.referencePrice,
      item?.materialUnitCost,
      item?.materialCost,
      item?.unitPrice,
      item?.price
    ];

    for (const candidate of directCandidates) {
      if (candidate !== '' && candidate !== null && candidate !== undefined) {
        const amount = numberValue(candidate);
        if (amount >= 0) return amount;
      }
    }

    const sizes = Array.isArray(plant?.sizes) ? plant.sizes : [];
    const selected = sizes.find(size =>
      String(size?.label || size?.size || '') === String(item?.sizeLabel || '')
    );
    const sizeCandidates = [
      selected?.boqReferencePrice,
      selected?.referencePrice,
      selected?.materialCost,
      selected?.unitPrice,
      selected?.price
    ];

    for (const candidate of sizeCandidates) {
      if (candidate !== '' && candidate !== null && candidate !== undefined) {
        const amount = numberValue(candidate);
        if (amount >= 0) return amount;
      }
    }
    return 0;
  }

  function projectRow(item) {
    const plant = plantById(item?.plantId) || {};
    const category = plant.category || item?.category || '';
    return {
      id: `project-${item?.id || ''}`,
      section: sectionForCategory(category),
      itemNo: '',
      description: plant.commonName || item?.commonName || 'Landscape item',
      botanicalName: plant.scientificName || plant.material || item?.scientificName || '',
      sourceType: 'project',
      sourceProjectItemId: String(item?.id || ''),
      plantId: String(item?.plantId || ''),
      base: {
        spec: String(item?.sizeLabel || ''),
        height: String(plant.matureHeight || ''),
        spread: String(plant.matureSpread || ''),
        area: '',
        spacing: String(item?.spacing || plant.spacing || ''),
        quantity: Math.max(0, numberValue(item?.quantity)),
        unit: String(item?.unit || 'pc/s'),
        materialCost: Math.max(0, referencePrice(item, plant)),
        laborCost: 0
      }
    };
  }

  function syncMissingProjectPlants(projectId) {
    const project = projectById(projectId);
    if (!project) return 0;

    const allDrafts = readJSON(BOQ_STORAGE_KEY, {});
    if (!allDrafts || typeof allDrafts !== 'object' || Array.isArray(allDrafts)) return 0;

    const draft = allDrafts[String(project.id)];
    if (!draft || !Array.isArray(draft.rows)) {
      // A new BOQ draft is generated by the main BOQ creator and already includes all project plants.
      return 0;
    }

    draft.presets = draft.presets && typeof draft.presets === 'object' ? draft.presets : {};
    draft.scenarios = draft.scenarios && typeof draft.scenarios === 'object' ? draft.scenarios : {};
    DENSITY_IDS.forEach(id => {
      draft.presets[id] = { ...defaultPreset(id), ...(draft.presets[id] || {}) };
      if (!draft.scenarios[id] || typeof draft.scenarios[id] !== 'object') draft.scenarios[id] = {};
    });

    const existingIds = new Set(draft.rows.map(row => String(row?.id || '')));
    let added = 0;

    (Array.isArray(project.items) ? project.items : []).forEach(item => {
      if (!item?.id) return;
      const rowId = `project-${item.id}`;
      if (existingIds.has(rowId)) return;

      const row = projectRow(item);
      draft.rows.push(row);
      DENSITY_IDS.forEach(id => {
        draft.scenarios[id][row.id] = scenarioFromBase(row, draft.presets[id]);
      });
      existingIds.add(rowId);
      added += 1;
    });

    if (!added) return 0;

    draft.projectName = String(draft.projectName || project.name || '');
    draft.location = String(draft.location || project.location || '');
    draft.updatedAt = new Date().toISOString();
    allDrafts[String(project.id)] = draft;
    writeJSON(BOQ_STORAGE_KEY, allDrafts);
    return added;
  }

  function projectIdFromAddForm(form) {
    if (!form) return '';
    const hidden = form.querySelector('[name="projectIdHidden"]');
    const select = form.querySelector('[name="projectId"]');
    return String(hidden?.value || select?.value || '');
  }

  function applyTableZoom() {
    const backdrop = document.getElementById('boqCreatorBackdrop');
    if (!backdrop || backdrop.hidden) return;
    const table = backdrop.querySelector('.boq-editor-table');
    if (table) table.style.setProperty('zoom', String(zoomPercent / 100));

    const label = backdrop.querySelector('[data-boq-zoom-label]');
    if (label) {
      label.textContent = `${zoomPercent}%`;
      label.setAttribute('aria-label', `Reset BOQ zoom. Current zoom ${zoomPercent} percent`);
    }

    const out = backdrop.querySelector('[data-boq-zoom-out]');
    const increase = backdrop.querySelector('[data-boq-zoom-in]');
    if (out) out.disabled = zoomPercent <= MIN_ZOOM;
    if (increase) increase.disabled = zoomPercent >= MAX_ZOOM;
  }

  function setZoom(nextValue) {
    zoomPercent = clamp(Math.round(nextValue), MIN_ZOOM, MAX_ZOOM);
    saveZoom();
    applyTableZoom();
  }

  function ensureZoomControls() {
    const backdrop = document.getElementById('boqCreatorBackdrop');
    if (!backdrop || backdrop.hidden) return;

    const dialog = backdrop.querySelector('.boq-dialog');
    if (dialog) dialog.classList.add('boq-compact-mode');

    const heading = backdrop.querySelector('.boq-table-heading');
    if (!heading) return;

    let controls = heading.querySelector('.boq-zoom-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'boq-zoom-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'BOQ table zoom');
      controls.innerHTML = `
        <button type="button" data-boq-zoom-out aria-label="Zoom out BOQ table" title="Zoom out">−</button>
        <button type="button" data-boq-zoom-label aria-label="Reset BOQ zoom" title="Reset zoom">${zoomPercent}%</button>
        <button type="button" data-boq-zoom-in aria-label="Zoom in BOQ table" title="Zoom in">+</button>
      `;
      heading.appendChild(controls);
    }

    applyTableZoom();

    if (pendingSyncCount > 0) {
      const status = backdrop.querySelector('#boqSaveStatus');
      if (status) {
        status.textContent = `${pendingSyncCount} new project plant${pendingSyncCount === 1 ? '' : 's'} added automatically to the BOQ.`;
        pendingSyncCount = 0;
      }
    }
  }



  function rectanglesOverlap(first, second, padding = 4) {
    return (
      first.left < second.right - padding &&
      first.right > second.left + padding &&
      first.top < second.bottom - padding &&
      first.bottom > second.top + padding
    );
  }

  function isVisibleButton(button) {
    if (!(button instanceof HTMLElement) || button.disabled) return false;
    const style = window.getComputedStyle(button);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0 ||
      style.pointerEvents === 'none'
    ) return false;
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function updateHelpVisibility() {
    const body = document.body;
    if (!body.classList.contains('boq-open')) {
      body.classList.remove('boq-help-obstructing');
      return;
    }

    const help = document.getElementById('feedbackWidget') || document.querySelector('.feedback-widget');
    if (!help) {
      body.classList.remove('boq-help-obstructing');
      return;
    }

    const activeRoots = [
      document.getElementById('boqCreatorBackdrop'),
      document.getElementById('quotationCreatorBackdrop'),
      document.getElementById('costingSuiteBackdrop'),
      document.getElementById('modalRoot')
    ].filter(root => root && !root.hidden);

    if (!activeRoots.length) {
      body.classList.remove('boq-help-obstructing');
      return;
    }

    body.classList.remove('boq-help-obstructing');
    if (body.classList.contains('boq-is-scrolling')) return;

    const helpRect = help.getBoundingClientRect();
    const candidateButtons = activeRoots.flatMap(root =>
      Array.from(root.querySelectorAll('button, [role="button"]'))
    );

    const overlapsButton = candidateButtons.some(button => {
      if (button.closest('#feedbackWidget, .feedback-widget, .boq-zoom-controls')) return false;
      if (!isVisibleButton(button)) return false;
      return rectanglesOverlap(helpRect, button.getBoundingClientRect(), 5);
    });

    body.classList.toggle('boq-help-obstructing', overlapsButton);
  }

  function scheduleHelpVisibility() {
    if (helpVisibilityFrame) return;
    helpVisibilityFrame = requestAnimationFrame(() => {
      helpVisibilityFrame = 0;
      updateHelpVisibility();
    });
  }

  function markBoqScrolling() {
    if (!document.body.classList.contains('boq-open')) return;
    document.body.classList.add('boq-is-scrolling');
    window.clearTimeout(helpScrollTimer);
    helpScrollTimer = window.setTimeout(() => {
      document.body.classList.remove('boq-is-scrolling');
      scheduleHelpVisibility();
    }, 520);
  }

  function isInsideBoq(target) {
    return target instanceof Element && Boolean(target.closest('#boqCreatorBackdrop'));
  }

  function scheduleEnhancements() {
    if (enhancementFrame) return;
    enhancementFrame = requestAnimationFrame(() => {
      enhancementFrame = 0;
      ensureZoomControls();
      scheduleHelpVisibility();
    });
  }

  document.addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-boq-open]');
    if (!button) return;
    pendingSyncCount = syncMissingProjectPlants(button.dataset.boqOpen);
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const button = event.target.closest('[data-boq-open]');
    if (!button) return;
    pendingSyncCount = syncMissingProjectPlants(button.dataset.boqOpen);
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target.closest('#addToProjectForm');
    if (!form) return;
    const projectId = projectIdFromAddForm(form);
    setTimeout(() => {
      const added = syncMissingProjectPlants(projectId);
      if (added) pendingSyncCount = added;
    }, 0);
  }, true);

  document.addEventListener('click', event => {
    if (event.target.closest('[data-boq-close]')) {
      setTimeout(scheduleHelpVisibility, 0);
    }
    if (event.target.closest('[data-boq-zoom-out]')) {
      event.preventDefault();
      event.stopPropagation();
      setZoom(zoomPercent - ZOOM_STEP);
      return;
    }
    if (event.target.closest('[data-boq-zoom-in]')) {
      event.preventDefault();
      event.stopPropagation();
      setZoom(zoomPercent + ZOOM_STEP);
      return;
    }
    if (event.target.closest('[data-boq-zoom-label]')) {
      event.preventDefault();
      event.stopPropagation();
      setZoom(100);
    }
  }, true);


  document.addEventListener('wheel', event => {
    if (isInsideBoq(event.target)) markBoqScrolling();
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', event => {
    if (isInsideBoq(event.target)) markBoqScrolling();
  }, { capture: true, passive: true });

  document.addEventListener('scroll', event => {
    if (isInsideBoq(event.target) || (event.target === document && document.body.classList.contains('boq-open'))) {
      markBoqScrolling();
    }
  }, true);


  document.addEventListener('pointermove', event => {
    if (document.body.classList.contains('boq-open')) scheduleHelpVisibility();
  }, { capture: true, passive: true });

  document.addEventListener('focusin', () => {
    if (document.body.classList.contains('boq-open')) scheduleHelpVisibility();
  }, true);

  const observer = new MutationObserver(scheduleEnhancements);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleEnhancements);
  window.addEventListener('resize', scheduleEnhancements, { passive: true });
  scheduleEnhancements();
})();