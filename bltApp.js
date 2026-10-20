/* ==========================================================================
   MODULE: BLT MAIN APPLICATION COORDINATOR (Branchline Travel Time)
   ========================================================================== */
const BltApp = (() => {
  function runCompare(datePrev, dateLatest, useCompareLoader) {
    const { storedRows, storedDates } = BltFileProcessor.getState();
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
        const data = BltDataAnalyzer.compute(datePrev, dateLatest, storedRows, storedDates);
        BltUIManager.render(data);
        if (typeof BltDelayReason !== 'undefined') {
          BltDelayReason.render(dateLatest);
        }
        if (typeof BltSpDelay !== 'undefined') {
          // Default SP Delay view to focus date (or Overall)
          BltSpDelay.render(dateLatest || 'ALL');
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
    BltUIManager.initTabs();
    if (typeof BltDelayReason !== 'undefined') BltDelayReason.init();
    if (typeof BltSpDelay !== 'undefined') BltSpDelay.init();

    BltFileProcessor.init((d1, d2) => {
      runCompare(d1, d2, false);
    });

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', triggerCompare);
  }

  return { init, runCompare };
})();

document.addEventListener('DOMContentLoaded', BltApp.init);
