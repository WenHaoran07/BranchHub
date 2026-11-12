/* ==========================================================================
   MODULE: BAU MAIN APPLICATION COORDINATOR (Branchline App Usage)
   Pattern aligned with Branchline Travel Time (BltApp)
   ========================================================================== */
const BauApp = (() => {
  function runCompare(datePrev, dateLatest, useCompareLoader) {
    const { storedRows, storedDates } = BauFileProcessor.getState();
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
        const data = BauDataAnalyzer.compute(datePrev, dateLatest, storedRows, storedDates);
        BauUIManager.render(data);
        if (typeof BauDcRateReport !== 'undefined' && BauDcRateReport.render) {
          BauDcRateReport.render(dateLatest);
        }
        if (typeof BauSpRateReport !== 'undefined' && BauSpRateReport.render) {
          BauSpRateReport.render(dateLatest);
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
      day: 'bauMainDay',
      report: 'bauMainReport'
    };
    document.querySelectorAll('.blt-main-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.blt-main-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-main') === id);
    });
    const el = document.getElementById(map[id] || 'bauMainDay');
    if (el) el.classList.remove('hidden');

    if (id === 'report') {
      const sel = document.getElementById('selectLatest');
      const prefer = sel ? sel.value : null;
      // DC report owns shared week/daily filters — render first
      if (typeof BauDcRateReport !== 'undefined' && BauDcRateReport.render) {
        BauDcRateReport.render(prefer);
      }
      if (typeof BauSpRateReport !== 'undefined' && BauSpRateReport.render) {
        BauSpRateReport.render(prefer);
      }
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
    BauUIManager.initTabs();
    initMainTabs();
    if (typeof BauSpRateReport !== 'undefined') BauSpRateReport.init();
    if (typeof BauDcRateReport !== 'undefined') BauDcRateReport.init();

    BauFileProcessor.init((d1, d2) => {
      runCompare(d1, d2, false);
    });

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', triggerCompare);
  }

  return { init, runCompare, showMainPanel };
})();

document.addEventListener('DOMContentLoaded', BauApp.init);
