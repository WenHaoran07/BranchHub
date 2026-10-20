/* ==========================================================================
   MODULE: BLT SP DELAY ENCOUNTERED
   Top delay contributors by SP → Route, with duration + problem detail (Show)
   ========================================================================== */
const BltSpDelay = (() => {
  const { fmtDuration, cleanText } = BltUtils;

  let allLateAgg = []; // full aggregated rows for current date scope
  let availableSps = [];
  let availableDates = [];
  let expandedKey = null;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tripOverrunMin(r) {
    if (r.missingDispatch) return 0;
    const plan = Number(r.planTT) || 0;
    const actual = Number(r.actualTT) || 0;
    if (plan <= 0 && actual <= 0) return 0;
    return Math.max(0, actual - plan);
  }

  /** Index IR / delay-reason rows for quick lookup */
  function buildProblemIndex() {
    const index = { byShipment: {}, byRouteSp: {} };
    if (typeof BltDelayReason === 'undefined' || !BltDelayReason.getState) return index;
    const { delayRows } = BltDelayReason.getState();
    (delayRows || []).forEach(d => {
      const ship = cleanText(d.shipmentNo);
      if (ship) {
        if (!index.byShipment[ship]) index.byShipment[ship] = [];
        index.byShipment[ship].push(d);
      }
      const rk = (d.dateKey || '') + '||' + (d.sp || d.trucker || '') + '||' + (d.route || '');
      if (!index.byRouteSp[rk]) index.byRouteSp[rk] = [];
      index.byRouteSp[rk].push(d);
    });
    return index;
  }

  function problemsForGroup(trips, problemIndex) {
    const seen = new Set();
    const out = [];
    trips.forEach(t => {
      const ship = cleanText(t.shipmentNo);
      const fromShip = ship && problemIndex.byShipment[ship] ? problemIndex.byShipment[ship] : [];
      fromShip.forEach(p => {
        const id = p.shipmentNo + '|' + p.problem + '|' + (p.detailed || '').slice(0, 40);
        if (seen.has(id)) return;
        seen.add(id);
        out.push(p);
      });
      if (!fromShip.length) {
        const rk = (t.dateKey || '') + '||' + (t.sp || '') + '||' + (t.route || '');
        (problemIndex.byRouteSp[rk] || []).forEach(p => {
          const id = p.shipmentNo + '|' + p.problem + '|' + (p.detailed || '').slice(0, 40);
          if (seen.has(id)) return;
          seen.add(id);
          out.push(p);
        });
      }
    });
    return out;
  }

  /** Sunday–Saturday week info for a YYYY-MM-DD key */
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
    const monthName = months[monthForLabel];
    return {
      id: yearForLabel + '-W' + String(weekNo).padStart(2, '0'),
      startKey: toKey(sunday),
      endKey: toKey(saturday),
      label: 'Week ' + weekOfMonth + ' (WK' + weekNo + ') · ' + monthName + ' ' + yearForLabel +
        ' · ' + toKey(sunday) + ' → ' + toKey(saturday)
    };
  }

  function listAvailableWeeks() {
    const map = {};
    availableDates.forEach(dk => {
      const info = getWeekInfo(dk);
      if (!info) return;
      if (!map[info.id]) map[info.id] = info;
    });
    return Object.values(map).sort((a, b) => b.startKey.localeCompare(a.startKey));
  }

  /**
   * Build top delay contributors.
   * scopeSpec: { mode: 'date'|'week', dateKey?, weekId? }
   * dateKey = 'ALL' or YYYY-MM-DD; weekId = e.g. 2026-W41
   */
  function buildAggregates(scopeSpec) {
    const { storedRows, storedDates } = BltFileProcessor.getState();
    const rows = storedRows || [];
    availableDates = (storedDates || []).slice();

    let mode = 'date';
    let dateKey = 'ALL';
    let weekId = null;
    if (typeof scopeSpec === 'string') {
      // backward compatible: string treated as dateKey
      dateKey = scopeSpec || 'ALL';
    } else if (scopeSpec && typeof scopeSpec === 'object') {
      mode = scopeSpec.mode || 'date';
      dateKey = scopeSpec.dateKey || 'ALL';
      weekId = scopeSpec.weekId || null;
    }

    let scope = rows;
    if (mode === 'week') {
      const weeks = listAvailableWeeks();
      let weekInfo = weekId ? weeks.find(w => w.id === weekId) : null;
      if (!weekInfo && weeks.length) weekInfo = weeks[0];
      if (weekInfo) {
        scope = rows.filter(r => r.dateKey >= weekInfo.startKey && r.dateKey <= weekInfo.endKey);
      }
    } else if (dateKey && dateKey !== 'ALL') {
      scope = rows.filter(r => r.dateKey === dateKey);
    }
    const late = scope.filter(r => r.onTime === 'NO');
    const problemIndex = buildProblemIndex();

    // SP → Route groups
    const map = {};
    late.forEach(r => {
      const sp = r.sp || '(blank)';
      const route = r.route || '(blank)';
      const key = sp + '||' + route;
      if (!map[key]) {
        map[key] = {
          key,
          sp,
          route,
          lateCount: 0,
          totalOverrunMin: 0,
          trips: [],
          dcName: r.dcName || r.dcIntended || r.depDc || ''
        };
      }
      map[key].lateCount++;
      map[key].totalOverrunMin += tripOverrunMin(r);
      map[key].trips.push(r);
    });

    allLateAgg = Object.values(map).map(g => {
      const problems = problemsForGroup(g.trips, problemIndex);
      return {
        ...g,
        avgOverrunMin: g.lateCount ? g.totalOverrunMin / g.lateCount : 0,
        problemCount: problems.length,
        problems
      };
    }).sort((a, b) => b.totalOverrunMin - a.totalOverrunMin || b.lateCount - a.lateCount);

    availableSps = [...new Set(allLateAgg.map(r => r.sp))].sort((a, b) => a.localeCompare(b));
    return allLateAgg;
  }

  let selectedSpSet = new Set(); // empty = all SPs

  function getSelectedSps() {
    return [...selectedSpSet];
  }

  function updateMsLabel() {
    const label = document.getElementById('spDelayMsLabel');
    if (!label) return;
    const n = selectedSpSet.size;
    if (!n || n === availableSps.length) {
      label.textContent = 'All SPs';
    } else if (n === 1) {
      label.textContent = [...selectedSpSet][0];
    } else {
      label.textContent = n + ' SPs selected';
    }
  }

  function renderSpChecklist(preserveSelection) {
    const list = document.getElementById('spDelaySpList');
    if (!list) return;
    const prev = preserveSelection ? new Set(selectedSpSet) : new Set();
    // Drop selections no longer in availableSps
    selectedSpSet = new Set([...prev].filter(sp => availableSps.includes(sp)));
    if (!availableSps.length) {
      list.innerHTML = '<div class="sp-ms-empty">No SPs for this date</div>';
      updateMsLabel();
      return;
    }
    list.innerHTML = availableSps.map(sp => {
      const checked = selectedSpSet.size === 0 ? false : selectedSpSet.has(sp);
      // When selectedSpSet empty => all; show unchecked UI state meaning "all" is default
      // Actually when empty = all, leave checkboxes unchecked until user picks subset
      return '<label class="sp-ms-item">' +
        '<input type="checkbox" class="sp-ms-check" value="' + escapeHtml(sp) + '"' +
        (selectedSpSet.has(sp) ? ' checked' : '') + '>' +
        '<span>' + escapeHtml(sp) + '</span></label>';
    }).join('');
    updateMsLabel();
  }

  function syncSelectionFromChecks() {
    const list = document.getElementById('spDelaySpList');
    if (!list) return;
    const checks = [...list.querySelectorAll('.sp-ms-check')];
    selectedSpSet = new Set(checks.filter(c => c.checked).map(c => c.value));
    updateMsLabel();
  }

  function populateWeekSelect(preferDate) {
    const weekSel = document.getElementById('spDelayWeekFilter');
    if (!weekSel) return;
    const weeks = listAvailableWeeks();
    if (!weeks.length) {
      weekSel.innerHTML = '<option value="">No weeks</option>';
      return;
    }
    weekSel.innerHTML = weeks.map(w =>
      '<option value="' + w.id + '">' + escapeHtml(w.label) + '</option>'
    ).join('');
    if (preferDate && preferDate !== 'ALL') {
      const info = getWeekInfo(preferDate);
      if (info && weeks.some(w => w.id === info.id)) weekSel.value = info.id;
    }
  }

  function setModeUI(mode) {
    const dateWrap = document.getElementById('spDelayDateWrap');
    const weekWrap = document.getElementById('spDelayWeekWrap');
    if (dateWrap) dateWrap.style.display = mode === 'week' ? 'none' : '';
    if (weekWrap) weekWrap.style.display = mode === 'week' ? '' : 'none';
  }

  function populateFilters(preferDate) {
    const dateSel = document.getElementById('spDelayDateFilter');
    if (dateSel) {
      const dates = availableDates.length ? availableDates : [];
      dateSel.innerHTML = '<option value="ALL">Overall (All dates)</option>' +
        dates.map(d => '<option value="' + d + '">' + d + '</option>').join('');
      if (preferDate && (preferDate === 'ALL' || dates.includes(preferDate))) {
        dateSel.value = preferDate;
      } else if (dates.length) {
        dateSel.value = dates[dates.length - 1];
      } else {
        dateSel.value = 'ALL';
      }
    }
    populateWeekSelect(preferDate && preferDate !== 'ALL' ? preferDate : (availableDates[availableDates.length - 1] || null));
    const modeSel = document.getElementById('spDelayModeFilter');
    setModeUI(modeSel ? modeSel.value : 'date');
    renderSpChecklist(true);
  }

  function currentScopeSpec() {
    const modeSel = document.getElementById('spDelayModeFilter');
    const mode = modeSel ? modeSel.value : 'date';
    if (mode === 'week') {
      const weekSel = document.getElementById('spDelayWeekFilter');
      return { mode: 'week', weekId: weekSel ? weekSel.value : null };
    }
    const dateSel = document.getElementById('spDelayDateFilter');
    return { mode: 'date', dateKey: dateSel ? dateSel.value : 'ALL' };
  }

  function currentSortKey() {
    const sel = document.getElementById('spDelaySortFilter');
    return sel ? sel.value : 'totalDelay';
  }

  function sortRows(rows) {
    const key = currentSortKey();
    const list = rows.slice();
    if (key === 'lateTrips') {
      list.sort((a, b) => b.lateCount - a.lateCount || b.totalOverrunMin - a.totalOverrunMin);
    } else if (key === 'avgDelay') {
      list.sort((a, b) => b.avgOverrunMin - a.avgOverrunMin || b.lateCount - a.lateCount);
    } else {
      // totalDelay (default)
      list.sort((a, b) => b.totalOverrunMin - a.totalOverrunMin || b.lateCount - a.lateCount);
    }
    return list;
  }

  function filteredRows() {
    buildAggregates(currentScopeSpec());
    const sps = getSelectedSps();
    let rows = allLateAgg;
    if (sps.length) {
      const set = new Set(sps);
      rows = allLateAgg.filter(r => set.has(r.sp));
    }
    return sortRows(rows);
  }

  function renderProblemPanel(g) {
    if (!g.problems || !g.problems.length) {
      return '<div class="sp-delay-problems"><p class="section-note">No problem encountered / IR linked for this SP + route' +
        (g.lateCount ? ' (' + g.lateCount + ' late trip(s) still have no matching IR row).' : '.') +
        '</p></div>';
    }
    let html = '<div class="sp-delay-problems"><div class="sp-delay-problems-title">Problem encountered · ' +
      escapeHtml(g.sp) + ' · ' + escapeHtml(g.route) + '</div>';
    g.problems.forEach((p, i) => {
      html += '<div class="pe-item">';
      html += '<div class="pe-item-title">' + (i + 1) + '. <span class="pe-highlight">' +
        escapeHtml(p.problem || p.category || 'Unspecified') + '</span>';
      if (p.category) html += ' <span class="pe-cat">' + escapeHtml(p.category) + '</span>';
      html += '</div>';
      if (p.detailed || p.remarks) {
        html += '<p class="pe-narrative">' + escapeHtml(p.detailed || p.remarks).replace(/\n/g, '<br>') + '</p>';
      }
      html += '<div class="pe-meta">';
      html += '<span class="pe-chip">' + escapeHtml(p.dateKey || '') + '</span>';
      if (p.shipmentNo) html += '<span class="pe-chip">' + escapeHtml(p.shipmentNo) + '</span>';
      if (p.plate) html += '<span class="pe-chip">' + escapeHtml(p.plate) + '</span>';
      if (p.remarksStatus) html += '<span class="pe-chip">' + escapeHtml(p.remarksStatus) + '</span>';
      if (p.irFile) html += '<span class="pe-chip">' + escapeHtml(p.irFile) + '</span>';
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderTable() {
    const body = document.getElementById('spDelayBody');
    const detail = document.getElementById('spDelayDetail');
    const note = document.getElementById('spDelayNote');
    if (!body) return;

    const rows = filteredRows();
    if (note) {
      const scope = currentScopeSpec();
      let scopeTxt = '';
      if (scope.mode === 'week') {
        const weekSel = document.getElementById('spDelayWeekFilter');
        const opt = weekSel && weekSel.selectedOptions[0] ? weekSel.selectedOptions[0].textContent : scope.weekId;
        scopeTxt = ' · week: ' + (opt || '');
      } else if (scope.dateKey === 'ALL') {
        scopeTxt = ' · Overall (all dates)';
      } else {
        scopeTxt = ' · date: ' + scope.dateKey;
      }
      const sortKey = currentSortKey();
      const sortLbl = sortKey === 'lateTrips' ? 'late trips' : (sortKey === 'avgDelay' ? 'avg delay' : 'total delay');
      note.textContent = rows.length + ' SP–route group(s)' + scopeTxt + ' · sorted by ' + sortLbl;
    }

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No late trips for this filter</td></tr>';
      if (detail) detail.innerHTML = '';
      expandedKey = null;
      return;
    }

    body.innerHTML = rows.map((r, idx) => {
      const isOpen = expandedKey === r.key;
      return '<tr class="' + (isOpen ? 'sp-delay-row-open' : '') + '" data-key="' + escapeHtml(r.key) + '">' +
        '<td>' + (idx + 1) + '</td>' +
        '<td>' + escapeHtml(r.sp) + '</td>' +
        '<td>' + escapeHtml(r.route) + '</td>' +
        '<td>' + escapeHtml(r.dcName || '') + '</td>' +
        '<td class="neg">' + r.lateCount + '</td>' +
        '<td class="neg">' + fmtDuration(r.totalOverrunMin) + '</td>' +
        '<td class="neg">' + fmtDuration(r.avgOverrunMin) + '</td>' +
        '<td><button type="button" class="sp-delay-show-btn' + (isOpen ? ' active' : '') +
          '" data-key="' + escapeHtml(r.key) + '">' +
          (isOpen ? 'Hide' : 'Show') +
          (r.problemCount ? ' (' + r.problemCount + ')' : '') +
          '</button></td>' +
        '</tr>';
    }).join('');

    if (detail) {
      if (expandedKey) {
        const g = rows.find(r => r.key === expandedKey) || allLateAgg.find(r => r.key === expandedKey);
        detail.innerHTML = g ? renderProblemPanel(g) : '';
      } else {
        detail.innerHTML = '';
      }
    }
  }

  function onShowClick(key) {
    expandedKey = (expandedKey === key) ? null : key;
    renderTable();
    const detail = document.getElementById('spDelayDetail');
    if (detail && expandedKey) {
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function applyFilters() {
    expandedKey = null;
    buildAggregates(currentScopeSpec());
    renderSpChecklist(true);
    renderTable();
  }

  function selectAllSps(select) {
    if (select) {
      selectedSpSet = new Set(availableSps);
    } else {
      selectedSpSet = new Set();
    }
    renderSpChecklist(false);
    // After clear (empty) = all SPs; after select all = all checked
    if (select) {
      const list = document.getElementById('spDelaySpList');
      if (list) {
        list.querySelectorAll('.sp-ms-check').forEach(c => { c.checked = true; });
        selectedSpSet = new Set(availableSps);
        updateMsLabel();
      }
    }
    expandedKey = null;
    renderTable();
  }

  function setDropdownOpen(open) {
    const panel = document.getElementById('spDelayMsPanel');
    const toggle = document.getElementById('spDelayMsToggle');
    if (!panel || !toggle) return;
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.classList.toggle('open', !!open);
  }

  /**
   * Called after main data load / compare. preferDate from focus day filter.
   */
  function render(preferDate) {
    const dateKey = preferDate || 'ALL';
    selectedSpSet = new Set(); // default: all SPs
    buildAggregates({ mode: 'date', dateKey: dateKey === 'ALL' ? 'ALL' : dateKey });
    populateFilters(dateKey);
    expandedKey = null;
    renderTable();
  }

  function init() {
    const modeSel = document.getElementById('spDelayModeFilter');
    if (modeSel) {
      modeSel.addEventListener('change', () => {
        setModeUI(modeSel.value);
        applyFilters();
      });
    }
    const dateSel = document.getElementById('spDelayDateFilter');
    if (dateSel) dateSel.addEventListener('change', applyFilters);
    const weekSel = document.getElementById('spDelayWeekFilter');
    if (weekSel) weekSel.addEventListener('change', applyFilters);
    const sortSel = document.getElementById('spDelaySortFilter');
    if (sortSel) sortSel.addEventListener('change', () => {
      expandedKey = null;
      renderTable();
    });

    const toggle = document.getElementById('spDelayMsToggle');
    const panel = document.getElementById('spDelayMsPanel');
    if (toggle && panel) {
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        setDropdownOpen(panel.classList.contains('hidden'));
      });
      panel.addEventListener('click', e => e.stopPropagation());
      document.addEventListener('click', () => setDropdownOpen(false));
    }

    const list = document.getElementById('spDelaySpList');
    if (list) {
      list.addEventListener('change', e => {
        if (!e.target.classList.contains('sp-ms-check')) return;
        syncSelectionFromChecks();
        expandedKey = null;
        renderTable();
      });
    }

    const btnAll = document.getElementById('spDelaySpAll');
    if (btnAll) btnAll.addEventListener('click', e => { e.stopPropagation(); selectAllSps(true); });
    const btnClear = document.getElementById('spDelaySpClear');
    if (btnClear) btnClear.addEventListener('click', e => { e.stopPropagation(); selectAllSps(false); });

    const body = document.getElementById('spDelayBody');
    if (body) {
      body.addEventListener('click', e => {
        const btn = e.target.closest('.sp-delay-show-btn');
        if (!btn) return;
        onShowClick(btn.getAttribute('data-key'));
      });
    }
  }

  return { init, render, buildAggregates };
})();
