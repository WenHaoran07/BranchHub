/* ==========================================================================
   MODULE: BLT BRANCHLINE MONTHLY REPORT
   Tables (Excel layout):
     1) Branchline / Bulk / Collection summary (SLU)
     2) SLU by DC
     3) SLU by Trucker
     4) SLU Bulk by Region + Route
     5) SLU Collection by Region + Route
   Weekly: last 3 weeks · Monthly: delay/ontime/total + JUL…current + monthly diff
   JUL & AUG scope totals fixed from official baseline where listed.
   Weekly/Monthly rates = YES ÷ TOTAL (Excel WM SLU TRAVEL TIME formula).
   ========================================================================== */
const BltMonthlyReport = (() => {
  const TARGET = { ALL: 0.97, BULK: 0.97, COLLECTION: 0.97 };

  /** No fixed JUL/AUG baselines for Branchline — use computed rates from DATA */
  const FIXED_MONTH_RATES = {
    ALL: {},
    BULK: {},
    COLLECTION: {}
  };

  const MONTH_LABELS = {
    '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR',
    '05': 'MAY', '06': 'JUN', '07': 'JUL', '08': 'AUG',
    '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC'
  };

  const DC_NAME_MAP = (typeof BltUtils !== 'undefined' && BltUtils.DC_CODE_MAP)
    ? BltUtils.DC_CODE_MAP
    : {
      '206': 'Rizal DC', '430': 'Batangas DC', '431': 'Mindoro MamburaoDC1',
      '432': 'Mindoro CalapanDC2', '460': 'Cavite DC1', '470': 'LUCENA NEW DC',
      '480': 'PalawanDC1', '481': 'CORON DC', '491': 'Laguna-RTS DC',
      '492': 'Laguna DC2', '9071': 'DW-Taytay 888'
    };

  let charts = { overall: null, bulk: null, collection: null };
  let activeView = 'full';

  function pad2(n) { return String(n).padStart(2, '0'); }
  function pct(v, d) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(d == null ? 2 : d) + '%';
  }
  function weekKey(dateKey) {
    return (typeof BltUtils !== 'undefined' && BltUtils.weekKey) ? BltUtils.weekKey(dateKey) : null;
  }
  function weekNum(dateKey) {
    return (typeof BltUtils !== 'undefined' && BltUtils.excelWeekNum) ? BltUtils.excelWeekNum(dateKey) : null;
  }
  function monthKey(d) { return d ? String(d).slice(0, 7) : null; }

  function allRows() {
    if (typeof BltFileProcessor === 'undefined') return [];
    return BltFileProcessor.getState().storedRows || [];
  }
  function allDates() {
    if (typeof BltFileProcessor === 'undefined') return [];
    return (BltFileProcessor.getState().storedDates || []).slice().sort();
  }
  function getFocusDate() {
    const dates = allDates();
    const sel = document.getElementById('selectLatest');
    let v = sel && sel.value ? sel.value : '';
    if (!v || v === 'ALL' || v === 'Overall' || /overall/i.test(v)) {
      return dates.length ? dates[dates.length - 1] : null;
    }
    if (dates.indexOf(v) >= 0) return v;
    return dates.length ? dates[dates.length - 1] : null;
  }

  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => String(r.onTime || '').toUpperCase() === 'YES').length;
    const total = list.length;
    return { total, yes, no: total - yes, rate: total ? yes / total : null };
  }
    /** Excel WM SLU TRAVEL TIME: RATE = YES ÷ TOTAL (COUNTIFS), not avg of daily rates */
  function periodRate(list) {
    if (!list || !list.length) return null;
    const s = stats(list);
    return s.rate;
  }
  function filterScope(list, scope) {
    if (scope === 'BULK' || scope === 'COLLECTION') {
      return (typeof BltUtils !== 'undefined' && BltUtils.filterLineScope)
        ? BltUtils.filterLineScope(list, scope)
        : list.filter(function (r) {
            const lt = String(r.lineType || '');
            if (scope === 'BULK') return /bulk/i.test(lt);
            if (scope === 'COLLECTION') return /collection/i.test(lt);
            return true;
          });
    }
    return list;
  }

  function normalizeRegionName(raw) {
    const u = String(raw || '').trim().toUpperCase();
    if (!u || u === '(BLANK)' || u === 'BLANK' || u === 'N/A' || u === '-') return '(blank)';
    if (u === 'TWO DROPS' || u === 'TWODROPS' || u === 'TWO-DROPS') return 'TWO DROPS';
    if (u === 'BACKLOAD' || u === 'BACK LOAD') return 'BACKLOAD';
    return String(raw || '').trim() || '(blank)';
  }
  function regionSortKey(name) {
    const u = String(name || '').toUpperCase();
    if (u === 'TWO DROPS') return 'zzzz1';
    if (u === 'BACKLOAD') return 'zzzz2';
    if (u === '(BLANK)') return 'zzzz9';
    return u;
  }
  function sortRegions(names) {
    return names.slice().sort(function (a, b) {
      return regionSortKey(a).localeCompare(regionSortKey(b));
    });
  }
  /** Multi-leg routes e.g. 490-520-551 / 490-540-530 → TWO DROPS (same as Rate Matrix) */
  function isMultiDropRoute(route) {
    const s = String(route || '').trim().toUpperCase();
    if (!s || s === '(BLANK)' || s === 'BLANK') return false;
    const parts = s.split(/[-–—_/\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length >= 3) {
      const numericish = parts.filter(function (p) { return /^\d{2,}$/.test(p); });
      if (numericish.length >= 3) return true;
      return true;
    }
    if (s.indexOf('TWO DROP') >= 0 || s.indexOf('2 DROP') >= 0 || s.indexOf('TWODROP') >= 0) return true;
    return false;
  }
  function effectiveRegion(r) {
    const dc = String((r && (r.dcName || r.dcIntended)) || '').trim();
    if (dc && dc !== '(blank)') return dc;
    let reg = normalizeRegionName(r && r.region);
    if (reg === 'BACKLOAD') return 'BACKLOAD';
    if (reg === 'TWO DROPS') return 'TWO DROPS';
    return reg;
  }


  function resolveDc(codeOrName) {
    const raw = String(codeOrName || '').trim();
    const digits = raw.replace(/\.0+$/, '').replace(/[^0-9]/g, '') || raw;
    if (DC_NAME_MAP[digits]) return { name: DC_NAME_MAP[digits], code: digits };
    if (DC_NAME_MAP[raw]) return { name: DC_NAME_MAP[raw], code: raw };
    return { name: raw || '(blank)', code: digits || '' };
  }

  function destroyChart(key) {
    if (charts[key]) {
      try { charts[key].destroy(); } catch (e) {}
      charts[key] = null;
    }
  }

  /** Last 3 week keys ending at focus week, oldest → newest */
  function last3WeekKeys(focus, rows) {
    if (!focus) return [];
    const set = new Set();
    rows.forEach(r => {
      const wk = weekKey(r.dateKey);
      if (wk) set.add(wk);
    });
    const sorted = [...set].sort();
    const cur = weekKey(focus);
    let idx = sorted.indexOf(cur);
    if (idx < 0) idx = sorted.length - 1;
    if (idx < 0) return [];
    return sorted.slice(Math.max(0, idx - 2), idx + 1);
  }

  function monthRateFor(rows, ym, scopeFixed) {
    if (scopeFixed && FIXED_MONTH_RATES[scopeFixed] && FIXED_MONTH_RATES[scopeFixed][ym] != null) {
      return FIXED_MONTH_RATES[scopeFixed][ym];
    }
    const list = rows.filter(r => monthKey(r.dateKey) === ym);
    return periodRate(list);
  }

  function monthColsFor(focus, rows, scopeFixed) {
    const year = focus ? focus.slice(0, 4) : '2026';
    const endMonth = focus ? parseInt(focus.slice(5, 7), 10) : 10;
    const cols = [];
    for (let m = 7; m <= Math.max(endMonth, 9); m++) {
      if (m > 12) break;
      const ym = year + '-' + pad2(m);
      cols.push({
        ym,
        label: MONTH_LABELS[pad2(m)] + ' RATE',
        rate: monthRateFor(rows, ym, scopeFixed)
      });
    }
    return cols;
  }

  function buildEntityMetrics(name, code, rows, focus, weekKeys, scopeFixed, target) {
    const weekRates = weekKeys.map(wk => {
      const list = rows.filter(r => weekKey(r.dateKey) === wk);
      const s = stats(list);
      const wn = wk && String(wk).match(/W(\d+)/i);
      return {
        key: wk,
        label: wn ? ('WK ' + parseInt(wn[1], 10) + ' RATE') : 'WK —',
        rate: periodRate(list),
        total: s.total
      };
    });
    // WEEKLY DIFF = latest week − previous week
    let weeklyDiff = null;
    if (weekRates.length >= 2) {
      const a = weekRates[weekRates.length - 1].rate;
      const b = weekRates[weekRates.length - 2].rate;
      if (a != null && b != null) weeklyDiff = a - b;
    }

    const focusYm = monthKey(focus);
    const monthSt = stats(rows.filter(r => monthKey(r.dateKey) === focusYm));
    const mCols = monthColsFor(focus, rows, scopeFixed);

    // MONTHLY DIFF = latest month − previous month (e.g. SEP − AUG)
    let monthlyDiff = null;
    if (mCols.length >= 2) {
      const latest = mCols[mCols.length - 1].rate;
      const prev = mCols[mCols.length - 2].rate;
      if (latest != null && prev != null) monthlyDiff = latest - prev;
    }

    return {
      name, code, target,
      weekRates, weeklyDiff,
      monthLate: monthSt.no,
      monthOnTime: monthSt.yes,
      monthTotal: monthSt.total,
      monthCols: mCols,
      monthlyDiff
    };
  }

  function rateCls(rate, target) {
    if (rate == null) return 'mr-blank';
    if (target == null) return 'mr-ok';
    return rate >= target ? 'mr-ok' : 'mr-bad';
  }

  function paintMetricsCells(r) {
    let html = '';
    const weeks = r.weekRates || [];
    // pad to 3 week cols for consistent headers
    for (let i = 0; i < 3; i++) {
      const w = weeks[i];
      html += '<td class="' + rateCls(w ? w.rate : null, r.target) + '">' +
        (w && w.rate != null ? pct(w.rate) : '—') + '</td>';
    }
    const wd = r.weeklyDiff;
    const wCls = wd == null ? 'mr-blank' : (wd >= 0 ? 'mr-ok' : 'mr-bad');
    html += '<td class="' + wCls + '">' + (wd == null ? '—' : (wd * 100).toFixed(2) + '%') + '</td>';
    html += '<td>' + (r.monthLate != null ? r.monthLate : '—') + '</td>';
    html += '<td>' + (r.monthOnTime != null ? r.monthOnTime : '—') + '</td>';
    html += '<td>' + (r.monthTotal != null ? r.monthTotal : '—') + '</td>';
    // Monthly rate cells: green hit · white blank · red below
    (r.monthCols || []).forEach(c => {
      html += '<td class="' + rateCls(c.rate, r.target) + '">' + pct(c.rate) + '</td>';
    });
    const md = r.monthlyDiff;
    const mdCls = md == null ? 'mr-blank' : (md >= 0 ? 'mr-ok' : 'mr-bad');
    const arrow = md == null ? '' : (md >= 0 ? '↑ ' : '↓ ');
    html += '<td class="mr-diff ' + mdCls + '">' +
      (md == null ? '—' : arrow + Math.abs(md * 100).toFixed(2) + '%') + '</td>';
    return html;
  }

  function weekHeaderLabels(weekKeys) {
    const labels = weekKeys.map(wk => {
      const m = String(wk).match(/W(\d+)/i);
      return m ? ('WK ' + parseInt(m[1], 10) + ' RATE') : 'WK —';
    });
    while (labels.length < 3) labels.push('WK —');
    return labels.slice(0, 3);
  }

  function monthHeaderLabels(focus) {
    const cols = monthColsFor(focus, [], null);
    // labels only — rebuild with empty rows still gives Jul→end structure
    const year = focus ? focus.slice(0, 4) : '2026';
    const endMonth = focus ? parseInt(focus.slice(5, 7), 10) : 10;
    const out = [];
    for (let m = 7; m <= Math.max(endMonth, 9); m++) {
      if (m > 12) break;
      out.push(MONTH_LABELS[pad2(m)] + ' RATE');
    }
    return out;
  }

  let expandSeq = 0;

  function renderTable(opts) {
    const {
      title, leftHeaders, bodyRows, totalRow, focus, weekKeys, target
    } = opts;
    const wLabels = weekHeaderLabels(weekKeys || []);
    const mLabels = monthHeaderLabels(focus);
    const nMonth = mLabels.length;
    const expandId = 'mrExpandBody_' + (++expandSeq);

    let h = '<div class="mr-block">';
    h += '<div class="mr-block-title">';
    h += '<span>' + title + '</span>';
    h += '<button type="button" class="mr-expand-btn" data-mr-expand="' + expandId + '" title="Expand full table">⛶ Expand</button>';
    h += '</div>';
    h += '<div class="table-scroll mr-scroll" id="' + expandId + '"><table class="mr-table"><thead>';
    h += '<tr class="mr-h1">';
    leftHeaders.forEach((lh, i) => {
      h += '<th rowspan="2" class="' + (i === 0 ? 'mr-sticky ' : '') + 'mr-g-id">' + lh + '</th>';
    });
    h += '<th colspan="4" class="mr-g-week">WEEKLY RATE</th>';
    h += '<th colspan="' + (3 + nMonth + 1) + '" class="mr-g-month">MONTHLY RATE</th>';
    h += '</tr><tr class="mr-h2">';
    wLabels.forEach(l => { h += '<th class="mr-g-week">' + l + '</th>'; });
    h += '<th class="mr-g-week">WEEKLY DIFF</th>';
    h += '<th class="mr-g-month-core">MONTHLY DELAY</th>';
    h += '<th class="mr-g-month-core">MONTHLY ONTIME</th>';
    h += '<th class="mr-g-month-core">TOTAL</th>';
    mLabels.forEach(l => { h += '<th class="mr-g-month-rate">' + l + '</th>'; });
    h += '<th class="mr-g-month-diff">MONTHLY DIFF</th>';
    h += '</tr></thead><tbody>';

    function oneRow(r, leftVals, bold, isGroup) {
      let html = '<tr class="' + (bold ? 'mr-total' : (isGroup ? 'mr-group' : '')) + '">';
      leftVals.forEach((v, i) => {
        html += '<td class="' + (i === 0 ? 'mr-sticky' : '') + '">' +
          ((bold || isGroup) && i === 0 ? '<strong>' + (v || '') + '</strong>' : (v || '')) +
          '</td>';
      });
      while (leftVals.length < leftHeaders.length) {
        html += '<td></td>';
        leftVals = leftVals.concat(['']);
      }
      html += paintMetricsCells(r);
      html += '</tr>';
      return html;
    }

    (bodyRows || []).forEach(item => {
      h += oneRow(item.row, item.left.slice(), !!item.bold, !!item.isGroup);
    });
    if (totalRow) {
      h += oneRow(totalRow.row, totalRow.left.slice(), true, false);
    }
    h += '</tbody></table></div></div>';
    return h;
  }

  function buildSummaryBlocks(focus, rows, weekKeys) {
    const scopes = [
      { title: 'Branchline Travel Time Report', scope: 'ALL', target: TARGET.ALL, fixed: 'ALL' },
      { title: 'Bulk Cargo Branchline Travel Time Report', scope: 'BULK', target: TARGET.BULK, fixed: 'BULK' },
      { title: 'Collection Branchline Travel Time Report', scope: 'COLLECTION', target: TARGET.COLLECTION, fixed: 'COLLECTION' }
    ];
    return scopes.map(s => {
      const scoped = filterScope(rows, s.scope);
      const slu = buildEntityMetrics('SLU', '', scoped, focus, weekKeys, s.fixed, s.target);
      return renderTable({
        title: s.title,
        leftHeaders: ['DC INTENDED'],
        bodyRows: [{ row: slu, left: ['SLU'] }],
        totalRow: null,
        focus,
        weekKeys,
        target: s.target
      });
    }).join('');
  }

  function buildDcTable(focus, rows, weekKeys) {
    const by = new Map();
    rows.forEach(r => {
      const dc = resolveDc(r.dcIntended);
      const key = dc.code || dc.name;
      if (!by.has(key)) by.set(key, { name: dc.name, code: dc.code, list: [] });
      by.get(key).list.push(r);
    });
    const body = [...by.values()]
      .map(e => ({
        row: buildEntityMetrics(e.name, e.code, e.list, focus, weekKeys, null, TARGET.ALL),
        left: [e.name, e.code || '']
      }))
      .filter(i => i.row.monthTotal > 0 || (i.row.weekRates || []).some(w => w.total > 0))
      .sort((a, b) => String(a.left[0]).localeCompare(String(b.left[0])));
    const total = {
      row: buildEntityMetrics('SLU', '', rows, focus, weekKeys, 'ALL', TARGET.ALL),
      left: ['SLU', '']
    };
    return renderTable({
      title: 'SLU Branchline Travel Time Report',
      leftHeaders: ['DC NAME', 'DC CODE'],
      bodyRows: body,
      totalRow: total,
      focus,
      weekKeys,
      target: TARGET.ALL
    });
  }

  function buildTruckerTable(focus, rows, weekKeys) {
    const by = new Map();
    rows.forEach(r => {
      const t = r.trucker || '(blank)';
      if (!by.has(t)) by.set(t, []);
      by.get(t).push(r);
    });
    const body = [...by.entries()]
      .map(([name, list]) => ({
        row: buildEntityMetrics(name, '', list, focus, weekKeys, null, TARGET.ALL),
        left: [name]
      }))
      .filter(i => i.row.monthTotal > 0 || (i.row.weekRates || []).some(w => w.total > 0))
      .sort((a, b) => String(a.left[0]).localeCompare(String(b.left[0])));
    return renderTable({
      title: 'SLU Branchline Travel Time per Trucker Report',
      leftHeaders: ['TRUCKERS'],
      bodyRows: body,
      totalRow: null,
      focus,
      weekKeys,
      target: TARGET.ALL
    });
  }

  function buildRouteTable(scope, focus, rows, weekKeys) {
    const target = scope === 'BULK' ? TARGET.BULK : TARGET.COLLECTION;
    const scoped = filterScope(rows, scope);
    const title = scope === 'BULK'
      ? 'SLU Bulk Cargo Branchline Travel Time Report'
      : 'SLU Collection Branchline Travel Time Report';
    const totalName = scope === 'BULK' ? 'BULK ROUTE' : 'COLLECTION ROUTE';

    const byReg = new Map();
    scoped.forEach(r => {
      const reg = effectiveRegion(r);
      if (!byReg.has(reg)) byReg.set(reg, []);
      byReg.get(reg).push(r);
    });

    const body = [];
    [...byReg.keys()].sort().forEach(reg => {
      const regList = byReg.get(reg);
      body.push({
        row: buildEntityMetrics(reg, '', regList, focus, weekKeys, null, target),
        left: [reg, ''],
        isGroup: true
      });
      const byRoute = new Map();
      regList.forEach(r => {
        const rt = r.route || '(blank)';
        // BSL only: hide 3+ leg route rows; still counted in region group totals above
        if (String(reg).toUpperCase() === 'BSL' && isMultiDropRoute(rt)) return;
        if (!byRoute.has(rt)) byRoute.set(rt, []);
        byRoute.get(rt).push(r);
      });
      [...byRoute.keys()].sort().forEach(rt => {
        const routeRow = buildEntityMetrics(rt, '', byRoute.get(rt), focus, weekKeys, null, target);
        if (routeRow.monthTotal > 0 || (routeRow.weekRates || []).some(w => w.total > 0)) {
          body.push({ row: routeRow, left: ['', rt] });
        }
      });
    });

    const total = {
      row: buildEntityMetrics(totalName, '', scoped, focus, weekKeys, scope === 'BULK' ? 'BULK' : 'COLLECTION', target),
      left: [totalName, '']
    };

    return renderTable({
      title,
      leftHeaders: ['DC INTENDED', 'ROUTE'],
      bodyRows: body,
      totalRow: total,
      focus,
      weekKeys,
      target
    });
  }

  /** Plugin: rate labels ABOVE point if >= target, BELOW if under */
  function rateLabelPlugin(targetPct, color) {
    return {
      id: 'mrRateLabels_' + String(targetPct),
      afterDatasetsDraw: function (chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = 'bold 11px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        meta.data.forEach(function (pt, i) {
          const v = chart.data.datasets[0].data[i];
          if (v == null || isNaN(v)) return;
          const hit = v >= targetPct;
          ctx.fillStyle = hit ? '#1B5E20' : '#B71C1C';
          ctx.textBaseline = hit ? 'bottom' : 'top';
          const y = hit ? (pt.y - 6) : (pt.y + 6);
          ctx.fillText(Number(v).toFixed(2) + '%', pt.x, y);
        });
        ctx.restore();
      }
    };
  }



  /** Heat color for achievement % (like Excel screenshot) */
  function achieveColor(rate) {
    if (rate == null) return 'mr-ach-blank';
    const p = rate * 100;
    if (p >= 95) return 'mr-ach-hi';
    if (p >= 85) return 'mr-ach-mid';
    if (p >= 70) return 'mr-ach-warn';
    return 'mr-ach-low';
  }


  /**
   * Contributors — one ACHIEVEMENT RATE table per REGION
   * scope: 'BULK' | 'COLLECTION' · period: focus month · SLU only
   */
  function buildContributors(scope, focus, rows) {
    const scoped = filterScope(rows, scope);
    const ym = monthKey(focus);
    const monthRows = scoped.filter(r => monthKey(r.dateKey) === ym);
    const data = monthRows.length ? monthRows : scoped;
    const scopeLabel = scope === 'BULK' ? 'Bulk' : 'Collection';

    const byReg = new Map();
    data.forEach(r => {
      const reg = effectiveRegion(r);
      const route = r.route || '(blank)';
      const trucker = r.trucker || '(blank)';
      if (!byReg.has(reg)) byReg.set(reg, new Map());
      const byRoute = byReg.get(reg);
      if (!byRoute.has(route)) byRoute.set(route, new Map());
      const byT = byRoute.get(route);
      if (!byT.has(trucker)) byT.set(trucker, []);
      byT.get(trucker).push(r);
    });

    function stRow(list) { return stats(list); }

    function oneRegionTable(reg, byRoute) {
      const expandId = 'mrExpandBody_' + (++expandSeq);
      const regList = [];
      byRoute.forEach(byT => byT.forEach(list => list.forEach(x => regList.push(x))));
      const regSt = stRow(regList);

      let h = '<div class="mr-block">';
      h += '<div class="mr-block-title">';
      h += '<span>ACHIEVEMENT RATE — ' + reg +
        (ym ? (' · ' + ym) : '') + '</span>';
      h += '<button type="button" class="mr-expand-btn" data-mr-expand="' + expandId + '" title="Expand full table">⛶ Expand</button>';
      h += '</div>';
      h += '<div class="table-scroll mr-scroll" id="' + expandId + '">';
      h += '<table class="mr-table mr-achieve"><thead>';
      h += '<tr class="mr-h1"><th colspan="7" class="mr-ach-title">ACHIEVEMENT RATE · ' + scopeLabel.toUpperCase() + '</th></tr>';
      h += '<tr class="mr-h2">';
      h += '<th class="mr-g-id">REGION</th>';
      h += '<th class="mr-g-id">route</th>';
      h += '<th class="mr-g-id">Trucker Name</th>';
      h += '<th class="mr-g-month-core">NO</th>';
      h += '<th class="mr-g-month-core">YES</th>';
      h += '<th class="mr-g-month-core">Grand Total</th>';
      h += '<th class="mr-g-month-rate">Travel Time</th>';
      h += '</tr></thead><tbody>';

      h += '<tr class="mr-ach-region">';
      h += '<td class="mr-sticky"><strong>' + reg + '</strong></td>';
      h += '<td></td><td></td>';
      h += '<td>' + regSt.no + '</td>';
      h += '<td>' + regSt.yes + '</td>';
      h += '<td>' + regSt.total + '</td>';
      h += '<td class="' + achieveColor(regSt.rate) + '">' + pct(regSt.rate) + '</td>';
      h += '</tr>';

      [...byRoute.keys()].sort().forEach(route => {
        const byT = byRoute.get(route);
        const routeList = [];
        byT.forEach(list => list.forEach(x => routeList.push(x)));
        const routeSt = stRow(routeList);
        h += '<tr class="mr-ach-route">';
        h += '<td class="mr-sticky"></td>';
        h += '<td><strong>' + route + '</strong></td>';
        h += '<td></td>';
        h += '<td>' + routeSt.no + '</td>';
        h += '<td>' + routeSt.yes + '</td>';
        h += '<td>' + routeSt.total + '</td>';
        h += '<td class="' + achieveColor(routeSt.rate) + '">' + pct(routeSt.rate) + '</td>';
        h += '</tr>';

        [...byT.keys()].sort().forEach(trucker => {
          const s = stRow(byT.get(trucker));
          h += '<tr>';
          h += '<td class="mr-sticky"></td>';
          h += '<td></td>';
          h += '<td>' + trucker + '</td>';
          h += '<td>' + s.no + '</td>';
          h += '<td>' + s.yes + '</td>';
          h += '<td>' + s.total + '</td>';
          h += '<td class="' + achieveColor(s.rate) + '">' + pct(s.rate) + '</td>';
          h += '</tr>';
        });
      });

      h += '</tbody></table></div></div>';
      return h;
    }

    const regions = [...byReg.keys()].sort();
    if (!regions.length) {
      return '<p class="section-note">No ' + scopeLabel + ' trips in the focus month.</p>';
    }
    return regions.map(reg => oneRegionTable(reg, byReg.get(reg))).join('');
  }

  function buildBulkContributors(focus, rows) {
    return buildContributors('BULK', focus, rows);
  }

  function buildCollectionContributors(focus, rows) {
    return buildContributors('COLLECTION', focus, rows);
  }

  function renderChart(canvasId, key, labels, rates, targetPct, title, color) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    destroyChart(key);
    const data = rates.map(r => r == null ? null : +(r * 100).toFixed(2));
    charts[key] = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Rate %',
            data,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2.5,
            tension: 0.3,
            spanGaps: true,
            fill: false,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#fff',
            pointBorderColor: color,
            pointBorderWidth: 2
          },
          {
            label: 'Target ' + targetPct + '%',
            data: labels.map(() => targetPct),
            borderColor: '#9E9E9E',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 18, bottom: 18 } },
        plugins: {
          title: { display: true, text: title, font: { size: 13, weight: '700' }, color: color },
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
        },
        scales: {
          y: { min: 40, max: 105, title: { display: true, text: 'Rate %' } },
          x: { grid: { display: false } }
        }
      },
      plugins: [rateLabelPlugin(targetPct, color)]
    });
  }

  function openExpand(bodyId) {
    const src = document.getElementById(bodyId);
    const overlay = document.getElementById('mrTableExpandOverlay');
    const dest = document.getElementById('mrTableExpandBody');
    const titleEl = document.getElementById('mrTableExpandTitle');
    if (!src || !overlay || !dest) return;
    const block = src.closest('.mr-block');
    const title = block ? (block.querySelector('.mr-block-title span') || {}).textContent : 'Table';
    if (titleEl) titleEl.textContent = title || 'Expanded table';
    dest.innerHTML = src.innerHTML;
    // remove max-height constraint on expanded copy
    dest.classList.add('mr-expand-scroll');
    overlay.classList.remove('hidden');
    document.body.classList.add('mr-expand-open');
  }

  function closeExpand() {
    const overlay = document.getElementById('mrTableExpandOverlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('mr-expand-open');
    const dest = document.getElementById('mrTableExpandBody');
    if (dest) dest.innerHTML = '';
  }

  function bindExpandButtons() {
    document.querySelectorAll('.mr-expand-btn').forEach(function (btn) {
      if (btn._mrBound) return;
      btn._mrBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openExpand(btn.getAttribute('data-mr-expand'));
      });
    });
  }

  function render() {
    const host = document.getElementById('bltMonthlyReportView');
    if (!host) return;

    const focus = getFocusDate();
    const rows = allRows();
    const note = document.getElementById('bltMonthlyReportNote');
    if (note) {
      note.textContent = focus
        ? ('Focus: ' + focus)
        : 'Upload data and run Compare to set the focus date.';
    }
    ['overall', 'bulk', 'collection'].forEach(destroyChart);

    if (!focus || !rows.length) {
      host.innerHTML = '<p class="section-note">No branchline data loaded yet. Upload a workbook and click Compare first.</p>';
      return;
    }

    const weekKeys = last3WeekKeys(focus, rows);
    let html = '';

    if (activeView === 'summary' || activeView === 'full') {
      html += buildSummaryBlocks(focus, rows, weekKeys);
    }
    if (activeView === 'dc' || activeView === 'full') {
      html += buildDcTable(focus, rows, weekKeys);
    }
    if (activeView === 'trucker' || activeView === 'full') {
      html += buildTruckerTable(focus, rows, weekKeys);
    }
    if (activeView === 'bulk' || activeView === 'full') {
      html += buildRouteTable('BULK', focus, rows, weekKeys);
    }
    if (activeView === 'collection' || activeView === 'full') {
      html += buildRouteTable('COLLECTION', focus, rows, weekKeys);
    }
    if (activeView === 'bulkContrib') {
      html += buildBulkContributors(focus, rows);
    }
    if (activeView === 'collectionContrib') {
      html += buildCollectionContributors(focus, rows);
    }

    // Charts always on full/summary
    if (activeView === 'full' || activeView === 'summary') {
      html += '<div class="mr-charts">';
      html += '<div class="mr-chart-card"><canvas id="mrChartOverall"></canvas></div>';
      html += '<div class="mr-chart-card"><canvas id="mrChartBulk"></canvas></div>';
      html += '<div class="mr-chart-card"><canvas id="mrChartVismin"></canvas></div>';
      html += '</div>';
    }

    host.innerHTML = html;
    bindExpandButtons();

    if (activeView === 'full' || activeView === 'summary') {
      const mkCols = (scope, fixed) => monthColsFor(focus, filterScope(rows, scope), fixed);
      const allCols = mkCols('ALL', 'ALL');
      const labels = allCols.map(c => c.label.replace(' RATE', ''));
      setTimeout(function () {
        renderChart('mrChartOverall', 'overall', labels, allCols.map(c => c.rate), 97, 'Overall — Monthly Rate', '#E60012');
        renderChart('mrChartBulk', 'bulk', labels, mkCols('BULK', 'BULK').map(c => c.rate), 97, 'Bulk Cargo — Monthly Rate', '#1565C0');
        renderChart('mrChartVismin', 'collection', labels, mkCols('COLLECTION', 'COLLECTION').map(c => c.rate), 97, 'Collection — Monthly Rate', '#6A1B9A');
      }, 40);
    }
  }

  function setView(v) {
    activeView = v || 'full';
    document.querySelectorAll('.mr-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mrView === activeView);
    });
    render();
  }

  function onDataReady() { render(); }

  function init() {
    document.querySelectorAll('.mr-subtab').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.mrView));
    });
    const closeBtn = document.getElementById('mrTableExpandClose');
    if (closeBtn) closeBtn.addEventListener('click', closeExpand);
    const overlay = document.getElementById('mrTableExpandOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeExpand();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeExpand();
    });
    const exp = document.getElementById('btnMrExport');
    if (exp) exp.addEventListener('click', function () { exportExcel(); });
    const focusSel = document.getElementById('selectLatest');
    if (focusSel) focusSel.addEventListener('change', function () { render(); });
  }


  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureExcelJS() {
    if (typeof ExcelJS !== 'undefined') return;
    await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
  }

  const XLS = {
    thin: function (argb) {
      const s = { style: 'thin', color: { argb: argb || 'FF9E9E9E' } };
      return { top: s, left: s, bottom: s, right: s };
    },
    fill: function (argb) {
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
    },
    font: function (opts) {
      return Object.assign({ name: 'Calibri', size: 10 }, opts || {});
    }
  };

  function rateFill(rate, target) {
    if (rate == null) return XLS.fill('FFFFFFFF');
    if (target != null && rate >= target) return XLS.fill('FFC6EFCE');
    if (target != null && rate < target) return XLS.fill('FFFFC7CE');
    return XLS.fill('FFFFFFFF');
  }

  function rateFont(rate, target) {
    if (rate == null) return XLS.font({ color: { argb: 'FF9E9E9E' } });
    if (target != null && rate >= target) return XLS.font({ bold: true, color: { argb: 'FF006100' } });
    if (target != null && rate < target) return XLS.font({ bold: true, color: { argb: 'FF9C0006' } });
    return XLS.font({ bold: true });
  }

  function writeTitle(ws, row, colCount, text) {
    ws.mergeCells(row, 1, row, colCount);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = XLS.font({ bold: true, size: 13, color: { argb: 'FFFFFFFF' } });
    cell.fill = XLS.fill('FFC00000');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 24;
  }

  function writeHeaderRow(ws, row, values, fills) {
    values.forEach(function (v, i) {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      cell.font = XLS.font({ bold: true, size: 9 });
      cell.fill = XLS.fill(fills[i] || 'FFD9D9D9');
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = XLS.thin('FF9E9E9E');
    });
    ws.getRow(row).height = 30;
  }

  function metricsHeaderParts(focus, weekKeys) {
    const wLabels = weekHeaderLabels(weekKeys || []);
    const mLabels = monthHeaderLabels(focus);
    // left cols handled by caller
    const h1 = []; // group labels per data column after left
    const h2 = [];
    const fills1 = [];
    const fills2 = [];
    // weekly group
    wLabels.forEach(function (l) {
      h2.push(l);
      fills2.push('FFC6E0B4');
    });
    h2.push('WEEKLY DIFF');
    fills2.push('FFC6E0B4');
    for (let i = 0; i < 4; i++) {
      h1.push(i === 0 ? 'WEEKLY RATE' : '');
      fills1.push('FFC6E0B4');
    }
    // monthly core
    ['MONTHLY DELAY', 'MONTHLY ONTIME', 'TOTAL'].forEach(function (l) {
      h2.push(l);
      fills2.push('FFA9D08E');
      h1.push(h1.filter(Boolean).length === 1 && h1[h1.length - 1] === '' ? '' : (h1.indexOf('MONTHLY RATE') < 0 && l === 'MONTHLY DELAY' ? 'MONTHLY RATE' : ''));
      fills1.push('FFA9D08E');
    });
    // fix monthly group label
    // rebuild cleanly:
    return null;
  }

  function buildSheetStructure(leftHeaders, focus, weekKeys) {
    const wLabels = weekHeaderLabels(weekKeys || []);
    const mLabels = monthHeaderLabels(focus);
    const h1 = leftHeaders.map(function () { return ''; });
    const h2 = leftHeaders.slice();
    const f1 = leftHeaders.map(function () { return 'FFD9D9D9'; });
    const f2 = leftHeaders.map(function () { return 'FFD9D9D9'; });
    // mark first left header on row1
    if (leftHeaders.length) h1[0] = leftHeaders[0];

    // WEEKLY RATE group
    wLabels.forEach(function (l, i) {
      h1.push(i === 0 ? 'WEEKLY RATE' : '');
      f1.push('FFC6E0B4');
      h2.push(l);
      f2.push('FFC6E0B4');
    });
    h1.push('');
    f1.push('FFC6E0B4');
    h2.push('WEEKLY DIFF');
    f2.push('FFC6E0B4');

    // MONTHLY RATE group
    const monthParts = ['MONTHLY DELAY', 'MONTHLY ONTIME', 'TOTAL'].concat(mLabels).concat(['MONTHLY DIFF']);
    monthParts.forEach(function (l, i) {
      h1.push(i === 0 ? 'MONTHLY RATE' : '');
      const isRate = mLabels.indexOf(l) >= 0 || l === 'MONTHLY DIFF';
      f1.push(isRate ? 'FFFFE699' : 'FFA9D08E');
      h2.push(l);
      f2.push(isRate ? 'FFFFE699' : 'FFA9D08E');
    });

    return { h1: h1, h2: h2, f1: f1, f2: f2, colCount: h2.length, mLabels: mLabels, wLabels: wLabels };
  }

  function writeEntityRow(ws, rowIdx, leftVals, metrics, target, bold) {
    let c = 1;
    leftVals.forEach(function (v) {
      const cell = ws.getCell(rowIdx, c++);
      cell.value = v;
      cell.font = XLS.font({ bold: !!bold || !!v });
      cell.fill = bold ? XLS.fill('FFF2F2F2') : XLS.fill('FFFFFFFF');
      cell.border = XLS.thin('FFBDBDBD');
      cell.alignment = { horizontal: c === 2 ? 'left' : 'center', vertical: 'middle' };
    });
    // pad left if needed handled by caller same length
    const weeks = metrics.weekRates || [];
    for (let i = 0; i < 3; i++) {
      const w = weeks[i];
      const rate = w ? w.rate : null;
      const cell = ws.getCell(rowIdx, c++);
      cell.value = rate == null ? '—' : +(rate * 100).toFixed(2) / 100;
      if (rate != null) cell.numFmt = '0.00%';
      cell.fill = rateFill(rate, target);
      cell.font = rateFont(rate, target);
      cell.border = XLS.thin('FFBDBDBD');
      cell.alignment = { horizontal: 'center' };
    }
    const wd = metrics.weeklyDiff;
    {
      const cell = ws.getCell(rowIdx, c++);
      cell.value = wd == null ? '—' : +(wd * 100).toFixed(2) / 100;
      if (wd != null) cell.numFmt = '0.00%';
      cell.fill = rateFill(wd == null ? null : (wd >= 0 ? 1 : 0), wd == null ? null : 0.0000001);
      // simpler: green if >=0 else red
      if (wd == null) {
        cell.fill = XLS.fill('FFFFFFFF');
        cell.font = XLS.font({ color: { argb: 'FF9E9E9E' } });
      } else if (wd >= 0) {
        cell.fill = XLS.fill('FFC6EFCE');
        cell.font = XLS.font({ bold: true, color: { argb: 'FF006100' } });
      } else {
        cell.fill = XLS.fill('FFFFC7CE');
        cell.font = XLS.font({ bold: true, color: { argb: 'FF9C0006' } });
      }
      cell.border = XLS.thin('FFBDBDBD');
      cell.alignment = { horizontal: 'center' };
    }
    [metrics.monthLate, metrics.monthOnTime, metrics.monthTotal].forEach(function (v) {
      const cell = ws.getCell(rowIdx, c++);
      cell.value = v != null ? v : '—';
      cell.fill = bold ? XLS.fill('FFF2F2F2') : XLS.fill('FFFFFFFF');
      cell.font = XLS.font({ bold: !!bold });
      cell.border = XLS.thin('FFBDBDBD');
      cell.alignment = { horizontal: 'center' };
    });
    (metrics.monthCols || []).forEach(function (mc) {
      const cell = ws.getCell(rowIdx, c++);
      cell.value = mc.rate == null ? '—' : +(mc.rate * 100).toFixed(2) / 100;
      if (mc.rate != null) cell.numFmt = '0.00%';
      cell.fill = rateFill(mc.rate, target);
      cell.font = rateFont(mc.rate, target);
      cell.border = XLS.thin('FFBDBDBD');
      cell.alignment = { horizontal: 'center' };
    });
    const md = metrics.monthlyDiff;
    {
      const cell = ws.getCell(rowIdx, c++);
      if (md == null) {
        cell.value = '—';
        cell.fill = XLS.fill('FFFFFFFF');
        cell.font = XLS.font({ color: { argb: 'FF9E9E9E' } });
      } else {
        const arrow = md >= 0 ? '↑ ' : '↓ ';
        cell.value = arrow + Math.abs(md * 100).toFixed(2) + '%';
        cell.fill = md >= 0 ? XLS.fill('FFC6EFCE') : XLS.fill('FFFFC7CE');
        cell.font = XLS.font({ bold: true, color: { argb: md >= 0 ? 'FF006100' : 'FF9C0006' } });
      }
      cell.border = XLS.thin('FFBDBDBD');
      cell.alignment = { horizontal: 'center' };
    }
    if (bold) {
      // grey background already on some cells
    }
  }

  function appendTableToSheet(ws, startRow, pack) {
    // pack: { title, leftHeaders, bodyRows:[{left,row,bold,isGroup}], totalRow, focus, weekKeys, target }
    const struct = buildSheetStructure(pack.leftHeaders, pack.focus, pack.weekKeys);
    let r = startRow;
    writeTitle(ws, r, struct.colCount, pack.title);
    r++;
    // header row 1 — group labels with merges
    writeHeaderRow(ws, r, struct.h1, struct.f1);
    // merge group cells
    let col = pack.leftHeaders.length + 1;
    // weekly 4 cols
    if (struct.colCount >= col + 3) {
      try { ws.mergeCells(r, col, r, col + 3); } catch (e) {}
      ws.getCell(r, col).value = 'WEEKLY RATE';
      ws.getCell(r, col).fill = XLS.fill('FFC6E0B4');
      ws.getCell(r, col).font = XLS.font({ bold: true, size: 10 });
      ws.getCell(r, col).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    col = pack.leftHeaders.length + 5;
    if (struct.colCount >= col) {
      try { ws.mergeCells(r, col, r, struct.colCount); } catch (e) {}
      ws.getCell(r, col).value = 'MONTHLY RATE';
      ws.getCell(r, col).fill = XLS.fill('FFA9D08E');
      ws.getCell(r, col).font = XLS.font({ bold: true, size: 10 });
      ws.getCell(r, col).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    // left header rowspan visual — fill grey
    for (let i = 1; i <= pack.leftHeaders.length; i++) {
      const cell = ws.getCell(r, i);
      cell.value = pack.leftHeaders[i - 1];
      cell.fill = XLS.fill('FFD9D9D9');
      cell.font = XLS.font({ bold: true, size: 9 });
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = XLS.thin('FF9E9E9E');
    }
    r++;
    writeHeaderRow(ws, r, struct.h2, struct.f2);
    r++;

    function emit(item) {
      const left = item.left.slice();
      while (left.length < pack.leftHeaders.length) left.push('');
      writeEntityRow(ws, r, left, item.row, pack.target, !!item.bold || !!item.isGroup);
      r++;
    }
    (pack.bodyRows || []).forEach(emit);
    if (pack.totalRow) emit(Object.assign({}, pack.totalRow, { bold: true }));

    // column widths
    for (let i = 1; i <= struct.colCount; i++) {
      const w = i <= pack.leftHeaders.length ? 16 : 12;
      ws.getColumn(i).width = w;
    }
    r++; // blank spacer
    return r;
  }

  function collectPacks(focus, rows, weekKeys) {
    const packs = [];

    // Summary blocks
    [
      { title: 'Branchline Travel Time Report', scope: 'ALL', target: TARGET.ALL, fixed: 'ALL' },
      { title: 'Bulk Cargo Branchline Travel Time Report', scope: 'BULK', target: TARGET.BULK, fixed: 'BULK' },
      { title: 'Collection Branchline Travel Time Report', scope: 'COLLECTION', target: TARGET.COLLECTION, fixed: 'COLLECTION' }
    ].forEach(function (s) {
      const scoped = filterScope(rows, s.scope);
      const slu = buildEntityMetrics('SLU', '', scoped, focus, weekKeys, s.fixed, s.target);
      packs.push({
        sheetHint: 'Summary',
        title: s.title,
        leftHeaders: ['DC INTENDED'],
        bodyRows: [{ row: slu, left: ['SLU'] }],
        totalRow: null,
        focus: focus,
        weekKeys: weekKeys,
        target: s.target
      });
    });

    // DC
    (function () {
      const by = new Map();
      rows.forEach(function (r) {
        const dc = resolveDc(r.dcIntended);
        const key = dc.code || dc.name;
        if (!by.has(key)) by.set(key, { name: dc.name, code: dc.code, list: [] });
        by.get(key).list.push(r);
      });
      const body = [...by.values()]
        .map(function (e) {
          return {
            row: buildEntityMetrics(e.name, e.code, e.list, focus, weekKeys, null, TARGET.ALL),
            left: [e.name, e.code || '']
          };
        })
        .filter(function (i) {
          return i.row.monthTotal > 0 || (i.row.weekRates || []).some(function (w) { return w.total > 0; });
        })
        .sort(function (a, b) { return String(a.left[0]).localeCompare(String(b.left[0])); });
      packs.push({
        sheetHint: 'By DC',
        title: 'SLU Branchline Travel Time Report',
        leftHeaders: ['DC NAME', 'DC CODE'],
        bodyRows: body,
        totalRow: {
          row: buildEntityMetrics('SLU', '', rows, focus, weekKeys, 'ALL', TARGET.ALL),
          left: ['SLU', '']
        },
        focus: focus,
        weekKeys: weekKeys,
        target: TARGET.ALL
      });
    })();

    // Trucker
    (function () {
      const by = new Map();
      rows.forEach(function (r) {
        const t = r.trucker || '(blank)';
        if (!by.has(t)) by.set(t, []);
        by.get(t).push(r);
      });
      const body = [...by.entries()]
        .map(function (ent) {
          return {
            row: buildEntityMetrics(ent[0], '', ent[1], focus, weekKeys, null, TARGET.ALL),
            left: [ent[0]]
          };
        })
        .filter(function (i) {
          return i.row.monthTotal > 0 || (i.row.weekRates || []).some(function (w) { return w.total > 0; });
        })
        .sort(function (a, b) { return String(a.left[0]).localeCompare(String(b.left[0])); });
      packs.push({
        sheetHint: 'By Trucker',
        title: 'SLU Branchline Travel Time per Trucker Report',
        leftHeaders: ['TRUCKERS'],
        bodyRows: body,
        totalRow: null,
        focus: focus,
        weekKeys: weekKeys,
        target: TARGET.ALL
      });
    })();

    // Bulk / Collection routes
    ['BULK', 'COLLECTION'].forEach(function (scope) {
      const target = scope === 'BULK' ? TARGET.BULK : TARGET.COLLECTION;
      const scoped = filterScope(rows, scope);
      const title = scope === 'BULK'
        ? 'SLU Bulk Cargo Branchline Travel Time Report'
        : 'SLU Collection Branchline Travel Time Report';
      const totalName = scope === 'BULK' ? 'BULK ROUTE' : 'COLLECTION ROUTE';
      const byReg = new Map();
      scoped.forEach(function (r) {
        const reg = effectiveRegion(r);
        if (!byReg.has(reg)) byReg.set(reg, []);
        byReg.get(reg).push(r);
      });
      const body = [];
      sortRegions([...byReg.keys()]).forEach(function (reg) {
        const regList = byReg.get(reg);
        body.push({
          row: buildEntityMetrics(reg, '', regList, focus, weekKeys, null, target),
          left: [reg, ''],
          isGroup: true
        });
        const byRoute = new Map();
        regList.forEach(function (r) {
          const rt = r.route || '(blank)';
          if (String(reg).toUpperCase() === 'BSL' && isMultiDropRoute(rt)) return;
          if (!byRoute.has(rt)) byRoute.set(rt, []);
          byRoute.get(rt).push(r);
        });
        [...byRoute.keys()].sort().forEach(function (rt) {
          const routeRow = buildEntityMetrics(rt, '', byRoute.get(rt), focus, weekKeys, null, target);
          if (routeRow.monthTotal > 0 || (routeRow.weekRates || []).some(function (w) { return w.total > 0; })) {
            body.push({ row: routeRow, left: ['', rt] });
          }
        });
      });
      packs.push({
        sheetHint: scope === 'BULK' ? 'Bulk Routes' : 'Collection Routes',
        title: title,
        leftHeaders: ['DC INTENDED', 'ROUTE'],
        bodyRows: body,
        totalRow: {
          row: buildEntityMetrics(totalName, '', scoped, focus, weekKeys, scope === 'BULK' ? 'BULK' : 'COLLECTION', target),
          left: [totalName, '']
        },
        focus: focus,
        weekKeys: weekKeys,
        target: target
      });
    });



    // Bulk + Collection Contributors — separate sheet per REGION
    ['BULK', 'COLLECTION'].forEach(function (scope) {
      const scoped = filterScope(rows, scope);
      const ym = monthKey(focus);
      const data = scoped.filter(function (r) { return monthKey(r.dateKey) === ym; });
      const use = data.length ? data : scoped;
      const byReg = new Map();
      use.forEach(function (r) {
        const reg = effectiveRegion(r);
        const route = r.route || '(blank)';
        const trucker = r.trucker || '(blank)';
        if (!byReg.has(reg)) byReg.set(reg, new Map());
        const byRoute = byReg.get(reg);
        if (!byRoute.has(route)) byRoute.set(route, new Map());
        const byT = byRoute.get(route);
        if (!byT.has(trucker)) byT.set(trucker, []);
        byT.get(trucker).push(r);
      });
      const prefix = scope === 'BULK' ? 'LZ ' : 'VM ';
      [...byReg.keys()].sort().forEach(function (reg) {
        const byRoute = byReg.get(reg);
        const regList = [];
        byRoute.forEach(function (byT) {
          byT.forEach(function (list) { list.forEach(function (x) { regList.push(x); }); });
        });
        const single = new Map();
        single.set(reg, byRoute);
        const sheetName = (prefix + reg).slice(0, 31);
        packs.push({
          sheetHint: sheetName,
          _achieve: true,
          title: 'ACHIEVEMENT RATE',
          ym: ym,
          region: reg,
          scope: scope,
          byReg: single,
          allRows: regList
        });
      });
    });

    return packs;
  }

  function appendAchieveSheet(ws, pack) {
    const thin = XLS.thin('FFBDBDBD');
    let r = 1;
    ws.mergeCells(r, 1, r, 7);
    const title = ws.getCell(r, 1);
    title.value = 'ACHIEVEMENT RATE' + (pack.ym ? (' · ' + pack.ym) : '');
    title.font = XLS.font({ bold: true, size: 13, color: { argb: 'FFFFFFFF' } });
    title.fill = XLS.fill('FFC00000');
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 24;
    r++;
    const headers = ['REGION', 'route', 'Trucker Name', 'NO', 'YES', 'Grand Total', 'Travel Time'];
    headers.forEach(function (h, i) {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = XLS.font({ bold: true, size: 10 });
      cell.fill = XLS.fill(i < 3 ? 'FFD9D9D9' : (i === 6 ? 'FFFFE699' : 'FFA9D08E'));
      cell.border = thin;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    r++;

    function achFill(rate) {
      if (rate == null) return XLS.fill('FFFFFFFF');
      const p = rate * 100;
      if (p >= 95) return XLS.fill('FFA9D08E');
      if (p >= 85) return XLS.fill('FFC6EFCE');
      if (p >= 70) return XLS.fill('FFFFE699');
      return XLS.fill('FFFFC7CE');
    }

    function writeStatRow(left, st, style) {
      const vals = [left[0] || '', left[1] || '', left[2] || '', st.no, st.yes, st.total, st.rate];
      vals.forEach(function (v, i) {
        const cell = ws.getCell(r, i + 1);
        if (i === 6) {
          cell.value = st.rate == null ? '—' : +(st.rate * 100).toFixed(2) / 100;
          if (st.rate != null) cell.numFmt = '0.00%';
          cell.fill = achFill(st.rate);
          cell.font = XLS.font({ bold: true });
        } else {
          cell.value = v;
          cell.fill = style === 'region' ? XLS.fill('FFD9D9D9')
            : (style === 'route' ? XLS.fill('FFF2F2F2') : XLS.fill('FFFFFFFF'));
          cell.font = XLS.font({ bold: style === 'region' || style === 'route' || style === 'total' });
        }
        cell.border = thin;
        cell.alignment = { horizontal: i < 3 ? 'left' : 'center', vertical: 'middle' };
      });
      r++;
    }

    const byReg = pack.byReg;
    [...byReg.keys()].sort().forEach(function (reg) {
      const byRoute = byReg.get(reg);
      const regList = [];
      byRoute.forEach(function (byT) {
        byT.forEach(function (list) { list.forEach(function (x) { regList.push(x); }); });
      });
      writeStatRow([reg, '', ''], stats(regList), 'region');
      [...byRoute.keys()].sort().forEach(function (route) {
        const byT = byRoute.get(route);
        const routeList = [];
        byT.forEach(function (list) { list.forEach(function (x) { routeList.push(x); }); });
        writeStatRow(['', route, ''], stats(routeList), 'route');
        [...byT.keys()].sort().forEach(function (trucker) {
          writeStatRow(['', '', trucker], stats(byT.get(trucker)), 'trucker');
        });
      });
    });
    writeStatRow([pack.region || 'COLLECTION ROUTE', '', ''], stats(pack.allRows || []), 'total');
    [14, 12, 22, 8, 8, 12, 12].forEach(function (w, i) {
      ws.getColumn(i + 1).width = w;
    });
  }

  async function exportExcel() {
    const focus = getFocusDate();
    const rows = allRows();
    if (!focus || !rows.length) {
      alert('No SLU data to export. Upload a workbook and run Compare first.');
      return;
    }
    const btn = document.getElementById('btnMrExport');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }
    try {
      await ensureExcelJS();
      const weekKeys = last3WeekKeys(focus, rows);
      const packs = collectPacks(focus, rows, weekKeys);
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Branchline Travel Time Analyzer';
      wb.created = new Date();

      // Group packs into sheets
      const sheetMap = {};
      packs.forEach(function (p) {
        const name = p.sheetHint || 'Report';
        if (!sheetMap[name]) sheetMap[name] = [];
        sheetMap[name].push(p);
      });

      Object.keys(sheetMap).forEach(function (name) {
        const ws = wb.addWorksheet(name, { views: [{ showGridLines: false, state: 'frozen', ySplit: 0 }] });
        let row = 1;
        sheetMap[name].forEach(function (pack) {
          if (pack._achieve) {
            appendAchieveSheet(ws, pack);
            row = 50;
          } else {
            row = appendTableToSheet(ws, row, pack);
            row += 1;
          }
        });
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = 'SLU_Branchline_Monthly_Report_' + focus + '.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + (err && err.message ? err.message : err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⬇ Export Excel';
      }
    }
  }

  return { init, render, onDataReady, setView, exportExcel };
})();

