/* ==========================================================================
   MODULE: BAU DETAIL FILTER
   Date / Week + Sort + SP filters for all Detail Tables tabs
   ========================================================================== */
const BauDetailFilter = (() => {
  const { stats, groupBy, fmtPct, fmtPp, TARGET } = BauUtils;

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
    const { storedRows } = BauFileProcessor.getState();
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
    const modeSel = document.getElementById('bauDetailModeFilter');
    const mode = modeSel ? modeSel.value : 'date';
    if (mode === 'week') {
      const weekSel = document.getElementById('bauDetailWeekFilter');
      return { mode: 'week', weekId: weekSel ? weekSel.value : null };
    }
    const dateSel = document.getElementById('bauDetailDateFilter');
    return { mode: 'date', dateKey: dateSel ? dateSel.value : 'ALL' };
  }

  function currentSortKey() {
    const sel = document.getElementById('bauDetailSortFilter');
    return sel ? sel.value : 'miss';
  }

  function updateMsLabel() {
    const label = document.getElementById('bauDetailMsLabel');
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
    const list = document.getElementById('bauDetailSpList');
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
        '<input type="checkbox" class="bau-ms-check" value="' + escapeHtml(sp) + '"' +
        (selectedSpSet.has(sp) ? ' checked' : '') + '>' +
        '<span>' + escapeHtml(sp) + '</span></label>';
    }).join('');
    updateMsLabel();
  }

  function syncSelectionFromChecks() {
    const list = document.getElementById('bauDetailSpList');
    if (!list) return;
    const checks = [...list.querySelectorAll('.bau-ms-check')];
    selectedSpSet = new Set(checks.filter(c => c.checked).map(c => c.value));
    updateMsLabel();
  }

  function setModeUI(mode) {
    const dateWrap = document.getElementById('bauDetailDateWrap');
    const weekWrap = document.getElementById('bauDetailWeekWrap');
    if (dateWrap) dateWrap.style.display = mode === 'week' ? 'none' : '';
    if (weekWrap) weekWrap.style.display = mode === 'week' ? '' : 'none';
  }

  function populateWeekSelect(preferDate) {
    const weekSel = document.getElementById('bauDetailWeekFilter');
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
    const dateSel = document.getElementById('bauDetailDateFilter');
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
    const modeSel = document.getElementById('bauDetailModeFilter');
    setModeUI(modeSel ? modeSel.value : 'date');
    refreshAvailableSps();
    renderSpChecklist(true);
  }

  function refreshAvailableSps() {
    const scope = rowsForScope(currentScopeSpec());
    availableSps = [...new Set(scope.map(r => r.sp || '(blank)'))].sort((a, b) => a.localeCompare(b));
  }

  function filterBySp(rows) {
    if (!selectedSpSet.size || selectedSpSet.size === availableSps.length) return rows;
    return rows.filter(r => selectedSpSet.has(r.sp || '(blank)'));
  }

  function sortRows(rows) {
    const key = currentSortKey();
    const list = rows.slice();
    if (key === 'rate') {
      list.sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1) || (b.no - a.no));
    } else if (key === 'total') {
      list.sort((a, b) => b.total - a.total || (b.no - a.no));
    } else {
      // miss (default)
      list.sort((a, b) => (b.no - a.no) || ((a.rate ?? 1) - (b.rate ?? 1)));
    }
    return list;
  }

  function buildGroupRows(scopeRows, keyFn) {
    const map = groupBy(scopeRows, keyFn);
    return Object.keys(map).map(key => {
      const st = stats(map[key]);
      return {
        key,
        total: st.total,
        yes: st.yes,
        no: st.no,
        rate: st.rate,
        cinNo: st.cinNo,
        coutNo: st.coutNo
      };
    }).filter(r => r.total > 0);
  }

  function rateClass(rate) {
    if (rate == null) return '';
    return rate >= TARGET ? 'highlight-up' : 'highlight-down';
  }

  function renderTable(bodyId, rows, cols) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#757575;">No data for this filter</td></tr>';
      return;
    }
    body.innerHTML = rows.map(r => {
      const cells = cols.map(c => {
        const val = c.fn ? c.fn(r) : r[c.key];
        const cls = c.cls ? c.cls(r) : '';
        return '<td class="' + cls + '">' + val + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
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
    const sortLbl = sortKey === 'rate' ? 'rate (worst first)' : (sortKey === 'total' ? 'total trips' : 'miss trips');
    const spN = selectedSpSet.size;
    const spTxt = (!spN || spN === availableSps.length) ? '' : (' · ' + spN + ' SP(s)');
    return count + ' ' + entityLabel + scopeTxt + spTxt + ' · sorted by ' + sortLbl;
  }

  function applyFilters() {
    const note = document.getElementById('bauDetailNote');
    const spec = currentScopeSpec();
    let scope = rowsForScope(spec);
    scope = filterBySp(scope);

    refreshAvailableSps();
    selectedSpSet = new Set([...selectedSpSet].filter(sp => availableSps.includes(sp)));
    renderSpChecklist(true);

    // Re-filter after SP list refresh (in case selection emptied)
    scope = filterBySp(rowsForScope(spec));

    const dcRows = sortRows(buildGroupRows(scope, r => r.dcName || r.dcIntended || '(blank)'));
    const spRows = sortRows(buildGroupRows(scope, r => r.sp || '(blank)'));
    const driverRows = sortRows(buildGroupRows(scope, r => r.driver || '(blank)')).slice(0, 80);
    const routeRows = sortRows(buildGroupRows(scope, r => r.route || '(blank)')).slice(0, 60);
    const carrierRows = sortRows(buildGroupRows(scope, r => r.carrier || '(blank)'));

    if (note) {
      note.textContent = scopeNoteText(spec, scope.length, 'trip(s)');
    }

    renderTable('tbodyDC', dcRows, [
      { fn: r => escapeHtml(r.key) },
      { fn: r => r.total },
      { fn: r => r.yes },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => (r.cinNo || 0) + ' / ' + (r.coutNo || 0) },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate) }
    ]);

    renderTable('tbodySP', spRows, [
      { fn: r => escapeHtml(r.key) },
      { fn: r => r.total },
      { fn: r => r.yes },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => (r.cinNo || 0) + ' / ' + (r.coutNo || 0) },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate) }
    ]);

    renderTable('tbodyDriver', driverRows, [
      { fn: r => escapeHtml(r.key) },
      { fn: r => r.total },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => (r.cinNo || 0) + ' / ' + (r.coutNo || 0) },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate) }
    ]);

    renderTable('tbodyRoutes', routeRows, [
      { fn: r => escapeHtml(r.key) },
      { fn: r => r.total },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate) }
    ]);

    renderTable('tbodyCarrier', carrierRows, [
      { fn: r => escapeHtml(r.key) },
      { fn: r => r.total },
      { fn: r => r.no, cls: r => r.no > 0 ? 'neg' : '' },
      { fn: r => fmtPct(r.rate), cls: r => rateClass(r.rate) }
    ]);

    // Non-compliant detail
    let miss = scope.filter(r => !r.compliant);
    miss = miss.slice().sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || '') || (a.driver || '').localeCompare(b.driver || ''));
    const missDetail = miss.slice(0, 300).map(r => ({
      date: r.dateKey,
      shipmentNo: r.shipmentNo,
      driver: r.driver,
      plate: r.plate,
      sp: r.sp,
      dc: r.dcName || r.dcIntended,
      route: r.route,
      clockIn: r.clockIn || '—',
      clockOut: r.clockOut || '—',
      issue: (r.clockIn === 'NO' && r.clockOut === 'NO') ? 'No Clock In & Out'
        : (r.clockIn === 'NO') ? 'No Clock In (Arrival)'
        : (r.clockOut === 'NO') ? 'No Clock Out (Departure)'
        : 'Incomplete'
    }));

    renderTable('tbodyMissDetail', missDetail, [
      { fn: r => r.date },
      { fn: r => escapeHtml(r.shipmentNo || '—') },
      { fn: r => escapeHtml(r.driver) },
      { fn: r => escapeHtml(r.plate || '—') },
      { fn: r => escapeHtml(r.sp) },
      { fn: r => escapeHtml(r.dc) },
      { fn: r => escapeHtml(r.route) },
      { fn: r => r.clockIn, cls: r => r.clockIn === 'NO' ? 'neg' : '' },
      { fn: r => r.clockOut, cls: r => r.clockOut === 'NO' ? 'neg' : '' },
      { fn: r => r.issue, cls: () => 'neg' }
    ]);
  }

  function selectAllSps(select) {
    if (select) {
      selectedSpSet = new Set(availableSps);
    } else {
      selectedSpSet = new Set();
    }
    renderSpChecklist(false);
    if (select) {
      const list = document.getElementById('bauDetailSpList');
      if (list) {
        list.querySelectorAll('.bau-ms-check').forEach(c => { c.checked = true; });
        selectedSpSet = new Set(availableSps);
        updateMsLabel();
      }
    }
    applyFilters();
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    const modeSel = document.getElementById('bauDetailModeFilter');
    if (modeSel) {
      modeSel.addEventListener('change', () => {
        setModeUI(modeSel.value);
        applyFilters();
      });
    }
    const dateSel = document.getElementById('bauDetailDateFilter');
    if (dateSel) dateSel.addEventListener('change', applyFilters);
    const weekSel = document.getElementById('bauDetailWeekFilter');
    if (weekSel) weekSel.addEventListener('change', applyFilters);
    const sortSel = document.getElementById('bauDetailSortFilter');
    if (sortSel) sortSel.addEventListener('change', applyFilters);

    const toggle = document.getElementById('bauDetailMsToggle');
    const panel = document.getElementById('bauDetailMsPanel');
    if (toggle && panel) {
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        const open = !panel.classList.contains('hidden');
        panel.classList.toggle('hidden', open);
        toggle.classList.toggle('open', !open);
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
      document.addEventListener('click', e => {
        if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== toggle) {
          panel.classList.add('hidden');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
    const list = document.getElementById('bauDetailSpList');
    if (list) {
      list.addEventListener('change', e => {
        if (e.target && e.target.classList.contains('bau-ms-check')) {
          syncSelectionFromChecks();
          applyFilters();
        }
      });
    }
    const allBtn = document.getElementById('bauDetailSpAll');
    const clearBtn = document.getElementById('bauDetailSpClear');
    if (allBtn) allBtn.addEventListener('click', () => selectAllSps(true));
    if (clearBtn) clearBtn.addEventListener('click', () => selectAllSps(false));
  }

  /**
   * Called after main compare render so detail tables follow the focus date
   * but remain independently filterable.
   */
  function render(preferDate) {
    const { storedDates } = BauFileProcessor.getState();
    availableDates = (storedDates || []).slice();
    preferDateOnLoad = preferDate || null;
    populateFilters(preferDateOnLoad);
    bindEvents();
    applyFilters();
  }

  function init() {
    bindEvents();
  }

  return { init, render, applyFilters };
})();
