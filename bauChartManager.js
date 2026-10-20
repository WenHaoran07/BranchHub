/* ==========================================================================
   MODULE: BAU CHART MANAGER (Branchline App Usage)
   ========================================================================== */
const BauChartManager = (() => {
  const charts = {};

  function destroy(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function render(dcMissList, spMissList, driverMissList, histRows, targetPct) {
    if (targetPct == null) targetPct = 99;
    ['dc', 'sp', 'driver', 'history'].forEach(destroy);

    const barOpts = (label) => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: label } },
        y: { ticks: { font: { size: 11 } } }
      }
    });

    const el = (id) => document.getElementById(id);

    if (el('chartDC')) {
      const top = (dcMissList || []).slice(0, 12);
      charts.dc = new Chart(el('chartDC'), {
        type: 'bar',
        data: {
          labels: top.map(r => r.dc.length > 22 ? r.dc.slice(0, 20) + '…' : r.dc),
          datasets: [{ data: top.map(r => r.miss), backgroundColor: 'rgba(230,0,18,0.75)', borderRadius: 5 }]
        },
        options: barOpts('Non-compliant trips')
      });
    }
    if (el('chartSP')) {
      const top = (spMissList || []).slice(0, 12);
      charts.sp = new Chart(el('chartSP'), {
        type: 'bar',
        data: {
          labels: top.map(r => r.sp.length > 22 ? r.sp.slice(0, 20) + '…' : r.sp),
          datasets: [{ data: top.map(r => r.miss), backgroundColor: 'rgba(183,28,28,0.7)', borderRadius: 5 }]
        },
        options: barOpts('Non-compliant trips')
      });
    }
    if (el('chartDriver')) {
      const top = (driverMissList || []).slice(0, 12);
      charts.driver = new Chart(el('chartDriver'), {
        type: 'bar',
        data: {
          labels: top.map(r => {
            const name = r.driver || '(blank)';
            return name.length > 22 ? name.slice(0, 20) + '…' : name;
          }),
          datasets: [{ data: top.map(r => r.miss), backgroundColor: 'rgba(198,40,40,0.7)', borderRadius: 5 }]
        },
        options: barOpts('Non-compliant trips')
      });
    }
    if (el('chartHistory')) {
      charts.history = new Chart(el('chartHistory'), {
        type: 'line',
        data: {
          labels: (histRows || []).map(h => h.date.slice(5)),
          datasets: [
            {
              label: 'App Usage Rate',
              data: (histRows || []).map(h => h.rate != null ? +(h.rate * 100).toFixed(2) : null),
              borderColor: '#1565C0',
              backgroundColor: 'rgba(21,101,192,0.12)',
              fill: true,
              tension: 0.25,
              spanGaps: true,
              pointRadius: 3
            },
            {
              label: 'Target ' + targetPct + '%',
              data: (histRows || []).map(() => targetPct),
              borderColor: '#E60012',
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: {
            y: {
              min: Math.max(90, targetPct - 5),
              max: 100.5,
              ticks: { callback: v => v + '%' }
            }
          }
        }
      });
    }
  }

  return { render };
})();
