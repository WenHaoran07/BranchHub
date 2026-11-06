/* ==========================================================================
   MODULE: BLT BRANCHLINE TRAVEL TIME REPORT
   Focus period report: Overall · Bulk/Collection · DC · SP · Top late routes
   ========================================================================== */
const BltTravelReport = (() => {
  const TARGET = 0.98;

  function allRows() {
    if (typeof BltFileProcessor === 'undefined') return [];
    return BltFileProcessor.getState().storedRows || [];
  }

  function allDates() {
    return (BltFileProcessor.getState().storedDates || []).slice();
  }

  function stats(list) {
    return BltUtils.stats(list);
  }

  function populateFocus() {
    const sel = document.getElementById('bltTrFocus');
    if (!sel) return;
    const dates = allDates();
    const weeks = [...new Set(allRows().map(r => r.week).filter(Boolean))].sort();
    const months = [...new Set(allRows().map(r => r.month).filter(Boolean))].sort();
    const mode = (document.getElementById('bltTrMode') || {}).value || 'day';
    let opts = '';
    if (mode === 'day') {
      opts = dates.map(d => '<option value="day:' + d + '">' + d + '</option>').join('');
      if (dates.length) opts = '<option value="day:ALL">Overall (All dates)</option>' + opts;
    } else if (mode === 'week') {
      opts = weeks.map(w => '<option value="week:' + w + '">' + w + '</option>').join('');
    } else {
      opts = months.map(m => '<option value="month:' + m + '">' + m + '</option>').join('');
    }
    sel.innerHTML = opts || '<option value="">No periods</option>';
    if (sel.options.length) sel.selectedIndex = sel.options.length - 1;
  }

  function rowsForFocus() {
    const sel = document.getElementById('bltTrFocus');
    const val = sel ? sel.value : '';
    const rows = allRows();
    if (!val) return rows;
    const [kind, key] = val.split(':');
    if (kind === 'day') {
      if (key === 'ALL') return rows;
      return rows.filter(r => r.dateKey === key);
    }
    if (kind === 'week') return rows.filter(r => r.week === key);
    if (kind === 'month') return rows.filter(r => r.month === key);
    return rows;
  }

  function metricCard(title, st) {
    const { fmtPct } = BltUtils;
    const ok = st.rate != null && st.rate >= TARGET;
    return '<div class="metric ' + (ok ? 'highlight-up' : 'highlight-down') + '">' +
      '<div class="label">' + title + '</div>' +
      '<div class="value">' + fmtPct(st.rate) + '</div>' +
      '<div class="diff neutral">' + st.total + ' trips · late ' + st.no + '</div></div>';
  }

  function topTable(title, list, keyFn) {
    const { fmtPct } = BltUtils;
    const map = BltUtils.groupBy(list, keyFn);
    const rows = Object.entries(map).map(([k, arr]) => {
      const st = stats(arr);
      return { key: k, ...st };
    }).filter(r => r.total > 0).sort((a, b) => (b.no - a.no) || ((a.rate ?? 1) - (b.rate ?? 1)));
    let html = '<h3 style="font-size:0.95rem;margin:14px 0 8px;">' + title + '</h3>';
    html += '<div class="table-scroll"><table><thead><tr><th>Name</th><th>Total</th><th>On Time</th><th>Late</th><th>Rate</th></tr></thead><tbody>';
    if (!rows.length) {
      html += '<tr><td colspan="5" style="text-align:center;color:#888;">No data</td></tr>';
    } else {
      rows.slice(0, 25).forEach(r => {
        html += '<tr><td>' + r.key + '</td><td>' + r.total + '</td><td class="pos">' + r.yes +
          '</td><td class="neg">' + r.no + '</td><td class="' +
          (r.rate >= TARGET ? 'pos' : 'neg') + '">' + fmtPct(r.rate) + '</td></tr>';
      });
    }
    html += '</tbody></table></div>';
    return html;
  }

  function render() {
    const panel = document.getElementById('bltTrPanel');
    if (!panel) return;
    const focusRows = rowsForFocus();
    const overall = stats(focusRows);
    const bulk = stats(BltUtils.filterLineScope(focusRows, 'BULK'));
    const coll = stats(BltUtils.filterLineScope(focusRows, 'COLLECTION'));

    let html = '<div class="metrics">' +
      metricCard('Overall', overall) +
      metricCard('Bulk cargo', bulk) +
      metricCard('Collection', coll) +
      '</div>';
    html += topTable('By DC Intended', focusRows, r => r.dcName || r.dcIntended || '(blank)');
    html += topTable('By Service Partner (PH/SP)', focusRows, r => r.sp || '(blank)');
    html += topTable('By Trucker / Carrier name', focusRows, r => r.trucker || r.carrierName || '(blank)');
    html += topTable('By Route', focusRows, r => r.route || '(blank)');
    panel.innerHTML = html;

    const focusSel = document.getElementById('bltTrFocus');
    const label = document.getElementById('bltTrFocusLabel');
    if (label && focusSel) label.textContent = focusSel.options[focusSel.selectedIndex]
      ? focusSel.options[focusSel.selectedIndex].text : '';
  }

  function onDataReady() {
    populateFocus();
    render();
  }

  function init() {
    const mode = document.getElementById('bltTrMode');
    if (mode) mode.addEventListener('change', () => { populateFocus(); render(); });
    const focus = document.getElementById('bltTrFocus');
    if (focus) focus.addEventListener('change', render);
  }

  return { init, onDataReady, render };
})();
