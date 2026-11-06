/* ==========================================================================
   MODULE: BLT RATE MATRIX
   Weekly / Monthly rate board — Overall · Bulk · Collection · by DC Intended
   Rate = average of daily on-time % within the period (matches mainline approach)
   ========================================================================== */
const BltRateMatrix = (() => {
  const TARGET = 0.98;
  let mode = 'weekly';

  function getRows() {
    if (typeof BltFileProcessor === 'undefined') return [];
    return BltFileProcessor.getState().storedRows || [];
  }

  function periodOf(r) {
    return mode === 'weekly'
      ? (r.week || BltUtils.weekKey(r.dateKey))
      : (r.month || BltUtils.monthKey(r.dateKey));
  }

  function periodKeys(rows) {
    return [...new Set(rows.map(periodOf).filter(Boolean))].sort();
  }

  /** Avg of daily rates in period (not trip-weighted) */
  function avgDailyRate(list) {
    if (!list || !list.length) return null;
    const byDay = BltUtils.groupBy(list, r => r.dateKey);
    const rates = Object.values(byDay).map(dayRows => {
      const st = BltUtils.stats(dayRows);
      return st.rate;
    }).filter(v => v != null);
    if (!rates.length) return null;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  function labelPeriod(key) {
    if (!key) return '';
    if (mode === 'weekly') {
      const m = String(key).match(/W(\d+)/i);
      return m ? ('WK ' + parseInt(m[1], 10)) : key;
    }
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const mi = parseInt(String(key).slice(5, 7), 10) - 1;
    return (months[mi] || '') + ' ' + String(key).slice(0, 4);
  }

  function rateClass(rate) {
    if (rate == null) return '';
    return rate >= TARGET ? 'rm-ok' : 'rm-miss';
  }

  function fmt(rate) {
    return rate == null ? '—' : (rate * 100).toFixed(1) + '%';
  }

  function buildMatrix() {
    const rows = getRows();
    const keys = periodKeys(rows);
    const scopes = [
      { id: 'ALL', name: 'OVERALL' },
      { id: 'BULK', name: 'BULK CARGO' },
      { id: 'COLLECTION', name: 'COLLECTION' }
    ];

    const scopeRows = scopes.map(sc => {
      const cells = keys.map(k => {
        const list = rows.filter(r => periodOf(r) === k);
        const scoped = BltUtils.filterLineScope(list, sc.id);
        return { key: k, rate: avgDailyRate(scoped), total: scoped.length };
      });
      return { scope: sc, cells };
    });

    // By DC Intended
    const dcNames = [...new Set(rows.map(r => r.dcName || r.dcIntended).filter(v => v && v !== '(blank)'))].sort();
    const dcRows = dcNames.map(dc => {
      const cells = keys.map(k => {
        const list = rows.filter(r => periodOf(r) === k && (r.dcName || r.dcIntended) === dc);
        return { key: k, rate: avgDailyRate(list), total: list.length };
      });
      return { dc, cells };
    });

    return { keys, scopeRows, dcRows };
  }

  function render() {
    const board = document.getElementById('bltRmBoard');
    const dcBoard = document.getElementById('bltRmDcBoard');
    if (!board) return;
    const { keys, scopeRows, dcRows } = buildMatrix();

    if (!keys.length) {
      board.innerHTML = '<p class="section-note">No period data yet. Upload a file first.</p>';
      if (dcBoard) dcBoard.innerHTML = '';
      return;
    }

    let html = '<div class="table-scroll"><table class="rm-table"><thead><tr><th>Scope</th>';
    keys.forEach(k => { html += '<th>' + labelPeriod(k) + '</th>'; });
    html += '</tr></thead><tbody>';
    scopeRows.forEach(sr => {
      html += '<tr><td class="rm-scope">' + sr.scope.name +
        '<div class="rm-target">Target ' + Math.round(TARGET * 100) + '%</div></td>';
      sr.cells.forEach(c => {
        html += '<td class="' + rateClass(c.rate) + '"><strong>' + fmt(c.rate) + '</strong>' +
          '<div class="rm-sub">' + c.total + ' trips</div></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    board.innerHTML = html;

    if (dcBoard) {
      let dhtml = '<div class="table-scroll"><table class="rm-table"><thead><tr><th>DC Intended</th>';
      keys.forEach(k => { dhtml += '<th>' + labelPeriod(k) + '</th>'; });
      dhtml += '</tr></thead><tbody>';
      dcRows.forEach(dr => {
        dhtml += '<tr><td class="rm-scope">' + dr.dc + '</td>';
        dr.cells.forEach(c => {
          dhtml += '<td class="' + rateClass(c.rate) + '"><strong>' + fmt(c.rate) + '</strong>' +
            '<div class="rm-sub">' + c.total + '</div></td>';
        });
        dhtml += '</tr>';
      });
      dhtml += '</tbody></table></div>';
      dcBoard.innerHTML = dhtml;
    }

    const note = document.getElementById('bltRmNote');
    if (note) {
      note.textContent = (mode === 'weekly' ? 'Weekly' : 'Monthly') +
        ' rate matrix · avg of daily rates · Target 98%';
    }
  }

  function setMode(m) {
    mode = m === 'monthly' ? 'monthly' : 'weekly';
    document.querySelectorAll('.blt-rm-mode').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    render();
  }

  function onDataReady() { render(); }

  function init() {
    document.querySelectorAll('.blt-rm-mode').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.getAttribute('data-mode')));
    });
  }

  return { init, onDataReady, render, setMode };
})();
