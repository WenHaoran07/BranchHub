/* ==========================================================================
   MODULE: BDR UI MANAGER (DOM rendering for Branchline)
   ========================================================================== */
const BdrUIManager = (() => {
  const { fmtPct, fmtNum, fmtPp, fmtDuration, TARGET } = BdrUtils;

  function rateClass(rate, target) {
    if (rate == null) return '';
    return rate >= target ? 'highlight-up' : 'highlight-down';
  }

  function deltaClass(d) {
    if (d == null) return 'neutral';
    if (d < -0.005) return 'down';
    if (d > 0.005) return 'up';
    return 'neutral';
  }

  function renderTable(bodyId, rows, cols) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#757575;">No data</td></tr>';
      return;
    }
    body.innerHTML = rows.map(r => {
      const cells = cols.map(c => {
        let val = c.fn ? c.fn(r) : r[c.key];
        const cls = c.cls ? c.cls(r) : '';
        return '<td class="'+cls+'">'+val+'</td>';
      }).join('');
      return '<tr>'+cells+'</tr>';
    }).join('');
  }

  function render(data) {
    const {
      datePrev, dateLatest, datePrevLabel, dateLatestLabel,
      isOverallLatest, target, targetPct,
      overall, overallPrev, rateDiff,
      bulk, bulkPrev, collection, collectionPrev,
      own, ownPrev, tp, tpPrev,
      dcLateList, spLateList, routeLateList,
      dcRows, spRows, routeRows, lineTypeRows,
      spLateRouteList, lateDetail, histRows, forecast
    } = data;

    const prevLbl = datePrevLabel || datePrev;
    const latestLbl = dateLatestLabel || dateLatest;

    document.getElementById('datePrev').textContent = prevLbl;
    document.getElementById('dateLatest').textContent = latestLbl;

    const targetBadge = document.getElementById('targetBadgeText');
    if (targetBadge) targetBadge.textContent = 'Target ' + targetPct + '%';

    const rateDown = rateDiff != null && rateDiff < -0.005;
    const rateUp = rateDiff != null && rateDiff > 0.005;

    // Overall metrics
    document.getElementById('metricsOverall').innerHTML =
      '<div class="metric '+(rateDown?'highlight-down':rateUp?'highlight-up':'')+'"><div class="label">Achievement Rate</div><div class="value">'+fmtPct(overall.rate)+'</div><div class="diff '+deltaClass(rateDiff)+'">'+fmtPp(rateDiff)+' vs prev</div></div>' +
      '<div class="metric"><div class="label">Total Departures</div><div class="value">'+overall.total+'</div><div class="diff neutral">'+overallPrev.total+' prev</div></div>' +
      '<div class="metric"><div class="label">On Time</div><div class="value pos">'+overall.yes+'</div></div>' +
      '<div class="metric '+(overall.no>0?'highlight-down':'')+'"><div class="label">Late</div><div class="value '+(overall.no?'neg':'')+'">'+overall.no+'</div><div class="diff neutral">'+overallPrev.no+' prev</div></div>' +
      '<div class="metric"><div class="label">Prev Rate</div><div class="value">'+fmtPct(overallPrev.rate)+'</div></div>' +
      '<div class="metric '+rateClass(overall.rate, target)+'"><div class="label">vs Target '+targetPct+'%</div><div class="value">'+(overall.rate!=null?(overall.rate>=target?'✓':'✗'):'—')+'</div></div>';

    const focusWord = isOverallLatest ? 'Overall' : 'Focus day';
    let summary = 'SLU Branchline Departure Rate · '+focusWord+' <strong>'+latestLbl+'</strong>: '+overall.total+' departures, <strong>'+fmtPct(overall.rate)+'</strong> on time';
    if (overall.no > 0) summary += ', <strong style="color:#E60012">'+overall.no+' late</strong>';
    summary += ' (target '+targetPct+'%).';
    if (rateDiff != null) {
      if (rateDiff < -0.01) summary += ' Rate <strong>down '+fmtPp(rateDiff)+'</strong> vs '+prevLbl+'.';
      else if (rateDiff > 0.01) summary += ' Rate <strong>up '+fmtPp(rateDiff)+'</strong> vs '+prevLbl+'.';
    }
    if (forecast && forecast.trend) {
      summary += ' Recent trend: <strong>'+forecast.trend+'</strong>';
      if (forecast.risk === 'high') summary += ' · <span style="color:#E60012">risk of missing target</span>';
    }
    document.getElementById('summaryText').innerHTML = summary;

    // Line type & Carrier cards
    const bulkDiff = (bulk.rate != null && bulkPrev.rate != null) ? bulk.rate - bulkPrev.rate : null;
    const collDiff = (collection.rate != null && collectionPrev.rate != null) ? collection.rate - collectionPrev.rate : null;
    document.getElementById('metricsBulk').innerHTML =
      '<div class="metric '+rateClass(bulk.rate, target)+'"><div class="label">Rate</div><div class="value">'+fmtPct(bulk.rate)+'</div><div class="diff '+deltaClass(bulkDiff)+'">'+fmtPp(bulkDiff)+'</div></div>' +
      '<div class="metric"><div class="label">Total</div><div class="value">'+bulk.total+'</div></div>' +
      '<div class="metric"><div class="label">Late</div><div class="value '+(bulk.no?'neg':'')+'">'+bulk.no+'</div></div>';
    document.getElementById('metricsCollection').innerHTML =
      '<div class="metric '+rateClass(collection.rate, target)+'"><div class="label">Rate</div><div class="value">'+fmtPct(collection.rate)+'</div><div class="diff '+deltaClass(collDiff)+'">'+fmtPp(collDiff)+'</div></div>' +
      '<div class="metric"><div class="label">Total</div><div class="value">'+collection.total+'</div></div>' +
      '<div class="metric"><div class="label">Late</div><div class="value '+(collection.no?'neg':'')+'">'+collection.no+'</div></div>';

    // Late panels
    const lateDcPanel = document.getElementById('lateDcPanel');
    const lateSpPanel = document.getElementById('lateSpPanel');
    const noLatePanel = document.getElementById('noLatePanel');
    if (overall.no === 0) {
      if (lateDcPanel) lateDcPanel.innerHTML = '';
      if (lateSpPanel) lateSpPanel.innerHTML = '';
      if (noLatePanel) {
        noLatePanel.classList.remove('hidden');
        noLatePanel.innerHTML = '<div style="padding:16px;text-align:center;color:#2E7D32;font-weight:600;">✓ All branchline trips on time for '+latestLbl+'</div>';
      }
    } else {
      if (noLatePanel) noLatePanel.classList.add('hidden');
      if (lateDcPanel) {
        lateDcPanel.innerHTML = '<h3 style="font-size:0.95rem;margin-bottom:8px;">Late by DC Intended</h3>' +
          '<div class="table-scroll"><table><thead><tr><th>DC Name</th><th>Code</th><th>Late</th><th>Total</th><th>Rate</th></tr></thead><tbody>' +
          (dcLateList || []).map(r =>
            '<tr><td>'+r.dc+'</td><td>'+(r.dcCode || '')+'</td><td class="neg">'+r.late+'</td><td>'+r.total+'</td><td>'+fmtPct(r.rate)+'</td></tr>'
          ).join('') + '</tbody></table></div>';
      }
      if (lateSpPanel) {
        lateSpPanel.innerHTML = '<h3 style="font-size:0.95rem;margin-bottom:8px;">Late by Service Partner (SP)</h3>' +
          '<div class="table-scroll"><table><thead><tr><th>SP / PH</th><th>Late</th><th>Total</th><th>Rate</th></tr></thead><tbody>' +
          (spLateList || []).map(r =>
            '<tr><td>'+r.sp+'</td><td class="neg">'+r.late+'</td><td>'+r.total+'</td><td>'+fmtPct(r.rate)+'</td></tr>'
          ).join('') + '</tbody></table></div>';
      }
    }

    // Tables
    renderTable('dcBody', dcRows, [
      { key: 'key', fn: r => r.key },
      { key: 'total' },
      { key: 'yes' },
      { key: 'no', cls: r => r.no ? 'neg' : '' },
      { key: 'rate', fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { key: 'prevRate', fn: r => fmtPct(r.prevRate) },
      { key: 'delta', fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    renderTable('spBody', spRows, [
      { key: 'key', fn: r => r.key },
      { key: 'total' },
      { key: 'yes' },
      { key: 'no', cls: r => r.no ? 'neg' : '' },
      { key: 'rate', fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { key: 'prevRate', fn: r => fmtPct(r.prevRate) },
      { key: 'delta', fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    renderTable('routesBody', routeRows, [
      { key: 'key', fn: r => r.key },
      { key: 'total' },
      { key: 'yes' },
      { key: 'no', cls: r => r.no ? 'neg' : '' },
      { key: 'rate', fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { key: 'prevRate', fn: r => fmtPct(r.prevRate) },
      { key: 'delta', fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    // SP Late Routes + Late Trip Detail are rendered by BdrLateFilter
    // (Date / Week / Sort / SP filters) after this main render.

    // History
    renderTable('historyBody', histRows.slice().reverse(), [
      { key: 'date' },
      { key: 'total' },
      { key: 'yes' },
      { key: 'late', fn: r => r.late, cls: r => r.late ? 'neg' : '' },
      { key: 'rate', fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) }
    ]);

    // Charts
    BdrChartManager.render(dcLateList, spLateList, routeLateList, histRows, targetPct);

    // Show results
    const loading = document.getElementById('loading');
    const loadingCompare = document.getElementById('loadingCompare');
    const results = document.getElementById('results');
    if (loading) loading.classList.add('hidden');
    if (loadingCompare) loadingCompare.classList.add('hidden');
    if (results) results.classList.remove('hidden');
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(tab.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  return { render, initTabs };
})();
