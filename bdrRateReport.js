/* ==========================================================================
   MODULE: BDR RATE REPORT
   Sheet A  → per-DC daily / weekly / monthly on-time rate matrix
   Sheet B  → per-DC Bulk vs Collection vs Accumulated
   SP Rates → service partner on-time matrix
   Late Dept → detailed late contributors (driver, DC, count, task IDs)
   Shared filter: Week or Daily + free compare target
   ========================================================================== */
const BdrRateReport = (() => {
  const { stats, TARGET, resolveDcName, fmtDuration } = BdrUtils;

  let bound = false;
  let availableWeeks = [];
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
    const { storedRows } = BdrFileProcessor.getState();
    return storedRows || [];
  }

  function getDates() {
    const { storedDates } = BdrFileProcessor.getState();
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

  function isOwn(r) {
    return /^own$/i.test(r.carrier || '');
  }

  /* ---------- Shared filter ---------- */
  function filterMode() {
    const el = document.getElementById('bdrReportModeFilter');
    return el ? el.value : 'week';
  }

  function selectedWeekId() {
    const sel = document.getElementById('bdrReportWeekFilter');
    return sel ? sel.value : null;
  }

  function selectedCompareWeekId() {
    const sel = document.getElementById('bdrReportCompareWeekFilter');
    return sel && sel.value ? sel.value : null;
  }

  function selectedDailyDate() {
    const sel = document.getElementById('bdrReportDailyFilter');
    return sel ? sel.value : null;
  }

  function selectedCompareDailyDate() {
    const sel = document.getElementById('bdrReportCompareDailyFilter');
    return sel && sel.value ? sel.value : null;
  }

  function setModeUI(mode) {
    const weekWrap = document.getElementById('bdrReportWeekWrap');
    const dailyWrap = document.getElementById('bdrReportDailyWrap');
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
        currStart: focusDay,
        currEnd: focusDay,
        prevStart: compareDay,
        prevEnd: compareDay
      };
    }

    const weekId = selectedWeekId() || (weeks[0] && weeks[0].id);
    const weekIdx = weeks.findIndex(w => w.id === weekId);
    const weekCurr = weekIdx >= 0 ? weeks[weekIdx] : weeks[0];
    let weekPrev = null;
    const cmpId = selectedCompareWeekId();
    if (cmpId) weekPrev = weeks.find(w => w.id === cmpId) || null;
    else if (weekIdx >= 0 && weekIdx < weeks.length - 1) weekPrev = weeks[weekIdx + 1];

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
    const hint = document.getElementById('bdrReportWeekHint');
    if (!hint) return;
    const p = resolvePeriod();
    if (p.mode === 'daily') {
      if (p.focusDay && p.compareDay) hint.textContent = 'Daily · ' + p.focusDay + ' vs ' + p.compareDay;
      else if (p.focusDay) hint.textContent = 'Daily · ' + p.focusDay;
      else hint.textContent = '';
      return;
    }
    if (p.weekCurr && p.weekPrev) {
      hint.textContent = 'Comparing WK' + p.weekCurr.weekNo + ' vs WK' + p.weekPrev.weekNo;
    } else if (p.weekCurr) {
      hint.textContent = 'WK' + p.weekCurr.weekNo;
    } else {
      hint.textContent = '';
    }
  }

  function populateFilters(preferDate) {
    const dates = getDates();
    availableDates = dates.slice();
    availableWeeks = listWeeksFromDates(dates);

    const modeSel = document.getElementById('bdrReportModeFilter');
    setModeUI(modeSel ? modeSel.value : 'week');

    const weekSel = document.getElementById('bdrReportWeekFilter');
    const cmpWeekSel = document.getElementById('bdrReportCompareWeekFilter');
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

    const daySel = document.getElementById('bdrReportDailyFilter');
    const cmpDaySel = document.getElementById('bdrReportCompareDailyFilter');
    if (daySel) {
      const prevDay = daySel.value;
      if (!availableDates.length) {
        daySel.innerHTML = '<option value="">No dates</option>';
      } else {
        const rev = availableDates.slice().reverse();
        daySel.innerHTML = rev.map(d => '<option value="' + d + '">' + d + '</option>').join('');
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

  function buildEntityReport(keyFn, labelFn) {
    const all = getAllRows();
    const dates = getDates();
    if (!all.length || !dates.length) return null;
    const p = resolvePeriod();
    if (!p.focusDay && !p.currStart) return null;

    const monthRows = p.focusMonth
      ? all.filter(r => r.dateKey && r.dateKey.startsWith(p.focusMonth))
      : [];
    const focusDayRows = p.focusDay ? all.filter(r => r.dateKey === p.focusDay) : [];

    const keys = [...new Set(all.map(keyFn))].filter(k => k && k !== '(blank)');
    keys.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

    const rows = keys.map(key => {
      const entityAll = all.filter(r => keyFn(r) === key);
      const daySnap = focusDayRows.filter(r => keyFn(r) === key);
      const stDay = stats(daySnap);

      const dailyRates = (p.dailyDates || []).map(dk => {
        const dayRows = entityAll.filter(r => r.dateKey === dk);
        return dayRows.length ? rateFor(dayRows) : null;
      });

      let dailyGap = null;
      if (p.mode === 'daily' && p.focusDay && p.compareDay) {
        const a = rateFor(entityAll.filter(r => r.dateKey === p.focusDay));
        const b = rateFor(entityAll.filter(r => r.dateKey === p.compareDay));
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
        const wr = entityAll.filter(r => r.dateKey >= p.prevStart && r.dateKey <= p.prevEnd);
        if (wr.length) weekPrevRate = rateFor(wr);
      }
      if (p.currStart && p.currEnd) {
        const wr = entityAll.filter(r => r.dateKey >= p.currStart && r.dateKey <= p.currEnd);
        if (wr.length) weekCurrRate = rateFor(wr);
      }
      const weeklyDiff = (weekCurrRate != null && weekPrevRate != null)
        ? weekCurrRate - weekPrevRate
        : null;

      const mRows = monthRows.filter(r => keyFn(r) === key);
      const mStats = stats(mRows);

      return {
        key,
        label: labelFn ? labelFn(key, entityAll) : key,
        total: stDay.total,
        yes: stDay.yes,
        no: stDay.no,
        dayRate: stDay.rate,
        dailyRates,
        dailyGap,
        weekPrevRate,
        weekCurrRate,
        weeklyDiff,
        mNo: mStats.no,
        mYes: mStats.yes,
        mTotal: mStats.total,
        monthRate: mStats.rate,
        negWeekly: weeklyDiff != null && weeklyDiff < -0.00005
      };
    }).filter(r => r.mTotal > 0 || r.total > 0 || r.dailyRates.some(x => x != null));

    const ranked = rows.slice().sort((a, b) => {
      const ra = a.monthRate == null ? -1 : a.monthRate;
      const rb = b.monthRate == null ? -1 : b.monthRate;
      if (rb !== ra) return rb - ra;
      return (b.mTotal || 0) - (a.mTotal || 0);
    });
    ranked.forEach((r, i) => { r.rank = i + 1; });

    rows.sort((a, b) => {
      if (a.negWeekly !== b.negWeekly) return a.negWeekly ? -1 : 1;
      if (a.weeklyDiff != null && b.weeklyDiff != null && a.weeklyDiff !== b.weeklyDiff) {
        return a.weeklyDiff - b.weeklyDiff;
      }
      return (a.rank || 99) - (b.rank || 99);
    });

    return { period: p, rows, negCount: rows.filter(r => r.negWeekly).length };
  }

  function drawEntityTable(theadId, bodyId, noteId, report, nameCol, codeCol) {
    const body = document.getElementById(bodyId);
    const thead = document.getElementById(theadId);
    const note = document.getElementById(noteId);
    if (!body || !thead) return;

    if (!report) {
      thead.innerHTML = '';
      body.innerHTML = '<tr><td colspan="24" style="text-align:center;color:#757575;">Upload data</td></tr>';
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
        '<th rowspan="2" class="sp-th-sp">' + nameCol + '</th>' +
        (codeCol ? '<th rowspan="2" class="sp-th-dc">' + codeCol + '</th>' : '') +
        '<th colspan="4" class="sp-th-group-daily">DAILY · ' + escapeHtml(focusLbl) + '</th>' +
        '<th colspan="' + dailyColSpan + '" class="sp-th-group-daily">DAILY TREND</th>' +
        '<th rowspan="2" class="sp-th-gap">GAP</th>' +
        '<th colspan="3" class="sp-th-group-week">RATE COMPARE</th>' +
        '<th colspan="5" class="sp-th-group-month">MONTHLY' +
          (monthLabel ? ' · ' + escapeHtml(monthLabel) : '') + '</th>' +
      '</tr>' +
      '<tr class="sp-rate-subhead">' +
        '<th class="sp-th-daily">TOTAL</th>' +
        '<th class="sp-th-daily">ON TIME</th>' +
        '<th class="sp-th-daily">LATE</th>' +
        '<th class="sp-th-daily">RATE</th>' +
        (dailyDates.length ? dailyHeaders : '<th class="sp-th-daily">—</th>') +
        '<th class="sp-th-week">' + escapeHtml(wPrevLabel) + '</th>' +
        '<th class="sp-th-week">' + escapeHtml(wCurrLabel) + '</th>' +
        '<th class="sp-th-week">DIFF</th>' +
        '<th class="sp-th-month">LATE</th>' +
        '<th class="sp-th-month">ON TIME</th>' +
        '<th class="sp-th-month">TOTAL</th>' +
        '<th class="sp-th-month">RATE %</th>' +
        '<th class="sp-th-month">RANK</th>' +
      '</tr>';

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="24" style="text-align:center;color:#757575;">No data</td></tr>';
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
        '<td class="sp-name">' + escapeHtml(r.label) + '</td>' +
        (codeCol ? '<td>' + escapeHtml(r.key) + '</td>' : '') +
        '<td>' + r.total + '</td>' +
        '<td class="pos">' + r.yes + '</td>' +
        '<td class="' + (r.no ? 'neg' : '') + '">' + r.no + '</td>' +
        '<td class="' + rateCellClass(r.dayRate) + '">' + fmtRate(r.dayRate) + '</td>' +
        dailyCells +
        '<td class="' + gapCls + '">' + gapHtml + '</td>' +
        '<td class="' + rateCellClass(r.weekPrevRate) + '">' + fmtRate(r.weekPrevRate) + '</td>' +
        '<td class="' + rateCellClass(r.weekCurrRate) + '">' + fmtRate(r.weekCurrRate) + '</td>' +
        '<td class="' + wDiffCls + '">' + wDiffHtml + '</td>' +
        '<td class="' + (r.mNo ? 'neg' : '') + '">' + r.mNo + '</td>' +
        '<td class="pos">' + r.mYes + '</td>' +
        '<td>' + r.mTotal + '</td>' +
        '<td class="' + rateCellClass(r.monthRate) + '">' + fmtRate(r.monthRate) + '</td>' +
        '<td class="tr-rank">' + (r.rank || '—') + '</td>' +
        '</tr>';
    }).join('');

    if (note) {
      note.textContent = rows.length + ' row(s) · ' +
        (negCount ? negCount + ' negative diff' : 'no negative diff');
    }
  }

  function drawDcTable() {
    const report = buildEntityReport(
      dcKey,
      (code) => dcDisplayName(code)
    );
    drawEntityTable('theadDcRateReport', 'tbodyDcRateReport', 'dcRateReportNote', report, 'DC NAME', 'DC CODE');
  }

  function drawSpTable() {
    const report = buildEntityReport(
      r => r.sp || '(blank)',
      (sp) => sp
    );
    drawEntityTable('theadSpRateReport', 'tbodySpRateReport', 'spRateReportNote', report, 'SERVICE PARTNER', null);
  }

  /* ---------- Sheet B: Bulk vs Collection ---------- */
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
      return '<td>0</td><td>0</td><td>0</td><td>—</td>';
    }
    return '<td>' + st.total + '</td>' +
      '<td class="pos">' + st.yes + '</td>' +
      '<td class="' + (st.no ? 'neg' : '') + '">' + st.no + '</td>' +
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
    const targetPct = Math.round(TARGET * 100) + '%';

    thead.innerHTML =
      '<tr class="sp-rate-group-row">' +
        '<th rowspan="2" class="sp-th-sp">DC NAME</th>' +
        '<th rowspan="2" class="sp-th-dc">DC CODE</th>' +
        '<th rowspan="2" class="sp-th-gap">TARGET</th>' +
        '<th colspan="4" class="sp-th-group-daily">BULK · ' + escapeHtml(focusLbl) + '</th>' +
        '<th colspan="4" class="sp-th-group-week">COLLECTION · ' + escapeHtml(focusLbl) + '</th>' +
        '<th colspan="4" class="sp-th-group-month">ACCUMULATED · ' + escapeHtml(p.focusMonth || '') + '</th>' +
      '</tr>' +
      '<tr class="sp-rate-subhead">' +
        '<th class="sp-th-daily">TOTAL</th><th class="sp-th-daily">ON TIME</th><th class="sp-th-daily">LATE</th><th class="sp-th-daily">RATE</th>' +
        '<th class="sp-th-week">TOTAL</th><th class="sp-th-week">ON TIME</th><th class="sp-th-week">LATE</th><th class="sp-th-week">RATE</th>' +
        '<th class="sp-th-month">TOTAL</th><th class="sp-th-month">ON TIME</th><th class="sp-th-month">LATE</th><th class="sp-th-month">RATE</th>' +
      '</tr>';

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

  /* ---------- Late Departures (LATE DEPT style) ---------- */
  function groupDetailed(list) {
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
          taskIds: [],
          totalLateMin: 0
        };
      }
      map[k].count += 1;
      const tid = r.shipmentNo || r.uniqueCode || r.mission || '';
      if (tid && map[k].taskIds.length < 12) map[k].taskIds.push(tid);
      const lm = Number(r.lateMin) || 0;
      if (lm > 0) map[k].totalLateMin += lm;
    });
    return Object.values(map).sort((a, b) => b.count - a.count || a.driver.localeCompare(b.driver));
  }

  function buildLateDept() {
    const all = getAllRows();
    if (!all.length) return null;
    const p = resolvePeriod();

    let scope;
    if (p.mode === 'daily' && p.focusDay) {
      scope = all.filter(r => r.dateKey === p.focusDay);
    } else if (p.focusDay) {
      scope = all.filter(r => r.dateKey === p.focusDay);
    } else if (p.currStart && p.currEnd) {
      scope = all.filter(r => r.dateKey >= p.currStart && r.dateKey <= p.currEnd);
    } else {
      return null;
    }

    const late = scope.filter(r => r.onTime === 'NO');

    // Collection / Bulk late routes (COLLECTION BULK sheet style)
    function routeAgg(list) {
      const map = {};
      list.forEach(r => {
        const route = r.route || '(blank)';
        if (!map[route]) map[route] = { route, count: 0, sp: r.sp || '', dc: dcDisplayName(dcKey(r)) };
        map[route].count += 1;
      });
      return Object.values(map).sort((a, b) => b.count - a.count);
    }

    return {
      period: p,
      scopeTotal: scope.length,
      lateTotal: late.length,
      organic: groupDetailed(late.filter(isOwn)),
      spLate: groupDetailed(late.filter(r => !isOwn(r))),
      allLate: groupDetailed(late),
      bulkRoutes: routeAgg(late.filter(isBulk)),
      collRoutes: routeAgg(late.filter(isCollection))
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
        '<td class="neg">' + (it.totalLateMin ? fmtDuration(it.totalLateMin) : '—') + '</td>' +
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
        '<th class="sp-th-month">Late Time</th>' +
        '<th class="sp-th-month">Task ID</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function routeTableHtml(items, emptyLabel) {
    if (!items || !items.length) {
      return '<div class="empty-note">' + escapeHtml(emptyLabel) + '</div>';
    }
    const rows = items.slice(0, 30).map(it =>
      '<tr>' +
        '<td class="sp-name">' + escapeHtml(it.route) + '</td>' +
        '<td>' + escapeHtml(it.dc) + '</td>' +
        '<td>' + escapeHtml(it.sp) + '</td>' +
        '<td class="neg" style="font-weight:700;text-align:center;">' + it.count + '</td>' +
      '</tr>'
    ).join('');
    return '<div class="table-scroll" style="max-height:240px;">' +
      '<table class="sp-rate-table" style="width:100%;min-width:0;">' +
      '<thead><tr>' +
        '<th class="sp-th-sp">Route</th>' +
        '<th class="sp-th-dc">DC</th>' +
        '<th class="sp-th-sp">SP</th>' +
        '<th class="sp-th-gap">Count</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function drawLateDept() {
    const root = document.getElementById('bdrLateDeptPanel');
    const note = document.getElementById('lateDeptNote');
    if (!root) return;

    const data = buildLateDept();
    if (!data) {
      root.innerHTML = '<div class="empty-note">Upload data to see late departures.</div>';
      if (note) note.textContent = '';
      return;
    }

    const p = data.period;
    if (note) {
      note.textContent = (p.focusDay || '—') + ' · ' + data.lateTotal + ' late / ' + data.scopeTotal + ' departures';
    }

    root.innerHTML =
      '<div class="tc-grid">' +
        '<div class="tc-block">' +
          '<div class="tc-title tc-own">Late Departures — Own Fleet (Organic)</div>' +
          detailTableHtml(data.organic, 'None') +
        '</div>' +
        '<div class="tc-block">' +
          '<div class="tc-title tc-sp">Late Departures — Service Partners</div>' +
          detailTableHtml(data.spLate, 'None') +
        '</div>' +
      '</div>' +
      '<div class="tc-block" style="margin-top:14px;">' +
        '<div class="tc-title">All Late Departures (Driver · DC · SP)</div>' +
        detailTableHtml(data.allLate, 'None') +
      '</div>' +
      '<div class="tc-grid" style="margin-top:14px;">' +
        '<div class="tc-block">' +
          '<div class="tc-title">Late Routes — Bulk Cargo</div>' +
          routeTableHtml(data.bulkRoutes, 'None') +
        '</div>' +
        '<div class="tc-block">' +
          '<div class="tc-title">Late Routes — Collection</div>' +
          routeTableHtml(data.collRoutes, 'None') +
        '</div>' +
      '</div>';
  }

  function drawAll() {
    updateHint();
    drawSpTable();
    drawDcTable();
    drawLineTypeTable();
    drawLateDept();
  }

  function render(preferDate) {
    populateFilters(preferDate);
    availableWeeks = listWeeksFromDates(getDates());
    availableDates = getDates();
    drawAll();
  }

  function showSubPanel(id) {
    document.querySelectorAll('.bdr-report-subpanel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.bdr-report-subtab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-sub') === id);
    });
    const map = {
      sp: 'bdrReportSp',
      dc: 'bdrReportDc',
      line: 'bdrReportLineType',
      late: 'bdrReportLate'
    };
    const el = document.getElementById(map[id] || 'bdrReportSp');
    if (el) el.classList.remove('hidden');
  }

  function onFilterChange() {
    const modeSel = document.getElementById('bdrReportModeFilter');
    if (modeSel) setModeUI(modeSel.value);
    updateHint();
    drawAll();
  }

  function init() {
    if (bound) return;
    bound = true;

    ['bdrReportModeFilter', 'bdrReportWeekFilter', 'bdrReportCompareWeekFilter',
      'bdrReportDailyFilter', 'bdrReportCompareDailyFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', onFilterChange);
    });

    document.querySelectorAll('.bdr-report-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        showSubPanel(btn.getAttribute('data-sub') || 'sp');
      });
    });
  }

  return { init, render, showSubPanel, drawAll };
})();
