/* ==========================================================================
   MODULE: BLT MONTHLY REPORT
   Month picker · Overall / Bulk / Collection summary · DC & SP leaderboards
   ========================================================================== */
const BltMonthlyReport = (() => {
  const TARGET = 0.98;

  function allRows() {
    if (typeof BltFileProcessor === 'undefined') return [];
    return BltFileProcessor.getState().storedRows || [];
  }

  function months() {
    return [...new Set(allRows().map(r => r.month).filter(Boolean))].sort();
  }

  function populate() {
    const sel = document.getElementById('bltMrMonth');
    if (!sel) return;
    const list = months();
    sel.innerHTML = list.map(m => '<option value="' + m + '">' + m + '</option>').join('') ||
      '<option value="">No months</option>';
    if (list.length) sel.value = list[list.length - 1];
  }

  function rowsForMonth(ym) {
    return allRows().filter(r => r.month === ym);
  }

  function dailyBreakdown(list) {
    const dates = [...new Set(list.map(r => r.dateKey))].sort();
    return dates.map(d => {
      const day = list.filter(r => r.dateKey === d);
      return { date: d, ...BltUtils.stats(day) };
    });
  }

  function leaderboard(list, keyFn, limit) {
    const map = BltUtils.groupBy(list, keyFn);
    return Object.entries(map).map(([k, arr]) => ({ key: k, ...BltUtils.stats(arr) }))
      .filter(r => r.total > 0)
      .sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1) || b.no - a.no)
      .slice(0, limit || 15);
  }

  function render() {
    const panel = document.getElementById('bltMrPanel');
    if (!panel) return;
    const { fmtPct, fmtDuration } = BltUtils;
    const sel = document.getElementById('bltMrMonth');
    const ym = sel ? sel.value : '';
    if (!ym) {
      panel.innerHTML = '<p class="section-note">No monthly data.</p>';
      return;
    }
    const list = rowsForMonth(ym);
    const overall = BltUtils.stats(list);
    const bulk = BltUtils.stats(BltUtils.filterLineScope(list, 'BULK'));
    const coll = BltUtils.stats(BltUtils.filterLineScope(list, 'COLLECTION'));
    const days = dailyBreakdown(list);
    const byDc = leaderboard(list, r => r.dcName || r.dcIntended || '(blank)');
    const bySp = leaderboard(list, r => r.sp || '(blank)');

    const totalDelay = list.filter(r => r.onTime === 'NO').reduce((s, r) => {
      if (r.missingDispatch) return s;
      return s + Math.max(0, (r.actualTT || 0) - (r.planTT || 0));
    }, 0);

    let html = '<div class="metrics">' +
      '<div class="metric ' + (overall.rate >= TARGET ? 'highlight-up' : 'highlight-down') + '">' +
      '<div class="label">Month Overall</div><div class="value">' + fmtPct(overall.rate) + '</div>' +
      '<div class="diff neutral">' + overall.total + ' trips · late ' + overall.no + '</div></div>' +
      '<div class="metric"><div class="label">Bulk</div><div class="value">' + fmtPct(bulk.rate) +
      '</div><div class="diff neutral">' + bulk.total + ' · late ' + bulk.no + '</div></div>' +
      '<div class="metric"><div class="label">Collection</div><div class="value">' + fmtPct(coll.rate) +
      '</div><div class="diff neutral">' + coll.total + ' · late ' + coll.no + '</div></div>' +
      '<div class="metric highlight-down"><div class="label">Total delay (late trips)</div>' +
      '<div class="value neg">' + fmtDuration(totalDelay) + '</div></div></div>';

    html += '<h3 style="font-size:0.95rem;margin:14px 0 8px;">Daily breakdown · ' + ym + '</h3>';
    html += '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Total</th><th>On Time</th><th>Late</th><th>Rate</th></tr></thead><tbody>';
    days.slice().reverse().forEach(d => {
      html += '<tr><td>' + d.date + '</td><td>' + d.total + '</td><td class="pos">' + d.yes +
        '</td><td class="neg">' + d.no + '</td><td class="' + (d.rate >= TARGET ? 'pos' : 'neg') +
        '">' + fmtPct(d.rate) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    function board(title, rows) {
      let h = '<h3 style="font-size:0.95rem;margin:14px 0 8px;">' + title + ' (lowest rate first)</h3>';
      h += '<div class="table-scroll"><table><thead><tr><th>Name</th><th>Total</th><th>Late</th><th>Rate</th></tr></thead><tbody>';
      rows.forEach(r => {
        h += '<tr><td>' + r.key + '</td><td>' + r.total + '</td><td class="neg">' + r.no +
          '</td><td class="' + (r.rate >= TARGET ? 'pos' : 'neg') + '">' + fmtPct(r.rate) + '</td></tr>';
      });
      return h + '</tbody></table></div>';
    }
    html += board('DC Intended', byDc);
    html += board('Service Partner', bySp);
    panel.innerHTML = html;
  }

  function onDataReady() {
    populate();
    render();
  }

  function init() {
    const sel = document.getElementById('bltMrMonth');
    if (sel) sel.addEventListener('change', render);
  }

  return { init, onDataReady, render };
})();
