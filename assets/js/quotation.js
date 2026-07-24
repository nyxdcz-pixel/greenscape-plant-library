(function () {
  'use strict';

  const PROJECT_STORAGE_KEY = 'greenscape-plant-library-projects-v1';
  const QUOTATION_STORAGE_KEY = 'greenscape-plant-library-quotations-v1';
  const content = document.getElementById('pageContent');
  let activeProjectId = '';
  let returnFocus = null;

  const scopeDetails = [
    'Concept and design',
    'Landscape plan',
    'Landscape perspectives',
    'General arrangement plan',
    'Landscape walkthrough',
    'General paving layout',
    'Materials plan and material board',
    'Plant and material specifications'
  ].join(' | ');

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function numberValue(value) {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function currency(value) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numberValue(value));
  }

  function inputDate(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = raw ? new Date(raw) : new Date();
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function datePlusDays(value, days) {
    const date = new Date(`${inputDate(value)}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function displayDate(value) {
    const raw = inputDate(value);
    const date = new Date(`${raw}T00:00:00`);
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function projects() {
    const records = readJSON(PROJECT_STORAGE_KEY, []);
    return Array.isArray(records) ? records : [];
  }

  function projectById(projectId) {
    return projects().find(project => String(project.id) === String(projectId));
  }

  function quotationDrafts() {
    const records = readJSON(QUOTATION_STORAGE_KEY, {});
    return records && typeof records === 'object' && !Array.isArray(records) ? records : {};
  }

  function defaultQuoteNumber(project) {
    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
    const projectPart = String(project?.id || 'PROJECT').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || '0001';
    return `GSQ-${datePart}-${projectPart}`;
  }

  function defaultItems(project) {
    const designCost = numberValue(project?.designCost);
    const landscapingCost = numberValue(project?.landscapingCost);
    const rows = [];

    if (designCost > 0) {
      rows.push({
        id: uid('quote-item'),
        description: 'Landscape Design Services',
        details: scopeDetails,
        quantity: 1,
        unit: 'lump sum',
        unitPrice: designCost
      });
    }

    if (landscapingCost > 0) {
      rows.push({
        id: uid('quote-item'),
        description: 'Landscape Implementation Services',
        details: 'Plant supply, landscape materials, labor, installation, and site implementation.',
        quantity: 1,
        unit: 'lump sum',
        unitPrice: landscapingCost
      });
    }

    if (!rows.length) {
      rows.push({
        id: uid('quote-item'),
        description: 'Landscape Design Services',
        details: scopeDetails,
        quantity: 1,
        unit: 'lump sum',
        unitPrice: 0
      });
    }

    return rows;
  }

  function createDefaultDraft(project) {
    const date = new Date().toISOString().slice(0, 10);
    return {
      projectId: String(project?.id || ''),
      quoteNumber: defaultQuoteNumber(project),
      date,
      validUntil: datePlusDays(date, 30),
      client: String(project?.client || ''),
      projectName: String(project?.name || ''),
      location: String(project?.location || ''),
      preparedBy: '',
      items: defaultItems(project),
      profitPercent: 0,
      adminFeePercent: 0,
      cityTaxPercent: 0,
      discountPercent: 0,
      vatPercent: 12,
      paymentReceived: 0,
      terms: 'Quotation is valid for 30 days. Work starts after written approval and the agreed initial payment.',
      notes: 'Final quantities and material selections are subject to site verification and client approval.',
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeDraft(source, project) {
    const base = createDefaultDraft(project);
    const draft = source && typeof source === 'object' ? source : {};
    return {
      ...base,
      ...draft,
      projectId: String(project?.id || draft.projectId || ''),
      items: Array.isArray(draft.items) && draft.items.length
        ? draft.items.map(item => ({
            id: String(item.id || uid('quote-item')),
            description: String(item.description || ''),
            details: String(item.details || ''),
            quantity: Math.max(0, numberValue(item.quantity || 1)),
            unit: String(item.unit || 'lump sum'),
            unitPrice: Math.max(0, numberValue(item.unitPrice))
          }))
        : base.items
    };
  }

  function quoteCalculations(draft) {
    const subtotal = (draft.items || []).reduce((sum, item) => {
      return sum + Math.max(0, numberValue(item.quantity)) * Math.max(0, numberValue(item.unitPrice));
    }, 0);
    const profit = subtotal * Math.max(0, numberValue(draft.profitPercent)) / 100;
    const adminFee = subtotal * Math.max(0, numberValue(draft.adminFeePercent)) / 100;
    const cityTax = subtotal * Math.max(0, numberValue(draft.cityTaxPercent)) / 100;
    const discount = subtotal * Math.max(0, numberValue(draft.discountPercent)) / 100;
    const beforeVat = Math.max(0, subtotal + profit + adminFee + cityTax - discount);
    const vat = beforeVat * Math.max(0, numberValue(draft.vatPercent)) / 100;
    const total = beforeVat + vat;
    const paymentReceived = Math.max(0, numberValue(draft.paymentReceived));
    const balance = Math.max(0, total - paymentReceived);
    return { subtotal, profit, adminFee, cityTax, discount, beforeVat, vat, total, paymentReceived, balance };
  }

  function ensureBackdrop() {
    let backdrop = document.getElementById('quotationCreatorBackdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'quotationCreatorBackdrop';
    backdrop.className = 'quotation-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = '<section class="quotation-dialog" role="dialog" aria-modal="true" aria-labelledby="quotationDialogTitle" tabindex="-1"><div id="quotationDialogContent"></div></section>';
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function quotationItemEditorHTML(item, index) {
    return `<div class="quotation-item-row" data-quotation-item-id="${escapeHTML(item.id)}">
      <div class="quotation-item-number">${index + 1}</div>
      <label><span>Description</span><input class="text-input" data-quote-item-field="description" value="${escapeHTML(item.description)}" placeholder="Service or work item"></label>
      <label class="quotation-item-details"><span>Details</span><textarea data-quote-item-field="details" rows="2" placeholder="Scope or description">${escapeHTML(item.details)}</textarea></label>
      <label><span>Qty</span><input class="number-input" data-quote-item-field="quantity" type="number" min="0" step="0.01" value="${escapeHTML(item.quantity)}"></label>
      <label><span>Unit</span><input class="text-input" data-quote-item-field="unit" value="${escapeHTML(item.unit)}" placeholder="lump sum"></label>
      <label><span>Unit price</span><input class="number-input" data-quote-item-field="unitPrice" type="number" min="0" step="0.01" value="${escapeHTML(item.unitPrice)}"></label>
      <button type="button" class="quotation-remove-item" data-quotation-remove-item="${escapeHTML(item.id)}" aria-label="Remove quotation item">×</button>
    </div>`;
  }

  function summaryRowsHTML(draft, calculations) {
    const rows = [
      ['Subtotal', calculations.subtotal, true],
      [`Profit markup (${numberValue(draft.profitPercent)}%)`, calculations.profit, calculations.profit > 0],
      [`Admin fee (${numberValue(draft.adminFeePercent)}%)`, calculations.adminFee, calculations.adminFee > 0],
      [`City tax (${numberValue(draft.cityTaxPercent)}%)`, calculations.cityTax, calculations.cityTax > 0],
      [`Discount (${numberValue(draft.discountPercent)}%)`, -calculations.discount, calculations.discount > 0],
      [`VAT (${numberValue(draft.vatPercent)}%)`, calculations.vat, calculations.vat > 0]
    ];
    return rows.filter(row => row[2]).map(([label, amount]) => {
      const negative = amount < 0;
      return `<div class="quotation-summary-row"><span>${escapeHTML(label)}</span><strong>${negative ? '-' : ''}${currency(Math.abs(amount))}</strong></div>`;
    }).join('');
  }

  function quotationPreviewHTML(draft) {
    const calculations = quoteCalculations(draft);
    const logo = new URL('assets/images/greenscape-logo.png', location.href).href;
    const rows = (draft.items || []).map((item, index) => {
      const total = numberValue(item.quantity) * numberValue(item.unitPrice);
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHTML(item.description || 'Untitled item')}</strong>${item.details ? `<small>${escapeHTML(item.details)}</small>` : ''}</td>
        <td>${escapeHTML(numberValue(item.quantity))}</td>
        <td>${escapeHTML(item.unit || '—')}</td>
        <td>${currency(item.unitPrice)}</td>
        <td>${currency(total)}</td>
      </tr>`;
    }).join('');

    return `<article class="quotation-paper">
      <header class="quotation-paper-header">
        <div class="quotation-company">
          <img src="${escapeHTML(logo)}" alt="Greenscape Landscaping Services" width="600" height="70">
          <div>
            <strong>GREENSCAPE LANDSCAPING SERVICES</strong>
            <span>Palawan, Philippines</span>
            <span>greenscapepalawan@gmail.com</span>
            <span>(048) 434-0911 / +63 917 844 3330</span>
          </div>
        </div>
        <div class="quotation-title-block">
          <h2>QUOTATION</h2>
          <dl>
            <div><dt>Quotation No.</dt><dd>${escapeHTML(draft.quoteNumber || '—')}</dd></div>
            <div><dt>Date</dt><dd>${escapeHTML(displayDate(draft.date))}</dd></div>
            <div><dt>Valid until</dt><dd>${escapeHTML(displayDate(draft.validUntil))}</dd></div>
          </dl>
        </div>
      </header>

      <section class="quotation-client-grid">
        <div><span>Prepared for</span><strong>${escapeHTML(draft.client || 'Client name')}</strong></div>
        <div><span>Project</span><strong>${escapeHTML(draft.projectName || 'Project name')}</strong></div>
        <div><span>Location</span><strong>${escapeHTML(draft.location || 'Location not set')}</strong></div>
        <div><span>Prepared by</span><strong>${escapeHTML(draft.preparedBy || 'Greenscape Team')}</strong></div>
      </section>

      <table class="quotation-table">
        <thead><tr><th>#</th><th>Particulars</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No quotation items added.</td></tr>'}</tbody>
      </table>

      <section class="quotation-paper-bottom">
        <div class="quotation-terms-block">
          <div><span>Terms</span><p>${escapeHTML(draft.terms || '—')}</p></div>
          <div><span>Notes</span><p>${escapeHTML(draft.notes || '—')}</p></div>
        </div>
        <div class="quotation-summary">
          ${summaryRowsHTML(draft, calculations)}
          <div class="quotation-summary-row quotation-grand-total"><span>Total quotation</span><strong>${currency(calculations.total)}</strong></div>
          <div class="quotation-summary-row"><span>Payment received</span><strong>${currency(calculations.paymentReceived)}</strong></div>
          <div class="quotation-summary-row quotation-balance"><span>Balance</span><strong>${currency(calculations.balance)}</strong></div>
        </div>
      </section>

      <footer class="quotation-signatures">
        <div><span>Prepared by</span><strong>${escapeHTML(draft.preparedBy || 'Greenscape Representative')}</strong></div>
        <div><span>Client approval</span><strong>Printed Name & Signature</strong></div>
      </footer>
    </article>`;
  }

  function dialogHTML(project, draft) {
    return `<header class="quotation-dialog-header">
      <div><span class="quotation-dialog-kicker">Project quotation</span><h2 id="quotationDialogTitle">Automatic Quotation Creator</h2><p>${escapeHTML(project.name || 'Project')} - fields and totals update automatically.</p></div>
      <button type="button" class="quotation-dialog-close" data-quotation-close aria-label="Close quotation creator">×</button>
    </header>
    <div class="quotation-workspace">
      <form id="quotationCreatorForm" class="quotation-controls">
        <section class="quotation-control-section">
          <div class="quotation-section-heading"><h3>Quotation details</h3><button type="button" class="button ghost small" data-quotation-reset>Reset from project</button></div>
          <div class="quotation-field-grid">
            <label><span>Quotation number</span><input class="text-input" name="quoteNumber" value="${escapeHTML(draft.quoteNumber)}"></label>
            <label><span>Date</span><input class="text-input" type="date" name="date" value="${escapeHTML(inputDate(draft.date))}"></label>
            <label><span>Valid until</span><input class="text-input" type="date" name="validUntil" value="${escapeHTML(inputDate(draft.validUntil))}"></label>
            <label><span>Prepared by</span><input class="text-input" name="preparedBy" value="${escapeHTML(draft.preparedBy)}" placeholder="Name or team"></label>
            <label class="full"><span>Client</span><input class="text-input" name="client" value="${escapeHTML(draft.client)}" placeholder="Client name"></label>
            <label class="full"><span>Project name</span><input class="text-input" name="projectName" value="${escapeHTML(draft.projectName)}"></label>
            <label class="full"><span>Location</span><input class="text-input" name="location" value="${escapeHTML(draft.location)}"></label>
          </div>
        </section>

        <section class="quotation-control-section">
          <div class="quotation-section-heading"><h3>Particulars</h3><button type="button" class="button secondary small" data-quotation-add-item>Add item</button></div>
          <div id="quotationItemEditor" class="quotation-item-editor">${draft.items.map(quotationItemEditorHTML).join('')}</div>
        </section>

        <section class="quotation-control-section">
          <h3>Automatic calculations</h3>
          <div class="quotation-rate-grid">
            <label><span>Profit markup %</span><input class="number-input" type="number" min="0" step="0.01" name="profitPercent" value="${escapeHTML(draft.profitPercent)}"></label>
            <label><span>Admin fee %</span><input class="number-input" type="number" min="0" step="0.01" name="adminFeePercent" value="${escapeHTML(draft.adminFeePercent)}"></label>
            <label><span>City tax %</span><input class="number-input" type="number" min="0" step="0.01" name="cityTaxPercent" value="${escapeHTML(draft.cityTaxPercent)}"></label>
            <label><span>Discount %</span><input class="number-input" type="number" min="0" step="0.01" name="discountPercent" value="${escapeHTML(draft.discountPercent)}"></label>
            <label><span>VAT %</span><input class="number-input" type="number" min="0" step="0.01" name="vatPercent" value="${escapeHTML(draft.vatPercent)}"></label>
            <label><span>Payment received</span><input class="number-input" type="number" min="0" step="0.01" name="paymentReceived" value="${escapeHTML(draft.paymentReceived)}"></label>
          </div>
        </section>

        <section class="quotation-control-section">
          <h3>Terms and notes</h3>
          <label class="quotation-stacked-field"><span>Terms</span><textarea name="terms" rows="3">${escapeHTML(draft.terms)}</textarea></label>
          <label class="quotation-stacked-field"><span>Notes</span><textarea name="notes" rows="3">${escapeHTML(draft.notes)}</textarea></label>
        </section>
      </form>
      <section class="quotation-preview-panel">
        <div class="quotation-preview-toolbar"><strong>Live preview</strong><span>Use Print / Save PDF for the final A4 copy.</span></div>
        <div id="quotationPreview">${quotationPreviewHTML(draft)}</div>
      </section>
    </div>
    <footer class="quotation-dialog-footer">
      <span id="quotationSaveStatus" role="status" aria-live="polite">Drafts are saved only in this browser.</span>
      <div>
        <button type="button" class="button secondary" data-quotation-close>Close</button>
        <button type="button" class="button secondary" data-quotation-save>Save draft</button>
        <button type="button" class="button primary" data-quotation-print>Print / Save PDF</button>
      </div>
    </footer>`;
  }

  function draftFromForm() {
    const form = document.getElementById('quotationCreatorForm');
    if (!form) return null;
    const project = projectById(activeProjectId);
    const existing = normalizeDraft(quotationDrafts()[activeProjectId], project);
    const items = Array.from(form.querySelectorAll('.quotation-item-row')).map(row => ({
      id: row.dataset.quotationItemId || uid('quote-item'),
      description: String(row.querySelector('[data-quote-item-field="description"]')?.value || '').trim(),
      details: String(row.querySelector('[data-quote-item-field="details"]')?.value || '').trim(),
      quantity: Math.max(0, numberValue(row.querySelector('[data-quote-item-field="quantity"]')?.value || 0)),
      unit: String(row.querySelector('[data-quote-item-field="unit"]')?.value || '').trim(),
      unitPrice: Math.max(0, numberValue(row.querySelector('[data-quote-item-field="unitPrice"]')?.value || 0))
    }));

    return {
      ...existing,
      projectId: activeProjectId,
      quoteNumber: String(form.elements.quoteNumber?.value || '').trim(),
      date: inputDate(form.elements.date?.value),
      validUntil: inputDate(form.elements.validUntil?.value),
      client: String(form.elements.client?.value || '').trim(),
      projectName: String(form.elements.projectName?.value || '').trim(),
      location: String(form.elements.location?.value || '').trim(),
      preparedBy: String(form.elements.preparedBy?.value || '').trim(),
      items,
      profitPercent: Math.max(0, numberValue(form.elements.profitPercent?.value)),
      adminFeePercent: Math.max(0, numberValue(form.elements.adminFeePercent?.value)),
      cityTaxPercent: Math.max(0, numberValue(form.elements.cityTaxPercent?.value)),
      discountPercent: Math.max(0, numberValue(form.elements.discountPercent?.value)),
      vatPercent: Math.max(0, numberValue(form.elements.vatPercent?.value)),
      paymentReceived: Math.max(0, numberValue(form.elements.paymentReceived?.value)),
      terms: String(form.elements.terms?.value || '').trim(),
      notes: String(form.elements.notes?.value || '').trim(),
      updatedAt: new Date().toISOString()
    };
  }

  function updatePreview() {
    const draft = draftFromForm();
    const preview = document.getElementById('quotationPreview');
    if (draft && preview) preview.innerHTML = quotationPreviewHTML(draft);
  }

  function setStatus(message, isError) {
    const node = document.getElementById('quotationSaveStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', Boolean(isError));
  }

  function saveDraft() {
    const draft = draftFromForm();
    if (!draft) return null;
    try {
      const drafts = quotationDrafts();
      drafts[activeProjectId] = draft;
      writeJSON(QUOTATION_STORAGE_KEY, drafts);
      setStatus(`Draft saved ${new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}.`);
      return draft;
    } catch (error) {
      setStatus('Could not save the quotation draft in this browser.', true);
      return draft;
    }
  }

  function openCreator(projectId, suppliedDraft) {
    const project = projectById(projectId);
    if (!project) return;
    activeProjectId = String(project.id);
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const stored = quotationDrafts()[activeProjectId];
    const draft = normalizeDraft(suppliedDraft || stored, project);
    const backdrop = ensureBackdrop();
    document.getElementById('quotationDialogContent').innerHTML = dialogHTML(project, draft);
    backdrop.hidden = false;
    document.body.classList.add('quotation-open');
    backdrop.querySelector('.quotation-dialog')?.focus({ preventScroll: true });
  }

  function closeCreator() {
    const backdrop = ensureBackdrop();
    backdrop.hidden = true;
    document.body.classList.remove('quotation-open');
    activeProjectId = '';
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function addItem() {
    const draft = draftFromForm();
    const project = projectById(activeProjectId);
    if (!draft || !project) return;
    draft.items.push({ id: uid('quote-item'), description: '', details: '', quantity: 1, unit: 'lump sum', unitPrice: 0 });
    openCreator(activeProjectId, draft);
    requestAnimationFrame(() => document.querySelector('.quotation-item-row:last-child [data-quote-item-field="description"]')?.focus());
  }

  function removeItem(itemId) {
    const draft = draftFromForm();
    const project = projectById(activeProjectId);
    if (!draft || !project) return;
    draft.items = draft.items.filter(item => item.id !== itemId);
    if (!draft.items.length) draft.items.push({ id: uid('quote-item'), description: '', details: '', quantity: 1, unit: 'lump sum', unitPrice: 0 });
    openCreator(activeProjectId, draft);
  }

  function resetDraft() {
    const project = projectById(activeProjectId);
    if (!project) return;
    if (!confirm('Reset this quotation using the latest project details and costs?')) return;
    const drafts = quotationDrafts();
    delete drafts[activeProjectId];
    try { writeJSON(QUOTATION_STORAGE_KEY, drafts); } catch (error) { /* Ignore storage errors. */ }
    openCreator(activeProjectId, createDefaultDraft(project));
  }

  function printStyles() {
    return `
      *{box-sizing:border-box}body{margin:0;background:#fff;color:#18382d;font-family:Arial,Helvetica,sans-serif}body>article{margin:0 auto}.quotation-paper{width:210mm;min-height:297mm;padding:14mm 14mm 16mm;background:#fff}.quotation-paper-header{display:grid;grid-template-columns:1fr 76mm;gap:12mm;align-items:start;border-bottom:2px solid #0b5a3f;padding-bottom:8mm}.quotation-company{display:flex;gap:8mm;align-items:flex-start}.quotation-company img{width:72mm;height:auto;object-fit:contain}.quotation-company div{display:flex;flex-direction:column;font-size:8.5pt;line-height:1.45}.quotation-company strong{font-size:10pt}.quotation-title-block{text-align:right}.quotation-title-block h2{font-size:24pt;letter-spacing:.1em;margin:0 0 5mm}.quotation-title-block dl{margin:0}.quotation-title-block dl div{display:grid;grid-template-columns:1fr auto;gap:5mm;font-size:8.5pt;margin:1.5mm 0}.quotation-title-block dt{color:#60756d}.quotation-title-block dd{margin:0;font-weight:700}.quotation-client-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm 10mm;padding:7mm 0}.quotation-client-grid div{border-bottom:1px solid #cdd8d3;padding-bottom:2.5mm}.quotation-client-grid span,.quotation-terms-block span{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:7pt;color:#647970;margin-bottom:1mm}.quotation-client-grid strong{font-size:10pt}.quotation-table{width:100%;border-collapse:collapse;font-size:8.5pt}.quotation-table th{background:#0b5a3f;color:white;text-align:left;padding:3mm 2.5mm}.quotation-table td{border-bottom:1px solid #d8e0dc;padding:3mm 2.5mm;vertical-align:top}.quotation-table td:nth-child(1),.quotation-table td:nth-child(3),.quotation-table td:nth-child(4){text-align:center}.quotation-table td:nth-child(5),.quotation-table td:nth-child(6),.quotation-table th:nth-child(5),.quotation-table th:nth-child(6){text-align:right;white-space:nowrap}.quotation-table small{display:block;color:#61736c;line-height:1.35;margin-top:1mm}.quotation-paper-bottom{display:grid;grid-template-columns:1fr 72mm;gap:10mm;margin-top:8mm}.quotation-terms-block{display:grid;gap:5mm}.quotation-terms-block p{margin:0;font-size:8.5pt;line-height:1.5;white-space:pre-wrap}.quotation-summary{border:1px solid #b9c9c1}.quotation-summary-row{display:flex;justify-content:space-between;gap:6mm;padding:2.5mm 3mm;border-bottom:1px solid #d8e0dc;font-size:8.5pt}.quotation-summary-row:last-child{border-bottom:0}.quotation-grand-total{background:#e8f3ee;font-size:10pt}.quotation-balance{background:#0b5a3f;color:#fff;font-size:10pt}.quotation-signatures{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:22mm}.quotation-signatures div{border-top:1px solid #4a6259;padding-top:2mm}.quotation-signatures span{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:.08em;color:#647970}.quotation-signatures strong{font-size:8.5pt}@page{size:A4 portrait;margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.quotation-paper{box-shadow:none}}
    `;
  }

  function printQuotation() {
    const draft = saveDraft() || draftFromForm();
    if (!draft) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setStatus('Pop-up blocked. Allow pop-ups, then try Print / Save PDF again.', true);
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(draft.quoteNumber || 'Quotation')}</title><style>${printStyles()}</style></head><body>${quotationPreviewHTML(draft)}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    const runPrint = () => setTimeout(() => printWindow.print(), 250);
    if (printWindow.document.readyState === 'complete') runPrint();
    else printWindow.addEventListener('load', runPrint, { once: true });
  }

  function enhanceProjectButtons() {
    if (!content) return;

    content.querySelectorAll('.project-card').forEach(card => {
      const source = card.querySelector('[data-action="open-project"][data-project-id]');
      const actions = card.querySelector('.project-card-actions');
      if (!source || !actions || actions.querySelector('[data-quotation-project]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary small quotation-launch-button';
      button.dataset.quotationProject = source.dataset.projectId;
      button.textContent = 'Quotation';
      actions.appendChild(button);
    });

    const detailActions = content.querySelector('.detail-actions');
    const detailSource = detailActions?.querySelector('[data-action="edit-project"][data-project-id]');
    if (detailActions && detailSource && !detailActions.querySelector('[data-quotation-project]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary quotation-launch-button';
      button.dataset.quotationProject = detailSource.dataset.projectId;
      button.textContent = 'Create quotation';
      const primary = detailActions.querySelector('.button.primary');
      detailActions.insertBefore(button, primary || null);
    }
  }

  document.addEventListener('click', event => {
    const launch = event.target.closest('[data-quotation-project]');
    if (launch) {
      event.preventDefault();
      event.stopPropagation();
      openCreator(launch.dataset.quotationProject);
      return;
    }

    if (event.target.closest('[data-quotation-close]')) {
      event.preventDefault();
      closeCreator();
      return;
    }

    if (event.target.closest('[data-quotation-save]')) {
      event.preventDefault();
      saveDraft();
      return;
    }

    if (event.target.closest('[data-quotation-print]')) {
      event.preventDefault();
      printQuotation();
      return;
    }

    if (event.target.closest('[data-quotation-add-item]')) {
      event.preventDefault();
      addItem();
      return;
    }

    const remove = event.target.closest('[data-quotation-remove-item]');
    if (remove) {
      event.preventDefault();
      removeItem(remove.dataset.quotationRemoveItem);
      return;
    }

    if (event.target.closest('[data-quotation-reset]')) {
      event.preventDefault();
      resetDraft();
      return;
    }

    const backdrop = event.target.closest('#quotationCreatorBackdrop');
    if (backdrop && event.target === backdrop) closeCreator();
  });

  document.addEventListener('input', event => {
    if (event.target.closest('#quotationCreatorForm')) updatePreview();
  });

  document.addEventListener('keydown', event => {
    const backdrop = document.getElementById('quotationCreatorBackdrop');
    if (!backdrop || backdrop.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCreator();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = backdrop.querySelector('.quotation-dialog');
    const focusable = Array.from(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])
      .filter(element => !element.hidden && element.getClientRects().length);
    if (!focusable.length) return;
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
    const observer = new MutationObserver(() => requestAnimationFrame(enhanceProjectButtons));
    observer.observe(content, { childList: true, subtree: true });
  }

  window.addEventListener('hashchange', () => requestAnimationFrame(enhanceProjectButtons));
  requestAnimationFrame(enhanceProjectButtons);
})();
