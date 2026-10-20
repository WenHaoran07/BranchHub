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
      } catch (err) {
        console.error(err);
        alert('Error during comparison: ' + err.message);
        if (loading) loading.classList.add('hidden');
        if (loadingCompare) loadingCompare.classList.add('hidden');
      }
    }, 80);
  }

  function triggerCompare() {
    const d1 = document.getElementById('selectPrev').value;
    const d2 = document.getElementById('selectLatest').value;
    if (!d1 || !d2) {
      alert('Please select both dates.');
      return;
    }
    runCompare(d1, d2, true);
  }

  function init() {
    BdrUIManager.initTabs();
    if (typeof BdrLateFilter !== 'undefined') BdrLateFilter.init();
    BdrFileProcessor.init((d1, d2) => {
      runCompare(d1, d2, false);
    });

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', triggerCompare);
  }

  return { init, runCompare };
})();

document.addEventListener('DOMContentLoaded', BdrApp.init);
