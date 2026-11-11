/* ==========================================================================
   MODULE: BLT RATE MATRIX
   Layout 1 (Summary Board): clean photo-style OVERALL / LUZON / VISMIN bands
   Layout 2 (Original + Graphs): detailed sheets + trend charts (Overall/Luzon/VisMin)
   Rates = YES ÷ TOTAL (Excel WM SLU formula) · Trend = last vs previous consecutive period
   TWO DROPS & BACKLOAD listed last · blanks kept for abnormality checks
   ========================================================================== */
const BltRateMatrix = (() => {
  const TARGET = { ALL: 0.97, BULK: 0.97, COLLECTION: 0.97 };
  const SCOPES = [
    { id: 'ALL', head: 'BRANCHLINE TRAVEL TIME', target: TARGET.ALL },
    { id: 'BULK', head: 'BULK CARGO', target: TARGET.BULK },
    { id: 'COLLECTION', head: 'COLLECTION', target: TARGET.COLLECTION }
  ];
  const SPECIAL_REGIONS = [];

  let mode = 'weekly'; // 'weekly' | 'monthly'
  let matrixView = 'scope';
  let periodFrom = ''; // inclusive range start (weekKey / monthKey); '' = open
  let periodTo = '';   // inclusive range end; '' = open

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_UP = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  function weekKey(dateKey) {
    return (typeof BltUtils !== 'undefined' && BltUtils.weekKey) ? BltUtils.weekKey(dateKey) : null;
  }
  function monthKey(dateKey) {
    return dateKey ? String(dateKey).slice(0, 7) : null;
  }
  function fmtDay(dk) {
    if (!dk || String(dk).length < 10) return dk || '';
    const p = String(dk).split('-');
    return (MONTH_SHORT[parseInt(p[1], 10) - 1] || p[1]) + ' ' + parseInt(p[2], 10);
  }
  function weekDateRange(wk, rows) {
    if (!wk) return '';
    const dates = [...new Set(
      (rows || []).filter(r => r.period === wk || weekKey(r.dateKey) === wk)
        .map(r => r.dateKey).filter(Boolean)
    )].sort();
    if (!dates.length) return '';
    if (dates.length === 1) return fmtDay(dates[0]);
    return fmtDay(dates[0]) + '–' + fmtDay(dates[dates.length - 1]);
  }
  function labelFor(key, forMode, rows) {
    const m = forMode || mode;
    if (m === 'weekly') {
      const mm = String(key).match(/W(\d+)/i);
      let base = mm ? ('WK ' + parseInt(mm[1], 10) + ' RATE') : String(key);
      const range = weekDateRange(key, rows || getRows(m));
      if (range) base += ' · ' + range;
      return base;
    }
    if (!key || key.length < 7) return key;
    const mi = parseInt(key.slice(5, 7), 10) - 1;
    return (MONTH_UP[mi] || key.slice(5)) + ' ' + key.slice(0, 4);
  }
  function shortLabel(key, forMode, rows) {
    const m = forMode || mode;
    if (m === 'weekly') {
      const mm = String(key).match(/W(\d+)/i);
      const wk = mm ? ('WK ' + parseInt(mm[1], 10)) : String(key);
      const range = weekDateRange(key, rows || getRows(m));
      if (range) {
        const parts = range.split('–');
        const start = parts[0] || '';
        const sm = start.match(/^([A-Za-z]+)\s+(\d+)/);
        const mon = sm ? sm[1] : '';
        return { top: wk + ' RATE · ' + mon, bottom: range };
      }
      return { top: wk + ' RATE', bottom: '' };
    }
    return { top: labelFor(key, m, rows), bottom: '' };
  }

  function getRows(forMode) {
    const m = forMode || mode;
    if (typeof BltFileProcessor === 'undefined') return [];
    const st = BltFileProcessor.getState();
    const pkFn = m === 'monthly' ? monthKey : weekKey;
    let rows = (st.storedRows || []).map(function (r) {
      return Object.assign({}, r, {
        period: r.dateKey ? pkFn(r.dateKey) : null
      });
    });
    // Inclusive period range filter (e.g. WK39→WK45 or 2026-01→2026-05)
    const keys = periodKeysInRange(availablePeriods(m), periodFrom, periodTo);
    if (keys) {
      const allow = new Set(keys);
      rows = rows.filter(function (r) { return r.period && allow.has(r.period); });
    }
    return rows;
  }

  function availablePeriods(forMode) {
    const m = forMode || mode;
    if (typeof BltFileProcessor === 'undefined') return [];
    const st = BltFileProcessor.getState();
    const pkFn = m === 'monthly' ? monthKey : weekKey;
    const set = new Set();
    (st.storedRows || []).forEach(function (r) {
      const pk = r.dateKey ? pkFn(r.dateKey) : null;
      if (pk) set.add(pk);
    });
    return [...set].sort();
  }

  /** Returns null = no filter (all); else sorted list of keys in [from, to] inclusive */
  function periodKeysInRange(allKeys, from, to) {
    if (!allKeys || !allKeys.length) return null;
    if (!from && !to) return null;
    const sorted = allKeys.slice().sort();
    let i0 = 0;
    let i1 = sorted.length - 1;
    if (from) {
      const i = sorted.indexOf(from);
      i0 = i >= 0 ? i : sorted.findIndex(function (k) { return k >= from; });
      if (i0 < 0) i0 = sorted.length;
    }
    if (to) {
      const i = sorted.indexOf(to);
      i1 = i >= 0 ? i : (function () {
        let last = -1;
        for (let j = 0; j < sorted.length; j++) if (sorted[j] <= to) last = j;
        return last;
      })();
    }
    if (i0 > i1) return [];
    return sorted.slice(i0, i1 + 1);
  }

  function optionLabel(pk, forMode, labelRows) {
    const m = forMode || mode;
    if (m === 'weekly') {
      const mm = String(pk).match(/W(\d+)/i);
      const range = weekDateRange(pk, labelRows || []);
      return (mm ? ('WK ' + parseInt(mm[1], 10)) : pk) + (range ? (' · ' + range) : '');
    }
    return labelFor(pk, 'monthly', []);
  }

  function fillPeriodSelect(sel, keys, labelRows, placeholder) {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder;
    sel.appendChild(opt0);
    keys.forEach(function (pk) {
      const o = document.createElement('option');
      o.value = pk;
      o.textContent = optionLabel(pk, mode, labelRows);
      sel.appendChild(o);
    });
    if (prev && keys.indexOf(prev) >= 0) sel.value = prev;
    else sel.value = '';
  }

  function refreshPeriodSelect() {
    const wrap = document.getElementById('rmPeriodPickWrap');
    const fromSel = document.getElementById('rmPeriodFrom');
    const toSel = document.getElementById('rmPeriodTo');
    const lab = document.getElementById('rmPeriodPickLabel');
    if (!wrap || !fromSel || !toSel) return;
    wrap.style.display = '';
    if (lab) lab.textContent = mode === 'weekly' ? 'Week range' : 'Month range';
    const keys = availablePeriods(mode);
    let labelRows = [];
    if (typeof BltFileProcessor !== 'undefined') {
      const st = BltFileProcessor.getState();
      labelRows = (st.storedRows || []).map(function (r) {
        return Object.assign({}, r, { period: r.dateKey ? weekKey(r.dateKey) : null });
      });
    }
    const fromPh = mode === 'weekly' ? 'From (all weeks)' : 'From (all months)';
    const toPh = mode === 'weekly' ? 'To (all weeks)' : 'To (all months)';
    fillPeriodSelect(fromSel, keys, labelRows, fromPh);
    fillPeriodSelect(toSel, keys, labelRows, toPh);
    // restore range if still valid
    if (periodFrom && keys.indexOf(periodFrom) >= 0) fromSel.value = periodFrom;
    else { periodFrom = ''; fromSel.value = ''; }
    if (periodTo && keys.indexOf(periodTo) >= 0) toSel.value = periodTo;
    else { periodTo = ''; toSel.value = ''; }
  }

  function updateFilterNote() {
    const note = document.getElementById('rmFilterNote');
    if (!note) return;
    const kind = mode === 'weekly' ? 'Weekly' : 'Monthly';
    const keys = availablePeriods(mode);
    const inRange = periodKeysInRange(keys, periodFrom, periodTo);
    if (!inRange) {
      note.textContent = kind + ' · ' + (mode === 'weekly' ? 'All weeks' : 'All months');
      return;
    }
    if (!inRange.length) {
      note.textContent = kind + ' · (empty range)';
      return;
    }
    const a = optionLabel(inRange[0], mode, []);
    const b = optionLabel(inRange[inRange.length - 1], mode, []);
    note.textContent = kind + ' · ' + a + ' → ' + b;
  }

  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => String(r.onTime || '').toUpperCase() === 'YES').length;
    const total = list.length;
    return { total: total, yes: yes, no: total - yes, rate: total ? yes / total : null };
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
  function periodKeys(rows) {
    return [...new Set(rows.map(r => r.period).filter(Boolean))].sort();
  }
  function fmtPct(v) {
    if (v == null || isNaN(v)) return '';
    return (v * 100).toFixed(2) + '%';
  }
  function rateColor(rate, target) {
    if (rate == null || isNaN(rate)) {
      return { bg: 'FFFFFF', fg: '9E9E9E', cssBg: '#FFFFFF', cssFg: '#9E9E9E' };
    }
    const pct = rate * 100;
    const t = (target || 0.97) * 100;
    if (pct >= t) return { bg: 'A5D6A7', fg: '1B5E20', cssBg: '#A5D6A7', cssFg: '#1B5E20' };
    if (pct >= t - 2) return { bg: 'C5E1A5', fg: '33691E', cssBg: '#C5E1A5', cssFg: '#33691E' };
    if (pct >= t - 5) return { bg: 'FFF59D', fg: 'F57F17', cssBg: '#FFF59D', cssFg: '#F57F17' };
    if (pct >= t - 10) return { bg: 'FFCC80', fg: 'E65100', cssBg: '#FFCC80', cssFg: '#E65100' };
    return { bg: 'EF9A9A', fg: 'B71C1C', cssBg: '#EF9A9A', cssFg: '#B71C1C' };
  }

  function trendInfo(series) {
    if (!series || series.length < 2) return { text: '', cls: '', dir: 0 };
    const a = series[series.length - 2];
    const b = series[series.length - 1];
    if (a == null || isNaN(a) || b == null || isNaN(b)) return { text: '', cls: '', dir: 0 };
    const d = b - a;
    const pp = (d * 100).toFixed(2);
    if (d > 0.0005) return { text: 'UP +' + pp + 'pp', cls: 'rm-up', dir: 1 };
    if (d < -0.0005) return { text: 'DOWN ' + pp + 'pp', cls: 'rm-down', dir: -1 };
    return { text: 'FLAT 0.00pp', cls: 'rm-flat', dir: 0 };
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
  function isSpecialRegion(name) {
    return SPECIAL_REGIONS.indexOf(String(name || '').toUpperCase()) >= 0;
  }

  /**
   * Multi-stop / two-drop routes look like 490-540-550 (3+ numeric legs).
   * Simple mainline legs are 490-520 / 490-540 (exactly 2 legs).
   * Those multi-leg codes belong only under TWO DROPS, not under BSL/NCR/etc.
   */
  function isMultiDropRoute(route) {
    const s = String(route || '').trim().toUpperCase();
    if (!s || s === '(BLANK)' || s === 'BLANK') return false;
    // Normalize separators
    const parts = s.split(/[-–—_/\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    // 3+ segments that look like DC/route codes → two drops
    if (parts.length >= 3) {
      const numericish = parts.filter(function (p) { return /^\d{2,}$/.test(p); });
      if (numericish.length >= 3) return true;
      if (parts.length >= 3) return true;
    }
    // Explicit keywords
    if (s.indexOf('TWO DROP') >= 0 || s.indexOf('2 DROP') >= 0 || s.indexOf('TWODROP') >= 0) return true;
    return false;
  }

  function buildMatrix(allRows, scopeId) {
    const scoped = filterScope(allRows, scopeId);
    const periods = periodKeys(scoped);
    const rates = {};
    periods.forEach(function (pk) {
      rates[pk] = periodRate(scoped.filter(function (r) { return r.period === pk; }));
    });
    return { periods: periods, rates: rates };
  }

  function buildRouteMatrix(allRows, scopeId) {
    const scoped = filterScope(allRows, scopeId);
    const periods = periodKeys(scoped);
    const byRegion = new Map();
    scoped.forEach(function (r) {
      let reg = normalizeRegionName(r.dcName || r.dcIntended || r.region);
      const route = (r.route || '(blank)').trim() || '(blank)';
      // Keep region from data (TWO DROPS / BACKLOAD only when region says so).
      // Do NOT move multi-leg BSL routes out of BSL — they still count in BSL totals.
      if (!byRegion.has(reg)) byRegion.set(reg, new Map());
      const byRoute = byRegion.get(reg);
      if (!byRoute.has(route)) byRoute.set(route, []);
      byRoute.get(route).push(r);
    });
    const regions = sortRegions([...byRegion.keys()]);
    const blocks = regions.map(function (reg) {
      const byRoute = byRegion.get(reg);
      const special = isSpecialRegion(reg);
      const bsl = String(reg || '').trim().toUpperCase() === 'BSL';
      // BSL only: 3+ leg routes still COUNT in region totals but are NOT listed as route rows.
      // Other regions / TWO DROPS / BACKLOAD: list all routes as before.
      const routes = [...byRoute.keys()].filter(function (rt) {
        if (bsl && isMultiDropRoute(rt)) return false;
        return true;
      }).sort(function (a, b) { return a.localeCompare(b); });
      const regAll = [];
      byRoute.forEach(function (list) {
        list.forEach(function (x) { regAll.push(x); });
      });
      const regionRates = {};
      periods.forEach(function (pk) {
        regionRates[pk] = periodRate(regAll.filter(function (r) { return r.period === pk; }));
      });
      const routeRows = routes.map(function (route) {
        const list = byRoute.get(route);
        const rates = {};
        periods.forEach(function (pk) {
          rates[pk] = periodRate(list.filter(function (r) { return r.period === pk; }));
        });
        return { route: route, rates: rates, series: periods.map(function (pk) { return rates[pk]; }) };
      });
      return {
        region: reg,
        special: isSpecialRegion(reg),
        regionRates: regionRates,
        regionSeries: periods.map(function (pk) { return regionRates[pk]; }),
        routes: routeRows
      };
    });
    return { periods: periods, blocks: blocks };
  }


  /** By DC Intended — mirrors Excel sheets A / B */
  function buildDcMatrix(allRows, scopeId) {
    const scoped = filterScope(allRows, scopeId);
    const periods = periodKeys(scoped);
    const byDc = new Map();
    scoped.forEach(function (r) {
      const dc = String(r.dcName || r.dcIntended || '(blank)').trim() || '(blank)';
      if (!byDc.has(dc)) byDc.set(dc, []);
      byDc.get(dc).push(r);
    });
    const dcs = [...byDc.keys()].sort(function (a, b) {
      if (a === 'SLU') return 1;
      if (b === 'SLU') return -1;
      return a.localeCompare(b);
    });
    const rows = dcs.map(function (dc) {
      const list = byDc.get(dc);
      const rates = {};
      periods.forEach(function (pk) {
        rates[pk] = periodRate(list.filter(function (r) { return r.period === pk; }));
      });
      const series = periods.map(function (pk) { return rates[pk]; });
      // Bulk / Collection split (sheet B style)
      const bulkRates = {};
      const collRates = {};
      periods.forEach(function (pk) {
        const dayList = list.filter(function (r) { return r.period === pk; });
        bulkRates[pk] = periodRate(filterScope(dayList, 'BULK'));
        collRates[pk] = periodRate(filterScope(dayList, 'COLLECTION'));
      });
      return {
        dc: dc,
        rates: rates,
        series: series,
        bulkRates: bulkRates,
        collRates: collRates,
        total: list.length
      };
    });
    // Overall SLU row
    const allRates = {};
    periods.forEach(function (pk) {
      allRates[pk] = periodRate(scoped.filter(function (r) { return r.period === pk; }));
    });
    return {
      periods: periods,
      rows: rows,
      overall: {
        dc: 'SLU',
        rates: allRates,
        series: periods.map(function (pk) { return allRates[pk]; }),
        bulkRates: (function () {
          const o = {};
          periods.forEach(function (pk) {
            o[pk] = periodRate(filterScope(scoped.filter(function (r) { return r.period === pk; }), 'BULK'));
          });
          return o;
        })(),
        collRates: (function () {
          const o = {};
          periods.forEach(function (pk) {
            o[pk] = periodRate(filterScope(scoped.filter(function (r) { return r.period === pk; }), 'COLLECTION'));
          });
          return o;
        })()
      }
    };
  }

  function renderDcBlock(scope, matrix, allRows) {
    const periods = matrix.periods;
    let h = '<div class="rm-board rm-route-board">';
    h += '<div class="rm-board-title">' + scope.head + ' · BY DC INTENDED</div>';
    if (!periods.length) {
      h += '<div class="rm-board-empty">—</div></div>';
      return h;
    }
    const trendLabel = mode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';
    // Overall rate by period
    h += '<div class="rm-table-wrap"><table class="rm-table"><thead><tr>';
    h += '<th>DC INTENDED</th>';
    periods.forEach(function (pk) {
      h += '<th>' + labelFor(pk, mode, allRows) + '</th>';
    });
    h += '<th class="rm-th-trend">' + trendLabel + '</th></tr></thead><tbody>';

    function rateTd(rate) {
      const c = rateColor(rate, scope.target);
      return '<td class="rm-rate' + (rate == null ? ' rm-blank' : '') +
        '" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' + fmtPct(rate) + '</td>';
    }

    matrix.rows.forEach(function (row) {
      h += '<tr>';
      h += '<td class="rm-region"><strong>' + row.dc + '</strong></td>';
      periods.forEach(function (pk) { h += rateTd(row.rates[pk]); });
      const ti = trendInfo(row.series);
      h += '<td class="rm-trend ' + ti.cls + '">' + (ti.text || '') + '</td></tr>';
    });
    // SLU total
    h += '<tr class="rm-region-row">';
    h += '<td class="rm-region"><strong>SLU</strong></td>';
    periods.forEach(function (pk) { h += rateTd(matrix.overall.rates[pk]); });
    const oti = trendInfo(matrix.overall.series);
    h += '<td class="rm-trend ' + oti.cls + '">' + (oti.text || '') + '</td></tr>';

    h += '</tbody></table></div>';

    // Sheet B style: Bulk vs Collection weekly rates side-by-side when scope is ALL
    if (scope.id === 'ALL' && periods.length) {
      h += '<div class="rm-board-title" style="margin-top:14px;">BULK vs COLLECTION BY DC</div>';
      h += '<div class="rm-table-wrap"><table class="rm-table"><thead><tr>';
      h += '<th>DC INTENDED</th>';
      periods.forEach(function (pk) {
        h += '<th colspan="2">' + labelFor(pk, mode, allRows) + '</th>';
      });
      h += '</tr><tr><th></th>';
      periods.forEach(function () {
        h += '<th>Bulk</th><th>Collection</th>';
      });
      h += '</tr></thead><tbody>';
      matrix.rows.forEach(function (row) {
        h += '<tr><td class="rm-region"><strong>' + row.dc + '</strong></td>';
        periods.forEach(function (pk) {
          h += rateTd(row.bulkRates[pk]);
          h += rateTd(row.collRates[pk]);
        });
        h += '</tr>';
      });
      h += '<tr class="rm-region-row"><td class="rm-region"><strong>SLU</strong></td>';
      periods.forEach(function (pk) {
        h += rateTd(matrix.overall.bulkRates[pk]);
        h += rateTd(matrix.overall.collRates[pk]);
      });
      h += '</tr></tbody></table></div>';
    }

    h += '</div>';
    return h;
  }

  function renderScopeBlock(scope, matrix, allRows) {
    const periods = matrix.periods;
    const rates = matrix.rates;
    if (!periods.length) {
      return '<div class="rm-board"><div class="rm-board-title">' + scope.head +
        '</div><div class="rm-board-empty">—</div></div>';
    }
    const trendLabel = mode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';
    const series = periods.map(function (pk) { return rates[pk]; });
    const ti = trendInfo(series);

    let h = '<div class="rm-board">';
    h += '<div class="rm-board-title">' + scope.head + '</div>';
    h += '<table class="rm-board-table"><thead><tr>';
    periods.forEach(function (pk) {
      const lab = shortLabel(pk, mode, allRows);
      h += '<th><div class="rm-wk-top">' + lab.top + '</div>';
      if (lab.bottom) h += '<div class="rm-wk-bot">' + lab.bottom + '</div>';
      h += '</th>';
    });
    h += '<th class="rm-th-trend">' + trendLabel + '</th></tr></thead><tbody><tr>';
    periods.forEach(function (pk) {
      const rate = rates[pk];
      const c = rateColor(rate, scope.target);
      const blank = rate == null ? ' rm-blank' : '';
      h += '<td class="rm-rate' + blank + '" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' +
        fmtPct(rate) + '</td>';
    });
    h += '<td class="rm-trend ' + ti.cls + '">' + (ti.text || '') + '</td>';
    h += '</tr></tbody></table></div>';
    return h;
  }

  function renderRouteBlock(scope, matrix, allRows) {
    const periods = matrix.periods;
    const blocks = matrix.blocks;
    let h = '<div class="rm-board rm-route-board">';
    h += '<div class="rm-board-title">' + scope.head + ' · BY ROUTE</div>';
    if (!periods.length || !blocks.length) {
      h += '<div class="rm-board-empty">—</div></div>';
      return h;
    }
    const trendLabel = mode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';
    h += '<div class="rm-table-wrap"><table class="rm-table"><thead><tr>';
    h += '<th>DC INTENDED</th><th>ROUTE</th>';
    periods.forEach(function (pk) {
      h += '<th>' + labelFor(pk, mode, allRows) + '</th>';
    });
    h += '<th class="rm-th-trend">' + trendLabel + '</th></tr></thead><tbody>';

    let specialStarted = false;
    blocks.forEach(function (b) {
      if (b.special && !specialStarted) {
        specialStarted = true;
        h += '<tr class="rm-special-sep"><td colspan="' + (periods.length + 3) +
          '">TWO DROPS / BACKLOAD</td></tr>';
      }
      const specialCls = b.special ? ' rm-special-region' : '';
      h += '<tr class="rm-region-row' + specialCls + '">';
      h += '<td class="rm-region"><strong>' + b.region + '</strong></td><td class="rm-muted">—</td>';
      periods.forEach(function (pk) {
        const rate = b.regionRates[pk];
        const c = rateColor(rate, scope.target);
        h += '<td class="rm-rate' + (rate == null ? ' rm-blank' : '') +
          '" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' + fmtPct(rate) + '</td>';
      });
      const ti = trendInfo(b.regionSeries);
      h += '<td class="rm-trend ' + ti.cls + '">' + (ti.text || '') + '</td></tr>';
      b.routes.forEach(function (rr) {
        h += '<tr' + (b.special ? ' class="rm-special-region"' : '') + '>';
        h += '<td class="rm-muted"></td><td class="rm-route-name">' + rr.route + '</td>';
        periods.forEach(function (pk) {
          const rate = rr.rates[pk];
          const c = rateColor(rate, scope.target);
          h += '<td class="rm-rate' + (rate == null ? ' rm-blank' : '') +
            '" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' + fmtPct(rate) + '</td>';
        });
        const rti = trendInfo(rr.series);
        h += '<td class="rm-trend ' + rti.cls + '">' + (rti.text || '') + '</td></tr>';
      });
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  const rmChartInstances = {};

  function destroyRmCharts() {
    Object.keys(rmChartInstances).forEach(function (k) {
      try { rmChartInstances[k].destroy(); } catch (e) {}
      delete rmChartInstances[k];
    });
  }

  function paintScopeCharts(rows) {
    if (typeof Chart === 'undefined') return;
    destroyRmCharts();
    SCOPES.forEach(function (scope) {
      const canvas = document.getElementById('rmChart_' + scope.id);
      if (!canvas) return;
      const matrix = buildMatrix(rows, scope.id);
      if (!matrix.periods.length) return;
      const labels = matrix.periods.map(function (pk) {
        return shortLabel(pk, mode, rows).top.replace(' RATE', '');
      });
      const data = matrix.periods.map(function (pk) {
        const v = matrix.rates[pk];
        return v == null ? null : +(v * 100).toFixed(2);
      });
      const targetPct = Math.round(scope.target * 100);
      const nums = data.filter(function (v) { return v != null; });
      const yMin = nums.length ? Math.max(0, Math.min.apply(null, nums.concat([targetPct])) - 8) : 70;
      rmChartInstances[scope.id] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: scope.head,
              data: data,
              borderColor: '#E60012',
              backgroundColor: 'rgba(230,0,18,0.10)',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#E60012',
              tension: 0.25,
              spanGaps: false
            },
            {
              label: 'Target ' + targetPct + '%',
              data: labels.map(function () { return targetPct; }),
              borderColor: '#2E7D32',
              borderWidth: 1.5,
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
            title: {
              display: true,
              text: scope.head,
              color: '#C00000',
              font: { size: 13, weight: 'bold' }
            }
          },
          scales: {
            y: {
              title: { display: true, text: 'On-time %', font: { size: 10 } },
              suggestedMin: yMin,
              suggestedMax: 100,
              ticks: { font: { size: 10 } }
            },
            x: { ticks: { font: { size: 9 }, maxRotation: 45 } }
          }
        }
      });
    });
  }

  function render() {
    const el = document.getElementById('rmView');
    if (!el) return;
    const rows = getRows(mode);
    destroyRmCharts();
    if (!rows.length) {
      el.innerHTML = '<p class="section-note">Upload a Branchline workbook first.</p>';
      return;
    }
    let html = '';
    if (matrixView === 'route') {
      [SCOPES[1], SCOPES[2]].forEach(function (scope) {
        html += renderRouteBlock(scope, buildRouteMatrix(rows, scope.id), rows);
      });
    } else if (matrixView === 'dc') {
      SCOPES.forEach(function (scope) {
        html += renderDcBlock(scope, buildDcMatrix(rows, scope.id), rows);
      });
    } else {
      SCOPES.forEach(function (scope) {
        html += renderScopeBlock(scope, buildMatrix(rows, scope.id), rows);
      });
      html += '<div class="rm-charts-row">';
      SCOPES.forEach(function (scope) {
        html += '<div class="rm-chart-card"><div class="chart-wrap rm-chart-wrap">' +
          '<canvas id="rmChart_' + scope.id + '"></canvas></div></div>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
    if (matrixView !== 'route') {
      setTimeout(function () { paintScopeCharts(rows); }, 30);
    }
  }

  const BORDER = {
    top: { style: 'thin', color: { rgb: '8B0000' } },
    bottom: { style: 'thin', color: { rgb: '8B0000' } },
    left: { style: 'thin', color: { rgb: '8B0000' } },
    right: { style: 'thin', color: { rgb: '8B0000' } }
  };
  function titleStyle() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'C00000' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER
    };
  }
  function headStyle() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'C00000' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER
    };
  }
  function rateCellStyle(rate, target) {
    const c = rateColor(rate, target);
    return {
      fill: { patternType: 'solid', fgColor: { rgb: c.bg } },
      font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: c.fg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      numFmt: '0.00%',
      border: BORDER
    };
  }
  function trendCellStyle(ti) {
    let fg = '616161', bg = 'FFFFFF';
    if (ti.dir > 0) { fg = '1B5E20'; bg = 'E8F5E9'; }
    if (ti.dir < 0) { fg = 'B71C1C'; bg = 'FFEBEE'; }
    return {
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: fg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER
    };
  }
  function blankStyle() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
      border: BORDER,
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  function applySheetStyles(ws, pack) {
    ws['!merges'] = pack.merges || [];
    const n = Math.max(8, (pack.periods || []).length + 2, pack.colCount || 0);
    ws['!cols'] = Array(n).fill({ wch: 14 });
    Object.keys(pack.styles || {}).forEach(function (key) {
      const parts = key.split('_');
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      const ref = XLSX.utils.encode_cell({ r: r, c: c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = pack.styles[key];
      if (ws[ref].v == null) { ws[ref].v = ''; ws[ref].t = 's'; }
    });
  }

  function buildSummaryBoardAoA(forMode) {
    const rows = getRows(forMode);
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }
    const allPeriods = periodKeys(rows);
    const trendLabel = forMode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';

    SCOPES.forEach(function (scope, si) {
      if (si > 0) aoa.push([]);

      const scoped = filterScope(rows, scope.id);
      const rates = {};
      allPeriods.forEach(function (pk) {
        rates[pk] = periodRate(scoped.filter(function (r) { return r.period === pk; }));
      });
      const series = allPeriods.map(function (pk) { return rates[pk]; });
      const ti = trendInfo(series);
      const colCount = allPeriods.length + 1;

      const titleRow = aoa.length;
      const titleCells = [scope.head];
      for (let i = 1; i < colCount; i++) titleCells.push('');
      aoa.push(titleCells);
      merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: colCount - 1 } });
      for (let c = 0; c < colCount; c++) setS(titleRow, c, titleStyle());

      const headRow = aoa.length;
      const head = allPeriods.map(function (pk) { return labelFor(pk, forMode, rows); });
      head.push(trendLabel);
      aoa.push(head);
      for (let c = 0; c < head.length; c++) setS(headRow, c, headStyle());

      const dataRow = aoa.length;
      const rowVals = allPeriods.map(function (pk) {
        return rates[pk] == null ? '' : rates[pk];
      });
      rowVals.push(ti.text || '');
      aoa.push(rowVals);
      allPeriods.forEach(function (pk, i) {
        if (rates[pk] == null) setS(dataRow, i, blankStyle());
        else setS(dataRow, i, rateCellStyle(rates[pk], scope.target));
      });
      setS(dataRow, allPeriods.length, trendCellStyle(ti));
    });

    return { aoa: aoa, merges: merges, styles: styles, periods: allPeriods, colCount: allPeriods.length + 1 };
  }

  function buildDetailSheetAoA(forMode) {
    const rows = getRows(forMode);
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }
    const trendLabel = forMode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';

    SCOPES.forEach(function (scope, si) {
      if (si > 0) { aoa.push([]); aoa.push([]); }
      const scoped = filterScope(rows, scope.id);
      const periods = periodKeys(scoped);
      const rates = {};
      periods.forEach(function (pk) {
        rates[pk] = periodRate(scoped.filter(function (r) { return r.period === pk; }));
      });
      const series = periods.map(function (pk) { return rates[pk]; });
      const ti = trendInfo(series);
      const colCount = Math.max(periods.length + 1, 2);

      const titleRow = aoa.length;
      const titleCells = [scope.head];
      for (let i = 1; i < colCount; i++) titleCells.push('');
      aoa.push(titleCells);
      merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: colCount - 1 } });
      for (let c = 0; c < colCount; c++) setS(titleRow, c, titleStyle());

      const headRow = aoa.length;
      const head = periods.map(function (pk) { return labelFor(pk, forMode, rows); });
      head.push(trendLabel);
      while (head.length < colCount) head.push('');
      aoa.push(head);
      for (let c = 0; c < head.length; c++) setS(headRow, c, headStyle());

      const dataRow = aoa.length;
      const rowVals = periods.map(function (pk) { return rates[pk] == null ? '' : rates[pk]; });
      rowVals.push(ti.text || '');
      aoa.push(rowVals);
      periods.forEach(function (pk, i) {
        if (rates[pk] == null) setS(dataRow, i, blankStyle());
        else setS(dataRow, i, rateCellStyle(rates[pk], scope.target));
      });
      setS(dataRow, periods.length, trendCellStyle(ti));
    });

    return { aoa: aoa, merges: merges, styles: styles, periods: periodKeys(rows) };
  }

  function buildRouteSheetAoA(forMode, scopeId) {
    const rows = getRows(forMode);
    const scope = SCOPES.find(function (s) { return s.id === scopeId; });
    const matrix = buildRouteMatrix(rows, scopeId);
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }
    const colCount = Math.max(matrix.periods.length + 3, 4);
    const trendLabel = forMode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';

    const titleCells = [scope.head + ' · BY ROUTE'];
    for (let i = 1; i < colCount; i++) titleCells.push('');
    aoa.push(titleCells);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
    for (let c = 0; c < colCount; c++) setS(0, c, titleStyle());

    const head = ['REGION', 'ROUTE'].concat(
      matrix.periods.map(function (pk) { return labelFor(pk, forMode, rows); })
    ).concat([trendLabel]);
    aoa.push(head);
    head.forEach(function (_, c) { setS(1, c, headStyle()); });

    let r = 2;
    let specialStarted = false;
    matrix.blocks.forEach(function (b) {
      if (b.special && !specialStarted) {
        specialStarted = true;
        const sep = ['TWO DROPS / BACKLOAD'];
        for (let i = 1; i < colCount; i++) sep.push('');
        aoa.push(sep);
        merges.push({ s: { r: r, c: 0 }, e: { r: r, c: colCount - 1 } });
        for (let c = 0; c < colCount; c++) {
          setS(r, c, {
            fill: { patternType: 'solid', fgColor: { rgb: 'FFF3E0' } },
            font: { bold: true, sz: 9, color: { rgb: 'E65100' }, name: 'Calibri' },
            border: BORDER
          });
        }
        r++;
      }
      const regRow = [b.region, '—'].concat(
        matrix.periods.map(function (pk) {
          const v = b.regionRates[pk];
          return v == null ? '' : v;
        })
      ).concat([trendInfo(b.regionSeries).text || '']);
      aoa.push(regRow);
      setS(r, 0, {
        font: { bold: true, sz: 10, name: 'Calibri' },
        fill: { patternType: 'solid', fgColor: { rgb: b.special ? 'FFF8E1' : 'F5F5F5' } },
        border: BORDER
      });
      setS(r, 1, { border: BORDER });
      matrix.periods.forEach(function (pk, i) {
        const v = b.regionRates[pk];
        setS(r, 2 + i, v == null ? blankStyle() : rateCellStyle(v, scope.target));
      });
      setS(r, 2 + matrix.periods.length, trendCellStyle(trendInfo(b.regionSeries)));
      r++;
      b.routes.forEach(function (rr) {
        const row = ['', rr.route].concat(
          matrix.periods.map(function (pk) {
            const v = rr.rates[pk];
            return v == null ? '' : v;
          })
        ).concat([trendInfo(rr.series).text || '']);
        aoa.push(row);
        setS(r, 0, { border: BORDER });
        setS(r, 1, { border: BORDER, font: { sz: 9, name: 'Calibri' } });
        matrix.periods.forEach(function (pk, i) {
          const v = rr.rates[pk];
          setS(r, 2 + i, v == null ? blankStyle() : rateCellStyle(v, scope.target));
        });
        setS(r, 2 + matrix.periods.length, trendCellStyle(trendInfo(rr.series)));
        r++;
      });
    });
    return { aoa: aoa, merges: merges, styles: styles, periods: matrix.periods };
  }

  function renderTrendChartPng(scope, forMode) {
    return new Promise(function (resolve) {
      if (typeof Chart === 'undefined') { resolve(null); return; }
      const rows = getRows(forMode);
      const matrix = buildMatrix(rows, scope.id);
      const labels = matrix.periods.map(function (pk) {
        return shortLabel(pk, forMode, rows).top.replace(' RATE', '');
      });
      const data = matrix.periods.map(function (pk) {
        const v = matrix.rates[pk];
        return v == null ? null : +(v * 100).toFixed(2);
      });
      const targetPct = Math.round(scope.target * 100);
      const nums = data.filter(function (v) { return v != null; });
      const yMin = nums.length ? Math.max(0, Math.min.apply(null, nums.concat([targetPct])) - 8) : 70;

      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 360;
      canvas.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(canvas);

      const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: scope.head,
              data: data,
              borderColor: '#E60012',
              backgroundColor: 'rgba(230,0,18,0.08)',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#E60012',
              tension: 0.25,
              spanGaps: false
            },
            {
              label: 'Target ' + targetPct + '%',
              data: labels.map(function () { return targetPct; }),
              borderColor: '#2E7D32',
              borderWidth: 1.5,
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            title: {
              display: true,
              text: scope.head + (forMode === 'weekly' ? ' — Weekly Trend' : ' — Monthly Trend'),
              font: { size: 16, weight: 'bold' },
              color: '#C00000'
            },
            legend: { position: 'bottom' }
          },
          scales: {
            y: {
              title: { display: true, text: 'On-time %' },
              suggestedMin: yMin,
              suggestedMax: 100
            }
          }
        }
      });

      setTimeout(function () {
        try {
          const url = canvas.toDataURL('image/png');
          chart.destroy();
          document.body.removeChild(canvas);
          resolve({ name: scope.head, dataUrl: url, scopeId: scope.id });
        } catch (e) {
          try { chart.destroy(); } catch (_) {}
          try { document.body.removeChild(canvas); } catch (_) {}
          resolve(null);
        }
      }, 100);
    });
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function dataUrlToArrayBuffer(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function loadExcelJS() {
    return new Promise(function (resolve, reject) {
      if (window.ExcelJS) { resolve(window.ExcelJS); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = function () { resolve(window.ExcelJS); };
      s.onerror = function () { reject(new Error('Failed to load ExcelJS')); };
      document.head.appendChild(s);
    });
  }

  function downloadExcelBuffer(buffer, filename) {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function styleExcelJsCell(cell, st) {
    if (!st) return;
    if (st.fill && st.fill.fgColor && st.fill.fgColor.rgb) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + st.fill.fgColor.rgb }
      };
    }
    if (st.font) {
      cell.font = {
        bold: !!st.font.bold,
        size: st.font.sz || 10,
        name: st.font.name || 'Calibri',
        color: st.font.color && st.font.color.rgb
          ? { argb: 'FF' + st.font.color.rgb }
          : undefined
      };
    }
    if (st.alignment) {
      cell.alignment = {
        horizontal: st.alignment.horizontal || 'center',
        vertical: st.alignment.vertical || 'middle',
        wrapText: !!st.alignment.wrapText
      };
    }
    if (st.numFmt) cell.numFmt = st.numFmt;
    if (st.border) {
      const edge = function (side) {
        const b = st.border[side];
        if (!b) return undefined;
        return {
          style: b.style || 'thin',
          color: { argb: 'FF' + ((b.color && b.color.rgb) || '8B0000') }
        };
      };
      cell.border = {
        top: edge('top'),
        bottom: edge('bottom'),
        left: edge('left'),
        right: edge('right')
      };
    }
  }

  function packToExcelJsSheet(wb, pack, sheetName) {
    const ws = wb.addWorksheet(sheetName.slice(0, 31));
    const aoa = pack.aoa || [];
    aoa.forEach(function (row, r) {
      row.forEach(function (val, c) {
        const cell = ws.getCell(r + 1, c + 1);
        if (val === '' || val == null) {
          cell.value = null;
        } else if (typeof val === 'number') {
          cell.value = val;
        } else {
          cell.value = val;
        }
        const st = pack.styles && pack.styles[r + '_' + c];
        styleExcelJsCell(cell, st);
      });
    });
    (pack.merges || []).forEach(function (m) {
      ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1);
    });
    const cols = Math.max(8, (pack.periods || []).length + 2, pack.colCount || 0);
    for (let i = 1; i <= cols; i++) ws.getColumn(i).width = 14;
    return ws;
  }

  async function addChartsSheet(wb, forMode, title) {
    const imgs = await Promise.all(
      SCOPES.map(function (s) { return renderTrendChartPng(s, forMode); })
    );
    const ws = wb.addWorksheet(title.slice(0, 31));
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFC00000' } };
    let rowCursor = 3;
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (!img || !img.dataUrl) continue;
      const imageId = wb.addImage({
        buffer: dataUrlToArrayBuffer(img.dataUrl),
        extension: 'png'
      });
      ws.addImage(imageId, {
        tl: { col: 0, row: rowCursor - 1 },
        ext: { width: 720, height: 288 }
      });
      rowCursor += 16;
    }
    ws.getColumn(1).width = 20;
    return imgs;
  }

  async function exportSummaryBoard() {
    const rows = getRows('weekly');
    if (!rows.length) { alert('No branchline data to export.'); return; }
    try {
      const ExcelJS = await loadExcelJS();
      const wb = new ExcelJS.Workbook();
      packToExcelJsSheet(wb, buildSummaryBoardAoA('weekly'), 'Weekly');
      packToExcelJsSheet(wb, buildSummaryBoardAoA('monthly'), 'Monthly');
      await addChartsSheet(wb, 'weekly', 'Weekly Charts');
      await addChartsSheet(wb, 'monthly', 'Monthly Charts');
      const buffer = await wb.xlsx.writeBuffer();
      downloadExcelBuffer(buffer, 'BRANCHLINE_TRAVEL_TIME_SUMMARY_BOARD.xlsx');
    } catch (err) {
      console.error(err);
      // Fallback: SheetJS without embedded charts
      const wb = XLSX.utils.book_new();
      const weeklyPack = buildSummaryBoardAoA('weekly');
      const wsW = XLSX.utils.aoa_to_sheet(weeklyPack.aoa);
      applySheetStyles(wsW, weeklyPack);
      XLSX.utils.book_append_sheet(wb, wsW, 'Weekly');
      const monthlyPack = buildSummaryBoardAoA('monthly');
      const wsM = XLSX.utils.aoa_to_sheet(monthlyPack.aoa);
      applySheetStyles(wsM, monthlyPack);
      XLSX.utils.book_append_sheet(wb, wsM, 'Monthly');
      XLSX.writeFile(wb, 'BRANCHLINE_TRAVEL_TIME_SUMMARY_BOARD.xlsx');
      alert('Excel saved. Chart embed unavailable — check network for ExcelJS CDN.');
    }
  }

  async function exportOriginalWithGraphs() {
    const rows = getRows('weekly');
    if (!rows.length) { alert('No branchline data to export.'); return; }
    try {
      const ExcelJS = await loadExcelJS();
      const wb = new ExcelJS.Workbook();
      packToExcelJsSheet(wb, buildDetailSheetAoA('weekly'), 'Weekly');
      packToExcelJsSheet(wb, buildDetailSheetAoA('monthly'), 'Monthly');
      ['BULK', 'COLLECTION'].forEach(function (sid) {
        const nameW = sid === 'BULK' ? 'Bulk Routes Weekly' : 'Collection Routes Weekly';
        const nameM = sid === 'BULK' ? 'Bulk Routes Monthly' : 'Collection Routes Monthly';
        packToExcelJsSheet(wb, buildRouteSheetAoA('weekly', sid), nameW);
        packToExcelJsSheet(wb, buildRouteSheetAoA('monthly', sid), nameM);
      });
      await addChartsSheet(wb, 'weekly', 'Weekly Charts');
      await addChartsSheet(wb, 'monthly', 'Monthly Charts');
      const buffer = await wb.xlsx.writeBuffer();
      downloadExcelBuffer(buffer, 'BRANCHLINE_TRAVEL_TIME_DETAILED.xlsx');
    } catch (err) {
      console.error(err);
      const wb = XLSX.utils.book_new();
      const weeklyPack = buildDetailSheetAoA('weekly');
      const wsW = XLSX.utils.aoa_to_sheet(weeklyPack.aoa);
      applySheetStyles(wsW, weeklyPack);
      XLSX.utils.book_append_sheet(wb, wsW, 'Weekly');
      const monthlyPack = buildDetailSheetAoA('monthly');
      const wsM = XLSX.utils.aoa_to_sheet(monthlyPack.aoa);
      applySheetStyles(wsM, monthlyPack);
      XLSX.utils.book_append_sheet(wb, wsM, 'Monthly');
      XLSX.writeFile(wb, 'BRANCHLINE_TRAVEL_TIME_DETAILED.xlsx');
      alert('Excel saved without embedded charts. Check network for ExcelJS CDN.');
    }
  }

  function closeExportModal() {
    const m = document.getElementById('rmExportModal');
    if (m) m.classList.add('hidden');
  }

  function openExportModal() {
    let m = document.getElementById('rmExportModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'rmExportModal';
      m.className = 'rm-export-modal';
      m.innerHTML =
        '<div class="rm-export-panel" role="dialog" aria-modal="true">' +
          '<div class="rm-export-bar">' +
            '<h3>Export</h3>' +
            '<button type="button" class="rm-export-close" id="rmExportClose">✕</button>' +
          '</div>' +
          '<div class="rm-export-choices">' +
            '<button type="button" class="rm-export-choice" data-rm-fmt="summary">' +
              '<img class="rm-export-preview" src="layout1.png" alt="Layout 1"' +
                ' onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">' +
              '<span class="rm-export-fallback" style="display:none">Layout 1</span>' +
              '<span class="rm-export-choice-title">Layout 1 · Summary Board</span>' +
            '</button>' +
            '<button type="button" class="rm-export-choice" data-rm-fmt="original">' +
              '<img class="rm-export-preview" src="layout2.png" alt="Layout 2"' +
                ' onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">' +
              '<span class="rm-export-fallback" style="display:none">Layout 2</span>' +
              '<span class="rm-export-choice-title">Layout 2 · Detailed + Graphs</span>' +
            '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(m);
      m.addEventListener('click', function (e) {
        if (e.target === m) closeExportModal();
      });
      m.querySelector('#rmExportClose').addEventListener('click', closeExportModal);
      m.querySelectorAll('[data-rm-fmt]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const fmt = btn.getAttribute('data-rm-fmt');
          closeExportModal();
          if (fmt === 'summary') exportSummaryBoard();
          else exportOriginalWithGraphs();
        });
      });
    }
    m.classList.remove('hidden');
  }

  function exportExcel() { openExportModal(); }

  function setMode(next) {
    mode = next === 'monthly' ? 'monthly' : 'weekly';
    periodFrom = '';
    periodTo = '';
    document.querySelectorAll('.rm-subtab[data-rm-mode]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.rmMode === mode);
    });
    refreshPeriodSelect();
    updateFilterNote();
    render();
  }
  function setMatrixView(next) {
    matrixView = next === 'route' ? 'route' : 'scope';
    document.querySelectorAll('.rm-viewtab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.rmView === matrixView);
    });
    render();
  }

  function init() {
    document.querySelectorAll('.rm-subtab[data-rm-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.rmMode); });
    });
    document.querySelectorAll('.rm-viewtab').forEach(function (btn) {
      btn.addEventListener('click', function () { setMatrixView(btn.dataset.rmView); });
    });
    function onRangeChange() {
      const fromSel = document.getElementById('rmPeriodFrom');
      const toSel = document.getElementById('rmPeriodTo');
      periodFrom = (fromSel && fromSel.value) || '';
      periodTo = (toSel && toSel.value) || '';
      // If from > to, swap for a sensible range
      if (periodFrom && periodTo && periodFrom > periodTo) {
        const tmp = periodFrom;
        periodFrom = periodTo;
        periodTo = tmp;
        if (fromSel) fromSel.value = periodFrom;
        if (toSel) toSel.value = periodTo;
      }
      updateFilterNote();
      render();
    }
    const fromSel = document.getElementById('rmPeriodFrom');
    const toSel = document.getElementById('rmPeriodTo');
    if (fromSel) fromSel.addEventListener('change', onRangeChange);
    if (toSel) toSel.addEventListener('change', onRangeChange);
    const exp = document.getElementById('btnRmExport');
    if (exp) exp.addEventListener('click', exportExcel);
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (tab.dataset.tab === 'tabRateMatrix') {
          setTimeout(function () {
            refreshPeriodSelect();
            updateFilterNote();
            render();
          }, 40);
        }
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeExportModal();
    });
  }

  function onDataReady() {
    refreshPeriodSelect();
    updateFilterNote();
    render();
  }

  return { init, render, onDataReady, exportExcel };
})();
