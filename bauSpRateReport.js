/* ==========================================================================
   MODULE: BAU SP APP USED RATES REPORT
   Service Partners daily / weekly / monthly rate matrix
   Week filter selects current week; prior week used for weekly difference
   Rows with negative weekly difference are highlighted
   ========================================================================== */
const BauSpRateReport = (() => {
  const { stats, TARGET, resolveDcName } = BauUtils;

  let bound = false;
  let availableWeeks = []; // newest first

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Sunday–Saturday week + week number */
  function getWeekInfo(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    if (isNaN(d)) return null;
    const toKey = (dt) => dt.getUTCFullYear() + '-' +
      String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getUTCDate()).padStart(2, '0');
    const base = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = base.getUTCDay();
    const sunday = new Date(base);
    sunday.setUTCDate(base.getUTCDate() - dow);
    const saturday = new Date(sunday);
    saturday.setUTCDate(sunday.getUTCDate() + 6);
    const mid = new Date(sunday);
    mid.setUTCDate(sunday.getUTCDate() + 3);
    const yearForLabel = mid.getUTCFullYear();
    const monthForLabel = mid.getUTCMonth();
    const jan1 = new Date(Date.UTC(yearForLabel, 0, 1));
    const firstSunday = new Date(jan1);
    firstSunday.setUTCDate(1 - jan1.getUTCDay());
    const weekNo = Math.floor((sunday - firstSunday) / 86400000 / 7) + 1;
    const firstOfMonth = new Date(Date.UTC(yearForLabel, monthForLabel, 1));
    const firstSunOfMonth = new Date(firstOfMonth);
    firstSunOfMonth.setUTCDate(1 - firstOfMonth.getUTCDay());
    const weekOfMonth = Math.floor((sunday - firstSunOfMonth) / 86400000 / 7) + 1;
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      id: yearForLabel + '-W' + String(weekNo).padStart(2, '0'),
      weekNo,
      year: yearForLabel,
      startKey: toKey(sunday),
      endKey: toKey(saturday),
      label: 'Week ' + weekOfMonth + ' (WK' + weekNo + ') · ' + months[monthForLabel] + ' ' + yearForLabel +
        ' · ' + toKey(sunday) + ' → ' + toKey(saturday)
    };
  }

  function shortDateLabel(dateKey) {
    const parts = String(dateKey).split('-');
    if (parts.length !== 3) return dateKey;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mi = parseInt(parts[1], 10) - 1;
    return parseInt(parts[2], 10) + '-' + (months[mi] || parts[1]);
  }

  function rateCellClass(rate) {
    if (rate == null || isNaN(rate)) return '';
    if (rate >= TARGET) return 'sp-rate-good';
    if (rate >= TARGET - 0.03) return 'sp-rate-warn';
    return 'sp-rate-bad';
  }

  function fmtRate(rate) {
    if (rate == null || isNaN(rate)) return '—';
    return (rate * 100).toFixed(2) + '%';
  }

  function fmtDiff(pp) {
    if (pp == null || isNaN(pp)) return '—';
    const sign = pp > 0 ? '+' : '';
    return sign + (pp * 100).toFixed(2) + '%';
  }

  function getAllRows() {
    const { storedRows } = BauFileProcessor.getState();
    return storedRows || [];
  }

  function getDates() {
    const { storedDates } = BauFileProcessor.getState();
    return (storedDates || []).slice();
  }

  function listWeeksFromDates(dates) {
    const map = {};
    (dates || []).forEach(dk => {
      const info = getWeekInfo(dk);
      if (!info) return;
      if (!map[info.id]) map[info.id] = info;
    });
    return Object.values(map).sort((a, b) => b.startKey.localeCompare(a.startKey));
  }

  function primaryDcBySp(rows) {
    const map = {};
    rows.forEach(r => {
      const sp = r.sp || '(blank)';
      const code = r.dcIntended || '';
      if (!map[sp]) map[sp] = {};
      map[sp][code] = (map[sp][code] || 0) + 1;
    });
    const out = {};
    Object.keys(map).forEach(sp => {
      const codes = Object.entries(map[sp]).sort((a, b) => b[1] - a[1]);
      const pick = codes.find(c => c[0] && c[0] !== '(blank)') || codes[0];
      out[sp] = pick ? pick[0] : '';
    });
    return out;
  }

  function rateFor(rows) {
    return stats(rows).rate;
  }

  function selectedWeekId() {
    const sel = document.getElementById('bauReportWeekFilter');
    return sel ? sel.value : null;
  }

  function populateWeekFilter(preferDate) {
    const sel = document.getElementById('bauReportWeekFilter');
    const hint = document.getElementById('bauReportWeekHint');
    if (!sel) return;

    const dates = getDates();
    availableWeeks = listWeeksFromDates(dates);

    if (!availableWeeks.length) {
      sel.innerHTML = '<option value="">No weeks in data</option>';
      if (hint) hint.textContent = '';
      return;
    }

    const prevVal = sel.value;
    sel.innerHTML = availableWeeks.map(w =>
      '<option value="' + w.id + '">' + escapeHtml(w.label) + '</option>'
    ).join('');

    // Prefer: existing selection, week of preferDate, else newest week
    let pick = null;
    if (prevVal && availableWeeks.some(w => w.id === prevVal)) pick = prevVal;
    else if (preferDate && preferDate !== 'ALL') {
      const info = getWeekInfo(preferDate);
      if (info && availableWeeks.some(w => w.id === info.id)) pick = info.id;
    }
    if (!pick) pick = availableWeeks[0].id;
    sel.value = pick;

    const curr = availableWeeks.find(w => w.id === pick);
    const idx = availableWeeks.findIndex(w => w.id === pick);
    // availableWeeks is newest-first; prior week is next index
    const prev = idx >= 0 && idx < availableWeeks.length - 1 ? availableWeeks[idx + 1] : null;
    if (hint) {
      if (curr && prev) {
        hint.textContent = 'Comparing WK' + curr.weekNo + ' vs WK' + prev.weekNo + ' (prior week)';
      } else if (curr) {
        hint.textContent = 'WK' + curr.weekNo + ' · no prior week in data';
      } else {
        hint.textContent = '';
      }
    }
  }

  function resolvePeriodLocal() {
    // Prefer shared filter from BauDcRateReport (supports free week/daily compare)
    if (typeof BauDcRateReport !== 'undefined' && BauDcRateReport.getResolvedPeriod) {
      return BauDcRateReport.getResolvedPeriod();
    }
    const dates = getDates();
    const weeks = availableWeeks.length ? availableWeeks : listWeeksFromDates(dates);
    const weekId = selectedWeekId() || (weeks[0] && weeks[0].id);
    const weekIdx = weeks.findIndex(w => w.id === weekId);
    const weekCurr = weekIdx >= 0 ? weeks[weekIdx] : weeks[0];
    const weekPrev = weekIdx >= 0 && weekIdx < weeks.length - 1 ? weeks[weekIdx + 1] : null;
    const dailyDates = weekCurr
      ? dates.filter(d => d >= weekCurr.startKey && d <= weekCurr.endKey)
      : [];
    return {
      mode: 'week',
      focusDay: dailyDates.length ? dailyDates[dailyDates.length - 1] : null,
      dailyDates,
      weekCurr,
      weekPrev,
      focusMonth: weekCurr ? weekCurr.endKey.slice(0, 7) : null,
      currStart: weekCurr ? weekCurr.startKey : null,
      currEnd: weekCurr ? weekCurr.endKey : null,
      prevStart: weekPrev ? weekPrev.startKey : null,
      prevEnd: weekPrev ? weekPrev.endKey : null,
      compareDay: null
    };
  }

  function buildReport() {
    const all = getAllRows();
    const dates = getDates();
    if (!all.length || !dates.length) return null;

    const p = resolvePeriodLocal();
    if (!p.currStart && !p.focusDay) return null;

    const dailyDates = p.dailyDates || [];
    const focusMonth = p.focusMonth;
    const monthRows = focusMonth
      ? all.filter(r => r.dateKey && r.dateKey.startsWith(focusMonth))
      : [];

    const dcBySp = primaryDcBySp(all);
    const sps = [...new Set(all.map(r => r.sp || '(blank)'))].sort((a, b) => a.localeCompare(b));

    const rows = sps.map(sp => {
      const spAll = all.filter(r => (r.sp || '(blank)') === sp);

      const dailyRates = dailyDates.map(dk => {
        const dayRows = spAll.filter(r => r.dateKey === dk);
        return dayRows.length ? rateFor(dayRows) : null;
      });

      let dailyGap = null;
      if (p.mode === 'daily' && p.focusDay && p.compareDay) {
        const a = rateFor(spAll.filter(r => r.dateKey === p.focusDay));
        const b = rateFor(spAll.filter(r => r.dateKey === p.compareDay));
        if (a != null && b != null) dailyGap = a - b;
      } else {
        const lastIdx = dailyRates.length - 1;
        if (lastIdx >= 1 && dailyRates[lastIdx] != null && dailyRates[lastIdx - 1] != null) {
          dailyGap = dailyRates[lastIdx] - dailyRates[lastIdx - 1];
        }
      }

      let weekPrevRate = null;
      let weekCurrRate = null;
      if (p.prevStart && p.prevEnd) {
        const wr = spAll.filter(r => r.dateKey >= p.prevStart && r.dateKey <= p.prevEnd);
        if (wr.length) weekPrevRate = rateFor(wr);
      }
      if (p.currStart && p.currEnd) {
        const wr = spAll.filter(r => r.dateKey >= p.currStart && r.dateKey <= p.currEnd);
        if (wr.length) weekCurrRate = rateFor(wr);
      }
      const weeklyDiff = (weekCurrRate != null && weekPrevRate != null)
        ? weekCurrRate - weekPrevRate
        : null;

      const mRows = monthRows.filter(r => (r.sp || '(blank)') === sp);
      const mStats = stats(mRows);
      const dcCode = dcBySp[sp] || '';
      const dcDisplay = dcCode && dcCode !== '(blank)' ? dcCode : '—';

      return {
        sp,
        dcCode: dcDisplay,
        dailyRates,
        dailyGap,
        weekPrevRate,
        weekCurrRate,
        weeklyDiff,
        noDeparture: mStats.coutNo,
        noArrival: mStats.cinNo,
        totalAppUsed: mStats.yes,
        grandTotal: mStats.total,
        monthRate: mStats.rate,
        negWeekly: weeklyDiff != null && weeklyDiff < -0.00005
      };
    }).filter(r => r.grandTotal > 0 || r.dailyRates.some(x => x != null) || r.weekCurrRate != null);

    rows.sort((a, b) => {
      if (a.negWeekly !== b.negWeekly) return a.negWeekly ? -1 : 1;
      if (a.weeklyDiff != null && b.weeklyDiff != null && a.weeklyDiff !== b.weeklyDiff) {
        return a.weeklyDiff - b.weeklyDiff;
      }
      return a.sp.localeCompare(b.sp);
    });

    return {
      period: p,
      dailyDates,
      weekPrev: p.weekPrev,
      weekCurr: p.weekCurr,
      focusMonth,
      rows,
      negCount: rows.filter(r => r.negWeekly).length
    };
  }

  function drawTable() {
    const body = document.getElementById('tbodySpRateReport');
    const thead = document.getElementById('theadSpRateReport');
    const note = document.getElementById('spRateReportNote');
    if (!body || !thead) return;

    const report = buildReport();
    if (!report) {
      thead.innerHTML = '';
      body.innerHTML = '<tr><td colspan="20" style="text-align:center;color:#757575;">Upload data to see SP App Used Rates</td></tr>';
      if (note) note.textContent = '';
      return;
    }

    const { period, dailyDates, weekPrev, weekCurr, focusMonth, rows, negCount } = report;
    const p = period || {};

    const dailyHeaders = dailyDates.map(d =>
      '<th class="sp-th-daily">' + escapeHtml(shortDateLabel(d)) + '</th>'
    ).join('');
    let wPrevLabel = 'COMPARE';
    let wCurrLabel = 'CURRENT';
    if (p.mode === 'daily') {
      wPrevLabel = p.compareDay ? shortDateLabel(p.compareDay) : 'COMPARE';
      wCurrLabel = p.focusDay ? shortDateLabel(p.focusDay) : 'CURRENT';
    } else {
      wPrevLabel = weekPrev ? ('WEEK ' + weekPrev.weekNo) : 'COMPARE';
      wCurrLabel = weekCurr ? ('WEEK ' + weekCurr.weekNo) : 'CURRENT';
    }
    const monthLabel = focusMonth || '';
    const dailyColSpan = Math.max(dailyDates.length, 1);

    thead.innerHTML =
      '<tr class="sp-rate-group-row">' +
        '<th rowspan="2" class="sp-th-sp">SP</th>' +
        '<th rowspan="2" class="sp-th-dc">DC INTENDED</th>' +
        '<th colspan="' + dailyColSpan + '" class="sp-th-group-daily">DAILY TREND</th>' +
        '<th rowspan="2" class="sp-th-gap">GAP</th>' +
        '<th colspan="3" class="sp-th-group-week">RATE COMPARE</th>' +
        '<th colspan="5" class="sp-th-group-month">MONTHLY' +
          (monthLabel ? ' · ' + escapeHtml(monthLabel) : '') + '</th>' +
      '</tr>' +
      '<tr class="sp-rate-subhead">' +
        (dailyDates.length
          ? dailyHeaders
          : '<th class="sp-th-daily">—</th>') +
        '<th class="sp-th-week">' + escapeHtml(wPrevLabel) + '</th>' +
        '<th class="sp-th-week">' + escapeHtml(wCurrLabel) + '</th>' +
        '<th class="sp-th-week">DIFF</th>' +
        '<th class="sp-th-month">NO DEP</th>' +
        '<th class="sp-th-month">NO ARR</th>' +
        '<th class="sp-th-month">APP USED</th>' +
        '<th class="sp-th-month">TOTAL</th>' +
        '<th class="sp-th-month">RATE %</th>' +
      '</tr>';

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="20" style="text-align:center;color:#757575;">No SP data for this week</td></tr>';
      if (note) note.textContent = '';
      return;
    }

    body.innerHTML = rows.map(r => {
      const rowCls = r.negWeekly ? 'sp-row-neg-weekly' : '';
      let dailyCells;
      if (dailyDates.length) {
        dailyCells = r.dailyRates.map(rate =>
          '<td class="' + rateCellClass(rate) + '">' + fmtRate(rate) + '</td>'
        ).join('');
      } else {
        dailyCells = '<td>—</td>';
      }

      let gapCls = '';
      let gapHtml = '—';
      if (r.dailyGap != null) {
        gapCls = r.dailyGap < -0.00005 ? 'neg' : (r.dailyGap > 0.00005 ? 'pos' : '');
        const arrow = r.dailyGap < -0.00005 ? ' ↓' : (r.dailyGap > 0.00005 ? ' ↑' : '');
        gapHtml = fmtDiff(r.dailyGap) + arrow;
      }

      const wDiffCls = r.negWeekly ? 'neg sp-weekly-diff-neg' : (r.weeklyDiff != null && r.weeklyDiff > 0.00005 ? 'pos' : '');
      const wDiffHtml = r.weeklyDiff != null ? fmtDiff(r.weeklyDiff) : '—';

      return '<tr class="' + rowCls + '">' +
        '<td class="sp-name">' + escapeHtml(r.sp) + '</td>' +
        '<td>' + escapeHtml(r.dcCode) + '</td>' +
        dailyCells +
        '<td class="' + gapCls + '">' + gapHtml + '</td>' +
        '<td class="' + rateCellClass(r.weekPrevRate) + '">' + fmtRate(r.weekPrevRate) + '</td>' +
        '<td class="' + rateCellClass(r.weekCurrRate) + '">' + fmtRate(r.weekCurrRate) + '</td>' +
        '<td class="' + wDiffCls + '">' + wDiffHtml + '</td>' +
        '<td class="' + (r.noDeparture ? 'neg' : '') + '">' + r.noDeparture + '</td>' +
        '<td class="' + (r.noArrival ? 'neg' : '') + '">' + r.noArrival + '</td>' +
        '<td class="pos">' + r.totalAppUsed + '</td>' +
        '<td>' + r.grandTotal + '</td>' +
        '<td class="' + rateCellClass(r.monthRate) + '">' + fmtRate(r.monthRate) + '</td>' +
        '</tr>';
    }).join('');

    if (note) {
      let wTxt = '';
      if (p.mode === 'daily') {
        wTxt = (p.focusDay || '') + (p.compareDay ? ' vs ' + p.compareDay : '');
      } else {
        wTxt = (weekPrev && weekCurr)
          ? ('WK' + weekCurr.weekNo + ' vs WK' + weekPrev.weekNo)
          : (weekCurr ? ('WK' + weekCurr.weekNo) : '');
      }
      note.textContent = rows.length + ' SP · ' + wTxt +
        (negCount ? ' · ' + negCount + ' negative diff' : '');
    }
  }

  function render(preferDate) {
    // Shared filters are owned by BauDcRateReport; only populate if that module is absent
    if (typeof BauDcRateReport === 'undefined') {
      populateWeekFilter(preferDate);
    } else {
      const dates = getDates();
      availableWeeks = listWeeksFromDates(dates);
    }
    drawTable();
  }

  function onExternalFilterChange() {
    const dates = getDates();
    availableWeeks = listWeeksFromDates(dates);
    drawTable();
  }

  function init() {
    if (bound) return;
    bound = true;
    // Filter change handlers are owned by BauDcRateReport when present
    if (typeof BauDcRateReport === 'undefined') {
      const sel = document.getElementById('bauReportWeekFilter');
      if (sel) sel.addEventListener('change', () => {
        populateWeekFilter();
        drawTable();
      });
    }
  }

  return { init, render, drawTable, onExternalFilterChange };
})();
