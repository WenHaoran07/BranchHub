/* ==========================================================================
   MODULE: BAU UI MANAGER (DOM rendering for Branchline App Usage)
   ========================================================================== */
const BauUIManager = (() => {
  const { fmtPct, fmtNum, fmtPp, TARGET } = BauUtils;

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
        return '<td class="' + cls + '">' + val + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
  }

  function render(data) {
    const {
      datePrev, dateLatest, datePrevLabel, dateLatestLabel,
      isOverallLatest, target, targetPct,
      overall, overallPrev, rateDiff,
      bulk, bulkPrev, collection, collectionPrev,
      own, ownPrev, tp, tpPrev,
      dcMissList, spMissList, driverMissList, routeMissList,
      dcRows, spRows, driverRows, routeRows, carrierRows,
      missDetail, noClockInCount, noClockOutCount, histRows
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
      '<div class="metric ' + (rateDown ? 'highlight-down' : rateUp ? 'highlight-up' : '') + '"><div class="label">App Usage Rate</div><div class="value">' + fmtPct(overall.rate) + '</div><div class="diff ' + deltaClass(rateDiff) + '">' + fmtPp(rateDiff) + ' vs prev</div></div>' +
      '<div class="metric"><div class="label">Total Trips</div><div class="value">' + overall.total + '</div><div class="diff neutral">' + overallPrev.total + ' prev</div></div>' +
      '<div class="metric"><div class="label">Compliant (Both YES)</div><div class="value pos">' + overall.yes + '</div></div>' +
      '<div class="metric ' + (overall.no > 0 ? 'highlight-down' : '') + '"><div class="label">Non-Compliant</div><div class="value ' + (overall.no ? 'neg' : '') + '">' + overall.no + '</div><div class="diff neutral">' + overallPrev.no + ' prev</div></div>' +
      '<div class="metric"><div class="label">Clock-In Rate</div><div class="value">' + fmtPct(overall.cinRate) + '</div><div class="diff neutral">' + overall.cinNo + ' NO</div></div>' +
      '<div class="metric"><div class="label">Clock-Out Rate</div><div class="value">' + fmtPct(overall.coutRate) + '</div><div class="diff neutral">' + overall.coutNo + ' NO</div></div>' +
      '<div class="metric ' + rateClass(overall.rate, target) + '"><div class="label">vs Target ' + targetPct + '%</div><div class="value">' + (overall.rate != null ? (overall.rate >= target ? '✓' : '✗') : '—') + '</div></div>';

    const focusWord = isOverallLatest ? 'Overall' : 'Focus day';
    let summary = 'SLU Branchline App Usage · ' + focusWord + ' <strong>' + latestLbl + '</strong>: ' + overall.total + ' trips, <strong>' + fmtPct(overall.rate) + '</strong> compliant (both Clock-In &amp; Clock-Out)';
    if (overall.no > 0) {
      summary += ', <strong style="color:#E60012">' + overall.no + ' non-compliant</strong>';
      summary += ' (No Clock-In: ' + (noClockInCount || 0) + ', No Clock-Out: ' + (noClockOutCount || 0) + ')';
    }
    summary += ' · target ' + targetPct + '%.';
    if (rateDiff != null) {
      if (rateDiff < -0.01) summary += ' Rate <strong>down ' + fmtPp(rateDiff) + '</strong> vs ' + prevLbl + '.';
      else if (rateDiff > 0.01) summary += ' Rate <strong>up ' + fmtPp(rateDiff) + '</strong> vs ' + prevLbl + '.';
    }
    document.getElementById('summaryText').innerHTML = summary;

    // Bulk / Collection
    document.getElementById('metricsBulk').innerHTML =
      '<div class="metric"><div class="label">Rate</div><div class="value">' + fmtPct(bulk.rate) + '</div></div>' +
      '<div class="metric"><div class="label">Trips</div><div class="value">' + bulk.total + '</div></div>' +
      '<div class="metric"><div class="label">Miss</div><div class="value ' + (bulk.no ? 'neg' : '') + '">' + bulk.no + '</div></div>';
    document.getElementById('metricsCollection').innerHTML =
      '<div class="metric"><div class="label">Rate</div><div class="value">' + fmtPct(collection.rate) + '</div></div>' +
      '<div class="metric"><div class="label">Trips</div><div class="value">' + collection.total + '</div></div>' +
      '<div class="metric"><div class="label">Miss</div><div class="value ' + (collection.no ? 'neg' : '') + '">' + collection.no + '</div></div>';

    // Own / TP
    const ownEl = document.getElementById('metricsOwn');
    const tpEl = document.getElementById('metricsTP');
    if (ownEl) {
      ownEl.innerHTML =
        '<div class="metric"><div class="label">Rate</div><div class="value">' + fmtPct(own.rate) + '</div></div>' +
        '<div class="metric"><div class="label">Trips</div><div class="value">' + own.total + '</div></div>' +
        '<div class="metric"><div class="label">Miss</div><div class="value ' + (own.no ? 'neg' : '') + '">' + own.no + '</div></div>';
    }
    if (tpEl) {
      tpEl.innerHTML =
        '<div class="metric"><div class="label">Rate</div><div class="value">' + fmtPct(tp.rate) + '</div></div>' +
        '<div class="metric"><div class="label">Trips</div><div class="value">' + tp.total + '</div></div>' +
        '<div class="metric"><div class="label">Miss</div><div class="value ' + (tp.no ? 'neg' : '') + '">' + tp.no + '</div></div>';
    }

    // Miss panels
    const lateDcPanel = document.getElementById('lateDcPanel');
    if (lateDcPanel) {
      if (!dcMissList || !dcMissList.length) {
        lateDcPanel.innerHTML = '<div class="empty-note">No non-compliant trips by DC.</div>';
      } else {
        lateDcPanel.innerHTML = '<div class="chip-row">' + dcMissList.slice(0, 15).map(d =>
          '<span class="chip"><strong>' + d.dc + '</strong> · ' + d.miss + ' miss · ' + fmtPct(d.rate) + '</span>'
        ).join('') + '</div>';
      }
    }
    const lateSpPanel = document.getElementById('lateSpPanel');
    if (lateSpPanel) {
      if (!spMissList || !spMissList.length) {
        lateSpPanel.innerHTML = '<div class="empty-note">No non-compliant trips by SP.</div>';
      } else {
        lateSpPanel.innerHTML = '<div class="chip-row">' + spMissList.slice(0, 15).map(d =>
          '<span class="chip"><strong>' + d.sp + '</strong> · ' + d.miss + ' miss · ' + fmtPct(d.rate) + '</span>'
        ).join('') + '</div>';
      }
    }

    // Tables
    renderTable('tbodyDC', dcRows, [
      { fn: r => r.key },
      { fn: r => r.total },
      { fn: r => r.yes },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => (r.cinNo || 0) + ' / ' + (r.coutNo || 0) },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { fn: r => fmtPct(r.prevRate) },
      { fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    renderTable('tbodySP', spRows, [
      { fn: r => r.key },
      { fn: r => r.total },
      { fn: r => r.yes },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => (r.cinNo || 0) + ' / ' + (r.coutNo || 0) },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { fn: r => fmtPct(r.prevRate) },
      { fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    renderTable('tbodyDriver', driverRows, [
      { fn: r => r.key },
      { fn: r => r.total },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => (r.cinNo || 0) + ' / ' + (r.coutNo || 0) },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { fn: r => fmtPct(r.prevRate) },
      { fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    renderTable('tbodyRoutes', routeRows.slice(0, 40), [
      { fn: r => r.key },
      { fn: r => r.total },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { fn: r => fmtPct(r.prevRate) },
      { fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    renderTable('tbodyCarrier', carrierRows, [
      { fn: r => r.key },
      { fn: r => r.total },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate, target) },
      { fn: r => fmtPct(r.prevRate) },
      { fn: r => fmtPp(r.delta), cls: r => deltaClass(r.delta) }
    ]);

    // Miss detail
    renderTable('tbodyMissDetail', missDetail.slice(0, 200), [
      { fn: r => r.date },
      { fn: r => r.shipmentNo || '—' },
      { fn: r => r.driver },
      { fn: r => r.plate || '—' },
      { fn: r => r.sp },
      { fn: r => r.dc },
      { fn: r => r.route },
      { fn: r => r.clockIn, cls: r => r.clockIn === 'NO' ? 'neg' : '' },
      { fn: r => r.clockOut, cls: r => r.clockOut === 'NO' ? 'neg' : '' },
      { fn: r => r.issue, cls: () => 'neg' }
    ]);

    BauChartManager.render(dcMissList, spMissList, driverMissList, histRows, targetPct);

    const loading = document.getElementById('loading');
    const loadingCompare = document.getElementById('loadingCompare');
    const results = document.getElementById('results');
    if (loading) loading.classList.add('hidden');
    if (loadingCompare) loadingCompare.classList.add('hidden');
    if (results) results.classList.remove('hidden');
  }

  function initTabs() {
    document.querySelectorAll('.tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const parent = tab.closest('.card') || document;
        parent.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
        parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(tab.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  return { render, initTabs };
})();
