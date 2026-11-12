/* ==========================================================================
   MODULE: BAU DC / BRANCHLINE APP USED RATES + BULK/COLLECTION + TOP CONTRIBUTORS
   Sheet A  → per-DC daily / weekly / monthly rate matrix
   Sheet B  → per-DC Bulk Cargo vs Collection vs Accumulated
   Top Contributors → detailed non-compliant (driver, DC, count, task IDs)
   Shared report filter: Week or Daily + free compare target
   ========================================================================== */
const BauDcRateReport = (() => {
  const { stats, TARGET, resolveDcName } = BauUtils;

  let bound = false;
  let availableWeeks = []; // newest first
  let availableDates = [];

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  function dcKey(r) {
    const code = r.dcIntended && r.dcIntended !== '(blank)' ? String(r.dcIntended).replace(/\.0$/, '') : '';
    if (code) return code;
    return r.dcName || '(blank)';
  }

  function dcDisplayName(code) {
    if (!code || code === '(blank)') return '(blank)';
    return resolveDcName(code);
  }

  function rateFor(rows) {
    return stats(rows).rate;
  }

  function isBulk(r) {
    return /bulk/i.test(r.lineType || '');
  }

  function isCollection(r) {
    return /collection/i.test(r.lineType || '');
  }

  /* ---------- Shared filter state ---------- */
  function filterMode() {
    const el = document.getElementById('bauReportModeFilter');
    return el ? el.value : 'week';
  }

  function selectedWeekId() {
    const sel = document.getElementById('bauReportWeekFilter');
    return sel ? sel.value : null;
  }

  function selectedCompareWeekId() {
    const sel = document.getElementById('bauReportCompareWeekFilter');
    return sel && sel.value ? sel.value : null;
  }

  function selectedDailyDate() {
    const sel = document.getElementById('bauReportDailyFilter');
    return sel ? sel.value : null;
  }

  function selectedCompareDailyDate() {
    const sel = document.getElementById('bauReportCompareDailyFilter');
    return sel && sel.value ? sel.value : null;
  }

  function setModeUI(mode) {
    const weekWrap = document.getElementById('bauReportWeekWrap');
    const dailyWrap = document.getElementById('bauReportDailyWrap');
    if (weekWrap) weekWrap.style.display = mode === 'daily' ? 'none' : 'flex';
    if (dailyWrap) dailyWrap.style.display = mode === 'daily' ? 'flex' : 'none';
  }

  function resolvePeriod() {
    const dates = getDates();
    const weeks = availableWeeks.length ? availableWeeks : listWeeksFromDates(dates);
    const mode = filterMode();

    if (mode === 'daily') {
      const focusDay = selectedDailyDate() || (dates.length ? dates[dates.length - 1] : null);
      let compareDay = selectedCompareDailyDate();
      if (!compareDay && focusDay) {
        const idx = dates.indexOf(focusDay);
        if (idx > 0) compareDay = dates[idx - 1];
      }
      const focusMonth = focusDay ? focusDay.slice(0, 7) : null;
      // For daily mode, daily trend = last 7 available dates ending at focusDay
      let dailyDates = [];
      if (focusDay) {
        const endIdx = dates.indexOf(focusDay);
        if (endIdx >= 0) {
          const startIdx = Math.max(0, endIdx - 6);
          dailyDates = dates.slice(startIdx, endIdx + 1);
        }
      }
      return {
        mode: 'daily',
        focusDay,
        compareDay,
        dailyDates,
        weekCurr: focusDay ? getWeekInfo(focusDay) : null,
        weekPrev: compareDay ? getWeekInfo(compareDay) : null,
        focusMonth,
        // For rate windows in daily mode: focus day vs compare day
        currStart: focusDay,
        currEnd: focusDay,
        prevStart: compareDay,
        prevEnd: compareDay
      };
    }

    // Week mode
    const weekId = selectedWeekId() || (weeks[0] && weeks[0].id);
    const weekIdx = weeks.findIndex(w => w.id === weekId);
    const weekCurr = weekIdx >= 0 ? weeks[weekIdx] : weeks[0];
    let weekPrev = null;
    const cmpId = selectedCompareWeekId();
    if (cmpId) {
      weekPrev = weeks.find(w => w.id === cmpId) || null;
    } else if (weekIdx >= 0 && weekIdx < weeks.length - 1) {
      weekPrev = weeks[weekIdx + 1];
    }
    const dailyDates = weekCurr
      ? dates.filter(d => d >= weekCurr.startKey && d <= weekCurr.endKey)
      : [];
    const focusDay = dailyDates.length ? dailyDates[dailyDates.length - 1] : null;
    const focusMonth = weekCurr ? weekCurr.endKey.slice(0, 7) : null;

    return {
      mode: 'week',
      focusDay,
      compareDay: null,
      dailyDates,
      weekCurr,
      weekPrev,
      focusMonth,
      currStart: weekCurr ? weekCurr.startKey : null,
      currEnd: weekCurr ? weekCurr.endKey : null,
      prevStart: weekPrev ? weekPrev.startKey : null,
      prevEnd: weekPrev ? weekPrev.endKey : null
    };
  }

  function updateHint() {
    const hint = document.getElementById('bauReportWeekHint');
    if (!hint) return;
    const p = resolvePeriod();
    if (p.mode === 'daily') {
      if (p.focusDay && p.compareDay) {
        hint.textContent = 'Daily · ' + p.focusDay + ' vs ' + p.compareDay;
      } else if (p.focusDay) {
        hint.textContent = 'Daily · ' + p.focusDay + ' · no compare date';
      } else {
        hint.textContent = '';
      }
      return;
    }
    if (p.weekCurr && p.weekPrev) {
      hint.textContent = 'Comparing WK' + p.weekCurr.weekNo + ' vs WK' + p.weekPrev.weekNo;
    } else if (p.weekCurr) {
      hint.textContent = 'WK' + p.weekCurr.weekNo + ' · no compare week';
    } else {
      hint.textContent = '';
    }
  }

  function populateFilters(preferDate) {
    const dates = getDates();
    availableDates = dates.slice();
    availableWeeks = listWeeksFromDates(dates);

    const modeSel = document.getElementById('bauReportModeFilter');
    const mode = modeSel ? modeSel.value : 'week';
    setModeUI(mode);

    // Week selects
    const weekSel = document.getElementById('bauReportWeekFilter');
    const cmpWeekSel = document.getElementById('bauReportCompareWeekFilter');
    if (weekSel) {
      const prevVal = weekSel.value;
      if (!availableWeeks.length) {
        weekSel.innerHTML = '<option value="">No weeks</option>';
      } else {
        weekSel.innerHTML = availableWeeks.map(w =>
          '<option value="' + w.id + '">' + escapeHtml(w.label) + '</option>'
        ).join('');
        let pick = null;
        if (prevVal && availableWeeks.some(w => w.id === prevVal)) pick = prevVal;
        else if (preferDate && preferDate !== 'ALL') {
          const info = getWeekInfo(preferDate);
          if (info && availableWeeks.some(w => w.id === info.id)) pick = info.id;
        }
        if (!pick) pick = availableWeeks[0].id;
        weekSel.value = pick;

        // Compare week: default prior week; user can change freely
        if (cmpWeekSel) {
          const prevCmp = cmpWeekSel.value;
          cmpWeekSel.innerHTML = '<option value="">Auto (prior week)</option>' +
            availableWeeks.map(w =>
              '<option value="' + w.id + '">' + escapeHtml(w.label) + '</option>'
            ).join('');
          if (prevCmp && availableWeeks.some(w => w.id === prevCmp) && prevCmp !== pick) {
            cmpWeekSel.value = prevCmp;
          } else {
            const idx = availableWeeks.findIndex(w => w.id === pick);
            cmpWeekSel.value = (idx >= 0 && idx < availableWeeks.length - 1)
              ? availableWeeks[idx + 1].id
              : '';
          }
        }
      }
    }

    // Daily selects
    const daySel = document.getElementById('bauReportDailyFilter');
    const cmpDaySel = document.getElementById('bauReportCompareDailyFilter');
    if (daySel) {
      const prevDay = daySel.value;
      if (!availableDates.length) {
        daySel.innerHTML = '<option value="">No dates</option>';
      } else {
        // newest first for convenience
        const rev = availableDates.slice().reverse();
        daySel.innerHTML = rev.map(d =>
          '<option value="' + d + '">' + d + '</option>'
        ).join('');
        let pick = null;
        if (prevDay && availableDates.includes(prevDay)) pick = prevDay;
        else if (preferDate && preferDate !== 'ALL' && availableDates.includes(preferDate)) pick = preferDate;
        else pick = availableDates[availableDates.length - 1];
        daySel.value = pick;

        if (cmpDaySel) {
          const prevCmp = cmpDaySel.value;
          cmpDaySel.innerHTML = '<option value="">Auto (previous day)</option>' +
            rev.map(d => '<option value="' + d + '">' + d + '</option>').join('');
          if (prevCmp && availableDates.includes(prevCmp) && prevCmp !== pick) {
            cmpDaySel.value = prevCmp;
          } else {
            const idx = availableDates.indexOf(pick);
            cmpDaySel.value = idx > 0 ? availableDates[idx - 1] : '';
          }
        }
      }
    }

    updateHint();
  }

  /* ---------- Sheet A style: DC rate matrix ---------- */
  function buildDcReport() {
    const all = getAllRows();
    const dates = getDates();
    if (!all.length || !dates.length) return null;

    const p = resolvePeriod();
    if (!p.focusDay && !p.currStart) return null;

    const monthRows = p.focusMonth
      ? all.filter(r => r.dateKey && r.dateKey.startsWith(p.focusMonth))
      : [];
    const focusDayRows = p.focusDay ? all.filter(r => r.dateKey === p.focusDay) : [];

    const codes = [...new Set(all.map(dcKey))].filter(c => c && c !== '(blank)');
    codes.sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });

    const rows = codes.map(code => {
      const codeAll = all.filter(r => dcKey(r) === code);
      const daySnap = focusDayRows.filter(r => dcKey(r) === code);
      const stDay = stats(daySnap);

      const dailyRates = (p.dailyDates || []).map(dk => {
        const dayRows = codeAll.filter(r => r.dateKey === dk);
        return dayRows.length ? rateFor(dayRows) : null;
      });

      let dailyGap = null;
      if (p.mode === 'daily' && p.focusDay && p.compareDay) {
        const a = rateFor(codeAll.filter(r => r.dateKey === p.focusDay));
        const b = rateFor(codeAll.filter(r => r.dateKey === p.compareDay));
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
        const wr = codeAll.filter(r => r.dateKey >= p.prevStart && r.dateKey <= p.prevEnd);
        if (wr.length) weekPrevRate = rateFor(wr);
      }
      if (p.currStart && p.currEnd) {
        const wr = codeAll.filter(r => r.dateKey >= p.currStart && r.dateKey <= p.currEnd);
        if (wr.length) weekCurrRate = rateFor(wr);
      }
      const weeklyDiff = (weekCurrRate != null && weekPrevRate != null)
        ? weekCurrRate - weekPrevRate
        : null;

      const mRows = monthRows.filter(r => dcKey(r) === code);
      const mStats = stats(mRows);

      return {
        code,
        name: dcDisplayName(code),
        noDeparture: stDay.coutNo,
        noArrival: stDay.cinNo,
        totalAppUsed: stDay.yes,
        grandTotal: stDay.total,
        dayRate: stDay.rate,
        dailyRates,
        dailyGap,
        weekPrevRate,
        weekCurrRate,
        weeklyDiff,
        mNoDeparture: mStats.coutNo,
        mNoArrival: mStats.cinNo,
        mTotalAppUsed: mStats.yes,
        mGrandTotal: mStats.total,
        monthRate: mStats.rate,
        negWeekly: weeklyDiff != null && weeklyDiff < -0.00005
      };
    }).filter(r => r.mGrandTotal > 0 || r.grandTotal > 0 || r.dailyRates.some(x => x != null));

    const ranked = rows.slice().sort((a, b) => {
      const ra = a.monthRate == null ? -1 : a.monthRate;
      const rb = b.monthRate == null ? -1 : b.monthRate;
      if (rb !== ra) return rb - ra;
      return (b.mGrandTotal || 0) - (a.mGrandTotal || 0);
    });
    ranked.forEach((r, i) => { r.rank = i + 1; });

    rows.sort((a, b) => {
      if (a.negWeekly !== b.negWeekly) return a.negWeekly ? -1 : 1;
      if (a.weeklyDiff != null && b.weeklyDiff != null && a.weeklyDiff !== b.weeklyDiff) {
        return a.weeklyDiff - b.weeklyDiff;
      }
      return (a.rank || 99) - (b.rank || 99);
    });

    return {
      period: p,
      rows,
      negCount: rows.filter(r => r.negWeekly).length
    };
  }

  function drawDcTable() {
    const body = document.getElementById('tbodyDcRateReport');
    const thead = document.getElementById('theadDcRateReport');
    const note = document.getElementById('dcRateReportNote');
    if (!body || !thead) return;

    const report = buildDcReport();
    if (!report) {
      thead.innerHTML = '';
      body.innerHTML = '<tr><td colspan="24" style="text-align:center;color:#757575;">Upload data to see DC App Used Rates</td></tr>';
      if (note) note.textContent = '';
      return;
    }

    const { period: p, rows, negCount } = report;
    const dailyDates = p.dailyDates || [];
    const dailyHeaders = dailyDates.map(d =>
      '<th class="sp-th-daily">' + escapeHtml(shortDateLabel(d)) + '</th>'
    ).join('');

    let wPrevLabel = 'COMPARE';
    let wCurrLabel = 'CURRENT';
    if (p.mode === 'daily') {
      wPrevLabel = p.compareDay ? shortDateLabel(p.compareDay) : 'COMPARE';
      wCurrLabel = p.focusDay ? shortDateLabel(p.focusDay) : 'CURRENT';
    } else {
      wPrevLabel = p.weekPrev ? ('WEEK ' + p.weekPrev.weekNo) : 'COMPARE';
      wCurrLabel = p.weekCurr ? ('WEEK ' + p.weekCurr.weekNo) : 'CURRENT';
    }
    const monthLabel = p.focusMonth || '';
    const dailyColSpan = Math.max(dailyDates.length, 1);
    const focusLbl = p.focusDay ? shortDateLabel(p.focusDay) : '—';

    thead.innerHTML =
      '<tr class="sp-rate-group-row">' +
        '<th rowspan="2" class="sp-th-sp">DC NAME</th>' +
        '<th rowspan="2" class="sp-th-dc">DC CODE</th>' +
        '<th colspan="5" class="sp-th-group-daily">DAILY · ' + escapeHtml(focusLbl) + '</th>' +
        '<th colspan="' + dailyColSpan + '" class="sp-th-group-daily">DAILY TREND</th>' +
        '<th rowspan="2" class="sp-th-gap">GAP</th>' +
        '<th colspan="3" class="sp-th-group-week">RATE COMPARE</th>' +
        '<th colspan="6" class="sp-th-group-month">MONTHLY' +
          (monthLabel ? ' · ' + escapeHtml(monthLabel) : '') + '</th>' +
      '</tr>' +
      '<tr class="sp-rate-subhead">' +
        '<th class="sp-th-daily">NO DEP</th>' +
        '<th class="sp-th-daily">NO ARR</th>' +
        '<th class="sp-th-daily">APP USED</th>' +
        '<th class="sp-th-daily">TOTAL</th>' +
        '<th class="sp-th-daily">RATE</th>' +
        (dailyDates.length ? dailyHeaders : '<th class="sp-th-daily">—</th>') +
        '<th class="sp-th-week">' + escapeHtml(wPrevLabel) + '</th>' +
        '<th class="sp-th-week">' + escapeHtml(wCurrLabel) + '</th>' +
        '<th class="sp-th-week">DIFF</th>' +
        '<th class="sp-th-month">NO DEP</th>' +
        '<th class="sp-th-month">NO ARR</th>' +
        '<th class="sp-th-month">APP USED</th>' +
        '<th class="sp-th-month">TOTAL</th>' +
        '<th class="sp-th-month">RATE %</th>' +
        '<th class="sp-th-month">RANK</th>' +
      '</tr>';

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="24" style="text-align:center;color:#757575;">No DC data</td></tr>';
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
        '<td class="sp-name">' + escapeHtml(r.name) + '</td>' +
        '<td>' + escapeHtml(r.code) + '</td>' +
        '<td class="' + (r.noDeparture ? 'neg' : '') + '">' + r.noDeparture + '</td>' +
        '<td class="' + (r.noArrival ? 'neg' : '') + '">' + r.noArrival + '</td>' +
        '<td class="pos">' + r.totalAppUsed + '</td>' +
        '<td>' + r.grandTotal + '</td>' +
        '<td class="' + rateCellClass(r.dayRate) + '">' + fmtRate(r.dayRate) + '</td>' +
        dailyCells +
        '<td class="' + gapCls + '">' + gapHtml + '</td>' +
        '<td class="' + rateCellClass(r.weekPrevRate) + '">' + fmtRate(r.weekPrevRate) + '</td>' +
        '<td class="' + rateCellClass(r.weekCurrRate) + '">' + fmtRate(r.weekCurrRate) + '</td>' +
        '<td class="' + wDiffCls + '">' + wDiffHtml + '</td>' +
        '<td class="' + (r.mNoDeparture ? 'neg' : '') + '">' + r.mNoDeparture + '</td>' +
        '<td class="' + (r.mNoArrival ? 'neg' : '') + '">' + r.mNoArrival + '</td>' +
        '<td class="pos">' + r.mTotalAppUsed + '</td>' +
        '<td>' + r.mGrandTotal + '</td>' +
        '<td class="' + rateCellClass(r.monthRate) + '">' + fmtRate(r.monthRate) + '</td>' +
        '<td class="tr-rank">' + (r.rank || '—') + '</td>' +
        '</tr>';
    }).join('');

    if (note) {
      note.textContent = rows.length + ' DC · ' +
        (negCount ? negCount + ' negative diff' : 'no negative diff');
    }
  }

  /* ---------- Sheet B style: Bulk vs Collection vs Accumulated ---------- */
  function buildLineTypeReport() {
    const all = getAllRows();
    if (!all.length) return null;
    const p = resolvePeriod();
    if (!p.focusDay && !p.focusMonth) return null;

    const dayRows = p.focusDay ? all.filter(r => r.dateKey === p.focusDay) : [];
    const monthRows = p.focusMonth
      ? all.filter(r => r.dateKey && r.dateKey.startsWith(p.focusMonth))
      : [];

    const codes = [...new Set(all.map(dcKey))].filter(c => c && c !== '(blank)');
    codes.sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });

    const rows = codes.map(code => {
      const dayDc = dayRows.filter(r => dcKey(r) === code);
      const monthDc = monthRows.filter(r => dcKey(r) === code);
      return {
        code,
        name: dcDisplayName(code),
        bulk: stats(dayDc.filter(isBulk)),
        coll: stats(dayDc.filter(isCollection)),
        acc: stats(monthDc)
      };
    }).filter(r => r.bulk.total > 0 || r.coll.total > 0 || r.acc.total > 0);

    return {
      period: p,
      rows,
      total: {
        name: 'SLU',
        code: '',
        bulk: stats(dayRows.filter(isBulk)),
        coll: stats(dayRows.filter(isCollection)),
        acc: stats(monthRows)
      }
    };
  }

  function lineTypeCells(st) {
    if (!st || !st.total) {
      return '<td class="sp-muted">0</td><td class="sp-muted">0</td><td class="sp-muted">0</td><td class="sp-muted">0</td><td>—</td>';
    }
    return '<td class="' + (st.coutNo ? 'neg' : '') + '">' + st.coutNo + '</td>' +
      '<td class="' + (st.cinNo ? 'neg' : '') + '">' + st.cinNo + '</td>' +
      '<td class="pos">' + st.yes + '</td>' +
      '<td>' + st.total + '</td>' +
      '<td class="' + rateCellClass(st.rate) + '">' + fmtRate(st.rate) + '</td>';
  }

  function drawLineTypeTable() {
    const body = document.getElementById('tbodyDcLineTypeReport');
    const thead = document.getElementById('theadDcLineTypeReport');
    const note = document.getElementById('dcLineTypeReportNote');
    if (!body || !thead) return;

    const report = buildLineTypeReport();
    if (!report) {
      thead.innerHTML = '';
      body.innerHTML = '<tr><td colspan="18" style="text-align:center;color:#757575;">Upload data</td></tr>';
      if (note) note.textContent = '';
      return;
    }

    const { period: p, rows, total } = report;
    const focusLbl = p.focusDay ? shortDateLabel(p.focusDay) : '—';

    thead.innerHTML =
      '<tr class="sp-rate-group-row">' +
        '<th rowspan="2" class="sp-th-sp">DC NAME</th>' +
        '<th rowspan="2" class="sp-th-dc">DC CODE</th>' +
        '<th rowspan="2" class="sp-th-gap">TARGET</th>' +
        '<th colspan="5" class="sp-th-group-daily">BULK · ' + escapeHtml(focusLbl) + '</th>' +
        '<th colspan="5" class="sp-th-group-week">COLLECTION · ' + escapeHtml(focusLbl) + '</th>' +
        '<th colspan="5" class="sp-th-group-month">ACCUMULATED · ' + escapeHtml(p.focusMonth || '') + '</th>' +
      '</tr>' +
      '<tr class="sp-rate-subhead">' +
        '<th class="sp-th-daily">NO DEP</th><th class="sp-th-daily">NO ARR</th>' +
        '<th class="sp-th-daily">APP USED</th><th class="sp-th-daily">TOTAL</th><th class="sp-th-daily">RATE</th>' +
        '<th class="sp-th-week">NO DEP</th><th class="sp-th-week">NO ARR</th>' +
        '<th class="sp-th-week">APP USED</th><th class="sp-th-week">TOTAL</th><th class="sp-th-week">RATE</th>' +
        '<th class="sp-th-month">NO DEP</th><th class="sp-th-month">NO ARR</th>' +
        '<th class="sp-th-month">APP USED</th><th class="sp-th-month">TOTAL</th><th class="sp-th-month">RATE</th>' +
      '</tr>';

    const targetPct = Math.round(TARGET * 100) + '%';
    const rowHtml = (r, isTotal) => {
      const cls = isTotal ? 'sp-row-neg-weekly' : '';
      return '<tr class="' + cls + '">' +
        '<td class="sp-name">' + escapeHtml(r.name) + '</td>' +
        '<td>' + escapeHtml(r.code || '—') + '</td>' +
        '<td>' + targetPct + '</td>' +
        lineTypeCells(r.bulk) +
        lineTypeCells(r.coll) +
        lineTypeCells(r.acc) +
        '</tr>';
    };

    body.innerHTML = rows.map(r => rowHtml(r, false)).join('') + rowHtml(total, true);
    if (note) {
      note.textContent = rows.length + ' DC · ' + (p.focusDay || '—') + ' · month ' + (p.focusMonth || '—');
    }
  }

  /* ---------- Top Contributors (detailed) ---------- */
  function groupDetailed(list) {
    // key = driver|dcCode|sp
    const map = {};
    list.forEach(r => {
      const driver = r.driver || '(blank)';
      const code = dcKey(r);
      const sp = r.sp || '(blank)';
      const k = driver + '\t' + code + '\t' + sp;
      if (!map[k]) {
        map[k] = {
          driver,
          dcCode: code,
          dcName: dcDisplayName(code),
          sp,
          count: 0,
          taskIds: []
        };
      }
      map[k].count += 1;
      const tid = r.shipmentNo || r.uniqueCode || r.mission || '';
      if (tid && map[k].taskIds.length < 12) map[k].taskIds.push(tid);
    });
    return Object.values(map).sort((a, b) => b.count - a.count || a.driver.localeCompare(b.driver));
  }

  function buildTopContributors() {
    const all = getAllRows();
    if (!all.length) return null;
    const p = resolvePeriod();

    let scope;
    if (p.mode === 'daily' && p.focusDay) {
      scope = all.filter(r => r.dateKey === p.focusDay);
    } else if (p.currStart && p.currEnd) {
      // Use focus day of week for top contributors (matches Excel snapshot style)
      scope = p.focusDay
        ? all.filter(r => r.dateKey === p.focusDay)
        : all.filter(r => r.dateKey >= p.currStart && r.dateKey <= p.currEnd);
    } else {
      return null;
    }

    const miss = scope.filter(r => !r.compliant);
    const isOwn = (r) => /^own$/i.test(r.carrier || '');

    return {
      period: p,
      scopeTotal: scope.length,
      missTotal: miss.length,
      noCinOwn: groupDetailed(miss.filter(r => r.clockIn === 'NO' && isOwn(r))),
      noCinSp: groupDetailed(miss.filter(r => r.clockIn === 'NO' && !isOwn(r))),
      noCoutOwn: groupDetailed(miss.filter(r => r.clockOut === 'NO' && isOwn(r))),
      noCoutSp: groupDetailed(miss.filter(r => r.clockOut === 'NO' && !isOwn(r))),
      allMiss: groupDetailed(miss)
    };
  }

  function detailTableHtml(items, emptyLabel) {
    if (!items || !items.length) {
      return '<div class="empty-note">' + escapeHtml(emptyLabel) + '</div>';
    }
    const rows = items.slice(0, 40).map(it =>
      '<tr>' +
        '<td class="sp-name">' + escapeHtml(it.driver) + '</td>' +
        '<td>' + escapeHtml(it.dcName) + '</td>' +
        '<td>' + escapeHtml(it.dcCode) + '</td>' +
        '<td>' + escapeHtml(it.sp) + '</td>' +
        '<td class="neg" style="font-weight:700;text-align:center;">' + it.count + '</td>' +
        '<td style="text-align:left;font-size:0.72rem;max-width:280px;white-space:normal;">' +
          escapeHtml(it.taskIds.join(', ')) +
          (it.count > it.taskIds.length ? ' …' : '') +
        '</td>' +
      '</tr>'
    ).join('');
    return '<div class="table-scroll" style="max-height:280px;">' +
      '<table class="sp-rate-table" style="width:100%;min-width:0;">' +
      '<thead><tr>' +
        '<th class="sp-th-sp">Driver</th>' +
        '<th class="sp-th-dc">DC Intended</th>' +
        '<th class="sp-th-dc">DC Code</th>' +
        '<th class="sp-th-sp">SP</th>' +
        '<th class="sp-th-gap">Count</th>' +
        '<th class="sp-th-month">Task ID</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function drawTopContributors() {
    const root = document.getElementById('bauTopContributorsPanel');
    const note = document.getElementById('topContributorsNote');
    if (!root) return;

    const data = buildTopContributors();
    if (!data) {
      root.innerHTML = '<div class="empty-note">Upload data to see top contributors.</div>';
      if (note) note.textContent = '';
      return;
    }

    const p = data.period;
    if (note) {
      note.textContent = (p.focusDay || '—') + ' · ' + data.missTotal + ' non-compliant / ' + data.scopeTotal + ' trips';
    }

    root.innerHTML =
      '<div class="tc-grid">' +
        '<div class="tc-block">' +
          '<div class="tc-title tc-own">No Clock-In (Arrival) — Own Fleet</div>' +
          detailTableHtml(data.noCinOwn, 'None') +
        '</div>' +
        '<div class="tc-block">' +
          '<div class="tc-title tc-sp">No Clock-In (Arrival) — Service Partner</div>' +
          detailTableHtml(data.noCinSp, 'None') +
        '</div>' +
        '<div class="tc-block">' +
          '<div class="tc-title tc-own">No Clock-Out (Departure) — Own Fleet</div>' +
          detailTableHtml(data.noCoutOwn, 'None') +
        '</div>' +
        '<div class="tc-block">' +
          '<div class="tc-title tc-sp">No Clock-Out (Departure) — Service Partner</div>' +
          detailTableHtml(data.noCoutSp, 'None') +
        '</div>' +
      '</div>' +
      '<div class="tc-block" style="margin-top:14px;">' +
        '<div class="tc-title">All Non-Compliant (Driver · DC · SP)</div>' +
        detailTableHtml(data.allMiss, 'None') +
      '</div>';
  }

  /* ---------- Public API ---------- */
  function drawAll() {
    updateHint();
    drawDcTable();
    drawLineTypeTable();
    drawTopContributors();
    // Refresh SP report when filter changes
    if (typeof BauSpRateReport !== 'undefined' && BauSpRateReport.drawTable) {
      BauSpRateReport.drawTable();
    } else if (typeof BauSpRateReport !== 'undefined' && BauSpRateReport.render) {
      // render may re-populate filters — only draw table if available
    }
  }

  function render(preferDate) {
    populateFilters(preferDate);
    availableWeeks = listWeeksFromDates(getDates());
    availableDates = getDates();
    drawAll();
  }

  function showSubPanel(id) {
    document.querySelectorAll('.bau-report-subpanel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.bau-report-subtab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-sub') === id);
    });
    const map = {
      sp: 'bauReportSp',
      dc: 'bauReportDc',
      line: 'bauReportLineType',
      top: 'bauReportTop'
    };
    const el = document.getElementById(map[id] || 'bauReportSp');
    if (el) el.classList.remove('hidden');
  }

  function onFilterChange() {
    const modeSel = document.getElementById('bauReportModeFilter');
    if (modeSel) setModeUI(modeSel.value);
    updateHint();
    drawDcTable();
    drawLineTypeTable();
    drawTopContributors();
    if (typeof BauSpRateReport !== 'undefined' && BauSpRateReport.onExternalFilterChange) {
      BauSpRateReport.onExternalFilterChange();
    }
  }

  function init() {
    if (bound) return;
    bound = true;

    ['bauReportModeFilter', 'bauReportWeekFilter', 'bauReportCompareWeekFilter',
      'bauReportDailyFilter', 'bauReportCompareDailyFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', onFilterChange);
    });

    document.querySelectorAll('.bau-report-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        showSubPanel(btn.getAttribute('data-sub') || 'sp');
      });
    });
  }

  // Expose period resolver for SP report
  function getResolvedPeriod() {
    return resolvePeriod();
  }

  return { init, render, showSubPanel, drawAll, getResolvedPeriod, onFilterChange };
})();
