/* ==========================================================================
   MODULE: BAU MAIN APPLICATION COORDINATOR (Branchline App Usage)
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

  function switchMainTab(tab) {
    const dayPanel = document.getElementById('bauDayPanel');
    const reportPanel = document.getElementById('bauReportPanel');
    const btnDay = document.getElementById('tabBauDay');
    const btnReport = document.getElementById('tabBauReport');

    if (tab === 'report') {
      if (dayPanel) dayPanel.classList.add('hidden');
      if (reportPanel) reportPanel.classList.remove('hidden');
      if (btnDay) { btnDay.classList.remove('active'); btnDay.setAttribute('aria-selected', 'false'); }
      if (btnReport) { btnReport.classList.add('active'); btnReport.setAttribute('aria-selected', 'true'); }
      const sel = document.getElementById('selectLatest');
      const focus = sel ? sel.value : null;
      if (typeof BauSpRateReport !== 'undefined' && BauSpRateReport.render) {
        BauSpRateReport.render(focus);
      }
    } else {
      if (reportPanel) reportPanel.classList.add('hidden');
      if (dayPanel) dayPanel.classList.remove('hidden');
      if (btnReport) { btnReport.classList.remove('active'); btnReport.setAttribute('aria-selected', 'false'); }
      if (btnDay) { btnDay.classList.add('active'); btnDay.setAttribute('aria-selected', 'true'); }
    }
  }

  function init() {
    BauUIManager.initTabs();
    if (typeof BauSpRateReport !== 'undefined') BauSpRateReport.init();

    BauFileProcessor.init((d1, d2) => {
      runCompare(d1, d2, false);
    });

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', triggerCompare);

    const btnDay = document.getElementById('tabBauDay');
    const btnReport = document.getElementById('tabBauReport');
    if (btnDay) btnDay.addEventListener('click', () => switchMainTab('day'));
    if (btnReport) btnReport.addEventListener('click', () => switchMainTab('report'));
  }

  return { init, runCompare, switchMainTab };
})();

document.addEventListener('DOMContentLoaded', BauApp.init);
