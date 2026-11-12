/* ==========================================================================
   MODULE: BDR MAIN APPLICATION COORDINATOR (Branchline Departure Rate)
   ========================================================================== */
const BdrApp = (() => {
  function runCompare(datePrev, dateLatest, useCompareLoader) {
    const { storedRows, storedDates } = BdrFileProcessor.getState();
    if (!storedRows) {
      alert('Please upload an Excel file first.');
      return;
    }
    const loading = document.getElementById('loading');
    const loadingCompare = document.getElementById('loadingCompare');
    const results = document.getElementById('results');

    if (useCompareLoader && loadingCompare) {
      loadingCompare.classList.remove('hidden');
      if (loading) loading.classList.add('hidden');
    } else if (loading) {
      loading.classList.remove('hidden');
    }
    if (results) results.classList.add('hidden');

    setTimeout(() => {
      try {
        const data = BdrDataAnalyzer.compute(datePrev, dateLatest, storedRows, storedDates);
        BdrUIManager.render(data);
        if (typeof BdrLateFilter !== 'undefined') {
          BdrLateFilter.render(dateLatest || 'ALL');
        }
        if (typeof BdrRateReport !== 'undefined' && BdrRateReport.render) {
          BdrRateReport.render(dateLatest);
        }
      } catch (err) {
        console.error(err);
        alert('Error during comparison: ' + err.message);
        if (loading) loading.classList.add('hidden');
        if (loadingCompare) loadingCompare.classList.add('hidden');
      }
    }, 80);
  }

  function triggerCompare() {
    const d1 = document.getElementById('selectPrev') && document.getElementById('selectPrev').value;
    const d2 = document.getElementById('selectLatest') && document.getElementById('selectLatest').value;
    if (!d1 || !d2) {
      alert('Please select both dates.');
      return;
    }
    runCompare(d1, d2, true);
  }

  function showMainPanel(id) {
    const map = {
      day: 'bdrMainDay',
      report: 'bdrMainReport'
    };
    document.querySelectorAll('.blt-main-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.blt-main-tab').forEach(b => {
      const active = b.getAttribute('data-main') === id;
      b.classList.toggle('active', active);
      b.style.background = active ? 'var(--jt-red)' : 'transparent';
      b.style.color = active ? '#fff' : '#6B7280';
    });
    const el = document.getElementById(map[id] || 'bdrMainDay');
    if (el) el.classList.remove('hidden');

    if (id === 'report' && typeof BdrRateReport !== 'undefined' && BdrRateReport.render) {
      const sel = document.getElementById('selectLatest');
      BdrRateReport.render(sel ? sel.value : null);
    }
  }

  function initMainTabs() {
    document.querySelectorAll('.blt-main-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        showMainPanel(btn.getAttribute('data-main') || 'day');
      });
    });
  }

  function init() {
    BdrUIManager.initTabs();
    initMainTabs();
    if (typeof BdrLateFilter !== 'undefined') BdrLateFilter.init();
    if (typeof BdrRateReport !== 'undefined') BdrRateReport.init();

    BdrFileProcessor.init((d1, d2) => {
      runCompare(d1, d2, false);
    });

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', triggerCompare);
  }

  return { init, runCompare, showMainPanel };
})();

document.addEventListener('DOMContentLoaded', BdrApp.init);
