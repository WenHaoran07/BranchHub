/* ==========================================================================
   MODULE: BLT WEEKLY / MONTHLY COMPARISON
   Scopes: Overall · Bulk · Collection · Target 97%
   ========================================================================== */
const BltWeeklyMonthly = (() => {
  const TARGET = 0.97;
  let mode = 'weekly'; // weekly | monthly
  let charts = { trend: null, compare: null };

  function getRows() {
    if (typeof BltFileProcessor === 'undefined') return [];
    return BltFileProcessor.getState().storedRows || [];
  }

  function periodKey(r) {
    return mode === 'weekly' ? (r.week || BltUtils.weekKey(r.dateKey)) : (r.month || BltUtils.monthKey(r.dateKey));
  }

  function periodKeys(rows) {
    return [...new Set(rows.map(periodKey).filter(Boolean))].sort();
  }

  function rowsIn(rows, key) {
    return rows.filter(r => periodKey(r) === key);
  }

  function stats(list) {
    return BltUtils.stats(list);
  }

  function labelPeriod(key) {
    if (!key) return '';
    if (mode === 'weekly') {
      const m = String(key).match(/W(\d+)/i);
      return m ? ('WK ' + parseInt(m[1], 10) + ' · ' + key) : key;
    }
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mi = parseInt(String(key).slice(5, 7), 10) - 1;
    return (months[mi] || key.slice(5)) + ' ' + key.slice(0, 4);
  }

  function buildPeriodTable(rows, keys) {
    const scopes = [
      { id: 'ALL', name: 'Overall' },
      { id: 'BULK', name: 'Bulk cargo' },
      { id: 'COLLECTION', name: 'Collection' }
    ];
    return keys.map(k => {
      const base = rowsIn(rows, k);
      const row = { key: k, label: labelPeriod(k) };
      scopes.forEach(sc => {
        const list = BltUtils.filterLineScope(base, sc.id);
        const st = stats(list);
        row[sc.id] = st;
      });
      return row;
    });
  }

  function renderTable(periodRows) {
    const body = document.getElementById('bltWmBody');
    if (!body) return;
    const { fmtPct, fmtPp } = BltUtils;
    if (!periodRows.length) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;">No data</td></tr>';
      return;
    }
    body.innerHTML = periodRows.map((r, i) => {
      const prev = i > 0 ? periodRows[i - 1] : null;
      function cell(scope) {
        const st = r[scope] || {};
        const prevSt = prev ? (prev[scope] || {}) : null;
        const delta = (st.rate != null && prevSt && prevSt.rate != null) ? st.rate - prevSt.rate : null;
        const cls = st.rate == null ? '' : (st.rate >= TARGET ? 'pos' : 'neg');
        return '<td class="' + cls + '">' + fmtPct(st.rate) +
          '<div style="font-size:0.75rem;color:#757575;">' + (st.total || 0) + ' trips · late ' + (st.no || 0) +
          (delta != null ? ' · ' + fmtPp(delta) : '') + '</div></td>';
      }
      return '<tr><td><strong>' + r.label + '</strong></td>' +
        cell('ALL') + cell('BULK') + cell('COLLECTION') + '</tr>';
    }).join('');
  }

  function renderCharts(periodRows) {
    ['trend', 'compare'].forEach(k => {
      if (charts[k]) { try { charts[k].destroy(); } catch (e) {} charts[k] = null; }
    });
    const labels = periodRows.map(r => r.label);
    const overall = periodRows.map(r => r.ALL && r.ALL.rate != null ? +(r.ALL.rate * 100).toFixed(2) : null);
    const bulk = periodRows.map(r => r.BULK && r.BULK.rate != null ? +(r.BULK.rate * 100).toFixed(2) : null);
    const coll = periodRows.map(r => r.COLLECTION && r.COLLECTION.rate != null ? +(r.COLLECTION.rate * 100).toFixed(2) : null);

    const elTrend = document.getElementById('bltWmTrendChart');
    if (elTrend && typeof Chart !== 'undefined') {
      charts.trend = new Chart(elTrend, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Overall', data: overall, borderColor: '#E60012', tension: 0.25, fill: false },
            { label: 'Bulk', data: bulk, borderColor: '#1565C0', tension: 0.25, fill: false },
            { label: 'Collection', data: coll, borderColor: '#2E7D32', tension: 0.25, fill: false },
            { label: 'Target 97%', data: labels.map(() => 97), borderColor: '#9E9E9E', borderDash: [6, 4], pointRadius: 0 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: { y: { min: 70, max: 102, title: { display: true, text: 'Rate %' } } }
        }
      });
    }

    // Side-by-side last 2 periods
    const last2 = periodRows.slice(-2);
    const elCmp = document.getElementById('bltWmCompareChart');
    if (elCmp && last2.length && typeof Chart !== 'undefined') {
      charts.compare = new Chart(elCmp, {
        type: 'bar',
        data: {
          labels: ['Overall', 'Bulk', 'Collection'],
          datasets: last2.map((r, i) => ({
            label: r.label,
            data: [
              r.ALL && r.ALL.rate != null ? +(r.ALL.rate * 100).toFixed(2) : 0,
              r.BULK && r.BULK.rate != null ? +(r.BULK.rate * 100).toFixed(2) : 0,
              r.COLLECTION && r.COLLECTION.rate != null ? +(r.COLLECTION.rate * 100).toFixed(2) : 0
            ],
            backgroundColor: i === last2.length - 1 ? 'rgba(230,0,18,0.75)' : 'rgba(21,101,192,0.55)'
          }))
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, max: 105, title: { display: true, text: 'Rate %' } } }
        }
      });
    }
  }

  function render() {
    const rows = getRows();
    const keys = periodKeys(rows);
    const periodRows = buildPeriodTable(rows, keys);
    renderTable(periodRows);
    renderCharts(periodRows);
    const note = document.getElementById('bltWmNote');
    if (note) {
      note.textContent = (mode === 'weekly' ? 'Weekly' : 'Monthly') +
        ' achievement · Target 97% · ' + keys.length + ' period(s)';
    }
  }

  function setMode(m) {
    mode = m === 'monthly' ? 'monthly' : 'weekly';
    document.querySelectorAll('.blt-wm-mode').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    render();
  }

  function onDataReady() { render(); }

  function init() {
    document.querySelectorAll('.blt-wm-mode').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.getAttribute('data-mode')));
    });
  }

  return { init, onDataReady, render, setMode };
})();
