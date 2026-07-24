(function () {
  'use strict';

  const PROJECT_KEY = 'greenscape-plant-library-projects-v1';
  const PLANT_KEY = 'greenscape-plant-library-plants-v1';
  const BOQ_KEY = 'greenscape-plant-library-boq-v1';
  const COSTING_KEY = 'greenscape-plant-library-project-costing-v1';
  const DENSITIES = ['100', '50', '35'];

  let activeProjectId = '';
  let activeSuite = null;
  let returnFocus = null;
  let saveTimer = 0;
  let scrollTimer = 0;

  const escapeHTML = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function numberValue(value) {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function positive(value) {
    return Math.max(0, numberValue(value));
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function currency(value) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numberValue(value));
  }

  function formatNumber(value, digits = 2) {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: digits }).format(numberValue(value));
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function projects() {
    const value = readJSON(PROJECT_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function plants() {
    const stored = readJSON(PLANT_KEY, null);
    if (Array.isArray(stored)) return stored;
    return Array.isArray(window.GREENSCAPE_PLANT_DATA) ? window.GREENSCAPE_PLANT_DATA : [];
  }

  function projectById(projectId) {
    return projects().find(project => String(project.id) === String(projectId));
  }

  function plantById(plantId) {
    return plants().find(plant => String(plant.id) === String(plantId));
  }

  function allSuites() {
    const value = readJSON(COSTING_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function allBoqs() {
    const value = readJSON(BOQ_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function defaultPresets() {
    return {
      '100': { label: '100% Density and Specs', densityPercent: 100, specPercent: 100, spacingPercent: 100, pricePercent: 100 },
      '50': { label: '50% Density and Specs', densityPercent: 50, specPercent: 83, spacingPercent: 115, pricePercent: 85 },
      '35': { label: '35% Density and Specs', densityPercent: 35, specPercent: 67, spacingPercent: 130, pricePercent: 70 }
    };
  }

  function categoryWaterRate(category, unit) {
    const text = String(category || '').toLowerCase();
    const unitText = String(unit || '').toLowerCase();
    if (unitText.includes('sq') || unitText.includes('m2') || unitText.includes('sqm')) return 5;
    if (text.includes('palm') || text.includes('tree') || text.includes('bamboo')) return 20;
    if (text.includes('grass') || text.includes('ground')) return 5;
    if (text.includes('shrub') || text.includes('fern') || text.includes('climber')) return 4;
    return 6;
  }

  function parseSpacing(value) {
    const raw = String(value || '').toLowerCase();
    const matches = raw.match(/\d+(?:\.\d+)?/g) || [];
    const convert = amount => {
      const number = positive(amount);
      if (raw.includes('mm')) return number / 1000;
      if (raw.includes('cm')) return number / 100;
      return number;
    };
    const first = convert(matches[0] || 0);
    const second = convert(matches[1] || matches[0] || 0);
    return { x: first, y: second };
  }

  function referencePrice(item, plant) {
    const candidates = [
      item?.boqReferencePrice,
      item?.referencePrice,
      item?.materialUnitCost,
      item?.materialCost,
      item?.unitPrice,
      item?.price
    ];
    for (const candidate of candidates) {
      if (candidate !== '' && candidate !== null && candidate !== undefined) return positive(candidate);
    }
    const size = (plant?.sizes || []).find(record =>
      String(record.label || record.size || '') === String(item?.sizeLabel || '')
    );
    const sizeCandidates = [size?.boqReferencePrice, size?.referencePrice, size?.materialCost, size?.unitPrice, size?.price];
    for (const candidate of sizeCandidates) {
      if (candidate !== '' && candidate !== null && candidate !== undefined) return positive(candidate);
    }
    return 0;
  }

  function defaultSpec(item) {
    const plant = plantById(item.plantId) || {};
    const spacing = parseSpacing(item.spacing || plant.spacing || '');
    return {
      projectItemId: String(item.id || uid('item')),
      plantId: String(item.plantId || ''),
      code: String(plant.code || item.plantCode || ''),
      commonName: String(plant.commonName || item.commonName || 'Landscape item'),
      botanicalName: String(plant.scientificName || item.scientificName || ''),
      category: String(plant.category || item.category || ''),
      size: String(item.sizeLabel || ''),
      height: String(plant.matureHeight || ''),
      spread: String(plant.matureSpread || ''),
      area: 0,
      spacingX: spacing.x,
      spacingY: spacing.y,
      quantity: positive(item.quantity),
      unit: String(item.unit || 'pc/s'),
      materialCost: referencePrice(item, plant),
      laborCost: 0,
      waterRate: categoryWaterRate(plant.category || item.category, item.unit),
      maintenanceClass: 'Moderate'
    };
  }

  function syncSpecs(project, currentSpecs) {
    const stored = new Map((Array.isArray(currentSpecs) ? currentSpecs : []).map(spec => [String(spec.projectItemId), spec]));
    return (Array.isArray(project.items) ? project.items : []).map(item => ({
      ...defaultSpec(item),
      ...(stored.get(String(item.id)) || {}),
      projectItemId: String(item.id)
    }));
  }

  function createSuite(project) {
    return {
      version: 1,
      projectId: String(project.id),
      projectName: String(project.name || ''),
      location: String(project.location || ''),
      client: String(project.client || ''),
      activeTab: 'overview',
      selectedDensity: '100',
      densityPresets: defaultPresets(),
      specs: syncSpecs(project, []),
      quantityCalculator: {
        projectItemId: String(project.items?.[0]?.id || ''),
        area: positive(project.areaSize),
        spacingX: 1,
        spacingY: 1,
        plantingPattern: 'square',
        densityPercent: 100,
        wastePercent: 5,
        result: 0
      },
      maintenance: {
        visitsPerMonth: 4,
        months: 12,
        gardeners: 2,
        daysPerVisit: 1,
        dailyRate: 650,
        transportPerVisit: 1000,
        equipmentPerMonth: 1500,
        additionalConsumablesPerMonth: 1000
      },
      water: {
        irrigationDaysPerMonth: 30,
        waterCostPerCubicMeter: 50
      },
      consumables: [
        { id: uid('cons'), description: 'Fertilizer', quantity: 1, unit: 'lot', unitCost: 0, usesPerMonth: 1 },
        { id: uid('cons'), description: 'Root booster / fungicide', quantity: 1, unit: 'lot', unitCost: 0, usesPerMonth: 1 }
      ],
      manpower: [
        { id: uid('man'), role: 'Leadman', workers: 1, dailyRate: 900, projectDays: 0, overtimeHours: 0, overtimeRate: 0 },
        { id: uid('man'), role: 'Gardener', workers: 4, dailyRate: 650, projectDays: 0, overtimeHours: 0, overtimeRate: 0 }
      ],
      duration: {
        workUnits: 0,
        workers: 0,
        productivityPerWorkerDay: 18,
        contingencyPercent: 10,
        workingDaysPerWeek: 6
      },
      tools: [
        { id: uid('tool'), description: 'Grass cutter', quantity: 1, unitCost: 0, allocationPercent: 100 },
        { id: uid('tool'), description: 'Wheelbarrow and hand tools', quantity: 1, unitCost: 0, allocationPercent: 100 }
      ],
      rentals: [
        { id: uid('rent'), description: 'Water tank / delivery vehicle', days: 0, dailyRate: 0, fuelLitersPerDay: 0, fuelPrice: 0, deliveryCost: 0 }
      ],
      controls: {
        includeConsumables: true,
        includeManpower: true,
        includeTools: true,
        includeRentals: true,
        includeMaintenance: false,
        safetyPercent: 2,
        adminPercent: 10,
        profitPercent: 15,
        taxPercent: 0,
        vatPercent: 12
      },
      soa: {
        contractAmount: 0,
        variationOrders: 0,
        discount: 0,
        retentionPercent: 10,
        billings: [],
        payments: []
      },
      notes: '',
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeSuite(source, project) {
    const fresh = createSuite(project);
    const value = source && typeof source === 'object' ? source : {};
    const presets = defaultPresets();
    DENSITIES.forEach(id => { presets[id] = { ...presets[id], ...(value.densityPresets?.[id] || {}) }; });
    return {
      ...fresh,
      ...value,
      projectId: String(project.id),
      projectName: String(value.projectName ?? project.name ?? ''),
      location: String(value.location ?? project.location ?? ''),
      client: String(value.client ?? project.client ?? ''),
      activeTab: String(value.activeTab || 'overview'),
      selectedDensity: DENSITIES.includes(String(value.selectedDensity)) ? String(value.selectedDensity) : '100',
      densityPresets: presets,
      specs: syncSpecs(project, value.specs),
      quantityCalculator: { ...fresh.quantityCalculator, ...(value.quantityCalculator || {}) },
      maintenance: { ...fresh.maintenance, ...(value.maintenance || {}) },
      water: { ...fresh.water, ...(value.water || {}) },
      consumables: Array.isArray(value.consumables) ? value.consumables : fresh.consumables,
      manpower: Array.isArray(value.manpower) ? value.manpower : fresh.manpower,
      duration: { ...fresh.duration, ...(value.duration || {}) },
      tools: Array.isArray(value.tools) ? value.tools : fresh.tools,
      rentals: Array.isArray(value.rentals) ? value.rentals : fresh.rentals,
      controls: { ...fresh.controls, ...(value.controls || {}) },
      soa: {
        ...fresh.soa,
        ...(value.soa || {}),
        billings: Array.isArray(value.soa?.billings) ? value.soa.billings : [],
        payments: Array.isArray(value.soa?.payments) ? value.soa.payments : []
      }
    };
  }

  function scaleMeasurement(value, percent) {
    const raw = String(value || '').trim();
    if (!raw || positive(percent) === 100) return raw;
    const factor = positive(percent) / 100;
    return raw.replace(/\d+(?:\.\d+)?/g, match => {
      const scaled = numberValue(match) * factor;
      return String(Math.round(scaled * 10) / 10).replace(/\.0$/, '');
    });
  }

  function scenarioFromBase(row, preset) {
    const densityItem = !['PRELIMINARIES', 'EARTHWORKS AND OTHER LANDSCAPING MATERIALS'].includes(row.section);
    const densityFactor = densityItem ? positive(preset.densityPercent) / 100 : 1;
    const priceFactor = densityItem ? positive(preset.pricePercent) / 100 : 1;
    const base = row.base || {};
    return {
      spec: scaleMeasurement(base.spec, preset.specPercent),
      height: scaleMeasurement(base.height, preset.specPercent),
      spread: scaleMeasurement(base.spread, preset.specPercent),
      area: base.area || '',
      spacing: scaleMeasurement(base.spacing, preset.spacingPercent),
      quantity: densityItem ? Math.ceil(positive(base.quantity) * densityFactor) : positive(base.quantity),
      unit: base.unit || 'pc/s',
      materialCost: Math.round(positive(base.materialCost) * priceFactor * 100) / 100,
      laborCost: Math.round(positive(base.laborCost) * priceFactor * 100) / 100
    };
  }

  function boqTotalsFor(densityId) {
    const draft = allBoqs()[activeProjectId];
    if (draft?.rows?.length) {
      const scenario = draft.scenarios?.[densityId] || {};
      let subtotal = 0;
      draft.rows.forEach(row => {
        const values = scenario[row.id] || scenarioFromBase(row, draft.presets?.[densityId] || activeSuite.densityPresets[densityId]);
        subtotal += positive(values.quantity) * (positive(values.materialCost) + positive(values.laborCost));
      });
      const vatRate = positive(draft.vatPercent);
      const vat = draft.vatInclusive ? (vatRate ? subtotal * vatRate / (100 + vatRate) : 0) : subtotal * vatRate / 100;
      return { subtotal, vat, grandTotal: draft.vatInclusive ? subtotal : subtotal + vat, source: 'BOQ draft' };
    }

    const preset = activeSuite.densityPresets[densityId];
    let subtotal = 0;
    activeSuite.specs.forEach(spec => {
      const quantity = Math.ceil(positive(spec.quantity) * positive(preset.densityPercent) / 100);
      const price = (positive(spec.materialCost) + positive(spec.laborCost)) * positive(preset.pricePercent) / 100;
      subtotal += quantity * price;
    });
    return { subtotal, vat: 0, grandTotal: subtotal, source: 'Specification matrix estimate' };
  }

  function consumablesTotals() {
    const monthly = activeSuite.consumables.reduce((sum, row) =>
      sum + positive(row.quantity) * positive(row.unitCost) * positive(row.usesPerMonth), 0);
    return { monthly, annual: monthly * 12 };
  }

  function manpowerTotal() {
    return activeSuite.manpower.reduce((sum, row) => {
      const basic = positive(row.workers) * positive(row.dailyRate) * positive(row.projectDays);
      const overtime = positive(row.workers) * positive(row.overtimeHours) * positive(row.overtimeRate);
      return sum + basic + overtime;
    }, 0);
  }

  function toolsTotal() {
    return activeSuite.tools.reduce((sum, row) =>
      sum + positive(row.quantity) * positive(row.unitCost) * positive(row.allocationPercent) / 100, 0);
  }

  function rentalsTotal() {
    return activeSuite.rentals.reduce((sum, row) => {
      const rental = positive(row.days) * positive(row.dailyRate);
      const fuel = positive(row.days) * positive(row.fuelLitersPerDay) * positive(row.fuelPrice);
      return sum + rental + fuel + positive(row.deliveryCost);
    }, 0);
  }

  function maintenanceTotals() {
    const value = activeSuite.maintenance;
    const labor = positive(value.visitsPerMonth) * positive(value.daysPerVisit) * positive(value.gardeners) * positive(value.dailyRate);
    const transport = positive(value.visitsPerMonth) * positive(value.transportPerVisit);
    const monthly = labor + transport + positive(value.equipmentPerMonth) +
      positive(value.additionalConsumablesPerMonth) + consumablesTotals().monthly;
    return { monthly, annual: monthly * positive(value.months), labor, transport };
  }

  function waterTotals() {
    const dailyLiters = activeSuite.specs.reduce((sum, spec) =>
      sum + positive(spec.quantity) * positive(spec.waterRate), 0);
    const monthlyLiters = dailyLiters * positive(activeSuite.water.irrigationDaysPerMonth);
    const monthlyCubicMeters = monthlyLiters / 1000;
    return {
      dailyLiters,
      monthlyLiters,
      monthlyCubicMeters,
      monthlyCost: monthlyCubicMeters * positive(activeSuite.water.waterCostPerCubicMeter)
    };
  }

  function durationTotals() {
    const autoUnits = activeSuite.specs.reduce((sum, spec) => sum + positive(spec.quantity), 0);
    const autoWorkers = activeSuite.manpower.reduce((sum, row) => sum + positive(row.workers), 0);
    const units = positive(activeSuite.duration.workUnits) || autoUnits;
    const workers = positive(activeSuite.duration.workers) || autoWorkers || 1;
    const productivity = positive(activeSuite.duration.productivityPerWorkerDay) || 1;
    const rawDays = units / (workers * productivity);
    const days = Math.max(0, Math.ceil(rawDays * (1 + positive(activeSuite.duration.contingencyPercent) / 100)));
    const weeks = positive(activeSuite.duration.workingDaysPerWeek)
      ? days / positive(activeSuite.duration.workingDaysPerWeek)
      : 0;
    return { units, workers, days, weeks, productivity };
  }

  function costingSummary() {
    const boq = boqTotalsFor(activeSuite.selectedDensity);
    const consumables = consumablesTotals().annual;
    const manpower = manpowerTotal();
    const tools = toolsTotal();
    const rentals = rentalsTotal();
    const maintenance = maintenanceTotals().annual;
    const controls = activeSuite.controls;
    const additions =
      (controls.includeConsumables ? consumables : 0) +
      (controls.includeManpower ? manpower : 0) +
      (controls.includeTools ? tools : 0) +
      (controls.includeRentals ? rentals : 0) +
      (controls.includeMaintenance ? maintenance : 0);
    const direct = boq.subtotal + additions;
    const safety = direct * positive(controls.safetyPercent) / 100;
    const admin = direct * positive(controls.adminPercent) / 100;
    const profitBase = direct + safety + admin;
    const profit = profitBase * positive(controls.profitPercent) / 100;
    const preTax = profitBase + profit;
    const tax = preTax * positive(controls.taxPercent) / 100;
    const vat = (preTax + tax) * positive(controls.vatPercent) / 100;
    return {
      boq, consumables, manpower, tools, rentals, maintenance, additions,
      direct, safety, admin, profit, preTax, tax, vat,
      finalTotal: preTax + tax + vat
    };
  }

  function soaTotals() {
    const summary = costingSummary();
    const soa = activeSuite.soa;
    const contract = positive(soa.contractAmount) || summary.finalTotal;
    const billings = soa.billings.reduce((sum, row) => sum + positive(row.amount), 0);
    const payments = soa.payments.reduce((sum, row) => sum + positive(row.amount), 0);
    const adjustedContract = contract + positive(soa.variationOrders) - positive(soa.discount);
    const retention = billings * positive(soa.retentionPercent) / 100;
    const currentDue = Math.max(0, billings - retention - payments);
    const balance = Math.max(0, adjustedContract - payments);
    return { contract, adjustedContract, billings, payments, retention, currentDue, balance };
  }

  function saveSuite(showMessage = false) {
    if (!activeSuite || !activeProjectId) return;
    activeSuite.updatedAt = new Date().toISOString();
    const records = allSuites();
    records[activeProjectId] = activeSuite;
    writeJSON(COSTING_KEY, records);
    const status = document.getElementById('costingSaveStatus');
    if (status && showMessage) status.textContent = `Saved ${new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}.`;
  }

  function queueSave() {
    clearTimeout(saveTimer);
    const status = document.getElementById('costingSaveStatus');
    if (status) status.textContent = 'Saving changes…';
    saveTimer = setTimeout(() => saveSuite(true), 500);
  }

  function setByPath(object, path, value) {
    const parts = String(path).split('.');
    let target = object;
    parts.slice(0, -1).forEach(part => {
      if (!target[part] || typeof target[part] !== 'object') target[part] = {};
      target = target[part];
    });
    target[parts.at(-1)] = value;
  }

  function ensureBackdrop() {
    let backdrop = document.getElementById('costingSuiteBackdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'costingSuiteBackdrop';
    backdrop.className = 'costing-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = '<section class="costing-dialog" role="dialog" aria-modal="true" aria-labelledby="costingTitle" tabindex="-1"><div id="costingDialogContent"></div></section>';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('scroll', markScrolling, { passive: true });
    return backdrop;
  }

  function markScrolling() {
    if (!document.body.classList.contains('costing-open')) return;
    document.body.classList.add('costing-scrolling');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => document.body.classList.remove('costing-scrolling'), 450);
  }

  function openSuite(projectId) {
    const project = projectById(projectId);
    if (!project) return;
    activeProjectId = String(project.id);
    activeSuite = normalizeSuite(allSuites()[activeProjectId], project);
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    renderDialog();
    const backdrop = ensureBackdrop();
    backdrop.hidden = false;
    backdrop.scrollTop = 0;
    document.body.classList.add('costing-open');
    backdrop.querySelector('.costing-dialog')?.focus({ preventScroll: true });
  }

  function closeSuite() {
    saveSuite(false);
    ensureBackdrop().hidden = true;
    document.body.classList.remove('costing-open', 'costing-scrolling');
    activeProjectId = '';
    activeSuite = null;
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function tabsHTML() {
    const tabs = [
      ['overview', 'Cost Summary'],
      ['boq', 'BOQ Comparison'],
      ['plants', 'Quantity & Specs'],
      ['maintenance', 'Maintenance & Water'],
      ['operations', 'Operations'],
      ['controls', 'Controls & SOA'],
      ['export', 'Complete Export']
    ];
    return tabs.map(([id, label]) =>
      `<button type="button" class="costing-tab${activeSuite.activeTab === id ? ' active' : ''}" data-costing-tab="${id}">${label}</button>`
    ).join('');
  }

  function card(label, value, note = '') {
    return `<article class="costing-stat"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong>${note ? `<small>${escapeHTML(note)}</small>` : ''}</article>`;
  }

  function comparisonBarsHTML() {
    const records = DENSITIES.map(id => ({ id, preset: activeSuite.densityPresets[id], totals: boqTotalsFor(id) }));
    const maximum = Math.max(...records.map(record => record.totals.grandTotal), 1);
    return records.map(record => `
      <div class="costing-bar-row">
        <div><strong>${escapeHTML(record.preset.label)}</strong><small>${escapeHTML(record.totals.source)}</small></div>
        <div class="costing-bar-track"><i style="width:${Math.max(2, record.totals.grandTotal / maximum * 100)}%"></i></div>
        <span>${currency(record.totals.grandTotal)}</span>
      </div>`).join('');
  }

  function overviewHTML() {
    const summary = costingSummary();
    const duration = durationTotals();
    const water = waterTotals();
    return `<div class="costing-stack">
      <section class="costing-stats-grid">
        ${card('Selected BOQ', currency(summary.boq.subtotal), activeSuite.densityPresets[activeSuite.selectedDensity].label)}
        ${card('Direct project cost', currency(summary.direct), 'BOQ plus included add-ons')}
        ${card('Final project cost', currency(summary.finalTotal), 'After admin, profit, safety and taxes')}
        ${card('Projected duration', `${formatNumber(duration.days, 0)} days`, `${formatNumber(duration.weeks, 1)} working weeks`)}
        ${card('Maintenance', currency(summary.maintenance), 'Projected annual cost')}
        ${card('Monthly water', `${formatNumber(water.monthlyCubicMeters)} m³`, currency(water.monthlyCost))}
      </section>

      <section class="costing-panel">
        <header><div><span>Cost comparison dashboard</span><h3>100% / 50% / 35% BOQ</h3></div>
          <label class="costing-inline-select"><span>Use for costing</span><select data-cost-path="selectedDensity">${DENSITIES.map(id => `<option value="${id}"${activeSuite.selectedDensity === id ? ' selected' : ''}>${escapeHTML(activeSuite.densityPresets[id].label)}</option>`).join('')}</select></label>
        </header>
        <div class="costing-bars">${comparisonBarsHTML()}</div>
      </section>

      <section class="costing-panel">
        <header><div><span>Project costing summary</span><h3>Cost build-up</h3></div></header>
        <div class="costing-summary-table">
          ${summaryRow('BOQ direct cost', summary.boq.subtotal)}
          ${summaryRow('Consumables', summary.consumables, activeSuite.controls.includeConsumables)}
          ${summaryRow('Manpower', summary.manpower, activeSuite.controls.includeManpower)}
          ${summaryRow('Tools and equipment', summary.tools, activeSuite.controls.includeTools)}
          ${summaryRow('Rental and fuel', summary.rentals, activeSuite.controls.includeRentals)}
          ${summaryRow('Maintenance contract', summary.maintenance, activeSuite.controls.includeMaintenance)}
          ${summaryRow('Safety requirements', summary.safety)}
          ${summaryRow('Administration', summary.admin)}
          ${summaryRow('Profit', summary.profit)}
          ${summaryRow('Other tax', summary.tax)}
          ${summaryRow('VAT', summary.vat)}
          <div class="grand"><strong>Final project cost</strong><strong>${currency(summary.finalTotal)}</strong></div>
        </div>
      </section>
    </div>`;
  }

  function summaryRow(label, amount, included) {
    const note = included === undefined ? '' : `<em>${included ? 'included' : 'not included'}</em>`;
    return `<div><span>${escapeHTML(label)} ${note}</span><strong>${currency(amount)}</strong></div>`;
  }

  function boqHTML() {
    return `<div class="costing-stack">
      <section class="costing-panel">
        <header><div><span>BOQ comparison</span><h3>Density option totals</h3></div><button class="button secondary small" type="button" data-costing-open-boq>Open full BOQ</button></header>
        <div class="costing-comparison-grid">
          ${DENSITIES.map(id => {
            const total = boqTotalsFor(id);
            return `<article class="${activeSuite.selectedDensity === id ? 'selected' : ''}">
              <span>${escapeHTML(activeSuite.densityPresets[id].label)}</span>
              <strong>${currency(total.grandTotal)}</strong>
              <small>${escapeHTML(total.source)}</small>
              <button type="button" data-costing-density-use="${id}">Use this option</button>
            </article>`;
          }).join('')}
        </div>
      </section>

      <section class="costing-panel">
        <header><div><span>Density specification presets</span><h3>Quantity, size, spacing and price factors</h3></div>
          <button class="button primary small" type="button" data-costing-apply-presets>Apply and recalculate BOQ</button>
        </header>
        <div class="costing-preset-grid">
          ${DENSITIES.map(id => presetEditorHTML(id)).join('')}
        </div>
        <p class="costing-note">Applying presets recalculates the three BOQ scenarios. Manual scenario edits in the BOQ will be replaced.</p>
      </section>
    </div>`;
  }

  function presetEditorHTML(id) {
    const preset = activeSuite.densityPresets[id];
    return `<article>
      <h4>${escapeHTML(preset.label)}</h4>
      ${inputField('Density / quantity %', `densityPresets.${id}.densityPercent`, preset.densityPercent, 'number')}
      ${inputField('Plant specification %', `densityPresets.${id}.specPercent`, preset.specPercent, 'number')}
      ${inputField('Spacing adjustment %', `densityPresets.${id}.spacingPercent`, preset.spacingPercent, 'number')}
      ${inputField('Unit price adjustment %', `densityPresets.${id}.pricePercent`, preset.pricePercent, 'number')}
    </article>`;
  }

  function quantityResult() {
    const calc = activeSuite.quantityCalculator;
    const x = positive(calc.spacingX);
    const y = positive(calc.spacingY);
    if (!x || !y) return 0;
    const patternFactor = calc.plantingPattern === 'triangular' ? 0.866 : 1;
    const base = positive(calc.area) / (x * y * patternFactor);
    return Math.ceil(base * positive(calc.densityPercent) / 100 * (1 + positive(calc.wastePercent) / 100));
  }

  function plantsHTML() {
    const calc = activeSuite.quantityCalculator;
    const result = quantityResult();
    calc.result = result;
    return `<div class="costing-stack">
      <section class="costing-panel">
        <header><div><span>Automatic plant quantity calculator</span><h3>Area ÷ spacing with density and allowance</h3></div></header>
        <div class="costing-form-grid">
          <label><span>Project plant</span><select data-cost-path="quantityCalculator.projectItemId">${activeSuite.specs.map(spec => `<option value="${escapeHTML(spec.projectItemId)}"${String(calc.projectItemId) === String(spec.projectItemId) ? ' selected' : ''}>${escapeHTML(spec.code)} — ${escapeHTML(spec.commonName)}</option>`).join('')}</select></label>
          ${inputField('Planting area (sqm)', 'quantityCalculator.area', calc.area, 'number')}
          ${inputField('Spacing X (m)', 'quantityCalculator.spacingX', calc.spacingX, 'number')}
          ${inputField('Spacing Y (m)', 'quantityCalculator.spacingY', calc.spacingY, 'number')}
          <label><span>Planting pattern</span><select data-cost-path="quantityCalculator.plantingPattern"><option value="square"${calc.plantingPattern === 'square' ? ' selected' : ''}>Square / grid</option><option value="triangular"${calc.plantingPattern === 'triangular' ? ' selected' : ''}>Triangular</option><option value="rows"${calc.plantingPattern === 'rows' ? ' selected' : ''}>Rows</option></select></label>
          ${inputField('Density %', 'quantityCalculator.densityPercent', calc.densityPercent, 'number')}
          ${inputField('Waste / replacement %', 'quantityCalculator.wastePercent', calc.wastePercent, 'number')}
          <article class="costing-result-card"><span>Calculated quantity</span><strong>${formatNumber(result, 0)}</strong><small>Rounded up to whole units</small></article>
        </div>
        <div class="costing-panel-actions"><button class="button primary" type="button" data-costing-use-quantity>Use quantity in specification matrix and BOQ</button></div>
      </section>

      <section class="costing-panel">
        <header><div><span>Plant specification matrix</span><h3>${activeSuite.specs.length} project plant records</h3></div>
          <button class="button primary small" type="button" data-costing-push-specs>Push specifications and prices to BOQ</button>
        </header>
        <div class="costing-table-scroll">
          <table class="costing-table specification">
            <thead><tr><th>Code / Plant</th><th>Size</th><th>Height</th><th>Spread</th><th>Area</th><th>Spacing X</th><th>Spacing Y</th><th>Qty</th><th>Unit</th><th>Material</th><th>Labor</th><th>Water rate</th><th>Maintenance</th></tr></thead>
            <tbody>${activeSuite.specs.map((spec, index) => specRowHTML(spec, index)).join('')}</tbody>
          </table>
        </div>
      </section>
    </div>`;
  }

  function specRowHTML(spec, index) {
    return `<tr>
      <td><strong>${escapeHTML(spec.code)} — ${escapeHTML(spec.commonName)}</strong><small>${escapeHTML(spec.botanicalName)}</small></td>
      ${arrayCell('specs', index, 'size', spec.size)}
      ${arrayCell('specs', index, 'height', spec.height)}
      ${arrayCell('specs', index, 'spread', spec.spread)}
      ${arrayCell('specs', index, 'area', spec.area, 'number')}
      ${arrayCell('specs', index, 'spacingX', spec.spacingX, 'number')}
      ${arrayCell('specs', index, 'spacingY', spec.spacingY, 'number')}
      ${arrayCell('specs', index, 'quantity', spec.quantity, 'number')}
      ${arrayCell('specs', index, 'unit', spec.unit)}
      ${arrayCell('specs', index, 'materialCost', spec.materialCost, 'number')}
      ${arrayCell('specs', index, 'laborCost', spec.laborCost, 'number')}
      ${arrayCell('specs', index, 'waterRate', spec.waterRate, 'number')}
      <td><select data-cost-array="specs" data-cost-index="${index}" data-cost-field="maintenanceClass"><option${spec.maintenanceClass === 'Low' ? ' selected' : ''}>Low</option><option${spec.maintenanceClass === 'Moderate' ? ' selected' : ''}>Moderate</option><option${spec.maintenanceClass === 'High' ? ' selected' : ''}>High</option></select></td>
    </tr>`;
  }

  function maintenanceHTML() {
    const maintenance = maintenanceTotals();
    const water = waterTotals();
    return `<div class="costing-two-column">
      <section class="costing-panel">
        <header><div><span>Maintenance cost calculator</span><h3>Monthly and annual service estimate</h3></div></header>
        <div class="costing-form-grid compact">
          ${inputField('Visits per month', 'maintenance.visitsPerMonth', activeSuite.maintenance.visitsPerMonth, 'number')}
          ${inputField('Contract months', 'maintenance.months', activeSuite.maintenance.months, 'number')}
          ${inputField('Gardeners per visit', 'maintenance.gardeners', activeSuite.maintenance.gardeners, 'number')}
          ${inputField('Days per visit', 'maintenance.daysPerVisit', activeSuite.maintenance.daysPerVisit, 'number')}
          ${inputField('Daily rate', 'maintenance.dailyRate', activeSuite.maintenance.dailyRate, 'number')}
          ${inputField('Transport per visit', 'maintenance.transportPerVisit', activeSuite.maintenance.transportPerVisit, 'number')}
          ${inputField('Equipment per month', 'maintenance.equipmentPerMonth', activeSuite.maintenance.equipmentPerMonth, 'number')}
          ${inputField('Additional consumables / month', 'maintenance.additionalConsumablesPerMonth', activeSuite.maintenance.additionalConsumablesPerMonth, 'number')}
        </div>
        <div class="costing-mini-summary">
          ${summaryRow('Monthly maintenance', maintenance.monthly)}
          ${summaryRow('Annual maintenance', maintenance.annual)}
        </div>
      </section>

      <section class="costing-panel">
        <header><div><span>Water consumption calculator</span><h3>Plant-based irrigation estimate</h3></div></header>
        <div class="costing-form-grid compact">
          ${inputField('Irrigation days per month', 'water.irrigationDaysPerMonth', activeSuite.water.irrigationDaysPerMonth, 'number')}
          ${inputField('Water cost per cubic meter', 'water.waterCostPerCubicMeter', activeSuite.water.waterCostPerCubicMeter, 'number')}
        </div>
        <div class="costing-stats-grid small">
          ${card('Daily use', `${formatNumber(water.dailyLiters)} L`)}
          ${card('Monthly use', `${formatNumber(water.monthlyCubicMeters)} m³`)}
          ${card('Monthly water cost', currency(water.monthlyCost))}
        </div>
        <p class="costing-note">Edit each plant’s water rate in the Plant Specification Matrix. Rates are liters per plant or liters per square meter per irrigation day.</p>
      </section>
    </div>`;
  }

  function operationsHTML() {
    const duration = durationTotals();
    return `<div class="costing-stack">
      ${editableTablePanel('Consumables calculator', 'consumables', [
        ['description', 'Description'], ['quantity', 'Qty', 'number'], ['unit', 'Unit'], ['unitCost', 'Unit cost', 'number'], ['usesPerMonth', 'Uses / month', 'number']
      ], activeSuite.consumables, `${currency(consumablesTotals().monthly)} monthly · ${currency(consumablesTotals().annual)} annual`)}

      ${editableTablePanel('Manpower calculator', 'manpower', [
        ['role', 'Role'], ['workers', 'Workers', 'number'], ['dailyRate', 'Daily rate', 'number'], ['projectDays', 'Project days', 'number'], ['overtimeHours', 'OT hours / worker', 'number'], ['overtimeRate', 'OT rate', 'number']
      ], activeSuite.manpower, currency(manpowerTotal()))}

      <section class="costing-panel">
        <header><div><span>Projected work duration</span><h3>${formatNumber(duration.days, 0)} working days · ${formatNumber(duration.weeks, 1)} weeks</h3></div></header>
        <div class="costing-form-grid compact">
          ${inputField('Work units (0 = project quantity)', 'duration.workUnits', activeSuite.duration.workUnits, 'number')}
          ${inputField('Workers (0 = manpower total)', 'duration.workers', activeSuite.duration.workers, 'number')}
          ${inputField('Output per worker per day', 'duration.productivityPerWorkerDay', activeSuite.duration.productivityPerWorkerDay, 'number')}
          ${inputField('Contingency %', 'duration.contingencyPercent', activeSuite.duration.contingencyPercent, 'number')}
          ${inputField('Working days per week', 'duration.workingDaysPerWeek', activeSuite.duration.workingDaysPerWeek, 'number')}
        </div>
      </section>

      ${editableTablePanel('Tools and equipment budget', 'tools', [
        ['description', 'Tool / equipment'], ['quantity', 'Qty', 'number'], ['unitCost', 'Unit cost', 'number'], ['allocationPercent', 'Project allocation %', 'number']
      ], activeSuite.tools, currency(toolsTotal()))}

      ${editableTablePanel('Equipment rental and fuel costing', 'rentals', [
        ['description', 'Equipment / vehicle'], ['days', 'Days', 'number'], ['dailyRate', 'Daily rate', 'number'], ['fuelLitersPerDay', 'Fuel L/day', 'number'], ['fuelPrice', 'Fuel price', 'number'], ['deliveryCost', 'Delivery / hauling', 'number']
      ], activeSuite.rentals, currency(rentalsTotal()))}
    </div>`;
  }

  function editableTablePanel(title, arrayName, columns, rows, totalText) {
    return `<section class="costing-panel">
      <header><div><span>${escapeHTML(title)}</span><h3>${escapeHTML(totalText)}</h3></div><button class="button secondary small" type="button" data-costing-add-row="${arrayName}">+ Add row</button></header>
      <div class="costing-table-scroll"><table class="costing-table"><thead><tr>${columns.map(([, label]) => `<th>${escapeHTML(label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map((row, index) => `<tr>${columns.map(([field, , type]) => arrayCell(arrayName, index, field, row[field], type)).join('')}<td><button class="costing-remove" type="button" data-costing-remove-row="${arrayName}" data-cost-index="${index}" aria-label="Remove row">×</button></td></tr>`).join('')}</tbody></table></div>
    </section>`;
  }

  function controlsHTML() {
    const summary = costingSummary();
    const soa = soaTotals();
    return `<div class="costing-stack">
      <section class="costing-panel">
        <header><div><span>Admin, profit, safety and tax controls</span><h3>Final project cost: ${currency(summary.finalTotal)}</h3></div></header>
        <div class="costing-toggle-grid">
          ${toggleField('Include consumables', 'controls.includeConsumables', activeSuite.controls.includeConsumables)}
          ${toggleField('Include manpower', 'controls.includeManpower', activeSuite.controls.includeManpower)}
          ${toggleField('Include tools', 'controls.includeTools', activeSuite.controls.includeTools)}
          ${toggleField('Include rentals and fuel', 'controls.includeRentals', activeSuite.controls.includeRentals)}
          ${toggleField('Include maintenance contract', 'controls.includeMaintenance', activeSuite.controls.includeMaintenance)}
        </div>
        <div class="costing-form-grid compact">
          ${inputField('Safety %', 'controls.safetyPercent', activeSuite.controls.safetyPercent, 'number')}
          ${inputField('Administration %', 'controls.adminPercent', activeSuite.controls.adminPercent, 'number')}
          ${inputField('Profit %', 'controls.profitPercent', activeSuite.controls.profitPercent, 'number')}
          ${inputField('Other tax %', 'controls.taxPercent', activeSuite.controls.taxPercent, 'number')}
          ${inputField('VAT %', 'controls.vatPercent', activeSuite.controls.vatPercent, 'number')}
        </div>
        <div class="costing-mini-summary">
          ${summaryRow('Direct cost', summary.direct)}
          ${summaryRow('Safety', summary.safety)}
          ${summaryRow('Administration', summary.admin)}
          ${summaryRow('Profit', summary.profit)}
          ${summaryRow('Other tax', summary.tax)}
          ${summaryRow('VAT', summary.vat)}
          <div class="grand"><strong>Final project cost</strong><strong>${currency(summary.finalTotal)}</strong></div>
        </div>
      </section>

      <section class="costing-panel">
        <header><div><span>Project statement of account</span><h3>Outstanding balance: ${currency(soa.balance)}</h3></div></header>
        <div class="costing-form-grid compact">
          ${inputField('Contract amount (0 = costing total)', 'soa.contractAmount', activeSuite.soa.contractAmount, 'number')}
          ${inputField('Variation orders', 'soa.variationOrders', activeSuite.soa.variationOrders, 'number')}
          ${inputField('Discount', 'soa.discount', activeSuite.soa.discount, 'number')}
          ${inputField('Retention %', 'soa.retentionPercent', activeSuite.soa.retentionPercent, 'number')}
        </div>
        <div class="costing-two-column inner">
          ${soaTableHTML('Progress billings', 'billings', activeSuite.soa.billings)}
          ${soaTableHTML('Payments received', 'payments', activeSuite.soa.payments)}
        </div>
        <div class="costing-stats-grid small">
          ${card('Adjusted contract', currency(soa.adjustedContract))}
          ${card('Total billed', currency(soa.billings))}
          ${card('Retention', currency(soa.retention))}
          ${card('Total paid', currency(soa.payments))}
          ${card('Current amount due', currency(soa.currentDue))}
          ${card('Account balance', currency(soa.balance))}
        </div>
      </section>
    </div>`;
  }

  function soaTableHTML(title, name, rows) {
    return `<article class="costing-subpanel"><header><h4>${escapeHTML(title)}</h4><button type="button" data-costing-add-soa="${name}">+ Add</button></header>
      <div class="costing-table-scroll"><table class="costing-table compact"><thead><tr><th>Date</th><th>Reference / description</th><th>Amount</th><th></th></tr></thead>
      <tbody>${rows.map((row, index) => `<tr>
        ${arrayCell(`soa.${name}`, index, 'date', row.date, 'date')}
        ${arrayCell(`soa.${name}`, index, 'description', row.description)}
        ${arrayCell(`soa.${name}`, index, 'amount', row.amount, 'number')}
        <td><button class="costing-remove" type="button" data-costing-remove-soa="${name}" data-cost-index="${index}">×</button></td>
      </tr>`).join('')}</tbody></table></div></article>`;
  }

  function exportHTML() {
    const summary = costingSummary();
    const soa = soaTotals();
    return `<div class="costing-stack">
      <section class="costing-panel export-intro">
        <header><div><span>Complete project export</span><h3>${escapeHTML(activeSuite.projectName)}</h3></div></header>
        <p>Generate one complete project report containing the costing summary, BOQ comparison, specification matrix, maintenance and water estimates, manpower, duration, tools, rentals, controls, and statement of account.</p>
        <div class="costing-export-actions">
          <button class="button primary" type="button" data-costing-download-report>Download complete HTML report</button>
          <button class="button secondary" type="button" data-costing-print-report>Print / Save complete PDF</button>
          <button class="button secondary" type="button" data-costing-export-json>Export project costing JSON</button>
          <button class="button secondary" type="button" data-costing-export-csv>Export plant specification CSV</button>
        </div>
      </section>
      <section class="costing-stats-grid">
        ${card('Final project cost', currency(summary.finalTotal))}
        ${card('Selected BOQ', activeSuite.densityPresets[activeSuite.selectedDensity].label)}
        ${card('Account balance', currency(soa.balance))}
        ${card('Plant records', formatNumber(activeSuite.specs.length, 0))}
      </section>
    </div>`;
  }

  function activeContentHTML() {
    if (activeSuite.activeTab === 'boq') return boqHTML();
    if (activeSuite.activeTab === 'plants') return plantsHTML();
    if (activeSuite.activeTab === 'maintenance') return maintenanceHTML();
    if (activeSuite.activeTab === 'operations') return operationsHTML();
    if (activeSuite.activeTab === 'controls') return controlsHTML();
    if (activeSuite.activeTab === 'export') return exportHTML();
    return overviewHTML();
  }

  function dialogHTML() {
    return `<header class="costing-dialog-header">
      <div><span>Project costing</span><h2 id="costingTitle">Project Costing Suite</h2><p>${escapeHTML(activeSuite.projectName)} · ${escapeHTML(activeSuite.location || 'Location not set')}</p></div>
      <button class="costing-close" type="button" data-costing-close aria-label="Close costing suite">×</button>
    </header>
    <nav class="costing-tabs" aria-label="Costing sections">${tabsHTML()}</nav>
    <main class="costing-dialog-body">${activeContentHTML()}</main>
    <footer class="costing-dialog-footer"><span id="costingSaveStatus">Saved in this browser.</span><div><button class="button secondary" type="button" data-costing-save>Save</button><button class="button primary" type="button" data-costing-close>Done</button></div></footer>`;
  }

  function renderDialog() {
    ensureBackdrop().querySelector('#costingDialogContent').innerHTML = dialogHTML();
  }

  function renderBody() {
    const body = ensureBackdrop().querySelector('.costing-dialog-body');
    const tabs = ensureBackdrop().querySelector('.costing-tabs');
    if (tabs) tabs.innerHTML = tabsHTML();
    if (body) body.innerHTML = activeContentHTML();
  }

  function inputField(label, path, value, type = 'text') {
    return `<label><span>${escapeHTML(label)}</span><input type="${type}"${type === 'number' ? ' min="0" step="0.01"' : ''} data-cost-path="${escapeHTML(path)}" value="${escapeHTML(value)}"></label>`;
  }

  function toggleField(label, path, checked) {
    return `<label class="costing-toggle"><input type="checkbox" data-cost-path="${escapeHTML(path)}"${checked ? ' checked' : ''}><span>${escapeHTML(label)}</span></label>`;
  }

  function arrayCell(arrayName, index, field, value, type = 'text') {
    return `<td><input type="${type}"${type === 'number' ? ' min="0" step="0.01"' : ''} data-cost-array="${escapeHTML(arrayName)}" data-cost-index="${index}" data-cost-field="${escapeHTML(field)}" value="${escapeHTML(value)}"></td>`;
  }

  function resolveArray(name) {
    return String(name).split('.').reduce((value, key) => value?.[key], activeSuite);
  }

  function addRow(name) {
    const templates = {
      consumables: { id: uid('cons'), description: '', quantity: 1, unit: 'lot', unitCost: 0, usesPerMonth: 1 },
      manpower: { id: uid('man'), role: '', workers: 1, dailyRate: 0, projectDays: 0, overtimeHours: 0, overtimeRate: 0 },
      tools: { id: uid('tool'), description: '', quantity: 1, unitCost: 0, allocationPercent: 100 },
      rentals: { id: uid('rent'), description: '', days: 1, dailyRate: 0, fuelLitersPerDay: 0, fuelPrice: 0, deliveryCost: 0 }
    };
    if (!templates[name]) return;
    activeSuite[name].push(templates[name]);
    renderBody();
    queueSave();
  }

  function addSoaRow(name) {
    activeSuite.soa[name].push({ id: uid('soa'), date: new Date().toISOString().slice(0, 10), description: '', amount: 0 });
    renderBody();
    queueSave();
  }

  function applyQuantity() {
    const spec = activeSuite.specs.find(record => String(record.projectItemId) === String(activeSuite.quantityCalculator.projectItemId));
    if (!spec) return;
    spec.quantity = quantityResult();
    spec.area = positive(activeSuite.quantityCalculator.area);
    spec.spacingX = positive(activeSuite.quantityCalculator.spacingX);
    spec.spacingY = positive(activeSuite.quantityCalculator.spacingY);
    pushSpecsToBoq(false);
    renderBody();
    queueSave();
  }

  function pushSpecsToBoq(showAlert = true) {
    const records = allBoqs();
    const draft = records[activeProjectId];
    if (!draft?.rows?.length) {
      if (showAlert) alert('Create the BOQ first. The specification matrix is saved and will remain available.');
      return;
    }
    activeSuite.specs.forEach(spec => {
      const row = draft.rows.find(record => record.id === `project-${spec.projectItemId}` || String(record.plantId) === String(spec.plantId));
      if (!row) return;
      row.description = spec.commonName;
      row.botanicalName = spec.botanicalName;
      row.base = {
        ...(row.base || {}),
        spec: spec.size,
        height: spec.height,
        spread: spec.spread,
        area: spec.area,
        spacing: spec.spacingX && spec.spacingY ? `${spec.spacingX} m x ${spec.spacingY} m` : '',
        quantity: positive(spec.quantity),
        unit: spec.unit,
        materialCost: positive(spec.materialCost),
        laborCost: positive(spec.laborCost)
      };
      DENSITIES.forEach(id => {
        const stored = draft.scenarios?.[id]?.[row.id] || {};
        draft.scenarios[id][row.id] = { ...scenarioFromBase(row, draft.presets?.[id] || activeSuite.densityPresets[id]), ...stored,
          spec: row.base.spec, height: row.base.height, spread: row.base.spread, area: row.base.area,
          spacing: row.base.spacing, quantity: Math.ceil(row.base.quantity * activeSuite.densityPresets[id].densityPercent / 100),
          unit: row.base.unit, materialCost: row.base.materialCost * activeSuite.densityPresets[id].pricePercent / 100,
          laborCost: row.base.laborCost * activeSuite.densityPresets[id].pricePercent / 100
        };
      });
    });
    draft.updatedAt = new Date().toISOString();
    records[activeProjectId] = draft;
    writeJSON(BOQ_KEY, records);
    if (showAlert) alert('Plant specifications, quantities, and reference prices were sent to the BOQ.');
  }

  function applyPresetsToBoq() {
    const records = allBoqs();
    const draft = records[activeProjectId];
    if (!draft?.rows?.length) {
      alert('Create the BOQ first, then apply these density presets.');
      return;
    }
    if (!confirm('Recalculate all three BOQ density options using these presets? Manual BOQ scenario edits will be replaced.')) return;
    draft.presets = JSON.parse(JSON.stringify(activeSuite.densityPresets));
    draft.scenarios = draft.scenarios || {};
    DENSITIES.forEach(id => {
      draft.scenarios[id] = {};
      draft.rows.forEach(row => { draft.scenarios[id][row.id] = scenarioFromBase(row, draft.presets[id]); });
    });
    draft.updatedAt = new Date().toISOString();
    records[activeProjectId] = draft;
    writeJSON(BOQ_KEY, records);
    renderBody();
    queueSave();
    alert('Density presets were applied to the BOQ.');
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function slug(value) {
    return String(value || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  }

  function csvCell(value) {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function exportSpecCSV() {
    const headers = ['Code','Common Name','Botanical Name','Category','Size','Height','Spread','Area','Spacing X','Spacing Y','Quantity','Unit','Material Cost','Labor Cost','Water Rate','Maintenance Class'];
    const rows = activeSuite.specs.map(row => [row.code,row.commonName,row.botanicalName,row.category,row.size,row.height,row.spread,row.area,row.spacingX,row.spacingY,row.quantity,row.unit,row.materialCost,row.laborCost,row.waterRate,row.maintenanceClass]);
    downloadBlob(`\ufeff${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}`, `${slug(activeSuite.projectName)}-plant-specifications.csv`, 'text/csv;charset=utf-8');
  }

  function reportHTML(printMode = false) {
    const summary = costingSummary();
    const water = waterTotals();
    const maintenance = maintenanceTotals();
    const duration = durationTotals();
    const soa = soaTotals();
    const comparison = DENSITIES.map(id => `<tr><td>${escapeHTML(activeSuite.densityPresets[id].label)}</td><td>${currency(boqTotalsFor(id).grandTotal)}</td></tr>`).join('');
    const specs = activeSuite.specs.map(row => `<tr><td>${escapeHTML(row.code)}</td><td><strong>${escapeHTML(row.commonName)}</strong><small>${escapeHTML(row.botanicalName)}</small></td><td>${escapeHTML(row.size)}</td><td>${escapeHTML(row.height)}</td><td>${escapeHTML(row.spread)}</td><td>${formatNumber(row.area)}</td><td>${formatNumber(row.spacingX)} × ${formatNumber(row.spacingY)} m</td><td>${formatNumber(row.quantity)}</td><td>${escapeHTML(row.unit)}</td><td>${currency(row.materialCost)}</td><td>${currency(row.laborCost)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(activeSuite.projectName)} - Complete Project Costing</title><style>
      *{box-sizing:border-box}body{margin:0;background:#eef3ef;color:#173d30;font-family:Arial,sans-serif}.report{max-width:1200px;margin:24px auto;padding:28px;background:#fff}.header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #17553e;padding-bottom:18px}.header h1{margin:0;font-size:28px}.header p{margin:5px 0;color:#60736a}.badge{font-weight:800;color:#17553e}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.card{padding:13px;border:1px solid #d4e0d9;border-radius:10px}.card span,.card small{display:block;color:#60736a;font-size:11px}.card strong{display:block;margin:5px 0;font-size:17px}section{margin-top:22px}h2{font-size:17px;border-bottom:1px solid #d9e3de;padding-bottom:8px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd8d1;padding:7px;vertical-align:top}th{background:#17553e;color:#fff;text-align:left}td small{display:block;color:#65766e;font-style:italic}.summary{max-width:520px;margin-left:auto}.summary div{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #d7e1dc}.summary .grand{background:#17553e;color:#fff;font-size:16px}.note{font-size:11px;color:#5f7168}.actions{margin:20px 0;text-align:right}.actions button{padding:10px 16px}@media print{body{background:#fff}.report{max-width:none;margin:0;padding:10mm}.actions{display:none}@page{size:A4 landscape;margin:0}}</style></head><body><article class="report">
      <header class="header"><div><span class="badge">GREENSCAPE LANDSCAPING SERVICES</span><h1>Complete Project Costing Report</h1><p>${escapeHTML(activeSuite.projectName)} · ${escapeHTML(activeSuite.location || 'Location not set')}</p></div><div><strong>Client</strong><p>${escapeHTML(activeSuite.client || 'Not set')}</p><strong>Generated</strong><p>${new Date().toLocaleDateString('en-PH')}</p></div></header>
      ${printMode ? '' : '<div class="actions"><button type="button" onclick="window.print()">Print / Save PDF</button></div>'}
      <div class="grid"><div class="card"><span>Final cost</span><strong>${currency(summary.finalTotal)}</strong></div><div class="card"><span>Maintenance annual</span><strong>${currency(maintenance.annual)}</strong></div><div class="card"><span>Water monthly</span><strong>${formatNumber(water.monthlyCubicMeters)} m³</strong><small>${currency(water.monthlyCost)}</small></div><div class="card"><span>Duration</span><strong>${formatNumber(duration.days,0)} days</strong><small>${formatNumber(duration.weeks,1)} weeks</small></div></div>
      <section><h2>100% / 50% / 35% BOQ Comparison</h2><table><thead><tr><th>Density option</th><th>Total</th></tr></thead><tbody>${comparison}</tbody></table></section>
      <section><h2>Project Costing Summary</h2><div class="summary">${summaryRow('BOQ direct cost',summary.boq.subtotal)}${summaryRow('Included add-ons',summary.additions)}${summaryRow('Safety',summary.safety)}${summaryRow('Administration',summary.admin)}${summaryRow('Profit',summary.profit)}${summaryRow('Other tax',summary.tax)}${summaryRow('VAT',summary.vat)}<div class="grand"><strong>Final project cost</strong><strong>${currency(summary.finalTotal)}</strong></div></div></section>
      <section><h2>Plant Specification Matrix</h2><table><thead><tr><th>Code</th><th>Plant</th><th>Size</th><th>Height</th><th>Spread</th><th>Area</th><th>Spacing</th><th>Qty</th><th>Unit</th><th>Material</th><th>Labor</th></tr></thead><tbody>${specs}</tbody></table></section>
      <section><h2>Maintenance and Water</h2><div class="grid"><div class="card"><span>Monthly maintenance</span><strong>${currency(maintenance.monthly)}</strong></div><div class="card"><span>Annual maintenance</span><strong>${currency(maintenance.annual)}</strong></div><div class="card"><span>Daily water</span><strong>${formatNumber(water.dailyLiters)} L</strong></div><div class="card"><span>Monthly water cost</span><strong>${currency(water.monthlyCost)}</strong></div></div></section>
      <section><h2>Operations Budget</h2><div class="grid"><div class="card"><span>Consumables annual</span><strong>${currency(consumablesTotals().annual)}</strong></div><div class="card"><span>Manpower</span><strong>${currency(manpowerTotal())}</strong></div><div class="card"><span>Tools</span><strong>${currency(toolsTotal())}</strong></div><div class="card"><span>Rental and fuel</span><strong>${currency(rentalsTotal())}</strong></div></div></section>
      <section><h2>Project Statement of Account</h2><div class="grid"><div class="card"><span>Adjusted contract</span><strong>${currency(soa.adjustedContract)}</strong></div><div class="card"><span>Total billed</span><strong>${currency(soa.billings)}</strong></div><div class="card"><span>Total paid</span><strong>${currency(soa.payments)}</strong></div><div class="card"><span>Balance</span><strong>${currency(soa.balance)}</strong></div></div></section>
      <p class="note">${escapeHTML(activeSuite.notes || 'Final quantities, prices, productivity, maintenance rates, water requirements, and taxes remain subject to supplier confirmation and site verification.')}</p>
    </article>${printMode ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));<\/script>' : ''}</body></html>`;
  }

  function downloadReport() {
    downloadBlob(reportHTML(false), `${slug(activeSuite.projectName)}-complete-project-costing.html`, 'text/html;charset=utf-8');
  }

  function printReport() {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return alert('Allow pop-ups to print the complete report.');
    win.document.open();
    win.document.write(reportHTML(true));
    win.document.close();
  }

  function exportJSON() {
    const project = projectById(activeProjectId);
    const payload = { app: 'Greenscape Project Costing Suite', version: 1, exportedAt: new Date().toISOString(), project, costing: activeSuite, boq: allBoqs()[activeProjectId] || null };
    downloadBlob(JSON.stringify(payload, null, 2), `${slug(activeSuite.projectName)}-complete-project-costing.json`, 'application/json');
  }

  function openFullBoq() {
    const button = document.querySelector(`[data-boq-open="${CSS.escape(activeProjectId)}"]`);
    if (!button) return alert('Close the Costing Suite, then select Create BOQ from the project.');
    closeSuite();
    button.click();
  }

  function ensureLaunchButtons() {
    document.querySelectorAll('.project-card-actions').forEach(actions => {
      if (actions.querySelector('[data-costing-open]')) return;
      const source = actions.querySelector('[data-project-id]');
      const projectId = source?.dataset.projectId;
      if (!projectId) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary small costing-launch';
      button.dataset.costingOpen = projectId;
      button.textContent = 'Costing';
      actions.appendChild(button);
    });
    document.querySelectorAll('.detail-actions').forEach(actions => {
      if (actions.querySelector('[data-costing-open]')) return;
      const source = actions.querySelector('[data-project-id]');
      const projectId = source?.dataset.projectId;
      if (!projectId) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary costing-launch';
      button.dataset.costingOpen = projectId;
      button.textContent = 'Costing Suite';
      const boqButton = actions.querySelector('[data-boq-open]');
      if (boqButton) boqButton.after(button);
      else actions.insertBefore(button, actions.lastElementChild || null);
    });
  }

  document.addEventListener('click', event => {
    const open = event.target.closest('[data-costing-open]');
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      openSuite(open.dataset.costingOpen);
      return;
    }
    if (!activeSuite) return;
    if (event.target.closest('[data-costing-close]')) { closeSuite(); return; }
    const tab = event.target.closest('[data-costing-tab]');
    if (tab) { activeSuite.activeTab = tab.dataset.costingTab; renderBody(); queueSave(); return; }
    const density = event.target.closest('[data-costing-density-use]');
    if (density) { activeSuite.selectedDensity = density.dataset.costingDensityUse; renderBody(); queueSave(); return; }
    if (event.target.closest('[data-costing-save]')) { saveSuite(true); return; }
    if (event.target.closest('[data-costing-use-quantity]')) { applyQuantity(); return; }
    if (event.target.closest('[data-costing-push-specs]')) { pushSpecsToBoq(true); return; }
    if (event.target.closest('[data-costing-apply-presets]')) { applyPresetsToBoq(); return; }
    if (event.target.closest('[data-costing-open-boq]')) { openFullBoq(); return; }
    const add = event.target.closest('[data-costing-add-row]');
    if (add) { addRow(add.dataset.costingAddRow); return; }
    const remove = event.target.closest('[data-costing-remove-row]');
    if (remove) { resolveArray(remove.dataset.costingRemoveRow).splice(Number(remove.dataset.costIndex), 1); renderBody(); queueSave(); return; }
    const addSoa = event.target.closest('[data-costing-add-soa]');
    if (addSoa) { addSoaRow(addSoa.dataset.costingAddSoa); return; }
    const removeSoa = event.target.closest('[data-costing-remove-soa]');
    if (removeSoa) { activeSuite.soa[removeSoa.dataset.costingRemoveSoa].splice(Number(removeSoa.dataset.costIndex), 1); renderBody(); queueSave(); return; }
    if (event.target.closest('[data-costing-download-report]')) { downloadReport(); return; }
    if (event.target.closest('[data-costing-print-report]')) { printReport(); return; }
    if (event.target.closest('[data-costing-export-json]')) { exportJSON(); return; }
    if (event.target.closest('[data-costing-export-csv]')) { exportSpecCSV(); }
  }, true);

  document.addEventListener('input', event => {
    if (!activeSuite || !event.target.closest('#costingSuiteBackdrop')) return;
    const path = event.target.dataset.costPath;
    if (path) {
      const value = event.target.type === 'checkbox' ? event.target.checked :
        event.target.type === 'number' ? positive(event.target.value) : event.target.value;
      setByPath(activeSuite, path, value);
      queueSave();
      return;
    }
    const arrayName = event.target.dataset.costArray;
    if (arrayName) {
      const array = resolveArray(arrayName);
      const row = array?.[Number(event.target.dataset.costIndex)];
      if (!row) return;
      row[event.target.dataset.costField] = event.target.type === 'number' ? positive(event.target.value) : event.target.value;
      queueSave();
    }
  });

  document.addEventListener('change', event => {
    if (!activeSuite || !event.target.closest('#costingSuiteBackdrop')) return;
    renderBody();
  });

  document.addEventListener('keydown', event => {
    if (!activeSuite) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSuite();
    }
  });

  const content = document.getElementById('pageContent');
  if (content && 'MutationObserver' in window) {
    new MutationObserver(() => requestAnimationFrame(ensureLaunchButtons)).observe(content, { childList: true, subtree: true });
  }
  window.addEventListener('hashchange', () => requestAnimationFrame(ensureLaunchButtons));
  requestAnimationFrame(ensureLaunchButtons);
})();