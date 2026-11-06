/* ==========================================================================
   MODULE: BLT ALL DATA EXPLORER
   Full SLU Branchline trip list — search shipment/plate, filter date / SP / on-time
   ========================================================================== */
const BltAllData = (() => {
  const PAGE_SIZE = 200;
  let page = 0;

  function allRows() {
    if (typeof BltFileProcessor === 'undefined') return [];
    return BltFileProcessor.getState().storedRows || [];
  }

  function uniqueDates(rows) {
    return [...new Set(rows.map(r => r.dateKey).filter(Boolean))].sort();
  }

  function fillSelect(id, values, allLabel) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = ['<option value="ALL">' + allLabel + '</option>']
      .concat(values.map(v => '<option value="' + String(v).replace(/"/g, '&quot;') + '">' + v + '</option>'))
      .join('');
    if (prev && (prev === 'ALL' || values.indexOf(prev) >= 0)) sel.value = prev;
    else sel.value = 'ALL';
  }

  function fillDateSelects(rows) {
    const dates = uniqueDates(rows);
    ['bltAdDateFrom', 'bltAdDateTo'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '<option value="">All dates</option>' +
        dates.map(d => '<option value="' + d + '">' + d + '</option>').join('');
      if (prev && dates.indexOf(prev) >= 0) sel.value = prev;
    });
  }

  function fillEntitySelects(rows) {
    const sps = [...new Set(rows.map(r => r.sp).filter(v => v && v !== '(blank)'))].sort(
      (a, b) => String(a).localeCompare(String(b))
    );
    const truckers = [...new Set(rows.map(r => r.trucker || r.carrierName).filter(v => v && v !== '(blank)'))].sort(
      (a, b) => String(a).localeCompare(String(b))
    );
    const lineTypes = [...new Set(rows.map(r => r.lineType).filter(v => v && v !== '(blank)'))].sort(
      (a, b) => String(a).localeCompare(String(b))
    );
    const dcs = [...new Set(rows.map(r => r.dcName || r.dcIntended).filter(v => v && v !== '(blank)'))].sort(
      (a, b) => String(a).localeCompare(String(b))
    );
    fillSelect('bltAdSp', sps, 'All SPs');
    fillSelect('bltAdTrucker', truckers, 'All truckers');
    fillSelect('bltAdLineType', lineTypes, 'All line types');
    fillSelect('bltAdDc', dcs, 'All DCs');
  }

  function filters() {
    return {
      task: (document.getElementById('bltAdSearchTask') || {}).value || '',
      plate: (document.getElementById('bltAdSearchPlate') || {}).value || '',
      dateFrom: (document.getElementById('bltAdDateFrom') || {}).value || '',
      dateTo: (document.getElementById('bltAdDateTo') || {}).value || '',
      sp: (document.getElementById('bltAdSp') || {}).value || 'ALL',
      trucker: (document.getElementById('bltAdTrucker') || {}).value || 'ALL',
      lineType: (document.getElementById('bltAdLineType') || {}).value || 'ALL',
      dc: (document.getElementById('bltAdDc') || {}).value || 'ALL',
      onTime: (document.getElementById('bltAdOnTime') || {}).value || 'ALL'
    };
  }

  function applyFilters(rows) {
    const f = filters();
    const taskQ = f.task.trim().toLowerCase();
    const plateQ = f.plate.trim().toLowerCase();
    return rows.filter(r => {
      if (taskQ && String(r.taskId || r.shipmentNo || '').toLowerCase().indexOf(taskQ) < 0) return false;
      if (plateQ && String(r.plate || '').toLowerCase().indexOf(plateQ) < 0) return false;
      if (f.dateFrom && r.dateKey < f.dateFrom) return false;
      if (f.dateTo && r.dateKey > f.dateTo) return false;
      if (f.sp !== 'ALL' && String(r.sp || '') !== f.sp) return false;
      if (f.trucker !== 'ALL' && String(r.trucker || r.carrierName || '') !== f.trucker) return false;
      if (f.lineType !== 'ALL' && String(r.lineType || '') !== f.lineType) return false;
      if (f.dc !== 'ALL' && String(r.dcName || r.dcIntended || '') !== f.dc) return false;
      if (f.onTime === 'YES' && String(r.onTime).toUpperCase() !== 'YES') return false;
      if (f.onTime === 'NO' && String(r.onTime).toUpperCase() !== 'NO') return false;
      return true;
    });
  }

  function delayMin(r) {
    if (r.missingDispatch) return 0;
    return Math.max(0, (Number(r.actualTT) || 0) - (Number(r.planTT) || 0));
  }

  function render() {
    const body = document.getElementById('bltAdBody');
    const meta = document.getElementById('bltAdMeta');
    if (!body) return;
    const { fmtDuration, fmtPct } = BltUtils;
    const rows = allRows();
    fillDateSelects(rows);
    fillEntitySelects(rows);
    const filtered = applyFilters(rows);
    const total = filtered.length;
    const yes = filtered.filter(r => String(r.onTime).toUpperCase() === 'YES').length;
    const rate = total ? yes / total : null;
    const totalDelay = filtered.reduce((s, r) => s + delayMin(r), 0);
    const lateCount = filtered.filter(r => String(r.onTime).toUpperCase() === 'NO').length;

    if (meta) {
      meta.innerHTML = '<strong>' + total.toLocaleString() + '</strong> trip(s)' +
        (total ? ' · on-time <strong>' + fmtPct(rate) + '</strong>' : '') +
        ' · late <strong class="neg">' + lateCount.toLocaleString() + '</strong>' +
        ' · total delay <strong class="neg">' + fmtDuration(totalDelay) + '</strong>' +
        ' · page ' + (page + 1) + ' / ' + Math.max(1, Math.ceil(total / PAGE_SIZE));
    }

    const start = page * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    if (!slice.length) {
      body.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#757575;padding:24px;">No trips match filters.</td></tr>';
    } else {
      body.innerHTML = slice.map(r => {
        const late = String(r.onTime).toUpperCase() === 'NO';
        const dmin = delayMin(r);
        return '<tr class="' + (late ? 'late-row' : '') + '">' +
          '<td>' + (r.dateKey || '') + '</td>' +
          '<td>' + (r.shipmentNo || r.taskId || '—') + '</td>' +
          '<td>' + (r.plate || '—') + '</td>' +
          '<td>' + (r.route || '') + '</td>' +
          '<td>' + (r.sp || '') + '</td>' +
          '<td>' + (r.dcName || r.dcIntended || '') + '</td>' +
          '<td>' + (r.lineType || '') + '</td>' +
          '<td>' + (r.trucker || r.carrierName || '') + '</td>' +
          '<td class="' + (late ? 'neg' : 'pos') + '">' + (r.onTime || '') + '</td>' +
          '<td>' + fmtDuration(r.planTT) + '</td>' +
          '<td>' + (r.missingDispatch ? 'Not on time' : fmtDuration(r.actualTT)) + '</td>' +
          '<td class="' + (dmin > 0 ? 'neg' : '') + '">' + (dmin > 0 ? fmtDuration(dmin) : '—') + '</td>' +
          '</tr>';
      }).join('');
    }

    const btnPrev = document.getElementById('bltAdPrev');
    const btnNext = document.getElementById('bltAdNext');
    if (btnPrev) btnPrev.disabled = page <= 0;
    if (btnNext) btnNext.disabled = start + PAGE_SIZE >= total;
  }

  function resetPageAndRender() {
    page = 0;
    render();
  }

  function onDataReady() {
    page = 0;
    render();
  }

  function init() {
    ['bltAdSearchTask', 'bltAdSearchPlate'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      let timer = null;
      el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(resetPageAndRender, 200);
      });
    });
    ['bltAdDateFrom', 'bltAdDateTo', 'bltAdSp', 'bltAdTrucker', 'bltAdLineType', 'bltAdDc', 'bltAdOnTime'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', resetPageAndRender);
    });
    const btnClear = document.getElementById('bltAdClear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        ['bltAdSearchTask', 'bltAdSearchPlate'].forEach(id => {
          const e = document.getElementById(id); if (e) e.value = '';
        });
        ['bltAdDateFrom', 'bltAdDateTo'].forEach(id => {
          const e = document.getElementById(id); if (e) e.value = '';
        });
        ['bltAdSp', 'bltAdTrucker', 'bltAdLineType', 'bltAdDc', 'bltAdOnTime'].forEach(id => {
          const e = document.getElementById(id); if (e) e.value = 'ALL';
        });
        resetPageAndRender();
      });
    }
    const btnPrev = document.getElementById('bltAdPrev');
    const btnNext = document.getElementById('bltAdNext');
    if (btnPrev) btnPrev.addEventListener('click', () => { if (page > 0) { page--; render(); } });
    if (btnNext) btnNext.addEventListener('click', () => { page++; render(); });
  }

  return { init, onDataReady, render };
})();
