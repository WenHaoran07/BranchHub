/* ==========================================================================
   MODULE: BDR LATE FILTER
   Date / Week + Sort + SP filters for SP Late Routes & Late Trip Detail
   ========================================================================== */
const BdrLateFilter = (() => {
  const { fmtDuration, cleanText } = BdrUtils;

  let availableDates = [];
  let availableSps = [];
  let selectedSpSet = new Set(); // empty = all SPs
  let bound = false;
  let preferDateOnLoad = null;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function getAllRows() {
    const { storedRows } = BdrFileProcessor.getState();
    return storedRows || [];
  }

  function rowsForScope(spec) {
    const all = getAllRows();
    if (!spec || (spec.mode === 'date' && (!spec.dateKey || spec.dateKey === 'ALL'))) {
      return all.slice();
    }
    if (spec.mode === 'week' && spec.weekId) {
      const weeks = listAvailableWeeks();
      const info = weeks.find(w => w.id === spec.weekId);
      if (!info) return [];
      return all.filter(r => r.dateKey >= info.startKey && r.dateKey <= info.endKey);
    }
    return all.filter(r => r.dateKey === spec.dateKey);
  }

  function currentScopeSpec() {
    const modeSel = document.getElementById('bdrLateModeFilter');
    const mode = modeSel ? modeSel.value : 'date';
    if (mode === 'week') {
      const weekSel = document.getElementById('bdrLateWeekFilter');
      return { mode: 'week', weekId: weekSel ? weekSel.value : null };
    }
    const dateSel = document.getElementById('bdrLateDateFilter');
    return { mode: 'date', dateKey: dateSel ? dateSel.value : 'ALL' };
  }

  function currentSortKey() {
    const sel = document.getElementById('bdrLateSortFilter');
    return sel ? sel.value : 'totalDelay';
  }

  function getSelectedSps() {
    return [...selectedSpSet];
  }

  function updateMsLabel() {
    const label = document.getElementById('bdrLateMsLabel');
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
    const list = document.getElementById('bdrLateSpList');
    if (!list) return;
    const prev = preserveSelection ? new Set(selectedSpSet) : new Set();
    selectedSpSet = new Set([...prev].filter(sp => availableSps.includes(sp)));
    if (!availableSps.length) {
      list.innerHTML = '<div class="sp-ms-empty">No SPs for this scope</div>';
      updateMsLabel();
      return;
    }
    list.innerHTML = availableSps.map(sp => {
      return '<label class="sp-ms-item">' +
        '<input type="checkbox" class="bdr-ms-check" value="' + escapeHtml(sp) + '"' +
        (selectedSpSet.has(sp) ? ' checked' : '') + '>' +
        '<span>' + escapeHtml(sp) + '</span></label>';
    }).join('');
    updateMsLabel();
  }

  function syncSelectionFromChecks() {
    const list = document.getElementById('bdrLateSpList');
    if (!list) return;
    const checks = [...list.querySelectorAll('.bdr-ms-check')];
    selectedSpSet = new Set(checks.filter(c => c.checked).map(c => c.value));
    updateMsLabel();
  }

  function setModeUI(mode) {
    const dateWrap = document.getElementById('bdrLateDateWrap');
    const weekWrap = document.getElementById('bdrLateWeekWrap');
    if (dateWrap) dateWrap.style.display = mode === 'week' ? 'none' : '';
    if (weekWrap) weekWrap.style.display = mode === 'week' ? '' : 'none';
  }

  function populateWeekSelect(preferDate) {
    const weekSel = document.getElementById('bdrLateWeekFilter');
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

  function populateFilters(preferDate) {
    const dateSel = document.getElementById('bdrLateDateFilter');
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
    const modeSel = document.getElementById('bdrLateModeFilter');
    setModeUI(modeSel ? modeSel.value : 'date');
    // Rebuild SP list for current scope
    refreshAvailableSps();
    renderSpChecklist(true);
  }

  function refreshAvailableSps() {
    const scope = rowsForScope(currentScopeSpec());
    const late = scope.filter(r => r.onTime === 'NO');
    availableSps = [...new Set(late.map(r => r.sp || '(blank)'))].sort((a, b) => a.localeCompare(b));
  }

  function filterBySp(rows) {
    if (!selectedSpSet.size || selectedSpSet.size === availableSps.length) return rows;
    return rows.filter(r => selectedSpSet.has(r.sp || '(blank)'));
  }

  function buildSpRouteAgg(lateRows) {
    const map = {};
    lateRows.forEach(r => {
      const sp = r.sp || '(blank)';
      const route = r.route || '(blank)';
      const key = sp + '||' + route;
      if (!map[key]) {
        map[key] = {
          sp,
          route,
          depDc: r.dcName || r.dcIntended || r.depDc || '',
          lateCount: 0,
          totalDelayMin: 0
        };
      }
      map[key].lateCount += 1;
      const lm = Number(r.lateMin) || 0;
      if (lm > 0) map[key].totalDelayMin += lm;
    });
    return Object.values(map).map(g => ({
      ...g,
      avgDelayMin: g.lateCount ? g.totalDelayMin / g.lateCount : 0
    }));
  }

  function sortAgg(rows) {
    const key = currentSortKey();
    const list = rows.slice();
    if (key === 'lateTrips') {
      list.sort((a, b) => b.lateCount - a.lateCount || b.totalDelayMin - a.totalDelayMin);
    } else if (key === 'avgDelay') {
      list.sort((a, b) => b.avgDelayMin - a.avgDelayMin || b.lateCount - a.lateCount);
    } else {
      list.sort((a, b) => b.totalDelayMin - a.totalDelayMin || b.lateCount - a.lateCount);
    }
    return list;
  }

  function scopeNoteText(spec, count, entityLabel) {
    let scopeTxt = '';
    if (spec.mode === 'week' && spec.weekId) {
      const weeks = listAvailableWeeks();
      const info = weeks.find(w => w.id === spec.weekId);
      scopeTxt = info ? ' · ' + info.label : ' · week';
    } else if (spec.dateKey && spec.dateKey !== 'ALL') {
      scopeTxt = ' · ' + spec.dateKey;
    } else {
      scopeTxt = ' · Overall (All dates)';
    }
    const sortKey = currentSortKey();
    const sortLbl = sortKey === 'lateTrips' ? 'late trips' : (sortKey === 'avgDelay' ? 'avg delay' : 'total delay');
    const spN = selectedSpSet.size;
    const spTxt = (!spN || spN === availableSps.length) ? '' : (' · ' + spN + ' SP(s)');
    return count + ' ' + entityLabel + scopeTxt + spTxt + ' · sorted by ' + sortLbl;
  }

  function renderSpLateRoutes() {
    const body = document.getElementById('spLateRoutesBody');
    const note = document.getElementById('bdrLateNote');
    if (!body) return;

    const spec = currentScopeSpec();
    const scope = rowsForScope(spec);
    const late = filterBySp(scope.filter(r => r.onTime === 'NO'));
    const agg = sortAgg(buildSpRouteAgg(late));

    if (note) note.textContent = scopeNoteText(spec, agg.length, 'SP–route group(s)');

    if (!agg.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">No late trips for this filter</td></tr>';
      return;
    }

    body.innerHTML = agg.map((r, i) =>
      '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td style="font-weight:600;">' + escapeHtml(r.sp) + '</td>' +
      '<td>' + escapeHtml(r.route) + '</td>' +
      '<td>' + escapeHtml(r.depDc) + '</td>' +
      '<td class="neg">' + r.lateCount + '</td>' +
      '<td class="neg">' + fmtDuration(r.totalDelayMin) + '</td>' +
      '<td class="neg">' + fmtDuration(r.avgDelayMin) + '</td>' +
      '</tr>'
    ).join('');
  }

  function renderLateDetail() {
    const body = document.getElementById('lateBody');
    const note = document.getElementById('bdrLateDetailNote');
    if (!body) return;

    const spec = currentScopeSpec();
    const scope = rowsForScope(spec);
    let late = filterBySp(scope.filter(r => r.onTime === 'NO'));

    // Sort by late minutes desc; missing dispatch last
    late = late.slice().sort((a, b) => {
      const am = !!a.missingDispatch;
      const bm = !!b.missingDispatch;
      if (am !== bm) return am ? 1 : -1;
      return Math.abs(b.lateMin || 0) - Math.abs(a.lateMin || 0);
    });

    if (note) {
      let scopeTxt = '';
      if (spec.mode === 'week' && spec.weekId) {
        const weeks = listAvailableWeeks();
        const info = weeks.find(w => w.id === spec.weekId);
        scopeTxt = info ? info.label : 'week';
      } else if (spec.dateKey && spec.dateKey !== 'ALL') {
        scopeTxt = spec.dateKey;
      } else {
        scopeTxt = 'Overall (All dates)';
      }
      const spN = selectedSpSet.size;
      const spTxt = (!spN || spN === availableSps.length) ? 'All SPs' : (spN + ' SP(s)');
      note.textContent = late.length + ' late departure(s) · ' + scopeTxt + ' · ' + spTxt;
    }

    if (!late.length) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">No late trips for this filter</td></tr>';
      return;
    }

    const noDispatchLabel = 'Not on time';
    body.innerHTML = late.map(r => {
      const ship = escapeHtml(r.shipmentNo || r.uniqueCode || '');
      const missing = !!r.missingDispatch;
      return '<tr>' +
        '<td>' + ship + '</td>' +
        '<td>' + escapeHtml(r.route || '') + '</td>' +
        '<td>' + escapeHtml(r.dcName || r.dcIntended || r.depDc || '') + '</td>' +
        '<td>' + escapeHtml(r.sp || '') + '</td>' +
        '<td>' + escapeHtml(r.lineType || '') + '</td>' +
        '<td>' + escapeHtml(r.plate || '') + '</td>' +
        '<td>' + escapeHtml(r.scheduledDep || '—') + '</td>' +
        '<td class="' + (missing ? 'neg' : '') + '">' + (missing ? noDispatchLabel : escapeHtml(r.dispatchTime || '—')) + '</td>' +
        '<td class="neg">' + (missing ? noDispatchLabel : fmtDuration(r.lateMin)) + '</td>' +
        '</tr>';
    }).join('');
  }

  function applyFilters() {
    refreshAvailableSps();
    // Keep SP selection valid
    selectedSpSet = new Set([...selectedSpSet].filter(sp => availableSps.includes(sp)));
    renderSpChecklist(true);
    renderSpLateRoutes();
    renderLateDetail();
  }

  function selectAllSps(select) {
    if (select) {
      selectedSpSet = new Set(availableSps);
    } else {
      selectedSpSet = new Set();
    }
    renderSpChecklist(false);
    if (select) {
      const list = document.getElementById('bdrLateSpList');
      if (list) {
        list.querySelectorAll('.bdr-ms-check').forEach(c => { c.checked = true; });
        selectedSpSet = new Set(availableSps);
        updateMsLabel();
      }
    }
    renderSpLateRoutes();
    renderLateDetail();
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    const modeSel = document.getElementById('bdrLateModeFilter');
    if (modeSel) {
      modeSel.addEventListener('change', () => {
        setModeUI(modeSel.value);
        applyFilters();
      });
    }
    const dateSel = document.getElementById('bdrLateDateFilter');
    if (dateSel) dateSel.addEventListener('change', applyFilters);
    const weekSel = document.getElementById('bdrLateWeekFilter');
    if (weekSel) weekSel.addEventListener('change', applyFilters);
    const sortSel = document.getElementById('bdrLateSortFilter');
    if (sortSel) sortSel.addEventListener('change', () => {
      renderSpLateRoutes();
      // detail stays same order by late min
    });

    const toggle = document.getElementById('bdrLateMsToggle');
    const panel = document.getElementById('bdrLateMsPanel');
    if (toggle && panel) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !panel.classList.contains('hidden');
        panel.classList.toggle('hidden', open);
        toggle.classList.toggle('open', !open);
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
      document.addEventListener('click', (e) => {
        if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== toggle) {
          panel.classList.add('hidden');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
    const list = document.getElementById('bdrLateSpList');
    if (list) {
      list.addEventListener('change', () => {
        syncSelectionFromChecks();
        renderSpLateRoutes();
        renderLateDetail();
      });
    }
    const btnAll = document.getElementById('bdrLateSpAll');
    if (btnAll) btnAll.addEventListener('click', () => selectAllSps(true));
    const btnClear = document.getElementById('bdrLateSpClear');
    if (btnClear) btnClear.addEventListener('click', () => selectAllSps(false));

    // Shared toolbar for Late Detail uses same controls (cloned ids avoided — one toolbar serves both via notes)
  }

  /**
   * Called after main data load / compare.
   * preferDate: focus day from main compare (or ALL).
   */
  function render(preferDate) {
    const { storedDates } = BdrFileProcessor.getState();
    availableDates = (storedDates || []).slice();
    preferDateOnLoad = preferDate || null;
    bindEvents();
    populateFilters(preferDate || 'ALL');
    applyFilters();
  }

  function init() {
    bindEvents();
  }

  return { init, render, applyFilters };
})();
