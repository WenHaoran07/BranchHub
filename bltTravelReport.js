/* ==========================================================================
   MODULE: BLT BRANCHLINE TRAVEL TIME REPORT
   Content aligned with Excel:
     OVERALL sheet → Branchline / Bulk / Collection blocks + monthly achieve charts
     SLU TRAVEL TIME → By DC, By Trucker, Bulk by Region+Route, Collection by Region+Route
   Data: SLU rows only (FileProcessor).
   Weekly/Monthly rates = YES ÷ TOTAL (Excel WM SLU TRAVEL TIME formula).
   ========================================================================== */
const BltTravelReport = (() => {
  const TARGET = { ALL: 0.97, BULK: 0.97, COLLECTION: 0.97 };

  const DC_NAME_MAP = (typeof BltUtils !== 'undefined' && BltUtils.DC_CODE_MAP)
    ? BltUtils.DC_CODE_MAP
    : {
      '206': 'Rizal DC', '430': 'Batangas DC', '431': 'Mindoro MamburaoDC1',
      '432': 'Mindoro CalapanDC2', '460': 'Cavite DC1', '470': 'LUCENA NEW DC',
      '480': 'PalawanDC1', '481': 'CORON DC', '491': 'Laguna-RTS DC',
      '492': 'Laguna DC2', '9071': 'DW-Taytay 888'
    };

  let activeView = 'overall';
  let focusDate = null;
  const charts = { bulkMonth: null, collectionMonth: null, overallMonth: null };

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

  function resolveDc(codeOrName) {
    const raw = String(codeOrName || '').trim();
    const digits = raw.replace(/\.0+$/, '').replace(/[^0-9]/g, '') || raw;
    if (DC_NAME_MAP[digits]) return { name: DC_NAME_MAP[digits], code: digits };
    if (DC_NAME_MAP[raw]) return { name: DC_NAME_MAP[raw], code: raw };
    return { name: raw || '(blank)', code: digits || '' };
  }

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
    // Branchline report entities = DC Intended (Excel sheets A/B)
    const dc = String((r && (r.dcName || r.dcIntended)) || '').trim();
    if (dc && dc !== '(blank)') return dc;
    let reg = normalizeRegionName(r && r.region);
    if (reg === 'BACKLOAD') return 'BACKLOAD';
    if (reg === 'TWO DROPS') return 'TWO DROPS';
    return reg;
  }

  function effectiveDc(r) {
    const resolved = resolveDc((r && (r.dcIntended || r.dcName)) || '');
    if (r && r.dcName && r.dcName !== '(blank)') return { name: r.dcName, code: resolved.code || String(r.dcIntended || '') };
    return resolved;
  }


  function last7Dates(focus, dates) {
    const sorted = (dates || []).slice().sort();
    if (!focus || !sorted.length) return [];
    const idx = sorted.indexOf(focus);
    const end = idx >= 0 ? idx : sorted.length - 1;
    return sorted.slice(Math.max(0, end - 6), end + 1);
  }
  function prevDate(focus, dates) {
    const sorted = (dates || []).slice().sort();
    const idx = sorted.indexOf(focus);
    return idx > 0 ? sorted[idx - 1] : null;
  }
  function histHeaders(hist7) {
    return hist7.map(d => {
      const p = String(d).split('-');
      return p.length === 3 ? (parseInt(p[1], 10) + '/' + parseInt(p[2], 10)) : d;
    });
  }
  function formatLongDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[m - 1] + ' ' + day + ', ' + y;
  }
  function arrow(diff) {
    if (diff == null || isNaN(diff)) return '—';
    if (Math.abs(diff) < 0.0005) return '➡';
    return diff > 0 ? '⬆' : '⬇';
  }
  function mood(diff) {
    if (diff == null || isNaN(diff)) return '';
    if (diff >= 0.01) return '😊';
    if (diff <= -0.01) return '😫';
    return '😐';
  }

  function buildEntityRow(name, code, rows, focus, dates, scopeTarget) {
    const day = rows.filter(r => r.dateKey === focus);
    const st = stats(day);
    const prev = prevDate(focus, dates);
    const prevSt = prev ? stats(rows.filter(r => r.dateKey === prev)) : { rate: null };
    const dailyDiff = (st.rate != null && prevSt.rate != null) ? st.rate - prevSt.rate : null;

    const hist7 = last7Dates(focus, dates);
    const histRates = hist7.map(d => {
      const s = stats(rows.filter(r => r.dateKey === d));
      return { date: d, rate: s.rate, total: s.total };
    });

    const wn = weekNum(focus);
    let wkPrevKey = null;
    if (focus) {
      const [y, m, d] = focus.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - 7));
      const pk = dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
      wkPrevKey = weekKey(pk);
    }
    const wkCurrKey = weekKey(focus);
    const wkCurrList = rows.filter(r => weekKey(r.dateKey) === wkCurrKey);
    const wkPrevList = wkPrevKey ? rows.filter(r => weekKey(r.dateKey) === wkPrevKey) : [];
    const wkCurrSt = stats(wkCurrList);
    const wkPrevSt = stats(wkPrevList);
    const wkCurrRate = periodRate(wkCurrList);
    const wkPrevRate = periodRate(wkPrevList);
    const weeklyDiff = (wkCurrRate != null && wkPrevRate != null) ? wkCurrRate - wkPrevRate : null;

    const mk = monthKey(focus);
    const monthRows = rows.filter(r => monthKey(r.dateKey) === mk);
    const monthSt = stats(monthRows);
    const monthRateAvg = periodRate(monthRows);

    let wkPrevLabel = 'WK —', wkCurrLabel = 'WK —';
    if (wn != null) wkCurrLabel = 'WK ' + wn;
    if (focus) {
      const [y, m, d] = focus.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - 7));
      const pk = dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
      const pwn = weekNum(pk);
      if (pwn != null) wkPrevLabel = 'WK ' + pwn;
    }

    return {
      name, code,
      total: st.total, followed: st.yes, notFollowed: st.no,
      target: scopeTarget, rate: st.rate,
      hist7, histRates,
      dailyDiff, mood: mood(dailyDiff), arrow: arrow(dailyDiff),
      wkPrev: wkPrevRate, wkCurr: wkCurrRate, weeklyDiff,
      wkPrevLabel, wkCurrLabel,
      monthLate: monthSt.no, monthOnTime: monthSt.yes,
      monthTotal: monthSt.total, monthRate: monthRateAvg
    };
  }

  function assignRanks(entities) {
    const ranked = entities
      .filter(r => r.monthRate != null && r.monthTotal > 0)
      .slice()
      .sort((a, b) => b.monthRate - a.monthRate || b.monthTotal - a.monthTotal);
    ranked.forEach((r, i) => { r.rank = i + 1; });
    entities.forEach(r => { if (r.rank == null) r.rank = '—'; });
  }

  function rateCell(rate, target, opts) {
    opts = opts || {};
    if (rate == null) return '<td class="tr-muted">—</td>';
    const hit = target != null && rate >= target;
    const cls = [hit ? 'tr-ok' : 'tr-bad'];
    if (opts.yellow) cls.push('tr-rate-yellow');
    return '<td class="' + cls.join(' ') + '">' + pct(rate) + '</td>';
  }

  function destroyChart(key) {
    if (charts[key]) {
      try { charts[key].destroy(); } catch (e) {}
      charts[key] = null;
    }
  }

  /** Monthly day 1–31 achieve series for a route scope (SLU only) */
  function monthDaySeries(scope, focus) {
    const mk = monthKey(focus);
    if (!mk) return { labels: [], rates: [], target: TARGET[scope] || 0.97 };
    const [y, m] = mk.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const rows = filterScope(allRows(), scope);
    const labels = [];
    const rates = [];
    for (let d = 1; d <= lastDay; d++) {
      const key = y + '-' + pad2(m) + '-' + pad2(d);
      labels.push(String(d));
      const dayRows = rows.filter(r => r.dateKey === key);
      const s = stats(dayRows);
      rates.push(s.total ? +(s.rate * 100).toFixed(2) : null);
    }
    return { labels, rates, target: (TARGET[scope] || 0.97) * 100 };
  }

  /** Rate labels ABOVE point if >= target, BELOW if under */
  function rateLabelPlugin(targetPct) {
    return {
      id: 'trRateLabels_' + String(targetPct),
      afterDatasetsDraw: function (chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = 'bold 10px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        meta.data.forEach(function (pt, i) {
          const v = chart.data.datasets[0].data[i];
          if (v == null || isNaN(v)) return;
          const hit = v >= targetPct;
          ctx.fillStyle = hit ? '#1B5E20' : '#B71C1C';
          ctx.textBaseline = hit ? 'bottom' : 'top';
          const y = hit ? (pt.y - 5) : (pt.y + 5);
          ctx.fillText(Number(v).toFixed(1) + '%', pt.x, y);
        });
        ctx.restore();
      }
    };
  }

  function renderMonthChart(canvasId, chartKey, scope, focus, title) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    destroyChart(chartKey);
    const series = monthDaySeries(scope, focus);
    const targetPct = series.target;
    charts[chartKey] = new Chart(el, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Achieve',
            data: series.rates,
            borderColor: '#E60012',
            backgroundColor: '#E60012',
            borderWidth: 2,
            tension: 0.25,
            spanGaps: true,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#E60012',
            pointBorderWidth: 2
          },
          {
            label: 'Target',
            data: series.labels.map(() => targetPct),
            borderColor: '#1565C0',
            borderWidth: 2,
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
        layout: { padding: { top: 16, bottom: 14 } },
        plugins: {
          title: { display: true, text: title, color: '#1565C0', font: { size: 15, weight: '700' } },
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.parsed.y;
                return ctx.dataset.label + ': ' + (v != null ? v.toFixed(2) + '%' : '—');
              }
            }
          }
        },
        scales: {
          y: {
            min: Math.max(0, targetPct - 40),
            max: 105,
            title: { display: true, text: 'Rate %' }
          },
          x: {
            title: { display: true, text: 'Day of month' },
            ticks: { autoSkip: true, maxTicksLimit: 31 }
          }
        }
      },
      plugins: [rateLabelPlugin(targetPct)]
    });
  }

  /** Shared multi-section table */
  function renderReportTable(opts) {
    const {
      title, leftHeaders, rows, hist7, target, totalRow, groupLeft
    } = opts;
    const hLabels = histHeaders(hist7 || []);
    const nHist = Math.max((hist7 || []).length, 1);
    const nLeft = leftHeaders.length;

    // Rank non-total rows
    const body = (rows || []).slice();
    assignRanks(body);

    let h = '<div class="tr-block">';
    h += '<div class="tr-block-title">' + title + '</div>';
    h += '<div class="table-scroll tr-scroll"><table class="tr-table tr-excel"><thead>';
    h += '<tr class="tr-h1">';
    leftHeaders.forEach((lh, i) => {
      h += '<th rowspan="2" class="' + (i === 0 ? 'tr-sticky ' : '') + 'tr-g-id">' + lh + '</th>';
    });
    h += '<th colspan="5" class="tr-g-daily">DAILY SUMMARY (' + formatLongDate(focusDate) + ')</th>';
    h += '<th colspan="' + nHist + '" class="tr-g-hist">7 DAYS RATE HISTORY</th>';
    h += '<th colspan="2" class="tr-g-daily-cmp">DAILY COMPARISON</th>';
    h += '<th colspan="3" class="tr-g-week">WEEKLY RATE</th>';
    h += '<th colspan="5" class="tr-g-month">MONTHLY RATE</th>';
    h += '</tr><tr class="tr-h2">';
    h += '<th class="tr-g-daily">Total Arrival Times</th>';
    h += '<th class="tr-g-daily">Followed Plan travel time</th>';
    h += '<th class="tr-g-daily">Not followed Plan travel time</th>';
    h += '<th class="tr-g-daily">TARGET</th>';
    h += '<th class="tr-g-daily">RATE</th>';
    h += (hist7 && hist7.length)
      ? hLabels.map(l => '<th class="tr-g-hist">' + l + '</th>').join('')
      : '<th class="tr-g-hist">—</th>';
    const sample = totalRow || body[0] || {};
    h += '<th class="tr-g-daily-cmp">DAILY DIFF</th><th class="tr-g-daily-cmp"></th>';
    h += '<th class="tr-g-week">' + (sample.wkPrevLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">' + (sample.wkCurrLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">WEEKLY DIFF</th>';
    h += '<th class="tr-g-month">MONTHLY DELAY</th>';
    h += '<th class="tr-g-month">MONTHLY ONTIME</th>';
    h += '<th class="tr-g-month">TOTAL</th>';
    h += '<th class="tr-g-month">RATE</th>';
    h += '<th class="tr-g-month">RANK</th>';
    h += '</tr></thead><tbody>';

    function paintRow(r, bold, leftVals) {
      let html = '<tr class="' + (bold ? 'tr-slu' : '') + '">';
      leftVals.forEach((v, i) => {
        html += '<td class="' + (i === 0 ? 'tr-sticky' : '') + '">' +
          (i === 0 ? '<strong>' + (v || '') + '</strong>' : (v || '')) + '</td>';
      });
      // pad left cells if group spans
      while (leftVals.length < nLeft) {
        html += '<td></td>';
        leftVals.push('');
      }
      html += '<td>' + (r.total || 0) + '</td>';
      html += '<td>' + (r.followed || 0) + '</td>';
      html += '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0) + '</td>';
      html += '<td>' + pct(r.target != null ? r.target : target, 0) + '</td>';
      html += rateCell(r.rate, r.target != null ? r.target : target, { yellow: true });
      (r.histRates || []).forEach(hr => { html += rateCell(hr.rate, r.target != null ? r.target : target); });
      if (!(r.histRates || []).length) html += '<td class="tr-muted">—</td>';
      const diffCls = r.dailyDiff == null ? '' : (r.dailyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + diffCls + '">' + (r.dailyDiff == null ? '—' : (r.dailyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td class="tr-arrow">' + (r.mood || r.arrow || '') + '</td>';
      html += rateCell(r.wkPrev, r.target != null ? r.target : target);
      html += rateCell(r.wkCurr, r.target != null ? r.target : target);
      const wCls = r.weeklyDiff == null ? '' : (r.weeklyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + wCls + '">' + (r.weeklyDiff == null ? '—' : (r.weeklyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td>' + (r.monthLate != null ? r.monthLate : '—') + '</td>';
      html += '<td>' + (r.monthOnTime != null ? r.monthOnTime : '—') + '</td>';
      html += '<td>' + (r.monthTotal != null ? r.monthTotal : '—') + '</td>';
      html += rateCell(r.monthRate, r.target != null ? r.target : target, { yellow: true });
      html += '<td class="tr-rank">' + (bold ? '—' : (r.rank != null ? r.rank : '—')) + '</td>';
      html += '</tr>';
      return html;
    }

    if (groupLeft) {
      // rows already ordered with region group labels in leftVals via custom list
      body.forEach(item => {
        h += paintRow(item.row, !!item.bold, item.left);
      });
    } else {
      body.forEach(r => {
        const left = leftHeaders.length === 2
          ? [r.name, r.code || '']
          : [r.name];
        h += paintRow(r, false, left);
      });
      if (totalRow) {
        const left = leftHeaders.length === 2
          ? [totalRow.name, totalRow.code || '']
          : [totalRow.name];
        h += paintRow(totalRow, true, left);
      }
    }

    h += '</tbody></table></div></div>';
    return h;
  }

  function buildScopeBlock(title, scope, target, focus, dates) {
    const rows = filterScope(allRows(), scope);
    const slu = buildEntityRow('SLU', '', rows, focus, dates, target);
    const regionNames = sortRegions([...new Set(rows.map(r => effectiveRegion(r)))]);
    const regionRows = regionNames.map(reg =>
      buildEntityRow(reg, '', rows.filter(r => effectiveRegion(r) === reg), focus, dates, target)
    ).filter(r => r.monthTotal > 0 || r.total > 0 || (r.histRates || []).some(h => h.total > 0));
    return { title, target, slu, regionRows, hist7: last7Dates(focus, dates) };
  }

  function buildRouteRegionPack(scope, target, focus, dates) {
    const rows = filterScope(allRows(), scope);
    const hist7 = last7Dates(focus, dates);
    // Group by effective region (multi-leg routes → TWO DROPS), then routes
    const byReg = new Map();
    rows.forEach(r => {
      const reg = effectiveRegion(r);
      if (!byReg.has(reg)) byReg.set(reg, []);
      byReg.get(reg).push(r);
    });
    const items = [];
    sortRegions([...byReg.keys()]).forEach(reg => {
      const regList = byReg.get(reg);
      const regRow = buildEntityRow(reg, '', regList, focus, dates, target);
      items.push({ left: [reg, ''], row: regRow, bold: false, isGroup: true });

      const byRoute = new Map();
      regList.forEach(r => {
        const rt = r.route || '(blank)';
        // BSL only: 3+ leg routes still count in region total (regList) but are not listed as rows
        if (String(reg).toUpperCase() === 'BSL' && isMultiDropRoute(rt)) return;
        if (!byRoute.has(rt)) byRoute.set(rt, []);
        byRoute.get(rt).push(r);
      });
      [...byRoute.keys()].sort().forEach(rt => {
        const routeRow = buildEntityRow(rt, '', byRoute.get(rt), focus, dates, target);
        if (routeRow.total > 0 || routeRow.monthTotal > 0 || (routeRow.histRates || []).some(h => h.total > 0)) {
          items.push({ left: ['', rt], row: routeRow, bold: false, isGroup: false });
        }
      });
    });

    const totalName = scope === 'BULK' ? 'BULK ROUTE' : (scope === 'COLLECTION' ? 'COLLECTION ROUTE' : 'SLU');
    const totalRow = buildEntityRow(totalName, '', rows, focus, dates, target);
    items.push({ left: [totalName, ''], row: totalRow, bold: true, isGroup: true });
    return { hist7, items, target, title: scope === 'BULK'
      ? 'SLU Bulk Cargo Branchline Travel Time Report'
      : 'SLU Collection Branchline Travel Time Report' };
  }

  function renderOverallView(focus, dates) {
    let html = '';
    const scopes = [
      { title: 'Branchline Travel Time Report', scope: 'ALL', target: TARGET.ALL },
      { title: 'Bulk Cargo Branchline Travel Time Report', scope: 'BULK', target: TARGET.BULK },
      { title: 'Collection Branchline Travel Time Report', scope: 'COLLECTION', target: TARGET.COLLECTION }
    ];

    function overallBlock(block) {
      // SLU first (like Excel), then other regions, no duplicate total footer
      const rows = [block.slu].concat(block.regionRows.filter(r => r.name !== 'SLU'));
      return renderReportTable({
        title: block.title,
        leftHeaders: ['DC INTENDED'],
        rows: rows,
        hist7: block.hist7,
        target: block.target,
        totalRow: null
      });
    }

    const main = buildScopeBlock(scopes[0].title, 'ALL', TARGET.ALL, focus, dates);
    html += overallBlock(main);

    const luz = buildScopeBlock(scopes[1].title, 'BULK', TARGET.BULK, focus, dates);
    html += overallBlock(luz);
    html += '<div class="tr-chart-card"><canvas id="trChartBulkMonth"></canvas></div>';

    const vis = buildScopeBlock(scopes[2].title, 'COLLECTION', TARGET.COLLECTION, focus, dates);
    html += overallBlock(vis);
    html += '<div class="tr-chart-card"><canvas id="trChartVisminMonth"></canvas></div>';

    return html;
  }

  function renderDcView(focus, dates) {
    const rows = allRows();
    const hist7 = last7Dates(focus, dates);
    const byCode = new Map();
    rows.forEach(r => {
      const dc = resolveDc(r.dcIntended);
      const key = dc.code || dc.name;
      if (!byCode.has(key)) byCode.set(key, { name: dc.name, code: dc.code, list: [] });
      byCode.get(key).list.push(r);
    });
    const entities = [...byCode.values()]
      .map(e => buildEntityRow(e.name, e.code, e.list, focus, dates, TARGET.ALL))
      .filter(r => r.monthTotal > 0 || r.total > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
    return renderReportTable({
      title: 'SLU Branchline Travel Time Report',
      leftHeaders: ['DC NAME', 'DC CODE'],
      rows: entities,
      hist7,
      target: TARGET.ALL,
      totalRow: slu
    });
  }

  function renderTruckerView(focus, dates) {
    const rows = allRows();
    const hist7 = last7Dates(focus, dates);
    const byT = new Map();
    rows.forEach(r => {
      const t = r.trucker || '(blank)';
      if (!byT.has(t)) byT.set(t, []);
      byT.get(t).push(r);
    });
    const entities = [...byT.entries()]
      .map(([name, list]) => buildEntityRow(name, '', list, focus, dates, TARGET.ALL))
      .filter(r => r.monthTotal > 0 || r.total > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
    return renderReportTable({
      title: 'SLU Branchline Travel Time per Trucker Report',
      leftHeaders: ['TRUCKERS'],
      rows: entities,
      hist7,
      target: TARGET.ALL,
      totalRow: slu
    });
  }

  function renderRouteView(scope, focus, dates) {
    const pack = buildRouteRegionPack(scope, scope === 'BULK' ? TARGET.BULK : TARGET.COLLECTION, focus, dates);
    return renderReportTable({
      title: pack.title,
      leftHeaders: ['DC INTENDED', 'ROUTE'],
      rows: null,
      hist7: pack.hist7,
      target: pack.target,
      totalRow: null,
      groupLeft: true,
      // custom: inject items via monkey — handle below
      _items: pack.items
    }).replace('<!--ITEMS-->', '') // placeholder unused
      // Actually renderReportTable with groupLeft needs items - fix by dedicated path
    ;
  }

  // Specialized renderer for region+route grouped tables
  function renderGroupedRouteTable(scope, focus, dates) {
    const target = scope === 'BULK' ? TARGET.BULK : TARGET.COLLECTION;
    const pack = buildRouteRegionPack(scope, target, focus, dates);
    const hist7 = pack.hist7;
    const hLabels = histHeaders(hist7);
    const nHist = Math.max(hist7.length, 1);
    const sample = pack.items.length ? pack.items[pack.items.length - 1].row : {};

    // rank only route-level (non-group, non-total) rows
    const routeRows = pack.items.filter(i => !i.isGroup && !i.bold).map(i => i.row);
    assignRanks(routeRows);

    let h = '<div class="tr-block">';
    h += '<div class="tr-block-title">' + pack.title + '</div>';
    h += '<div class="table-scroll tr-scroll"><table class="tr-table tr-excel"><thead>';
    h += '<tr class="tr-h1">';
    h += '<th rowspan="2" class="tr-sticky tr-g-id">REGION INTENDED</th>';
    h += '<th rowspan="2" class="tr-g-id">ROUTE</th>';
    h += '<th colspan="5" class="tr-g-daily">DAILY SUMMARY (' + formatLongDate(focusDate) + ')</th>';
    h += '<th colspan="' + nHist + '" class="tr-g-hist">7 DAYS RATE HISTORY</th>';
    h += '<th colspan="2" class="tr-g-daily-cmp">DAILY COMPARISON</th>';
    h += '<th colspan="3" class="tr-g-week">WEEKLY RATE</th>';
    h += '<th colspan="5" class="tr-g-month">MONTHLY RATE</th>';
    h += '</tr><tr class="tr-h2">';
    h += '<th class="tr-g-daily">Total Arrival Times</th>';
    h += '<th class="tr-g-daily">Followed Plan travel time</th>';
    h += '<th class="tr-g-daily">Not followed Plan travel time</th>';
    h += '<th class="tr-g-daily">TARGET</th>';
    h += '<th class="tr-g-daily">RATE</th>';
    h += hist7.length ? hLabels.map(l => '<th class="tr-g-hist">' + l + '</th>').join('') : '<th class="tr-g-hist">—</th>';
    h += '<th class="tr-g-daily-cmp">DAILY DIFF</th><th class="tr-g-daily-cmp"></th>';
    h += '<th class="tr-g-week">' + (sample.wkPrevLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">' + (sample.wkCurrLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">WEEKLY DIFF</th>';
    h += '<th class="tr-g-month">MONTHLY DELAY</th>';
    h += '<th class="tr-g-month">MONTHLY ONTIME</th>';
    h += '<th class="tr-g-month">TOTAL</th>';
    h += '<th class="tr-g-month">RATE</th>';
    h += '<th class="tr-g-month">RANK</th>';
    h += '</tr></thead><tbody>';

    pack.items.forEach(item => {
      const r = item.row;
      const bold = item.bold;
      const isGroup = item.isGroup && !bold;
      let html = '<tr class="' + (bold ? 'tr-slu' : (isGroup ? 'tr-group' : '')) + '">';
      html += '<td class="tr-sticky">' + (item.left[0] ? '<strong>' + item.left[0] + '</strong>' : '') + '</td>';
      html += '<td>' + (item.left[1] || '') + '</td>';
      html += '<td>' + (r.total || 0) + '</td>';
      html += '<td>' + (r.followed || 0) + '</td>';
      html += '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0) + '</td>';
      html += '<td>' + pct(target, 0) + '</td>';
      html += rateCell(r.rate, target, { yellow: true });
      (r.histRates || []).forEach(hr => { html += rateCell(hr.rate, target); });
      if (!(r.histRates || []).length) html += '<td class="tr-muted">—</td>';
      const diffCls = r.dailyDiff == null ? '' : (r.dailyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + diffCls + '">' + (r.dailyDiff == null ? '—' : (r.dailyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td class="tr-arrow">' + (r.mood || r.arrow || '') + '</td>';
      html += rateCell(r.wkPrev, target);
      html += rateCell(r.wkCurr, target);
      const wCls = r.weeklyDiff == null ? '' : (r.weeklyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + wCls + '">' + (r.weeklyDiff == null ? '—' : (r.weeklyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td>' + (r.monthLate != null ? r.monthLate : '—') + '</td>';
      html += '<td>' + (r.monthOnTime != null ? r.monthOnTime : '—') + '</td>';
      html += '<td>' + (r.monthTotal != null ? r.monthTotal : '—') + '</td>';
      html += rateCell(r.monthRate, target, { yellow: true });
      html += '<td class="tr-rank">' + (bold || isGroup ? '—' : (r.rank != null ? r.rank : '—')) + '</td>';
      html += '</tr>';
      h += html;
    });

    h += '</tbody></table></div></div>';
    return h;
  }


  /** Heat color for achievement % (same as Monthly Report contributors) */
  function achieveColor(rate) {
    if (rate == null) return 'mr-ach-blank';
    const p = rate * 100;
    if (p >= 95) return 'mr-ach-hi';
    if (p >= 85) return 'mr-ach-mid';
    if (p >= 70) return 'mr-ach-warn';
    return 'mr-ach-low';
  }


  /**
   * Contributors — weekly ACHIEVEMENT RATE tables per REGION
   * REGION → route → Trucker · NO · YES · Grand Total · Travel Time · Prev Rate · Diff
   * Week = Sunday–Saturday (Excel WEEKNUM) of focus date
   */
  function buildContributors(scope, focus) {
    const rows = allRows();
    const scoped = filterScope(rows, scope);
    const wk = weekKey(focus);
    const wn = weekNum(focus);
    const weekRows = wk
      ? scoped.filter(r => weekKey(r.dateKey) === wk)
      : scoped;
    const data = weekRows.length ? weekRows : scoped;

    // Previous week = 7 days before focus
    let prevWk = null;
    let prevWn = null;
    if (focus) {
      const [y, m, d] = focus.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - 7));
      const pk = dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
      prevWk = weekKey(pk);
      prevWn = weekNum(pk);
    }
    const prevData = prevWk
      ? scoped.filter(r => weekKey(r.dateKey) === prevWk)
      : [];

    const scopeLabel = scope === 'BULK' ? 'Bulk' : 'Collection';
    const weekLabel = wn != null ? ('WK ' + wn) : (wk || '—');
    const prevWeekLabel = prevWn != null ? ('WK ' + prevWn) : (prevWk || 'prev');

    function groupTree(list) {
      const byReg = new Map();
      list.forEach(r => {
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
      return byReg;
    }

    function pickGroup(tree, reg, route, trucker) {
      if (!tree.has(reg)) return [];
      const byRoute = tree.get(reg);
      if (route == null) {
        const all = [];
        byRoute.forEach(byT => byT.forEach(list => list.forEach(x => all.push(x))));
        return all;
      }
      if (!byRoute.has(route)) return [];
      const byT = byRoute.get(route);
      if (trucker == null) {
        const all = [];
        byT.forEach(list => list.forEach(x => all.push(x)));
        return all;
      }
      return byT.get(trucker) || [];
    }

    const currTree = groupTree(data);
    const prevTree = groupTree(prevData);

    function rateCells(currList, prevList) {
      const st = stats(currList);
      const prevSt = stats(prevList);
      const rate = periodRate(currList);
      const prevRate = periodRate(prevList);
      const diff = (rate != null && prevRate != null) ? rate - prevRate : null;
      let diffHtml = '<td class="tr-muted">—</td>';
      if (diff != null) {
        const cls = diff >= 0 ? 'mr-ok' : 'mr-bad';
        const arrow = diff >= 0 ? '↑ ' : '↓ ';
        diffHtml = '<td class="' + cls + '">' + arrow + Math.abs(diff * 100).toFixed(2) + 'pp</td>';
      }
      return {
        st: st,
        prevRate: prevRate,
        diffHtml: diffHtml,
        rateHtml: '<td class="' + achieveColor(rate) + '">' + pct(rate) + '</td>',
        prevHtml: '<td class="' + achieveColor(prevRate) + '">' + pct(prevRate) + '</td>'
      };
    }

    function oneRegionTable(reg, byRoute) {
      const cells = rateCells(pickGroup(currTree, reg), pickGroup(prevTree, reg));

      let h = '<div class="mr-block tr-contrib-block">';
      h += '<div class="mr-block-title"><span>ACHIEVEMENT RATE — ' + reg +
        ' · ' + weekLabel + '</span></div>';
      h += '<div class="table-scroll mr-scroll">';
      h += '<table class="mr-table mr-achieve"><thead>';
      h += '<tr class="mr-h1"><th colspan="9" class="mr-ach-title">ACHIEVEMENT RATE · ' +
        scopeLabel.toUpperCase() + ' · ' + weekLabel + '</th></tr>';
      h += '<tr class="mr-h2">';
      h += '<th class="mr-g-id">REGION</th>';
      h += '<th class="mr-g-id">route</th>';
      h += '<th class="mr-g-id">Trucker Name</th>';
      h += '<th class="mr-g-month-core">NO</th>';
      h += '<th class="mr-g-month-core">YES</th>';
      h += '<th class="mr-g-month-core">Grand Total</th>';
      h += '<th class="mr-g-month-rate">Prev (' + prevWeekLabel + ')</th>';
      h += '<th class="mr-g-month-rate">Travel Time (' + weekLabel + ')</th>';
      h += '<th class="mr-g-month-rate">Rate Diff</th>';
      h += '</tr></thead><tbody>';

      h += '<tr class="mr-ach-region">';
      h += '<td class="mr-sticky"><strong>' + reg + '</strong></td>';
      h += '<td></td><td></td>';
      h += '<td>' + cells.st.no + '</td>';
      h += '<td>' + cells.st.yes + '</td>';
      h += '<td>' + cells.st.total + '</td>';
      h += cells.prevHtml + cells.rateHtml + cells.diffHtml;
      h += '</tr>';

      [...byRoute.keys()].sort().forEach(route => {
        const byT = byRoute.get(route);
        const rc = rateCells(pickGroup(currTree, reg, route), pickGroup(prevTree, reg, route));
        h += '<tr class="mr-ach-route">';
        h += '<td class="mr-sticky"></td>';
        h += '<td><strong>' + route + '</strong></td>';
        h += '<td></td>';
        h += '<td>' + rc.st.no + '</td>';
        h += '<td>' + rc.st.yes + '</td>';
        h += '<td>' + rc.st.total + '</td>';
        h += rc.prevHtml + rc.rateHtml + rc.diffHtml;
        h += '</tr>';

        [...byT.keys()].sort().forEach(trucker => {
          const tc = rateCells(
            pickGroup(currTree, reg, route, trucker),
            pickGroup(prevTree, reg, route, trucker)
          );
          h += '<tr>';
          h += '<td class="mr-sticky"></td><td></td>';
          h += '<td>' + trucker + '</td>';
          h += '<td>' + tc.st.no + '</td>';
          h += '<td>' + tc.st.yes + '</td>';
          h += '<td>' + tc.st.total + '</td>';
          h += tc.prevHtml + tc.rateHtml + tc.diffHtml;
          h += '</tr>';
        });
      });

      h += '</tbody></table></div></div>';
      return h;
    }

    const regions = [...currTree.keys()].sort();
    if (!regions.length) {
      return '<p class="section-note">No ' + scopeLabel + ' trips in ' + weekLabel + '.</p>';
    }
    let intro = '<div class="tr-contrib-intro">';
    intro += '<strong>' + scopeLabel + ' Contributors</strong> · week <strong>' + weekLabel +
      '</strong> vs <strong>' + prevWeekLabel + '</strong>';
    intro += '</div>';
    return intro + regions.map(reg => oneRegionTable(reg, currTree.get(reg))).join('');
  }

  function renderBulkContributors(focus) {
    return buildContributors('BULK', focus);
  }
  function renderCollectionContributors(focus) {
    return buildContributors('COLLECTION', focus);
  }

  /** Structured contributor data for Excel export (weekly) */
  function collectContributorExport(scope, focus) {
    const rows = allRows();
    const scoped = filterScope(rows, scope);
    const wk = weekKey(focus);
    const wn = weekNum(focus);
    const weekRows = wk ? scoped.filter(r => weekKey(r.dateKey) === wk) : scoped;
    const data = weekRows.length ? weekRows : scoped;

    let prevWk = null;
    let prevWn = null;
    if (focus) {
      const [y, m, d] = focus.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - 7));
      const pk = dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
      prevWk = weekKey(pk);
      prevWn = weekNum(pk);
    }
    const prevData = prevWk ? scoped.filter(r => weekKey(r.dateKey) === prevWk) : [];

    function tree(list) {
      const byReg = new Map();
      list.forEach(r => {
        const reg = r.region || '(blank)';
        const route = r.route || '(blank)';
        const trucker = r.trucker || '(blank)';
        if (!byReg.has(reg)) byReg.set(reg, new Map());
        const byRoute = byReg.get(reg);
        if (!byRoute.has(route)) byRoute.set(route, new Map());
        const byT = byRoute.get(route);
        if (!byT.has(trucker)) byT.set(trucker, []);
        byT.get(trucker).push(r);
      });
      return byReg;
    }
    function gather(t, reg, route, trucker) {
      if (!t.has(reg)) return [];
      const byRoute = t.get(reg);
      if (route == null) {
        const all = [];
        byRoute.forEach(byT => byT.forEach(list => list.forEach(x => all.push(x))));
        return all;
      }
      if (!byRoute.has(route)) return [];
      const byT = byRoute.get(route);
      if (trucker == null) {
        const all = [];
        byT.forEach(list => list.forEach(x => all.push(x)));
        return all;
      }
      return byT.get(trucker) || [];
    }

    const currTree = tree(data);
    const prevTree = tree(prevData);
    const outRows = [];
    [...currTree.keys()].sort().forEach(reg => {
      const byRoute = currTree.get(reg);
      const st = stats(gather(currTree, reg));
      const pst = stats(gather(prevTree, reg));
      outRows.push({
        level: 'region', region: reg, route: '', trucker: '',
        no: st.no, yes: st.yes, total: st.total, rate: st.rate, prevRate: pst.rate
      });
      [...byRoute.keys()].sort().forEach(route => {
        const byT = byRoute.get(route);
        const rst = stats(gather(currTree, reg, route));
        const rpst = stats(gather(prevTree, reg, route));
        outRows.push({
          level: 'route', region: '', route: route, trucker: '',
          no: rst.no, yes: rst.yes, total: rst.total, rate: rst.rate, prevRate: rpst.rate
        });
        [...byT.keys()].sort().forEach(trucker => {
          const tst = stats(gather(currTree, reg, route, trucker));
          const tpst = stats(gather(prevTree, reg, route, trucker));
          outRows.push({
            level: 'trucker', region: '', route: '', trucker: trucker,
            no: tst.no, yes: tst.yes, total: tst.total, rate: tst.rate, prevRate: tpst.rate
          });
        });
      });
    });

    return {
      scope: scope,
      scopeLabel: scope === 'BULK' ? 'Bulk' : 'Collection',
      weekLabel: wn != null ? ('WK ' + wn) : (wk || ''),
      prevWeekLabel: prevWn != null ? ('WK ' + prevWn) : (prevWk || 'Prev'),
      rows: outRows
    };
  }

  function render() {
    const host = document.getElementById('bltTravelReportView');
    if (!host) return;
    focusDate = getFocusDate();
    const dates = allDates();
    const note = document.getElementById('bltTravelReportNote');
    if (note) {
      note.textContent = focusDate
        ? ('Focus arrival date: ' + focusDate)
        : 'Upload data and run Compare to set the focus arrival date.';
    }
    destroyChart('bulkMonth');
    destroyChart('collectionMonth');

    if (!focusDate || !allRows().length) {
      host.innerHTML = '<p class="section-note">No branchline data loaded yet.</p>';
      return;
    }

    let html = '';
    if (activeView === 'overall') {
      html = renderOverallView(focusDate, dates);
    } else if (activeView === 'byDc') {
      html = renderDcView(focusDate, dates);
    } else if (activeView === 'byTrucker') {
      html = renderTruckerView(focusDate, dates);
    } else if (activeView === 'bulkRoutes') {
      html = renderGroupedRouteTable('BULK', focusDate, dates);
    } else if (activeView === 'collectionRoutes') {
      html = renderGroupedRouteTable('COLLECTION', focusDate, dates);
    } else if (activeView === 'bulkContrib') {
      html = renderBulkContributors(focusDate);
    } else if (activeView === 'collectionContrib') {
      html = renderCollectionContributors(focusDate);
    } else {
      // full: everything stacked (complete report)
      html = renderOverallView(focusDate, dates);
      html += renderDcView(focusDate, dates);
      html += renderTruckerView(focusDate, dates);
      html += renderGroupedRouteTable('BULK', focusDate, dates);
      html += renderGroupedRouteTable('COLLECTION', focusDate, dates);
      html += renderBulkContributors(focusDate);
      html += renderCollectionContributors(focusDate);
    }

    host.innerHTML = html;

    if (activeView === 'overall' || activeView === 'full') {
      setTimeout(function () {
        renderMonthChart('trChartBulkMonth', 'bulkMonth', 'BULK', focusDate, 'SLU Bulk Cargo Travel Time Achieving Rate');
        renderMonthChart('trChartVisminMonth', 'collectionMonth', 'COLLECTION', focusDate, 'SLU Collection Travel Time Achieving Rate');
      }, 40);
    }
  }

  function setView(v) {
    activeView = v || 'overall';
    document.querySelectorAll('.tr-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.trView === activeView);
    });
    render();
  }

  function onDataReady() { render(); }


  function init() {
    document.querySelectorAll('.tr-subtab').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.trView));
    });
    const exp = document.getElementById('btnTrExport');
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

  function setCell(ws, r, c, value, opts) {
    opts = opts || {};
    const cell = ws.getCell(r, c);
    cell.value = value;
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    cell.font = opts.font || XLS.font();
    cell.fill = opts.fill || XLS.fill('FFFFFFFF');
    cell.border = XLS.thin('FFBDBDBD');
    cell.alignment = opts.align || { horizontal: 'center', vertical: 'middle', wrapText: true };
    return cell;
  }

  function writeEntityExcelRow(ws, rowIdx, leftVals, r, target, hist7, bold) {
    let c = 1;
    leftVals.forEach(function (v, i) {
      setCell(ws, rowIdx, c++, v, {
        font: XLS.font({ bold: true }),
        fill: bold ? XLS.fill('FFFFCDD2') : XLS.fill('FFF5F5F5'),
        align: { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
      });
    });
    // Daily summary
    setCell(ws, rowIdx, c++, r.total || 0, { fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF') });
    setCell(ws, rowIdx, c++, r.followed || 0, { fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF') });
    setCell(ws, rowIdx, c++, r.notFollowed || 0, {
      font: XLS.font({ bold: !!(r.notFollowed), color: { argb: r.notFollowed ? 'FFC62828' : 'FF000000' } }),
      fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF')
    });
    setCell(ws, rowIdx, c++, target != null ? target : r.target, {
      numFmt: '0%',
      fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF')
    });
    {
      const rate = r.rate;
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    }
    // 7-day history
    const hist = r.histRates || [];
    for (let i = 0; i < Math.max(hist7.length, 1); i++) {
      const hr = hist[i];
      const rate = hr ? hr.rate : null;
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    }
    // Daily diff + mood
    {
      const d = r.dailyDiff;
      setCell(ws, rowIdx, c++, d == null ? '—' : d, {
        numFmt: d == null ? undefined : '0.00%',
        fill: d == null ? XLS.fill('FFFFFFFF') : (d >= 0 ? XLS.fill('FFC6EFCE') : XLS.fill('FFFFC7CE')),
        font: d == null ? XLS.font({ color: { argb: 'FF9E9E9E' } })
          : XLS.font({ bold: true, color: { argb: d >= 0 ? 'FF006100' : 'FF9C0006' } })
      });
    }
    setCell(ws, rowIdx, c++, r.mood || r.arrow || '', { align: { horizontal: 'center' } });
    // Weekly
    [r.wkPrev, r.wkCurr].forEach(function (rate) {
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    });
    {
      const d = r.weeklyDiff;
      setCell(ws, rowIdx, c++, d == null ? '—' : d, {
        numFmt: d == null ? undefined : '0.00%',
        fill: d == null ? XLS.fill('FFFFFFFF') : (d >= 0 ? XLS.fill('FFC6EFCE') : XLS.fill('FFFFC7CE')),
        font: d == null ? XLS.font({ color: { argb: 'FF9E9E9E' } })
          : XLS.font({ bold: true, color: { argb: d >= 0 ? 'FF006100' : 'FF9C0006' } })
      });
    }
    // Monthly
    setCell(ws, rowIdx, c++, r.monthLate != null ? r.monthLate : '—');
    setCell(ws, rowIdx, c++, r.monthOnTime != null ? r.monthOnTime : '—');
    setCell(ws, rowIdx, c++, r.monthTotal != null ? r.monthTotal : '—');
    {
      const rate = r.monthRate;
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    }
    setCell(ws, rowIdx, c++, bold ? '—' : (r.rank != null ? r.rank : '—'), {
      font: XLS.font({ bold: true })
    });
  }

  function appendTravelTable(ws, startRow, pack) {
    // pack: title, leftHeaders, bodyItems[{left,row,bold}], hist7, target, sample
    const leftN = pack.leftHeaders.length;
    const hist7 = pack.hist7 || [];
    const nHist = Math.max(hist7.length, 1);
    const colCount = leftN + 5 + nHist + 2 + 3 + 5;
    let r = startRow;

    writeTitle(ws, r, colCount, pack.title);
    r++;

    // Header row 1 — group labels
    let c = 1;
    pack.leftHeaders.forEach(function (lh) {
      setCell(ws, r, c++, lh, {
        font: XLS.font({ bold: true, size: 9 }),
        fill: XLS.fill('FFD9D9D9')
      });
    });
    const groups = [
      { label: 'DAILY SUMMARY', span: 5, color: 'FFFFE699' },
      { label: '7 DAYS RATE HISTORY', span: nHist, color: 'FFBDD7EE' },
      { label: 'DAILY COMPARISON', span: 2, color: 'FFDDEBF7' },
      { label: 'WEEKLY RATE', span: 3, color: 'FFC6E0B4' },
      { label: 'MONTHLY RATE', span: 5, color: 'FFA9D08E' }
    ];
    groups.forEach(function (g) {
      const start = c;
      const end = c + g.span - 1;
      if (g.span > 1) {
        try { ws.mergeCells(r, start, r, end); } catch (e) {}
      }
      setCell(ws, r, start, g.label, {
        font: XLS.font({ bold: true, size: 10 }),
        fill: XLS.fill(g.color)
      });
      for (let i = start + 1; i <= end; i++) {
        setCell(ws, r, i, '', { fill: XLS.fill(g.color) });
      }
      c = end + 1;
    });
    ws.getRow(r).height = 22;
    r++;

    // Header row 2
    c = 1;
    pack.leftHeaders.forEach(function () {
      setCell(ws, r, c++, '', { fill: XLS.fill('FFD9D9D9') });
    });
    const h2 = [
      { t: 'Total Arrival Times', f: 'FFFFE699' },
      { t: 'Followed Plan travel time', f: 'FFFFE699' },
      { t: 'Not followed Plan travel time', f: 'FFFFE699' },
      { t: 'TARGET', f: 'FFFFE699' },
      { t: 'RATE', f: 'FFFFE699' }
    ];
    const hLabels = histHeaders(hist7);
    if (hist7.length) {
      hLabels.forEach(function (l) { h2.push({ t: l, f: 'FFBDD7EE' }); });
    } else {
      h2.push({ t: '—', f: 'FFBDD7EE' });
    }
    h2.push({ t: 'DAILY DIFF', f: 'FFDDEBF7' });
    h2.push({ t: '', f: 'FFDDEBF7' });
    const sample = pack.sample || {};
    h2.push({ t: sample.wkPrevLabel || 'WK —', f: 'FFC6E0B4' });
    h2.push({ t: sample.wkCurrLabel || 'WK —', f: 'FFC6E0B4' });
    h2.push({ t: 'WEEKLY DIFF', f: 'FFC6E0B4' });
    h2.push({ t: 'MONTHLY DELAY', f: 'FFA9D08E' });
    h2.push({ t: 'MONTHLY ONTIME', f: 'FFA9D08E' });
    h2.push({ t: 'TOTAL', f: 'FFA9D08E' });
    h2.push({ t: 'RATE', f: 'FFA9D08E' });
    h2.push({ t: 'RANK', f: 'FFA9D08E' });
    h2.forEach(function (x) {
      setCell(ws, r, c++, x.t, {
        font: XLS.font({ bold: true, size: 8 }),
        fill: XLS.fill(x.f)
      });
    });
    ws.getRow(r).height = 32;
    r++;

    (pack.bodyItems || []).forEach(function (item) {
      const left = item.left.slice();
      while (left.length < leftN) left.push('');
      writeEntityExcelRow(ws, r, left, item.row, pack.target, hist7, !!item.bold);
      r++;
    });

    for (let i = 1; i <= colCount; i++) {
      ws.getColumn(i).width = i <= leftN ? 16 : 11;
    }
    r++;
    return r;
  }

  function collectTravelPacks(focus, dates) {
    const rows = allRows();
    const packs = [];

    function overallPack(title, scope, target) {
      const block = buildScopeBlock(title, scope, target, focus, dates);
      const regionRows = (block.regionRows || []).filter(function (x) { return x.name !== 'SLU'; });
      assignRanks(regionRows);
      const bodyItems = [{ left: ['SLU'], row: block.slu, bold: true }]
        .concat(regionRows.map(function (x) { return { left: [x.name], row: x }; }));
      packs.push({
        sheetHint: 'Summary',
        title: title,
        leftHeaders: ['DC INTENDED'],
        bodyItems: bodyItems,
        hist7: block.hist7,
        target: target,
        sample: block.slu
      });
    }

    overallPack('Branchline Travel Time Report', 'ALL', TARGET.ALL);
    overallPack('Bulk Cargo Branchline Travel Time Report', 'BULK', TARGET.BULK);
    overallPack('Collection Branchline Travel Time Report', 'COLLECTION', TARGET.COLLECTION);

    // By DC
    (function () {
      const hist7 = last7Dates(focus, dates);
      const by = new Map();
      rows.forEach(function (r) {
        const dc = resolveDc(r.dcIntended);
        const key = dc.code || dc.name;
        if (!by.has(key)) by.set(key, { name: dc.name, code: dc.code, list: [] });
        by.get(key).list.push(r);
      });
      const entities = [...by.values()]
        .map(function (e) { return buildEntityRow(e.name, e.code, e.list, focus, dates, TARGET.ALL); })
        .filter(function (r) { return r.monthTotal > 0 || r.total > 0; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      assignRanks(entities);
      const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
      packs.push({
        sheetHint: 'By DC',
        title: 'SLU Branchline Travel Time Report',
        leftHeaders: ['DC NAME', 'DC CODE'],
        bodyItems: entities.map(function (e) {
          return { left: [e.name, e.code || ''], row: e };
        }).concat([{ left: ['SLU', ''], row: slu, bold: true }]),
        hist7: hist7,
        target: TARGET.ALL,
        sample: slu
      });
    })();

    // By Trucker
    (function () {
      const hist7 = last7Dates(focus, dates);
      const by = new Map();
      rows.forEach(function (r) {
        const t = r.trucker || '(blank)';
        if (!by.has(t)) by.set(t, []);
        by.get(t).push(r);
      });
      const entities = [...by.entries()]
        .map(function (ent) { return buildEntityRow(ent[0], '', ent[1], focus, dates, TARGET.ALL); })
        .filter(function (r) { return r.monthTotal > 0 || r.total > 0; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      assignRanks(entities);
      const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
      packs.push({
        sheetHint: 'By Trucker',
        title: 'SLU Branchline Travel Time per Trucker Report',
        leftHeaders: ['TRUCKERS'],
        bodyItems: entities.map(function (e) {
          return { left: [e.name], row: e };
        }).concat([{ left: ['SLU'], row: slu, bold: true }]),
        hist7: hist7,
        target: TARGET.ALL,
        sample: slu
      });
    })();

    // Bulk / Collection routes
    ['BULK', 'COLLECTION'].forEach(function (scope) {
      const target = scope === 'BULK' ? TARGET.BULK : TARGET.COLLECTION;
      const pack = buildRouteRegionPack(scope, target, focus, dates);
      const bodyItems = (pack.items || []).map(function (item) {
        return {
          left: item.left,
          row: item.row,
          bold: !!item.bold
        };
      });
      // ranks for route rows only
      const routeOnly = bodyItems.filter(function (i) { return !i.bold && i.left[1]; }).map(function (i) { return i.row; });
      assignRanks(routeOnly);
      packs.push({
        sheetHint: scope === 'BULK' ? 'Bulk Cargos' : 'Collections',
        title: pack.title,
        leftHeaders: ['DC INTENDED', 'ROUTE'],
        bodyItems: bodyItems,
        hist7: pack.hist7,
        target: target,
        sample: bodyItems.length ? bodyItems[bodyItems.length - 1].row : {}
      });
    });

    return packs;
  }


  function appendContributorSheet(ws, pack) {
    const thin = {
      top: { style: 'thin', color: { argb: 'FFBDBDBD' } },
      left: { style: 'thin', color: { argb: 'FFBDBDBD' } },
      bottom: { style: 'thin', color: { argb: 'FFBDBDBD' } },
      right: { style: 'thin', color: { argb: 'FFBDBDBD' } }
    };
    function fill(argb) {
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
    }
    function font(opts) {
      return Object.assign({ name: 'Calibri', size: 10 }, opts || {});
    }
    function achFill(rate) {
      if (rate == null) return fill('FFFFFFFF');
      const p = rate * 100;
      if (p >= 95) return fill('FFA9D08E');
      if (p >= 85) return fill('FFC6EFCE');
      if (p >= 70) return fill('FFFFE699');
      return fill('FFFFC7CE');
    }

    let r = 1;
    ws.mergeCells(r, 1, r, 9);
    const title = ws.getCell(r, 1);
    title.value = 'ACHIEVEMENT RATE · ' + pack.scopeLabel.toUpperCase() + ' · ' + pack.weekLabel;
    title.font = font({ bold: true, size: 13, color: { argb: 'FFFFFFFF' } });
    title.fill = fill('FFC00000');
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 24;
    r++;

    const headers = [
      'REGION', 'route', 'Trucker Name', 'NO', 'YES', 'Grand Total',
      'Prev (' + pack.prevWeekLabel + ')', 'Travel Time (' + pack.weekLabel + ')', 'Rate Diff'
    ];
    headers.forEach(function (h, i) {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = font({ bold: true, size: 9 });
      cell.fill = fill(i < 3 ? 'FFD9D9D9' : (i >= 6 ? 'FFFFE699' : 'FFA9D08E'));
      cell.border = thin;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    r++;

    pack.rows.forEach(function (row) {
      const vals = [
        row.region, row.route, row.trucker,
        row.no, row.yes, row.total,
        row.prevRate, row.rate,
        (row.rate != null && row.prevRate != null) ? (row.rate - row.prevRate) : null
      ];
      vals.forEach(function (v, i) {
        const cell = ws.getCell(r, i + 1);
        if (i >= 6 && i <= 8) {
          if (v == null) {
            cell.value = '—';
            cell.font = font({ color: { argb: 'FF9E9E9E' } });
            cell.fill = fill('FFFFFFFF');
          } else if (i === 8) {
            const arrow = v >= 0 ? '↑ ' : '↓ ';
            cell.value = arrow + Math.abs(v * 100).toFixed(2) + 'pp';
            cell.fill = v >= 0 ? fill('FFC6EFCE') : fill('FFFFC7CE');
            cell.font = font({ bold: true, color: { argb: v >= 0 ? 'FF006100' : 'FF9C0006' } });
          } else {
            cell.value = v;
            cell.numFmt = '0.00%';
            cell.fill = achFill(v);
            cell.font = font({ bold: true });
          }
        } else {
          cell.value = v;
          if (row.level === 'region') {
            cell.fill = fill('FFD9D9D9');
            cell.font = font({ bold: true });
          } else if (row.level === 'route') {
            cell.fill = fill('FFF2F2F2');
            cell.font = font({ bold: true });
          } else {
            cell.fill = fill('FFFFFFFF');
            cell.font = font();
          }
        }
        cell.border = thin;
        cell.alignment = { horizontal: i < 3 ? 'left' : 'center', vertical: 'middle' };
      });
      r++;
    });

    [14, 14, 22, 8, 8, 12, 12, 14, 12].forEach(function (w, i) {
      ws.getColumn(i + 1).width = w;
    });
  }

  async function exportExcel() {
    const focus = getFocusDate();
    const dates = allDates();
    if (!focus || !allRows().length) {
      alert('No branchline data to export. Upload a workbook and run Compare first.');
      return;
    }
    const btn = document.getElementById('btnTrExport');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }
    try {
      await ensureExcelJS();
      const packs = collectTravelPacks(focus, dates);
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Branchline Travel Time Analyzer';
      wb.created = new Date();

      const sheetMap = {};
      packs.forEach(function (p) {
        const name = p.sheetHint || 'Report';
        if (!sheetMap[name]) sheetMap[name] = [];
        sheetMap[name].push(p);
      });

      Object.keys(sheetMap).forEach(function (name) {
        const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
        let row = 1;
        sheetMap[name].forEach(function (pack) {
          row = appendTravelTable(ws, row, pack);
          row += 1;
        });
      });

      // Bulk / Collection Contributors (weekly) — separate sheets
      ['BULK', 'COLLECTION'].forEach(function (scope) {
        const pack = collectContributorExport(scope, focus);
        if (!pack.rows.length) return;
        const sheetName = (scope === 'BULK' ? 'Bulk Contributors' : 'Collection Contributors').slice(0, 31);
        const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
        appendContributorSheet(ws, pack);
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = 'SLU_Branchline_Travel_Time_Report_' + focus + '.xlsx';
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
