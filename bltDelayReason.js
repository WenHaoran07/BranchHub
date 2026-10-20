/* ==========================================================================
   MODULE: BLT DELAY REASON / PROBLEM ENCOUNTERED
   Parses Branchline IR sheets:
     - NO CLOCK-IN
     - NO CLOCK-OUT
     - IR DEPARTURE
     - IR TRAVEL TIME
   Builds Daily / Weekly / Table views (same pattern as Mainline Delay Reason)
   ========================================================================== */
const BltDelayReason = (() => {
  let delayRows = [];
  let delayDates = [];

  const SHEET_CATEGORY = {
    'NO CLOCK-IN': 'No Clock-In',
    'NO CLOCK-OUT': 'No Clock-Out',
    'IR DEPARTURE': 'Late Departure (IR)',
    'IR TRAVEL TIME': 'Late Travel Time (IR)'
  };

  function getState() {
    return { delayRows, delayDates };
  }

  function parseDateKey(val) {
    return BltUtils.parseDateKey(val);
  }

  function cleanText(v) {
    return BltUtils.cleanText ? BltUtils.cleanText(v) : String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim();
  }

  function formatDateLong(dateKey) {
    if (!dateKey) return '';
    const d = new Date(dateKey + 'T00:00:00');
    if (isNaN(d)) return dateKey;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[d.getMonth()].toUpperCase() + ' ' +
      String(d.getDate()).padStart(2, '0') + ' (' + days[d.getDay()] + ')';
  }

  /** Operational week = Sunday → Saturday */
  function getIsoWeekInfo(dateKey) {
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
    const monthName = months[monthForLabel];
    return {
      id: yearForLabel + '-W' + String(weekNo).padStart(2, '0'),
      weekNo,
      weekOfMonth,
      monthName,
      startKey: toKey(sunday),
      endKey: toKey(saturday),
      label: 'Week ' + weekOfMonth + ' (WK' + weekNo + ') · ' + monthName + ' ' + yearForLabel,
      shortLabel: 'Week ' + weekOfMonth + ' (WK' + weekNo + ')',
      headerLabel: monthName.toUpperCase() + ' PROBLEM ENCOUNTERED · WEEK ' +
        weekOfMonth + ' (WK' + weekNo + ')'
    };
  }

  function listAvailableWeeks() {
    const map = {};
    delayDates.forEach(dk => {
      const info = getIsoWeekInfo(dk);
      if (!info) return;
      if (!map[info.id]) map[info.id] = info;
    });
    return Object.values(map).sort((a, b) => b.startKey.localeCompare(a.startKey));
  }

  function colIndex(headers, predicates) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      for (const p of predicates) {
        if (typeof p === 'string' && h === p) return i;
        if (p instanceof RegExp && p.test(h)) return i;
      }
    }
    return null;
  }

  function parseSheet(workbook, sheetName, category) {
    if (!workbook.Sheets[sheetName]) return [];
    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    if (!aoa.length) return [];
    const headers = aoa[0].map(h => String(h || '').trim().toUpperCase().replace(/\u00a0/g, ' '));

    const idx = {
      date: colIndex(headers, ['DATE', /^DATE$/]),
      shipment: colIndex(headers, ['SHIPMENTNO', /SHIPMENT\s*NO/]),
      plate: colIndex(headers, [/VEHICLE\s*PLATE/, 'PLATE NUMBER', /^PLATE$/]),
      driver: colIndex(headers, [/^DRIVER$/]),
      carrier: colIndex(headers, [/VEHICLE\s*CARRIER\s*NAME/, /^CARRIER$/]),
      depDc: colIndex(headers, [/DEPARTURE\s*DC\s*NAME/]),
      route: colIndex(headers, [/^ROUTE$/]),
      lineType: colIndex(headers, [/LINE\s*TYPE/]),
      sp: colIndex(headers, [/^PH\/SP$/, /SP\s*NAMES/, /^SP$/]),
      specific: colIndex(headers, [/^SPECIFIC$/]),
      others: colIndex(headers, [/^OTHERS$/, /^OTHERS:$/]),
      detailed: colIndex(headers, [/^DETAILED$/, /^DETAILS$/, /^DETAIL$/]),
      ir: colIndex(headers, [/^IR$/]),
      remarks: colIndex(headers, [/^REMARKS$/, /CLOCK\s*IN\s*REMARKS/, /CLOCK\s*OUT\s*REMARKS/]),
      planTT: colIndex(headers, [/PLAN\s*TRAVEL/]),
      actualTT: colIndex(headers, [/ACTUAL\s*TRAVEL/]),
      lateMin: colIndex(headers, [/^LATE\s*TIME$/, /^LATE\s*TIME\s*$/]),
      onTime: colIndex(headers, [/ON\s*TIME/]),
      mission: colIndex(headers, [/MISSION\s*NAME/])
    };

    const get = (r, k) => (idx[k] != null && r[idx[k]] != null ? r[idx[k]] : '');

    return aoa.slice(1).map(r => {
      if (!r || !r.length) return null;
      const dateKey = parseDateKey(get(r, 'date'));
      if (!dateKey) return null;

      let specific = cleanText(get(r, 'specific'));
      const others = cleanText(get(r, 'others'));
      if (/^others:?$/i.test(specific) && others) {
        specific = 'OTHERS: ' + others;
      } else if (!specific && others) {
        specific = others;
      }

      const detailed = cleanText(get(r, 'detailed'));
      const irFile = cleanText(get(r, 'ir'));
      const remarksStatus = cleanText(get(r, 'remarks'));
      const problem = specific || (detailed ? detailed.split('\n')[0].slice(0, 80) : '') || category;

      const hasIssue = true; // every row on these sheets is an IR/problem row

      return {
        dateKey,
        category,
        sheet: sheetName,
        shipmentNo: cleanText(get(r, 'shipment')),
        plate: cleanText(get(r, 'plate')),
        driver: cleanText(get(r, 'driver')),
        trucker: cleanText(get(r, 'carrier')) || cleanText(get(r, 'sp')),
        depDc: cleanText(get(r, 'depDc')),
        route: cleanText(get(r, 'route')),
        lineType: cleanText(get(r, 'lineType')),
        sp: cleanText(get(r, 'sp')) || cleanText(get(r, 'carrier')),
        problem,
        specific,
        detailed,
        irFile,
        remarksStatus,
        remarks: detailed || irFile || remarksStatus,
        mission: cleanText(get(r, 'mission')),
        planTT: BltUtils.parseTravelMinutes ? BltUtils.parseTravelMinutes(get(r, 'planTT')) : (parseFloat(get(r, 'planTT')) || 0),
        actualTT: BltUtils.parseTravelMinutes ? BltUtils.parseTravelMinutes(get(r, 'actualTT')) : (parseFloat(get(r, 'actualTT')) || 0),
        lateMin: BltUtils.parseTravelMinutes ? BltUtils.parseTravelMinutes(get(r, 'lateMin')) : (parseFloat(get(r, 'lateMin')) || 0),
        onTime: cleanText(get(r, 'onTime')).toUpperCase(),
        hasIssue
      };
    }).filter(Boolean);
  }

  function ingestWorkbook(workbook) {
    delayRows = [];
    delayDates = [];
    const names = workbook.SheetNames || [];
    Object.keys(SHEET_CATEGORY).forEach(sheetName => {
      const match = names.find(n => n.toUpperCase().trim() === sheetName);
      if (!match) return;
      const rows = parseSheet(workbook, match, SHEET_CATEGORY[sheetName]);
      delayRows = delayRows.concat(rows);
    });
    delayDates = [...new Set(delayRows.map(r => r.dateKey))].sort();
    return { count: delayRows.length, dates: delayDates, bySheet: Object.keys(SHEET_CATEGORY).map(s => ({
      sheet: s,
      category: SHEET_CATEGORY[s],
      count: delayRows.filter(r => r.sheet === s || r.category === SHEET_CATEGORY[s]).length
    })) };
  }

  function rowsForDate(dateKey) {
    if (!dateKey || dateKey === 'ALL') return delayRows.slice();
    return delayRows.filter(r => r.dateKey === dateKey);
  }

  function rowsInRange(startKey, endKey) {
    return delayRows.filter(r => r.dateKey >= startKey && r.dateKey <= endKey);
  }

  function clusterProblems(rows) {
    const map = {};
    rows.forEach(r => {
      const title = r.problem || r.category || 'Unspecified';
      const key = (r.category || '') + '||' + title + '||' + (r.depDc || '');
      if (!map[key]) {
        map[key] = {
          category: r.category,
          problem: title,
          location: r.depDc,
          remarks: r.detailed || r.remarks,
          items: []
        };
      }
      map[key].items.push(r);
      if ((r.detailed || '').length > (map[key].remarks || '').length) {
        map[key].remarks = r.detailed || r.remarks;
      }
    });
    return Object.values(map).sort((a, b) => b.items.length - a.items.length);
  }

  function buildDailyReport(dateKey) {
    const dayRows = rowsForDate(dateKey);
    const isOverall = !dateKey || dateKey === 'ALL';
    const byCategory = {};
    Object.values(SHEET_CATEGORY).forEach(cat => { byCategory[cat] = []; });
    dayRows.forEach(r => {
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
    });
    const sections = Object.keys(byCategory).map(cat => ({
      category: cat,
      clusters: clusterProblems(byCategory[cat]),
      count: byCategory[cat].length
    })).filter(s => s.count > 0);

    let dateLabelText;
    let weekLabelText = '';
    if (isOverall) {
      if (delayDates.length) {
        dateLabelText = 'OVERALL · ' + delayDates[0] + ' → ' + delayDates[delayDates.length - 1];
      } else {
        dateLabelText = 'OVERALL (All dates)';
      }
    } else {
      dateLabelText = formatDateLong(dateKey);
      weekLabelText = (getIsoWeekInfo(dateKey) || {}).headerLabel || '';
    }

    return {
      dateKey: isOverall ? 'ALL' : dateKey,
      dateLabel: dateLabelText,
      weekLabel: weekLabelText,
      sections,
      tableRows: dayRows,
      totals: {
        all: dayRows.length,
        issues: dayRows.length,
        byCategory: Object.fromEntries(sections.map(s => [s.category, s.count]))
      }
    };
  }

  function buildWeeklyReport(weekId, endDateKey) {
    const TOP_N = 8;
    const weeks = listAvailableWeeks();
    let weekInfo = weekId ? weeks.find(w => w.id === weekId) : null;
    if (!weekInfo && endDateKey) weekInfo = getIsoWeekInfo(endDateKey);
    if (!weekInfo && weeks.length) weekInfo = weeks[0];
    if (!weekInfo) return null;

    const rangeRows = rowsInRange(weekInfo.startKey, weekInfo.endKey);

    function topCounts(keyFn, limit) {
      const map = {};
      rangeRows.forEach(r => {
        const k = keyFn(r) || '(blank)';
        map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit || 10);
    }

    const byCategory = topCounts(r => r.category, 10);
    const byProblem = topCounts(r => r.problem, 12);
    const bySp = topCounts(r => r.sp || r.trucker, 10);
    const byRoute = topCounts(r => r.route || r.mission, 10);
    const byDc = topCounts(r => r.depDc, 10);

    const dayMap = {};
    rangeRows.forEach(r => {
      if (!dayMap[r.dateKey]) dayMap[r.dateKey] = { date: r.dateKey, total: 0, rows: [] };
      dayMap[r.dateKey].total++;
      dayMap[r.dateKey].rows.push(r);
    });
    const daily = Object.values(dayMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => {
        const clusters = clusterProblems(d.rows).slice(0, 3);
        return {
          date: d.date,
          dateLabel: formatDateLong(d.date),
          total: d.total,
          topProblems: clusters.map(c => ({
            problem: c.problem,
            category: c.category,
            count: c.items.length
          }))
        };
      });

    const catTop = {};
    Object.values(SHEET_CATEGORY).forEach(cat => {
      catTop[cat] = clusterProblems(rangeRows.filter(r => r.category === cat)).slice(0, TOP_N);
    });

    return {
      startKey: weekInfo.startKey,
      endKey: weekInfo.endKey,
      weekId: weekInfo.id,
      weekLabel: weekInfo.headerLabel,
      weekShort: weekInfo.shortLabel,
      weekDisplay: weekInfo.label,
      totalIssues: rangeRows.length,
      byCategory,
      byProblem,
      bySp,
      byRoute,
      byDc,
      catTop,
      daily
    };
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderDailyNarrative(report) {
    if (!report) return '<p class="section-note">No delay-reason / IR data for this date.</p>';
    if (!report.totals.all) {
      return '<p class="section-note">No IR rows (NO CLOCK-IN / NO CLOCK-OUT / IR DEPARTURE / IR TRAVEL TIME) for <strong>' +
        escapeHtml(report.dateKey) + '</strong>.</p>';
    }

    let html = '<div class="pe-report">';
    html += '<div class="pe-header">';
    html += '<h2>Daily Problem Encountered</h2>';
    html += '<div class="pe-week">' + escapeHtml(report.weekLabel) + '</div>';
    html += '<div class="pe-date">' + escapeHtml(report.dateLabel) + '</div>';
    const catBits = Object.entries(report.totals.byCategory || {})
      .map(([k, v]) => escapeHtml(k) + ' ' + v).join(' · ');
    html += '<div class="pe-stats">' + report.totals.issues + ' issue(s)' +
      (catBits ? ' · ' + catBits : '') + '</div>';
    html += '</div>';

    report.sections.forEach(sec => {
      html += '<div class="pe-side"><h3 class="pe-side-title">' + escapeHtml(sec.category) +
        ' <span class="pe-count-badge">' + sec.count + '</span></h3>';
      if (!sec.clusters.length) {
        html += '<p class="section-note">No details recorded.</p></div>';
        return;
      }
      sec.clusters.forEach((c, i) => {
        const loc = c.location ? ' (' + escapeHtml(c.location) + ')' : '';
        html += '<div class="pe-item">';
        html += '<div class="pe-item-title">' + (i + 1) + '. <span class="pe-highlight">' +
          escapeHtml(c.problem) + loc + '</span></div>';
        if (c.remarks) {
          html += '<p class="pe-narrative">' + escapeHtml(c.remarks).replace(/\n/g, '<br>') + '</p>';
        }
        html += '<div class="pe-meta">';
        c.items.forEach(it => {
          html += '<span class="pe-chip">' + escapeHtml(it.shipmentNo || '—') +
            ' · ' + escapeHtml(it.plate || '—') +
            ' · ' + escapeHtml(it.route || it.mission || '—') +
            ' · ' + escapeHtml(it.sp || it.trucker || '—') + '</span>';
        });
        html += '</div></div>';
      });
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderWeekly(report) {
    if (!report) return '<p class="section-note">No delay-reason data for weekly summary.</p>';

    function listBlock(rows) {
      if (!rows.length) return '<p class="section-note">No data</p>';
      let h = '<table class="pe-week-table"><thead><tr><th>Item</th><th>Count</th></tr></thead><tbody>';
      rows.forEach(r => {
        h += '<tr><td>' + escapeHtml(r.key) + '</td><td class="neg">' + r.count + '</td></tr>';
      });
      return h + '</tbody></table>';
    }

    let html = '<div class="pe-report">';
    html += '<div class="pe-header">';
    html += '<h2>Weekly Problem Encountered</h2>';
    html += '<div class="pe-week">' + escapeHtml(report.weekLabel) + '</div>';
    html += '<div class="pe-date">' + escapeHtml(report.startKey) + ' → ' + escapeHtml(report.endKey) + '</div>';
    html += '<div class="pe-stats">' + report.totalIssues + ' total IR / problem row(s)</div>';
    html += '</div>';

    html += '<h3 class="pe-digest-title">Day-by-day digest</h3><div class="pe-digest">';
    (report.daily || []).forEach(d => {
      html += '<div class="pe-digest-day"><div class="pe-digest-date">' + escapeHtml(d.dateLabel) +
        ' · <strong>' + d.total + '</strong></div><ul class="pe-digest-list">';
      (d.topProblems || []).forEach(p => {
        html += '<li><span class="pe-cat">' + escapeHtml(p.category) + '</span> ' +
          escapeHtml(p.problem) + ' (' + p.count + ')</li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';

    html += '<h3 class="pe-digest-title">Top contributors</h3><div class="pe-week-grid">';
    html += '<div class="pe-week-card"><h3>By Category</h3>' + listBlock(report.byCategory) + '</div>';
    html += '<div class="pe-week-card"><h3>By Problem (SPECIFIC)</h3>' + listBlock(report.byProblem) + '</div>';
    html += '<div class="pe-week-card"><h3>By SP / Carrier</h3>' + listBlock(report.bySp) + '</div>';
    html += '<div class="pe-week-card"><h3>By Departure DC</h3>' + listBlock(report.byDc) + '</div>';
    html += '<div class="pe-week-card"><h3>By Route</h3>' + listBlock(report.byRoute) + '</div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderTable(rows) {
    if (!rows || !rows.length) {
      return '<p class="section-note">No IR / delay-reason rows for this date. Expected sheets: <strong>NO CLOCK-IN</strong>, <strong>NO CLOCK-OUT</strong>, <strong>IR DEPARTURE</strong>, <strong>IR TRAVEL TIME</strong>.</p>';
    }
    let html = '<div class="table-scroll pe-table-scroll"><table><thead><tr>' +
      '<th>Date</th><th>Category</th><th>Shipment</th><th>Plate</th><th>Route</th><th>Dep DC</th>' +
      '<th>SP / Carrier</th><th>Problem (SPECIFIC)</th><th>IR Status</th><th>Detail</th>' +
      '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>' +
        '<td>' + escapeHtml(r.dateKey) + '</td>' +
        '<td>' + escapeHtml(r.category) + '</td>' +
        '<td>' + escapeHtml(r.shipmentNo) + '</td>' +
        '<td>' + escapeHtml(r.plate) + '</td>' +
        '<td>' + escapeHtml(r.route || r.mission) + '</td>' +
        '<td>' + escapeHtml(r.depDc) + '</td>' +
        '<td>' + escapeHtml(r.sp || r.trucker) + '</td>' +
        '<td>' + escapeHtml(r.problem) + '</td>' +
        '<td>' + escapeHtml(r.remarksStatus || (r.irFile ? 'WITH IR' : '')) + '</td>' +
        '<td style="max-width:280px;white-space:pre-wrap;font-size:0.78rem;">' +
          escapeHtml((r.detailed || '').slice(0, 240)) +
          ((r.detailed || '').length > 240 ? '…' : '') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function populateDateSelect(focusDate) {
    const sel = document.getElementById('selectDelayDate');
    if (!sel) return;
    const dates = delayDates.length ? delayDates : [];
    if (!dates.length) {
      sel.innerHTML = '<option value="">No IR dates</option>';
      return;
    }
    sel.innerHTML = '<option value="ALL">Overall (All dates)</option>' +
      dates.map(d => '<option value="' + d + '">' + d + '</option>').join('');
    if (focusDate === 'ALL') {
      sel.value = 'ALL';
    } else {
      const pick = (focusDate && dates.includes(focusDate)) ? focusDate : dates[dates.length - 1];
      sel.value = pick;
    }
  }

  function populateWeekSelect(focusDate) {
    const sel = document.getElementById('selectDelayWeek');
    if (!sel) return;
    const weeks = listAvailableWeeks();
    if (!weeks.length) {
      sel.innerHTML = '<option value="">No weeks</option>';
      return;
    }
    sel.innerHTML = weeks.map(w =>
      '<option value="' + w.id + '">' + escapeHtml(w.label) + '</option>'
    ).join('');
    if (focusDate) {
      const info = getIsoWeekInfo(focusDate);
      if (info && weeks.some(w => w.id === info.id)) sel.value = info.id;
    }
  }

  function showView(view) {
    const daily = document.getElementById('peDailyView');
    const weekly = document.getElementById('peWeeklyView');
    const table = document.getElementById('peTableView');
    const dateWrap = document.getElementById('peDateFilterWrap');
    const weekWrap = document.getElementById('peWeekFilterWrap');
    if (daily) daily.classList.toggle('hidden', view !== 'daily');
    if (weekly) weekly.classList.toggle('hidden', view !== 'weekly');
    if (table) table.classList.toggle('hidden', view !== 'table');
    if (dateWrap) dateWrap.style.display = (view === 'weekly') ? 'none' : '';
    if (weekWrap) weekWrap.style.display = (view === 'weekly') ? '' : 'none';
    document.querySelectorAll('.pe-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-pe-view') === view);
    });
  }

  function render(focusDate) {
    populateDateSelect(focusDate);
    populateWeekSelect(focusDate);
    const dateSel = document.getElementById('selectDelayDate');
    const weekSel = document.getElementById('selectDelayWeek');
    const dateKey = (dateSel && dateSel.value) || focusDate || (delayDates[delayDates.length - 1] || null);

    const dailyEl = document.getElementById('peDailyView');
    const weeklyEl = document.getElementById('peWeeklyView');
    const tableEl = document.getElementById('peTableView');

    if (dailyEl) dailyEl.innerHTML = renderDailyNarrative(dateKey ? buildDailyReport(dateKey) : null);
    if (weeklyEl) {
      const weekId = weekSel ? weekSel.value : null;
      const weekAnchor = (dateKey && dateKey !== 'ALL') ? dateKey : (delayDates[delayDates.length - 1] || null);
      weeklyEl.innerHTML = renderWeekly(buildWeeklyReport(weekId, weekAnchor));
    }
    if (tableEl) tableEl.innerHTML = renderTable(dateKey ? rowsForDate(dateKey) : []);
  }

  function init() {
    document.querySelectorAll('.pe-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-pe-view') || 'daily';
        showView(view);
      });
    });
    const dateSel = document.getElementById('selectDelayDate');
    if (dateSel) {
      dateSel.addEventListener('change', () => {
        const dk = dateSel.value;
        const dailyEl = document.getElementById('peDailyView');
        const tableEl = document.getElementById('peTableView');
        if (dailyEl) dailyEl.innerHTML = renderDailyNarrative(buildDailyReport(dk));
        if (tableEl) tableEl.innerHTML = renderTable(rowsForDate(dk));
      });
    }
    const weekSel = document.getElementById('selectDelayWeek');
    if (weekSel) {
      weekSel.addEventListener('change', () => {
        const weeklyEl = document.getElementById('peWeeklyView');
        if (weeklyEl) weeklyEl.innerHTML = renderWeekly(buildWeeklyReport(weekSel.value, null));
      });
    }
    showView('daily');
  }

  return {
    ingestWorkbook,
    getState,
    render,
    init,
    buildDailyReport,
    buildWeeklyReport,
    listAvailableWeeks
  };
})();
